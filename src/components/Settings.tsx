import { useEffect, useState } from 'react'

import type { VoiceInputDevice } from '../alethe'
import { useT } from '../host'
import type { MessageKey } from '../messages/en'
import { openVoiceSettings, useOpenRouterKey } from '../openRouterKey'
import { CLOUD_MODELS, type CloudModel, updateSettings, useSettings } from '../settings'
import { speechListInputDevices, speechModelStates } from '../tauri'
import { MicSelect } from './MicSelect'
import styles from './Settings.module.css'

const CLOUD_MODEL_LABELS: Record<CloudModel, MessageKey> = {
  'openai/gpt-audio-mini': 'settings.dictationCloudModelGptAudioMini',
  'google/gemini-3.1-flash-lite': 'settings.dictationCloudModelGeminiFlashLite',
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

const READY = 'ready'

function openVoiceSettingsQuietly() {
  void openVoiceSettings().catch(() => undefined)
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

export function OpenRouterKeySetting() {
  const t = useT()
  const hasKey = useOpenRouterKey()
  return (
    <div className={styles.fields}>
      <p className={hasKey ? undefined : styles.warning}>
        {hasKey ? t('settings.openRouterKeySet') : t('settings.openRouterKeyMissing')}
      </p>
      <button type="button" className={styles.action} onClick={openVoiceSettingsQuietly}>
        {t('settings.openVoiceSettings')}
      </button>
    </div>
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
  const [mics, setMics] = useState<VoiceInputDevice[]>([])

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
  const { voiceEnabled, modelId } = useSettings()
  const [ready, setReady] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    speechModelStates()
      .then((states) => {
        if (cancelled) return
        setReady(
          states
            .filter((state) => state.status === READY && state.kind !== 'tts')
            .map((state) => state.id),
        )
      })
      .catch((cause) => {
        if (!cancelled) setError(messageOf(cause))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const manage = (
    <button type="button" className={styles.action} onClick={openVoiceSettingsQuietly}>
      {t('settings.manageModels')}
    </button>
  )

  if (error) {
    return (
      <div className={styles.fields}>
        <p className={styles.warning}>{error}</p>
        {manage}
      </div>
    )
  }

  if (!ready) {
    return (
      <div className={styles.fields}>
        <p>{t('settings.dictationModelLoading')}</p>
      </div>
    )
  }

  const chosenReady = ready.includes(modelId)
  return (
    <div className={styles.fields}>
      {ready.length > 0 ? (
        <select
          className={styles.modelSelect}
          value={chosenReady ? modelId : ''}
          disabled={!voiceEnabled}
          aria-label={t('settings.dictationModel')}
          onChange={(event) => updateSettings({ modelId: event.target.value })}
        >
          {chosenReady ? null : (
            <option value="" disabled>
              {modelId}
            </option>
          )}
          {ready.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      ) : null}
      {chosenReady ? null : (
        <p className={styles.warning}>{t('settings.dictationModelMissing', { model: modelId })}</p>
      )}
      {manage}
    </div>
  )
}

export function ModelSetting() {
  const { provider } = useSettings()
  return provider === 'openrouter' ? <CloudModelSetting /> : <LocalModelSetting />
}
