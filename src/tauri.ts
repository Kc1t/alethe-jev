import { host } from './host'

export type JevAnswer = {
  choice: string
  confidence: number
  probabilities: Record<string, number>
}

export type JevTask = {
  prompt: string
  promptConfidence: number
  agent: JevAnswer
  count: number
}

export type JevDecision = {
  action: JevAnswer
  agent: JevAnswer
  project: JevAnswer
  terminal: JevAnswer
  prompt: string
  promptConfidence: number
  tasks: JevTask[]
  leadCount: number
  multiTask: number
  parallel: number
  howMany: number
  addressedToApp: number
  destructive: number
  latencyMs: number
  costUsd: number
}

export type JevContext = {
  projects: { id: string; name: string; path: string }[]
  terminals: {
    id: string
    project: string
    agent: string
    cwd: string
    busy: boolean
    name: string
    ordinal: number
  }[]
  agents: string[]
  focusedProject: string | null
  focusedTerminal: string | null
}

export type SpeechModelManifest = {
  id: string
  label: string
  description: string
  language: string
  sampleRate: number
  sizeBytes: number
  recommended: boolean
}

export type SpeechModelState = {
  id: string
  status: 'not-downloaded' | 'downloading' | 'ready' | 'error' | string
  progress?: number | null
  error?: string | null
}

export type SpeechDownloadProgress = {
  modelId: string
  downloaded: number
  total: number
  fraction: number
}

export type SpeechInputDevice = {
  deviceId: string
  label: string
  isDefault: boolean
}

export type VadStatus = {
  level: number
  voice: boolean
  heardMs: number
  silenceMs: number
  segments: number
}

export type Transcriber = {
  provider: 'local' | 'openrouter'
  modelId: string
  cloudModel: string
  apiKey: string
}

const call = <T>(command: string, args?: Record<string, unknown>) => host().invoke<T>(command, args)

export const jevDecide = (spoken: string, context: JevContext, apiKey: string) =>
  call<JevDecision>('jev_decide', { spoken, context, apiKey, native: false })

export const speechListModels = () => call<SpeechModelManifest[]>('speech_list_models')
export const speechModelStates = () => call<SpeechModelState[]>('speech_model_states')
export const speechDownloadModel = (modelId: string) =>
  call<SpeechModelState>('speech_download_model', { modelId })
export const speechDeleteModel = (modelId: string) => call<void>('speech_delete_model', { modelId })
export const speechListInputDevices = () => call<SpeechInputDevice[]>('speech_list_input_devices')
export const speechStartCapture = (deviceId: string | null) =>
  call<void>('speech_start_capture', { deviceId })
export const speechCaptureLevel = () => call<number>('speech_capture_level')
export const speechVadStatus = () => call<VadStatus | null>('speech_vad_status')
export const speechPrepareVad = () => call<boolean>('speech_prepare_vad')
export const speechStopCapture = () => call<unknown>('speech_stop_capture')
export const speechPrepare = (modelId: string) => call<boolean>('speech_prepare', { modelId })
export const speechTranscribePartial = (modelId: string) =>
  call<string>('speech_transcribe_partial', { modelId })

export function stopAndTranscribe(transcriber: Transcriber): Promise<string> {
  return transcriber.provider === 'openrouter'
    ? call<string>('speech_stop_and_transcribe_cloud', {
        apiKey: transcriber.apiKey,
        model: transcriber.cloudModel,
      })
    : call<string>('speech_stop_and_transcribe', { modelId: transcriber.modelId })
}

export const SPEECH_DOWNLOAD_EVENT = 'speech://download-progress'
