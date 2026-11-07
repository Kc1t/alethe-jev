import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { bindHost } from '../host'
import { resetOpenRouterKey } from '../openRouterKey'
import { DEFAULT_SETTINGS, updateSettings } from '../settings'
import { createHostMock, openRouterCatalog } from '../test/host'
import { Dictation } from './Dictation'

let host = createHostMock()

async function pressDictation() {
  await act(async () => {
    fireEvent.keyDown(window, { key: 'e', ctrlKey: true })
  })
}

beforeEach(() => {
  host = createHostMock()
  bindHost(host.context)
  resetOpenRouterKey()
  updateSettings({ ...DEFAULT_SETTINGS, voiceEnabled: true, provider: 'openrouter' })
})

afterEach(() => cleanup())

describe('cloud dictation', () => {
  it('asks for the OpenRouter key instead of transcribing when the app has none', async () => {
    host.voice.providers.mockResolvedValue(openRouterCatalog(false))
    render(<Dictation />)
    await pressDictation()
    await pressDictation()
    expect(host.voice.stopCapture).toHaveBeenCalledOnce()
    expect(host.voice.stopAndTranscribe).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'dictation.label' })).toHaveAttribute(
      'title',
      'dictation.missingCloudKey',
    )
  })

  it('transcribes with the cloud model id when the app has the key', async () => {
    host.voice.stopAndTranscribe.mockResolvedValue('hello')
    render(<Dictation />)
    await pressDictation()
    await pressDictation()
    expect(host.voice.stopAndTranscribe).toHaveBeenCalledWith({
      provider: 'openrouter',
      modelId: DEFAULT_SETTINGS.cloudModel,
    })
  })
})
