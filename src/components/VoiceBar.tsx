import { Loader2, Mic, Play, Repeat } from 'lucide-react'
import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react'

import type { Translate } from '../alethe'
import { history } from '../history'
import { host, useT } from '../host'
import { getSettings, updateSettings, useSettings } from '../settings'
import { createSpeechEndpoint, vadSpeechEnded } from '../speech/endpoint'
import {
  jevDecide,
  type JevDecision,
  speechCaptureLevel,
  type SpeechInputDevice,
  speechListInputDevices,
  speechPrepare,
  speechPrepareVad,
  speechStartCapture,
  speechStopCapture,
  speechTranscribePartial,
  speechVadStatus,
  stopAndTranscribe,
} from '../tauri'
import {
  BLOCK_REASONS,
  endsWithSendPhrase,
  needsConfirmation,
  planFromDecision,
  planWarnings,
  stripSendPhrase,
  toJevContext,
  type VoicePlan,
  type VoiceWarning,
  WARNINGS,
} from '../voiceCommand'
import { agentName, type JevWorkspace, readWorkspace } from '../workspace'
import { MicSelect } from './MicSelect'
import styles from './VoiceBar.module.css'

const LEVEL_POLL_MS = 60
const SPECTRUM_BARS = 40
const SILENT_LEVEL = 0.005
const SILENT_POLLS_BEFORE_WARNING = 12
const SILENCE: number[] = Array.from({ length: SPECTRUM_BARS }, () => 0)
const DECIDE_TIMEOUT_MS = 20000
const PARTIAL_POLL_MS = 700
const HEARD_TAIL_CHARS = 60

async function withTimeout<T>(work: Promise<T>, timeoutMessage: string): Promise<T> {
  let timer: number | undefined
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error(timeoutMessage)), DECIDE_TIMEOUT_MS)
      }),
    ])
  } finally {
    window.clearTimeout(timer)
  }
}

function tailOf(text: string): string {
  return text.length > HEARD_TAIL_CHARS ? `…${text.slice(-HEARD_TAIL_CHARS)}` : text
}

