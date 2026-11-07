import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { VoiceModelState } from '../alethe'
import { bindHost } from '../host'
import { resetOpenRouterKey } from '../openRouterKey'
import { DEFAULT_SETTINGS, getSettings, updateSettings } from '../settings'
import { createHostMock, openRouterCatalog } from '../test/host'
import { ModelSetting, OpenRouterKeySetting } from './Settings'

let host = createHostMock()

function modelState(id: string, status: string, kind: 'stt' | 'tts' = 'stt'): VoiceModelState {
  return { id, status, progress: null, error: null, downloadedBytes: null, totalBytes: null, kind }
}

async function renderSettled(element: ReactElement) {
  await act(async () => {
    render(element)
  })
}

beforeEach(() => {
  host = createHostMock()
  bindHost(host.context)
  resetOpenRouterKey()
  updateSettings({ ...DEFAULT_SETTINGS, voiceEnabled: true, modelId: 'parakeet' })
})

afterEach(() => cleanup())

describe('OpenRouter key setting', () => {
  it('reports a key saved in Preferences → Voice without ever showing it', async () => {
    await renderSettled(<OpenRouterKeySetting />)
    expect(host.voice.providers).toHaveBeenCalled()
    expect(screen.getByText('settings.openRouterKeySet')).toBeInTheDocument()
    expect(document.querySelector('input')).toBeNull()
  })

  it('reports a missing key and sends the person to the voice settings', async () => {
    host.voice.providers.mockResolvedValue(openRouterCatalog(false))
    await renderSettled(<OpenRouterKeySetting />)
    expect(screen.getByText('settings.openRouterKeyMissing')).toBeInTheDocument()

    host.voice.providers.mockResolvedValue(openRouterCatalog(true))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'settings.openVoiceSettings' }))
    })
    expect(host.voice.openSettings).toHaveBeenCalledOnce()
    expect(screen.getByText('settings.openRouterKeySet')).toBeInTheDocument()
  })
})

describe('local model setting', () => {
  it('offers only downloaded models and lets the person pick one', async () => {
    host.voice.modelStates.mockResolvedValue([
      modelState('parakeet', 'ready'),
      modelState('whisper-small', 'ready'),
      modelState('moonshine', 'not-downloaded'),
      modelState('sensevoice', 'downloading'),
      modelState('kokoro-en', 'ready', 'tts'),
    ])
    await renderSettled(<ModelSetting />)
    const select = screen.getByRole('combobox', { name: 'settings.dictationModel' })
    const options = [...select.querySelectorAll('option')].map((option) => option.value)
    expect(options).toEqual(['parakeet', 'whisper-small'])
    fireEvent.change(select, { target: { value: 'whisper-small' } })
    expect(getSettings().modelId).toBe('whisper-small')
    expect(screen.queryByText(/settings\.dictationModelMissing/)).toBeNull()
    expect(screen.queryByRole('button', { name: /download/i })).toBeNull()
  })

  it('points to Manage models when the chosen model is not downloaded', async () => {
    host.voice.modelStates.mockResolvedValue([modelState('parakeet', 'not-downloaded')])
    await renderSettled(<ModelSetting />)
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(
      screen.getByText('settings.dictationModelMissing {"model":"parakeet"}'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'settings.manageModels' }))
    expect(host.voice.openSettings).toHaveBeenCalledOnce()
  })

  it('shows the host error when model states cannot be read', async () => {
    host.voice.modelStates.mockRejectedValue(new Error('models folder unreadable'))
    await renderSettled(<ModelSetting />)
    expect(screen.getByText('models folder unreadable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'settings.manageModels' })).toBeInTheDocument()
  })
})
