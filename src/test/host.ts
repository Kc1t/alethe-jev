import { vi } from 'vitest'

import type { PluginContext, VoiceProviderCatalog } from '../alethe'

const translate = (key: string, params?: Record<string, string | number>) =>
  params ? `${key} ${JSON.stringify(params)}` : key

export function openRouterCatalog(hasKey: boolean): VoiceProviderCatalog[] {
  return [
    {
      provider: 'openai',
      keyUrl: 'https://platform.openai.com/api-keys',
      models: [],
      voices: [],
      hasKey: true,
    },
    {
      provider: 'openrouter',
      keyUrl: 'https://openrouter.ai/settings/keys',
      models: [{ id: 'openai/whisper-1', label: 'OpenAI Whisper', capability: 'stt' }],
      voices: [],
      hasKey,
    },
  ]
}

export function createVoiceMock() {
  return {
    inputDevices: vi.fn().mockResolvedValue([]),
    modelStates: vi.fn().mockResolvedValue([]),
    prepare: vi.fn().mockResolvedValue(true),
    startCapture: vi.fn().mockResolvedValue(undefined),
    captureLevel: vi.fn().mockResolvedValue(0),
    vadStatus: vi.fn().mockResolvedValue(null),
    prepareVad: vi.fn().mockResolvedValue(true),
    stopCapture: vi.fn().mockResolvedValue({ samples: [], sampleRate: 16000, peak: 0 }),
    stopAndTranscribe: vi.fn().mockResolvedValue(''),
    transcribePartial: vi.fn().mockResolvedValue(''),
    providers: vi.fn().mockResolvedValue(openRouterCatalog(true)),
    openSettings: vi.fn(),
  }
}

export type VoiceMock = ReturnType<typeof createVoiceMock>

export function createHostMock() {
  const voice = createVoiceMock()
  const invoke = vi.fn()
  const toast = vi.fn()
  const openTerminal = vi.fn()
  const context = {
    t: translate,
    useT: () => translate,
    ui: { toast, revealView: vi.fn() },
    workspace: {
      snapshot: () => ({
        projects: [{ id: 'lab', name: 'Jev Lab', path: 'D:/lab' }],
        terminals: [],
        agents: [{ id: 'claude', label: 'Claude Code' }],
        focusedProjectId: 'lab',
        focusedTerminalId: null,
      }),
      openAgentTerminal: openTerminal,
      focusTerminal: vi.fn(),
      closeTerminal: vi.fn(),
      writeToTerminal: vi.fn(),
    },
    invoke,
    voice,
  } as unknown as PluginContext
  return { context, voice, invoke, toast, openTerminal }
}
