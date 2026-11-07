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

export type Transcriber = {
  provider: 'local' | 'openrouter'
  modelId: string
  cloudModel: string
}

const voice = () => host().voice

export const jevDecide = (spoken: string, context: JevContext) =>
  host().invoke<JevDecision>('jev_decide', { spoken, context, native: false })

export const speechModelStates = () => voice().modelStates()
export const speechListInputDevices = () => voice().inputDevices()
export const speechStartCapture = (deviceId: string | null) =>
  voice().startCapture(deviceId ?? undefined)
export const speechCaptureLevel = () => voice().captureLevel()
export const speechVadStatus = () => voice().vadStatus()
export const speechPrepareVad = () => voice().prepareVad()
export const speechStopCapture = () => voice().stopCapture()
export const speechPrepare = (modelId: string) => voice().prepare({ modelId })
export const speechTranscribePartial = (modelId: string) => voice().transcribePartial({ modelId })

export function stopAndTranscribe({ provider, modelId, cloudModel }: Transcriber): Promise<string> {
  if (provider === 'openrouter') return voice().stopAndTranscribe({ provider, modelId: cloudModel })
  // No provider, so the host still infers apple-speech from the id
  return voice().stopAndTranscribe({ modelId })
}
