import { describe, expect, it } from 'vitest'

import type { PluginStorage } from './alethe'
import {
  DEFAULT_SETTINGS,
  getSettings,
  loadSettings,
  normalizeSettings,
  updateSettings,
} from './settings'

function memoryStorage(initial: Record<string, unknown>): PluginStorage & {
  record: Record<string, unknown>
} {
  const record = { ...initial }
  return {
    record,
    read: async () => ({ ...record }),
    get: async (key, fallback) => (key in record ? (record[key] as never) : fallback),
    set: async (key, value) => {
      record[key] = value
    },
    remove: async (key) => {
      delete record[key]
    },
    clear: async () => {
      for (const key of Object.keys(record)) delete record[key]
    },
  }
}

describe('Jev settings', () => {
  it('starts from the defaults on a fresh install', async () => {
    await loadSettings(memoryStorage({}))
    expect(getSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('adopts the preferences Alethe handed over and stores them in its own shape', async () => {
    const storage = memoryStorage({
      legacyPreferences: {
        voiceCommandApiKey: 'sk-or-1',
        voiceKeepListening: true,
        dictationEnabled: true,
        dictationMode: 'hold',
        dictationProvider: 'openrouter',
        dictationCloudModel: 'google/gemini-3.1-flash-lite',
        dictationMicrophoneId: 'mic-2',
        dictationMicrophoneLabel: 'USB Mic',
      },
    })
    await loadSettings(storage)
    expect(getSettings()).toMatchObject({
      apiKey: 'sk-or-1',
      keepListening: true,
      voiceEnabled: true,
      dictationMode: 'hold',
      provider: 'openrouter',
      cloudModel: 'google/gemini-3.1-flash-lite',
      microphoneId: 'mic-2',
      microphoneLabel: 'USB Mic',
    })
    expect(storage.record.legacyPreferences).toBeUndefined()
    expect(storage.record.settings).toEqual(getSettings())
  })

  it('prefers its own settings over a stale handover', async () => {
    await loadSettings(
      memoryStorage({
        settings: { apiKey: 'current' },
        legacyPreferences: { voiceCommandApiKey: 'old' },
      }),
    )
    expect(getSettings().apiKey).toBe('current')
  })

  it('repairs values it does not recognise', () => {
    expect(
      normalizeSettings({
        provider: 'whisper',
        cloudModel: 'x',
        dictationMode: 'push',
        modelId: ' ',
      }),
    ).toMatchObject({
      provider: 'local',
      cloudModel: DEFAULT_SETTINGS.cloudModel,
      dictationMode: 'toggle',
      modelId: DEFAULT_SETTINGS.modelId,
    })
  })

  it('writes a stored legacy key back unchanged when other settings change', async () => {
    const storage = memoryStorage({ settings: { apiKey: 'sk-or-legacy', voiceEnabled: true } })
    await loadSettings(storage)
    updateSettings({ keepListening: true, provider: 'openrouter' })
    expect(storage.record.settings).toMatchObject({
      apiKey: 'sk-or-legacy',
      keepListening: true,
      provider: 'openrouter',
    })
  })

  it('keeps a key the app already blanked blank', async () => {
    const storage = memoryStorage({ settings: { apiKey: '', voiceEnabled: true } })
    await loadSettings(storage)
    updateSettings({ dictationMode: 'hold' })
    expect((storage.record.settings as { apiKey: string }).apiKey).toBe('')
  })
})