function isOpenChord(e: KeyboardEvent): boolean {
  const ctrl = e.ctrlKey || e.metaKey
  return ctrl && e.shiftKey && !e.altKey && (e.code === 'Space' || e.key === ' ')
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

async function runPlan(plan: VoicePlan, workspace: JevWorkspace, t: Translate): Promise<string[]> {
  const { workspace: control } = host()

  if (plan.kind === 'focus') {
    control.focusTerminal(plan.terminalId)
    return [t('action.focused', { terminal: plan.terminalName })]
  }
  if (plan.kind === 'kill') {
    control.closeTerminal(plan.terminalId)
    return [t('action.stopped', { terminal: plan.terminalName })]
  }
  if (plan.kind === 'reuse') {
    await control.writeToTerminal(plan.terminalId, `${plan.prompt}\r`)
    control.focusTerminal(plan.terminalId)
    return [t('action.sent', { terminal: plan.terminalName })]
  }
  if (plan.kind !== 'spawn') return []

  const created = await Promise.all(
    plan.jobs.map((job, index) => {
      const label = agentName(workspace, job.agent)
      const sameAgent = plan.jobs.filter((item) => item.agent === job.agent).length > 1
      return control.openAgentTerminal(plan.projectId, {
        agent: job.agent,
        name: sameAgent ? `${label} ${index + 1}` : label,
        prompt: job.prompt || undefined,
      })
    }),
  )
  const last = created[created.length - 1]
  if (last) control.focusTerminal(last)

  return plan.jobs.map((job) => {
    const agent = agentName(workspace, job.agent)
    return job.prompt
      ? t('action.openedWith', { agent, project: plan.projectName, prompt: job.prompt })
      : t('action.opened', { agent, project: plan.projectName })
  })
}

export function summarize(plan: VoicePlan, workspace: JevWorkspace, t: Translate): string {
  switch (plan.kind) {
    case 'spawn': {
      const agents = [...new Set(plan.jobs.map((job) => job.agent))]
      const distinctTasks = new Set(plan.jobs.map((job) => job.prompt)).size > 1
      if (distinctTasks) {
        return t('summary.splitTasks', { count: plan.jobs.length, project: plan.projectName })
      }
      if (agents.length > 1) {
        return t('summary.launchAgents', {
          agents: agents.map((agent) => agentName(workspace, agent)).join(' + '),
          project: plan.projectName,
        })
      }
      return t('summary.launchN', {
        count: plan.jobs.length,
        agent: agentName(workspace, agents[0] ?? 'claude'),
        project: plan.projectName,
      })
    }
    case 'reuse':
      return t('summary.reuse', { terminal: plan.terminalName })
    case 'focus':
      return t('summary.focus', { terminal: plan.terminalName })
    case 'kill':
      return t('summary.kill', { terminal: plan.terminalName })
    default:
      return t(BLOCK_REASONS[plan.reason])
  }
}

type Held = {
  answer: JevDecision
  next: VoicePlan
  nextWarnings: VoiceWarning[]
  entryId: string
  workspace: JevWorkspace
}

export function VoiceBar() {
  const t = useT()
  const settings = useSettings()
  const { apiKey, voiceEnabled, keepListening, modelId, microphoneId, provider, cloudModel } =
    settings

  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'listening' | 'transcribing' | 'deciding'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [held, setHeld] = useState<Held | null>(null)
  const [mics, setMics] = useState<SpeechInputDevice[]>([])
  const [levels, setLevels] = useState<number[]>(SILENCE)
  const [micSilent, setMicSilent] = useState(false)
  const [heard, setHeard] = useState('')
  const [voice, setVoice] = useState(false)

  const pillRef = useRef<HTMLDivElement>(null)
  const recordingRef = useRef(false)
  const busyRef = useRef(false)
  const startingRef = useRef(false)
  const sessionRef = useRef(0)

  const plan = held?.next ?? null
  const recording = phase === 'listening'
  const busy = phase === 'transcribing' || phase === 'deciding'
  const runnable = plan !== null && plan.kind !== 'blocked'

  const resetForNextCommand = useCallback(() => {
    setMessage(null)
    setHeld(null)
    setLevels(SILENCE)
    setMicSilent(false)
    setPhase('idle')
  }, [])

  const close = useCallback(() => {
    sessionRef.current += 1
    setOpen(false)
    resetForNextCommand()
    if (recordingRef.current) {
      recordingRef.current = false
      void speechStopCapture().catch(() => undefined)
    }
  }, [resetForNextCommand])

  const execute = useCallback(
    async (pending: VoicePlan, workspace: JevWorkspace, entryId: string | null) => {
      const current = getSettings()
      const continuous = Boolean(current.apiKey) && current.voiceEnabled && current.keepListening
      busyRef.current = true
      if (continuous) {
        resetForNextCommand()
        setPhase('deciding')
      } else {
        close()
      }
      try {
        const actions = await runPlan(pending, workspace, t)
        if (entryId) history.settle(entryId, { status: 'ran', actions })
        host().ui.toast({ title: t('successToastTitle'), body: summarize(pending, workspace, t) })
      } catch (cause) {
        const reason = messageOf(cause)
        if (entryId) history.settle(entryId, { status: 'failed', error: reason })
        host().ui.toast({ title: t('failedToast'), body: reason })
      } finally {
        busyRef.current = false
        setPhase('idle')
      }
    },
    [close, resetForNextCommand, t],
  )

  const route = useCallback(
    async (spoken: string, entryId: string): Promise<Held | null> => {
      const workspace = readWorkspace()
      const startedAt = performance.now()
      const session = sessionRef.current
      const answer = await withTimeout(
        jevDecide(spoken, toJevContext(workspace), apiKey),
        t('error.timeout'),
      )
      const decideMs = Math.round(performance.now() - startedAt)
      if (session !== sessionRef.current) {
        history.settle(entryId, { status: 'blocked', summary: t('confirm.cancel') })
        return null
      }
      const next = planFromDecision(answer, workspace)
      const nextWarnings = planWarnings(answer, next, workspace)
      const hold = next.kind === 'blocked' || needsConfirmation(next, nextWarnings)
      history.settle(entryId, {
        decision: answer,
        plan: next,
        decideMs,
        warnings: nextWarnings,
        status: next.kind === 'blocked' ? 'blocked' : hold ? 'waiting' : 'ran',
        summary: summarize(next, workspace, t),
      })
      if (!hold) {
        await execute(next, workspace, entryId)
        return null
      }
      return { answer, next, nextWarnings, entryId, workspace }
    },
    [apiKey, execute, t],
  )

  const listen = useCallback(async () => {
    if (recordingRef.current || busyRef.current || startingRef.current) return
    const session = sessionRef.current
    startingRef.current = true
    try {
      await speechStartCapture(microphoneId)
      if (session !== sessionRef.current) {
        await speechStopCapture().catch(() => undefined)
        return
      }
      recordingRef.current = true
      setMicSilent(false)
      setHeard('')
      setLevels(SILENCE)
      setMessage(null)
      setPhase('listening')
    } catch (cause) {
      recordingRef.current = false
      setPhase('idle')
      setMessage(messageOf(cause))
    } finally {
      startingRef.current = false
    }
  }, [microphoneId])

  const transcribe = useCallback(() => {
    if (startingRef.current && !recordingRef.current) {
      sessionRef.current += 1
      return
    }
    if (!recordingRef.current) return
    recordingRef.current = false
    busyRef.current = true
    setPhase('transcribing')
    const session = sessionRef.current
    const entryId = history.start(t('lifecycle.transcribing'))

    void (async () => {
      try {
        const startedAt = performance.now()
        const transcript = stripSendPhrase(
          (await stopAndTranscribe({ provider, modelId, cloudModel, apiKey })).trim(),
        )
        const transcribeMs = Math.round(performance.now() - startedAt)
        if (session !== sessionRef.current) {
          history.settle(entryId, { status: 'blocked', summary: t('confirm.cancel') })
          return
        }
        if (!transcript) {
          history.settle(entryId, {
            status: 'blocked',
            summary: t('lifecycle.heardNothing'),
            spoken: t('history.silence'),
          })
          return
        }
        history.settle(entryId, {
          spoken: transcript,
          summary: t('lifecycle.askingJev'),
          transcribeMs,
        })
        setPhase('deciding')
        const waiting = await route(transcript, entryId)
        if (waiting) setHeld(waiting)
      } catch (cause) {
        await speechStopCapture().catch(() => undefined)
        const reason = messageOf(cause)
        history.settle(entryId, { status: 'failed', summary: t('lifecycle.failed'), error: reason })
        host().ui.toast({ title: t('failedToast'), body: reason })
      } finally {
        busyRef.current = false
        setPhase('idle')
      }
    })()
  }, [apiKey, cloudModel, modelId, provider, route, t])

  const toggleRecording = useCallback(() => {
    if (recordingRef.current) transcribe()
    else void listen()
  }, [listen, transcribe])

  const confirm = useCallback(() => {
    if (!held || held.next.kind === 'blocked' || busyRef.current) return
    void execute(held.next, held.workspace, held.entryId)
  }, [execute, held])

  useEffect(() => {
    if (!open || !voiceEnabled) return
    let cancelled = false
    void speechListInputDevices()
      .then((devices) => {
        if (!cancelled) setMics(devices)
      })
      .catch(() => undefined)
    if (provider === 'local') void speechPrepare(modelId).catch(() => undefined)
    void speechPrepareVad().catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [open, voiceEnabled, modelId, provider])

  useEffect(() => {
    if (!open || !apiKey || !voiceEnabled) return
    void listen()
  }, [open, apiKey, voiceEnabled, listen])

  // Continuous listening: re-arm the mic after each command until the bar is closed.
  useEffect(() => {
    if (
      !open ||
      !apiKey ||
      !voiceEnabled ||
      !keepListening ||
      message ||
      plan !== null ||
      phase !== 'idle'
    )
      return
    if (recordingRef.current) return
    const id = window.setInterval(() => {
      if (busyRef.current) return
      window.clearInterval(id)
      void listen()
    }, 200)
    return () => window.clearInterval(id)
  }, [open, apiKey, voiceEnabled, keepListening, message, plan, phase, listen])

  useEffect(() => {
    if (phase !== 'listening') return
    let silentPolls = 0
    const endpoint = createSpeechEndpoint()
    const id = window.setInterval(() => {
      void speechVadStatus()
        .then(async (status) => {
          const next = status ? status.level : await speechCaptureLevel()
          setLevels((previous) => [...previous.slice(1), next])
          setVoice(status?.voice ?? false)
          if (next > SILENT_LEVEL) {
            silentPolls = 0
            setMicSilent(false)
          } else {
            silentPolls += 1
            if (silentPolls > SILENT_POLLS_BEFORE_WARNING) setMicSilent(true)
          }
          const ended = status ? vadSpeechEnded(status) : endpoint.push(next, performance.now())
          if (ended) transcribe()
        })
        .catch(() => undefined)
    }, LEVEL_POLL_MS)
    return () => window.clearInterval(id)
  }, [phase, transcribe])

  // Hands-free send: a spoken send phrase ends the recording, and so does a long pause.
  useEffect(() => {
    if (phase !== 'listening' || provider !== 'local') return
    let cancelled = false
    let unsupported = false
    let pending = false
    const id = window.setInterval(() => {
      if (cancelled || unsupported || pending || !recordingRef.current || busyRef.current) return
      pending = true
      void speechTranscribePartial(modelId)
        .then((partial) => {
          if (cancelled || !recordingRef.current) return
          setHeard(partial.trim())
          if (partial && endsWithSendPhrase(partial)) transcribe()
        })
        .catch(() => {
          unsupported = true
        })
        .finally(() => {
          pending = false
        })
    }, PARTIAL_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [phase, modelId, provider, transcribe])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isOpenChord(e) || e.repeat) return
      e.preventDefault()
      e.stopPropagation()
      if (open) close()
      else setOpen(true)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open, close])

  useEffect(() => {
    if (!open) return
    const id = window.setTimeout(() => pillRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      } else if (e.key === 'Enter' && runnable) {
        e.preventDefault()
        e.stopPropagation()
        confirm()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open, close, runnable, confirm])

  useEffect(() => {
    if (!open || !voiceEnabled || !apiKey) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'F9' || e.repeat) return
      e.preventDefault()
      void listen()
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== 'F9') return
      e.preventDefault()
      transcribe()
    }
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
    }
  }, [open, voiceEnabled, apiKey, listen, transcribe])

  useEffect(
    () => () => {
      sessionRef.current += 1
      if (!recordingRef.current) return
      recordingRef.current = false
      void speechStopCapture().catch(() => undefined)
    },
    [],
  )

  if (!open) return null

  const ready = Boolean(apiKey) && voiceEnabled
  const voiceLevel = Math.min(1, (levels[levels.length - 1] ?? 0) * 4)

  const hint = recording
    ? t('bar.handsFreeHint')
    : phase === 'transcribing'
      ? t('bar.transcribingHint')
      : phase === 'deciding'
        ? t('bar.decidingHint')
        : runnable
          ? t('bar.runnableHint')
          : !apiKey
            ? t('bar.noKeyHint')
            : !voiceEnabled
              ? t('bar.enableVoiceHint')
              : t('bar.voiceOnlyHint')

  return (
    <div
      className={styles.anchor}
      data-phase={phase}
      data-voice={recording && voice}
      style={{ '--voice-level': recording ? voiceLevel : 0 } as CSSProperties}
    >
      <div
        className={styles.scrim}
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) close()
        }}
      />

      {held && plan ? (
        <div className={styles.card} role="alertdialog" aria-label={t('bar.title')}>
          <svg className={styles.borderTrace} aria-hidden="true" focusable="false">
            <rect x="1" y="1" rx="32" pathLength="100" />
          </svg>
          <p className={runnable ? styles.summary : styles.blocked}>
            {summarize(plan, held.workspace, t)}
          </p>

          {plan.kind === 'reuse' && plan.prompt ? (
            <p className={styles.prompt}>{plan.prompt}</p>
          ) : null}
          {plan.kind === 'spawn'
            ? plan.jobs
                .filter((job) => job.prompt)
                .map((job, index) => (
                  <p key={`${job.agent}-${index}`} className={styles.prompt}>
                    {agentName(held.workspace, job.agent)}: {job.prompt}
                  </p>
                ))
            : null}

          <p className={styles.detail}>
            {held.answer.action.choice} {held.answer.action.confidence.toFixed(2)} |{' '}
            {t('history.projectConf', { value: held.answer.project.confidence.toFixed(2) })} |{' '}
            {held.answer.latencyMs} ms | US$ {held.answer.costUsd.toFixed(6)}
          </p>

          {held.nextWarnings.map((warning) => (
            <p key={warning} className={styles.warning}>
              {t(WARNINGS[warning])}
            </p>
          ))}

          {message ? <p className={styles.blocked}>{message}</p> : null}

          <div className={styles.confirmRow}>
            {runnable ? (
              <button type="button" className={styles.confirmRun} onClick={confirm}>
                <Play size={13} aria-hidden />
                {t('confirm.run')}
              </button>
            ) : null}
            <button type="button" className={styles.confirmCancel} onClick={close}>
              {t('confirm.cancel')}
            </button>
          </div>
        </div>
      ) : null}

      <div
        ref={pillRef}
        className={styles.center}
        data-phase={phase}
        role="dialog"
        tabIndex={-1}
        aria-label={t('bar.title')}
      >
        {ready ? (
          <button
            type="button"
            className={styles.orb}
            onClick={toggleRecording}
            disabled={busy}
            aria-pressed={recording}
            aria-label={recording ? t('bar.stopRecording') : t('bar.startRecording')}
            title={recording ? t('bar.stopRecording') : t('bar.startRecordingTitle')}
          >
            <span className={styles.ring} aria-hidden="true" />
            {busy ? (
              <Loader2 size={21} strokeWidth={1.7} className={styles.spin} aria-hidden />
            ) : (
              <Mic size={21} strokeWidth={1.7} aria-hidden />
            )}
          </button>
        ) : (
          <span className={styles.orb} data-disabled="true" aria-hidden="true">
            <Mic size={21} strokeWidth={1.7} />
          </span>
        )}

        <div className={styles.captionRow}>
          <p className={styles.caption} aria-live="polite">
            {recording && micSilent
              ? t('bar.micSilent')
              : recording && heard
                ? tailOf(heard)
                : hint}
          </p>

          {ready ? (
            <button
              type="button"
              className={`${styles.toggleButton} ${keepListening ? styles.toggleButtonOn : ''}`}
              onClick={() => updateSettings({ keepListening: !keepListening })}
              aria-pressed={keepListening}
              disabled={busy}
              aria-label={t('bar.keepListening')}
              title={t('bar.keepListeningTitle')}
            >
              <Repeat size={12} aria-hidden />
            </button>
          ) : null}

          {ready && !recording && mics.length > 1 ? (
            <MicSelect
              className={styles.micSelect}
              devices={mics}
              value={microphoneId}
              defaultLabel={t('bar.micDefault')}
              ariaLabel={t('bar.micLabel')}
              onChange={(device) =>
                updateSettings({
                  microphoneId: device?.deviceId ?? null,
                  microphoneLabel: device?.label ?? null,
                })
              }
            />
          ) : null}
        </div>

        {message && !plan ? (
          <p className={styles.blocked} role="alert">
            {message}
          </p>
        ) : null}
      </div>

      {recording ? (
        <div className={styles.spectrum} aria-hidden="true">
          {[...levels]
            .reverse()
            .concat(levels)
            .map((value, index) => (
              <span
                key={index}
                className={styles.spectrumBar}
                style={{ transform: `scaleY(${1 + Math.min(1, value * 4) * 11})` }}
              />
            ))}
        </div>
      ) : null}

      <div className={styles.edge} data-phase={phase} aria-hidden="true">
        <span className={styles.edgeBase} />
        <span className={styles.edgePulse} />
        <span className={styles.edgeGlow} />
        <span className={styles.edgeScan} />
      </div>
    </div>
  )
}
