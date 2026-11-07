import { useSyncExternalStore } from 'react'

import type { PluginStorage } from './alethe'

export const CLOUD_MODELS = ['openai/gpt-audio-mini', 'google/gemini-3.1-flash-lite'] as const
export type CloudModel = (typeof CLOUD_MODELS)[number]

export const DEFAULT_MODEL_ID = 'parakeet-tdt-0.6b-v3-int8'

export type JevSettings = {
  // Never used: the app moves this legacy key into the keychain and blanks it
  apiKey: string
  keepListening: boolean
  // Gates the microphone for both the command bar and dictation
  voiceEnabled: boolean
  dictationMode: 'toggle' | 'hold'
  modelId: string
  provider: 'local' | 'openrouter'
  cloudModel: CloudModel
  microphoneId: string | null
  microphoneLabel: string | null
}

export const DEFAULT_SETTINGS: JevSettings = {
  apiKey: '',
  keepListening: false,
  voiceEnabled: false,
  dictationMode: 'toggle',
  modelId: DEFAULT_MODEL_ID,
  provider: 'local',
  cloudModel: 'openai/gpt-audio-mini',
  microphoneId: null,
  microphoneLabel: null,
}

const SETTINGS_KEY = 'settings'
const LEGACY_KEY = 'legacyPreferences'

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function normalizeSettings(raw: unknown): JevSettings {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    apiKey: typeof value.apiKey === 'string' ? value.apiKey : '',
    keepListening: value.keepListening === true,
    voiceEnabled: value.voiceEnabled === true,
    dictationMode: value.dictationMode === 'hold' ? 'hold' : 'toggle',
    modelId: text(value.modelId) ?? DEFAULT_MODEL_ID,
    provider: value.provider === 'openrouter' ? 'openrouter' : 'local',
    cloudModel: CLOUD_MODELS.includes(value.cloudModel as CloudModel)
      ? (value.cloudModel as CloudModel)
      : DEFAULT_SETTINGS.cloudModel,
    microphoneId: text(value.microphoneId),
    microphoneLabel: text(value.microphoneLabel),
  }
}

export function fromLegacyPreferences(legacy: Record<string, unknown>): JevSettings {
  return normalizeSettings({
    apiKey: legacy.voiceCommandApiKey,
    keepListening: legacy.voiceKeepListening,
    voiceEnabled: legacy.dictationEnabled,
    dictationMode: legacy.dictationMode,
    modelId: legacy.dictationModelId,
    provider: legacy.dictationProvider,
    cloudModel: legacy.dictationCloudModel,
    microphoneId: legacy.dictationMicrophoneId,
    microphoneLabel: legacy.dictationMicrophoneLabel,
  })
}

let settings: JevSettings = DEFAULT_SETTINGS
let storage: PluginStorage | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export async function loadSettings(target: PluginStorage): Promise<void> {
  storage = target
  const record = await target.read()
  if (record[SETTINGS_KEY] !== undefined) {
    settings = normalizeSettings(record[SETTINGS_KEY])
  } else if (record[LEGACY_KEY] && typeof record[LEGACY_KEY] === 'object') {
    settings = fromLegacyPreferences(record[LEGACY_KEY] as Record<string, unknown>)
    await target.set(SETTINGS_KEY, settings)
    await target.remove(LEGACY_KEY)
  } else {
    settings = DEFAULT_SETTINGS
  }
  emit()
}

export function getSettings(): JevSettings {
  return settings
}

export function updateSettings(patch: Partial<JevSettings>): void {
  settings = { ...settings, ...patch }
  emit()
  void storage?.set(SETTINGS_KEY, settings)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSettings(): JevSettings {
  return useSyncExternalStore(subscribe, getSettings, getSettings)
}
