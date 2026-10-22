import { Loader2, Mic, MicOff } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { host, useT } from '../host'
import { formatShortcut } from '../platform'
import { useSettings } from '../settings'
import { speechStartCapture, speechStopCapture, stopAndTranscribe } from '../tauri'
import styles from './Dictation.module.css'

const ERROR_VISIBLE_MS = 4000

function isDictationChord(e: KeyboardEvent): boolean {
  const ctrl = e.ctrlKey || e.metaKey
  return ctrl && !e.altKey && !e.shiftKey && (e.key === 'e' || e.key === 'E')
}

export function Dictation() {
  const t = useT()
  const { voiceEnabled, dictationMode, modelId, microphoneId, provider, cloudModel, apiKey } =
    useSettings()
  const [listening, setListening] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recordingRef = useRef(false)
  const holdActiveRef = useRef(false)
  const busyRef = useRef(false)

  const insertTranscript = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      const { workspace } = host()
      const terminalId = workspace.snapshot().focusedTerminalId
      if (!terminalId) throw new Error(t('dictation.noActiveTerminal'))
      await workspace.writeToTerminal(terminalId, `${trimmed} `)
    },
    [t],
  )

  const stopCapture = useCallback(async () => {
    if (!recordingRef.current) return
    recordingRef.current = false
    setListening(false)
    busyRef.current = true
    setBusy(true)
    setError(null)
    try {
      if (provider === 'openrouter' && !apiKey.trim()) {
        await speechStopCapture()
        setError(t('dictation.missingCloudKey'))
        return
      }
      const text = await stopAndTranscribe({ provider, modelId, cloudModel, apiKey })
      if (!text.trim()) {
        setError(t('dictation.emptyTranscript'))
        return
      }
      await insertTranscript(text)
    } catch (cause) {
      await speechStopCapture().catch(() => undefined)
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [apiKey, cloudModel, insertTranscript, modelId, provider, t])

  const startCapture = useCallback(async () => {
    if (recordingRef.current || busyRef.current) return
    setError(null)
    try {
      await speechStartCapture(microphoneId)
      recordingRef.current = true
      setListening(true)
    } catch (cause) {
      recordingRef.current = false
      setError(cause instanceof Error ? cause.message : String(cause))
      setListening(false)
    }
  }, [microphoneId])

  const toggle = useCallback(() => {
    if (recordingRef.current) void stopCapture()
    else void startCapture()
  }, [startCapture, stopCapture])

  useEffect(() => {
    if (!voiceEnabled) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isDictationChord(e) || e.repeat) return
      e.preventDefault()
      e.stopPropagation()
      if (dictationMode === 'hold') {
        if (holdActiveRef.current) return
        holdActiveRef.current = true
        void startCapture()
        return
      }
      toggle()
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (dictationMode !== 'hold') return
      if (e.key !== 'Control' && e.key !== 'Meta' && e.key !== 'e' && e.key !== 'E') return
      if (!holdActiveRef.current) return
      holdActiveRef.current = false
      void stopCapture()
    }

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
    }
  }, [voiceEnabled, dictationMode, startCapture, stopCapture, toggle])

  useEffect(
    () => () => {
      if (!recordingRef.current) return
      recordingRef.current = false
      void speechStopCapture().catch(() => undefined)
    },
    [],
  )

  useEffect(() => {
    if (!error || listening || busy) return
    const timer = window.setTimeout(() => setError(null), ERROR_VISIBLE_MS)
    return () => window.clearTimeout(timer)
  }, [error, listening, busy])

  if (!voiceEnabled) return null
  if (!listening && !busy && !error) return null

  const shortcut = formatShortcut('Ctrl+E')
  const title = error
    ? error
    : busy
      ? t('dictation.transcribing')
      : t('dictation.stopShortcut', { shortcut })

  return (
    <button
      type="button"
      className={`${styles.btn} ${listening ? styles.listening : ''} ${busy ? styles.busy : ''} ${error ? styles.error : ''}`}
      onClick={() => {
        if (busy) return
        if (listening) {
          void stopCapture()
          return
        }
        setError(null)
      }}
      disabled={busy}
      title={title}
      aria-label={busy ? t('dictation.transcribing') : t('dictation.label')}
      aria-pressed={listening}
      aria-busy={busy}
    >
      {busy ? (
        <Loader2 size={18} className={styles.spin} aria-hidden />
      ) : listening ? (
        <Mic size={18} aria-hidden />
      ) : (
        <MicOff size={18} aria-hidden />
      )}
    </button>
  )
}
