import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { history } from '../history'
import { bindHost } from '../host'
import { refreshOpenRouterKey, resetOpenRouterKey } from '../openRouterKey'
import { DEFAULT_SETTINGS, updateSettings } from '../settings'
import { createHostMock, openRouterCatalog } from '../test/host'
import { VoiceBar } from './VoiceBar'

let host = createHostMock()

function open() {
  fireEvent.keyDown(window, { key: ' ', code: 'Space', ctrlKey: true, shiftKey: true })
}

describe('voice pill capture lifecycle', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    host = createHostMock()
    bindHost(host.context)
    resetOpenRouterKey()
    await refreshOpenRouterKey()
    updateSettings({
      ...DEFAULT_SETTINGS,
      voiceEnabled: true,
      modelId: 'test-model',
    })
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
    expect(host.voice.stopCapture).toHaveBeenCalledOnce()
  })

  it('stops a capture that finishes starting after Escape', async () => {
    let finish!: () => void
    host.voice.startCapture.mockReturnValue(
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
    expect(host.voice.stopCapture).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not start continuous capture without an OpenRouter key in the app', async () => {
    host.voice.providers.mockResolvedValue(openRouterCatalog(false))
    await refreshOpenRouterKey()
    updateSettings({ keepListening: true })
    render(<VoiceBar />)
    open()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    expect(host.voice.startCapture).not.toHaveBeenCalled()
  })

  it('does not allow typing commands or keys in the pill', async () => {
    host.voice.providers.mockResolvedValue(openRouterCatalog(false))
    await refreshOpenRouterKey()
    render(<VoiceBar />)
    open()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(document.querySelector('input')).toBeNull()
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(screen.getByText('bar.noKeyHint')).toBeInTheDocument()
  })

  it('enables the mic once the OpenRouter key is saved and the window regains focus', async () => {
    host.voice.providers.mockResolvedValue(openRouterCatalog(false))
    await refreshOpenRouterKey()
    render(<VoiceBar />)
    open()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(screen.queryByRole('button', { name: /bar\.(start|stop)Recording/ })).toBeNull()
    expect(host.voice.startCapture).not.toHaveBeenCalled()

    host.voice.providers.mockResolvedValue(openRouterCatalog(true))
    await act(async () => {
      fireEvent.focus(window)
    })
    expect(screen.queryByText('bar.noKeyHint')).not.toBeInTheDocument()
    expect(host.voice.startCapture).toHaveBeenCalledOnce()
  })

  it('treats a key for another provider as no OpenRouter key', async () => {
    host.voice.providers.mockResolvedValue(
      openRouterCatalog(false).map((entry) => ({
        ...entry,
        hasKey: entry.provider !== 'openrouter',
      })),
    )
    await refreshOpenRouterKey()
    render(<VoiceBar />)
    open()
    expect(screen.getByText('bar.noKeyHint')).toBeInTheDocument()
  })

  it('re-arms continuous capture only after transcription finishes', async () => {
    updateSettings({ keepListening: true })
    let finish!: (text: string) => void
    host.voice.stopAndTranscribe.mockReturnValue(
      new Promise<string>((resolve) => {
        finish = resolve
      }),
    )
    render(<VoiceBar />)
    open()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })
    expect(host.voice.startCapture).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'bar.stopRecording' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    expect(host.voice.startCapture).toHaveBeenCalledOnce()
    await act(async () => {
      finish('')
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })
    expect(host.voice.startCapture).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('transcribes through OpenRouter without local model work when selected', async () => {
    updateSettings({ provider: 'openrouter' })
    host.voice.stopAndTranscribe.mockResolvedValue('')
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
    expect(host.voice.transcribePartial).not.toHaveBeenCalled()
    expect(host.voice.prepare).not.toHaveBeenCalled()
    expect(host.voice.stopAndTranscribe).toHaveBeenCalledWith({
      provider: 'openrouter',
      modelId: 'openai/gpt-audio-mini',
    })
  })

  it('creates and records all three terminals requested by a voice decision', async () => {
    const answer = (choice: string) => ({ choice, confidence: 0.95, probabilities: {} })
    host.voice.stopAndTranscribe.mockResolvedValue('open up three terminals')
    host.invoke.mockResolvedValue({
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
    host.openTerminal.mockImplementation(
      async () => `terminal-${host.openTerminal.mock.calls.length}`,
    )
    render(<VoiceBar />)
    open()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'bar.startRecording' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'bar.stopRecording' }))
    })
    expect(host.voice.stopAndTranscribe).toHaveBeenCalledWith({ modelId: 'test-model' })
    expect(host.invoke).toHaveBeenCalledWith('jev_decide', {
      spoken: 'open up three terminals',
      context: expect.any(Object),
      native: false,
    })
    expect(host.openTerminal).toHaveBeenCalledTimes(3)
    expect(host.openTerminal).toHaveBeenCalledWith('lab', {
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
