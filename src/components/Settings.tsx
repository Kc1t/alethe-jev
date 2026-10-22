import { useCallback, useEffect, useState } from 'react'

import { host, useT } from '../host'
import type { MessageKey } from '../messages/en'
import { CLOUD_MODELS, type CloudModel, updateSettings, useSettings } from '../settings'
import {
  SPEECH_DOWNLOAD_EVENT,
  type SpeechDownloadProgress,
  speechDeleteModel,
  speechDownloadModel,
  type SpeechInputDevice,
  speechListInputDevices,
  speechListModels,
  type SpeechModelManifest,
  type SpeechModelState,
  speechModelStates,
} from '../tauri'
import { MicSelect } from './MicSelect'
import styles from './Settings.module.css'

const CLOUD_MODEL_LABELS: Record<CloudModel, MessageKey> = {
  'openai/gpt-audio-mini': 'settings.dictationCloudModelGptAudioMini',
  'google/gemini-3.1-flash-lite': 'settings.dictationCloudModelGeminiFlashLite',
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

type Choice<T extends string> = { value: T; label: string }

function Segmented<T extends string>({
  value,
  choices,
  disabled,
  onChange,
}: {
  value: T
  choices: Choice<T>[]
  disabled?: boolean
  onChange: (value: T) => void
}) {
  return (
    <div className={styles.segmented}>
      {choices.map((choice) => (
        <button
          key={choice.value}
          type="button"
          className={value === choice.value ? styles.active : undefined}
          disabled={disabled}
          onClick={() => onChange(choice.value)}
        >
          {choice.label}
        </button>
      ))}
    </div>
  )
}

export function KeySetting() {
  const t = useT()
  const { apiKey } = useSettings()
  return (
    <input
      className={styles.keyInput}
      type="password"
      autoComplete="off"
      spellCheck={false}
      aria-label={t('bar.keyInputLabel')}
      placeholder={t('bar.keyPlaceholder')}
      value={apiKey}
      onChange={(event) => updateSettings({ apiKey: event.target.value })}
    />
  )
}

export function VoiceSetting() {
  const t = useT()
  const { voiceEnabled } = useSettings()
  const [error, setError] = useState<string | null>(null)

  const enable = async () => {
    setError(null)
    try {
      await speechListInputDevices()
      updateSettings({ voiceEnabled: true })
    } catch (cause) {
      setError(messageOf(cause))
    }
  }

  return (
    <div className={styles.fields}>
      <Segmented
        value={voiceEnabled ? 'on' : 'off'}
        choices={[
          { value: 'on', label: t('settings.dictationOn') },
          { value: 'off', label: t('settings.dictationOff') },
        ]}
        onChange={(next) => {
          if (next === 'on') void enable()
          else updateSettings({ voiceEnabled: false })
        }}
      />
      {error ? <p className={styles.warning}>{error}</p> : null}
    </div>
  )
}

export function ModeSetting() {
  const t = useT()
  const { voiceEnabled, dictationMode } = useSettings()
  return (
    <Segmented
      value={dictationMode}
      disabled={!voiceEnabled}
      choices={[
        { value: 'toggle', label: t('settings.dictationModeToggle') },
        { value: 'hold', label: t('settings.dictationModeHold') },
      ]}
      onChange={(next) => updateSettings({ dictationMode: next })}
    />
  )
}

export function MicrophoneSetting() {
  const t = useT()
  const { voiceEnabled, microphoneId } = useSettings()
  const [mics, setMics] = useState<SpeechInputDevice[]>([])

  useEffect(() => {
    let cancelled = false
    void speechListInputDevices()
      .then((devices) => {
        if (!cancelled) setMics(devices)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const systemLabel = t('settings.dictationMicSystem')
  return (
    <MicSelect
      className={styles.micSelect}
      disabled={!voiceEnabled}
      devices={mics.map((device) => ({
        ...device,
        label: device.isDefault ? `${device.label} (${systemLabel})` : device.label,
      }))}
      value={microphoneId}
      defaultLabel={systemLabel}
      ariaLabel={t('settings.dictationMic')}
      onChange={(device) =>
        updateSettings({
          microphoneId: device?.deviceId ?? null,
          microphoneLabel: device
            ? (mics.find((m) => m.deviceId === device.deviceId)?.label ?? null)
            : null,
        })
      }
    />
  )
}

export function TranscriberSetting() {
  const t = useT()
  const { voiceEnabled, provider } = useSettings()
  return (
    <Segmented
      value={provider}
      disabled={!voiceEnabled}
      choices={[
        { value: 'local', label: t('settings.dictationProviderLocal') },
        { value: 'openrouter', label: t('settings.dictationProviderOpenRouter') },
      ]}
      onChange={(next) => updateSettings({ provider: next })}
    />
  )
}

function CloudModelSetting() {
  const t = useT()
  const { voiceEnabled, cloudModel } = useSettings()
  return (
    <Segmented
      value={cloudModel}
      disabled={!voiceEnabled}
      choices={CLOUD_MODELS.map((model) => ({ value: model, label: t(CLOUD_MODEL_LABELS[model]) }))}
      onChange={(next) => updateSettings({ cloudModel: next })}
    />
  )
}

function LocalModelSetting() {
  const t = useT()
  const { modelId } = useSettings()
  const [models, setModels] = useState<SpeechModelManifest[]>([])
  const [states, setStates] = useState<Record<string, SpeechModelState>>({})
  const [fraction, setFraction] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshStates = useCallback(async () => {
    const next: Record<string, SpeechModelState> = {}
    for (const state of await speechModelStates()) next[state.id] = state
    setStates(next)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const catalog = await speechListModels()
        if (cancelled) return
        setModels(catalog)
        await refreshStates()
      } catch (cause) {
        if (!cancelled) setError(messageOf(cause))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshStates])

  useEffect(() => {
    const subscription = host().listen<SpeechDownloadProgress>(
      SPEECH_DOWNLOAD_EVENT,
      (progress) => {
        if (progress.modelId === modelId) setFraction(progress.fraction)
      },
    )
    return () => subscription.dispose()
  }, [modelId])

  const model = models.find((item) => item.id === modelId) ?? models[0]
  const ready = model ? states[model.id]?.status === 'ready' : false

  const download = async () => {
    if (!model) return
    setBusy(true)
    setError(null)
    setFraction(0)
    try {
      await speechDownloadModel(model.id)
      updateSettings({ modelId: model.id })
      await refreshStates()
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(false)
      setFraction(null)
    }
  }

  const remove = async () => {
    if (!model) return
    setBusy(true)
    setError(null)
    try {
      await speechDeleteModel(model.id)
      await refreshStates()
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }

  if (!model) {
    return (
      <div className={styles.fields}>
        <p>{t('settings.dictationModelLoading')}</p>
        {error ? <p className={styles.warning}>{error}</p> : null}
      </div>
    )
  }

  return (
    <div className={styles.fields}>
      <p>
        <strong>{model.label}</strong>
        {model.recommended ? ` · ${t('settings.dictationModelRecommended')}` : null}
        {` · ${formatBytes(model.sizeBytes)}`}
      </p>
      <p>{model.description}</p>
      <p>{ready ? t('settings.dictationModelReady') : t('settings.dictationModelMissing')}</p>
      {fraction != null ? (
        <p>{t('settings.dictationModelProgress', { percent: Math.round(fraction * 100) })}</p>
      ) : null}
      <div className={styles.segmented}>
        <button type="button" disabled={busy || ready} onClick={() => void download()}>
          {t('settings.dictationModelDownload')}
        </button>
        <button type="button" disabled={busy || !ready} onClick={() => void remove()}>
          {t('settings.dictationModelDelete')}
        </button>
      </div>
      {error ? <p className={styles.warning}>{error}</p> : null}
    </div>
  )
}

export function ModelSetting() {
  const { provider } = useSettings()
  return provider === 'openrouter' ? <CloudModelSetting /> : <LocalModelSetting />
}
