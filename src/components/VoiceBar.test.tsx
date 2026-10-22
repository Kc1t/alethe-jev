import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PluginContext } from '../alethe'

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  transcribe: vi.fn(),
  partial: vi.fn(),
  prepare: vi.fn(),
  decide: vi.fn(),
  openTerminal: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('../tauri', () => ({
  speechStartCapture: mocks.start,
  speechStopCapture: mocks.stop,
  speechListInputDevices: vi.fn().mockResolvedValue([]),
  speechPrepare: mocks.prepare,
  speechCaptureLevel: vi.fn().mockResolvedValue(0),
  speechVadStatus: vi.fn().mockResolvedValue(null),
  speechPrepareVad: vi.fn().mockResolvedValue(true),
  speechTranscribePartial: mocks.partial,
  stopAndTranscribe: mocks.transcribe,
  jevDecide: mocks.decide,
}))

import { history } from '../history'
import { bindHost } from '../host'
import { DEFAULT_SETTINGS, updateSettings } from '../settings'
import { VoiceBar } from './VoiceBar'

const translate = (key: string) => key

const context = {
  t: translate,
  useT: () => translate,
  ui: { toast: mocks.toast, revealView: vi.fn() },
  workspace: {
    snapshot: () => ({
      projects: [{ id: 'lab', name: 'Jev Lab', path: 'D:/lab' }],
      terminals: [],
      agents: [{ id: 'claude', label: 'Claude Code' }],
      focusedProjectId: 'lab',
      focusedTerminalId: null,
    }),
    openAgentTerminal: mocks.openTerminal,
    focusTerminal: vi.fn(),
    closeTerminal: vi.fn(),
    writeToTerminal: vi.fn(),
  },
} as unknown as PluginContext

function open() {
  fireEvent.keyDown(window, { key: ' ', code: 'Space', ctrlKey: true, shiftKey: true })
}

describe('voice pill capture lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    bindHost(context)
    updateSettings({
      ...DEFAULT_SETTINGS,
      apiKey: 'test-key',
      voiceEnabled: true,
      modelId: 'test-model',
    })
    mocks.partial.mockResolvedValue('')
    mocks.prepare.mockResolvedValue(undefined)
    mocks.start.mockResolvedValue(undefined)
    mocks.stop.mockResolvedValue(undefined)
    history.clear()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('stops a live capture when the open shortcut closes the pill', async () => {
    render(<VoiceBar />)
    open()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'bar.startRecording' }))
    })
    open()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mocks.stop).toHaveBeenCalledOnce()
  })

  it('stops a capture that finishes starting after Escape', async () => {
    let finish!: () => void
    mocks.start.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve
      }),
    )
    render(<VoiceBar />)
    open()
    fireEvent.click(screen.getByRole('button', { name: 'bar.startRecording' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    await act(async () => {
      finish()
    })
    expect(mocks.stop).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not start continuous capture without an API key', async () => {
    updateSettings({ apiKey: '', keepListening: true })
    render(<VoiceBar />)
    open()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    expect(mocks.start).not.toHaveBeenCalled()
  })

  it('does not allow typing commands or keys in the pill', () => {
    updateSettings({ apiKey: '' })
    render(<VoiceBar />)
    open()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(document.querySelector('input')).toBeNull()
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(screen.getByText('bar.noKeyHint')).toBeInTheDocument()
  })

  it('re-arms continuous capture only after transcription finishes', async () => {
    updateSettings({ keepListening: true })
    let finish!: (text: string) => void
    mocks.transcribe.mockReturnValue(
      new Promise<string>((resolve) => {
        finish = resolve
      }),
    )
    render(<VoiceBar />)
    open()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })
    expect(mocks.start).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'bar.stopRecording' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    expect(mocks.start).toHaveBeenCalledOnce()
    await act(async () => {
      finish('')
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })
    expect(mocks.start).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('transcribes through OpenRouter without local model work when selected', async () => {
    updateSettings({ provider: 'openrouter' })
    mocks.transcribe.mockResolvedValue('')
    render(<VoiceBar />)
    open()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'bar.startRecording' }))
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'bar.stopRecording' }))
    })
    expect(mocks.partial).not.toHaveBeenCalled()
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(mocks.transcribe).toHaveBeenCalledWith({
      provider: 'openrouter',
      modelId: 'test-model',
      cloudModel: 'openai/gpt-audio-mini',
      apiKey: 'test-key',
    })
  })

  it('creates and records all three terminals requested by a voice decision', async () => {
    const answer = (choice: string) => ({ choice, confidence: 0.95, probabilities: {} })
    mocks.transcribe.mockResolvedValue('open up three terminals')
    mocks.decide.mockResolvedValue({
      action: answer('new_terminal'),
      agent: answer('claude'),
      project: answer('lab'),
      terminal: answer('none'),
      prompt: '',
      promptConfidence: 0,
      tasks: [],
      leadCount: 0.9,
      parallel: 0,
      howMany: 0.5,
      addressedToApp: 0.95,
      destructive: 0,
      latencyMs: 10,
      costUsd: 0,
    })
    mocks.openTerminal.mockImplementation(
      async () => `terminal-${mocks.openTerminal.mock.calls.length}`,
    )
    render(<VoiceBar />)
    open()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'bar.startRecording' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'bar.stopRecording' }))
    })
    expect(mocks.openTerminal).toHaveBeenCalledTimes(3)
    expect(mocks.openTerminal).toHaveBeenCalledWith('lab', {
      agent: 'claude',
      name: 'Claude Code 1',
      prompt: undefined,
    })
    const entry = history.entries()[0]
    expect(entry.status).toBe('ran')
    expect(entry.actions).toHaveLength(3)
    expect(entry.plan?.kind === 'spawn' && entry.plan.jobs.length).toBe(3)
  })
})
