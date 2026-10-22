import type { PluginContext } from './alethe'
import { Dictation } from './components/Dictation'
import { History } from './components/History'
import {
  KeySetting,
  MicrophoneSetting,
  ModelSetting,
  ModeSetting,
  TranscriberSetting,
  VoiceSetting,
} from './components/Settings'
import { VoiceBar } from './components/VoiceBar'
import { history } from './history'
import { bindHost } from './host'
import { en } from './messages/en'
import { ptBR } from './messages/pt-BR'
import { zhCN } from './messages/zh-CN'
import { formatShortcut } from './platform'
import { getSettings, loadSettings } from './settings'

const PLUGIN_ID = 'alethe.jev'
const HISTORY_VIEW_ID = 'jev'

function contributeSettings(context: PluginContext) {
  const shortcut = () => formatShortcut('Ctrl+E')
  const t = context.t
  const sections = [
    {
      id: 'jev.key',
      title: () => t('bar.keyInputLabel'),
      description: () => t('bar.keySettingsDesc'),
      keywords: 'jev voice command api key openrouter decisions chave comando voz',
      component: KeySetting,
    },
    {
      id: 'jev.voice',
      title: () => t('settings.dictation'),
      description: () => t('settings.dictationDesc', { shortcut: shortcut() }),
      keywords: 'dictation voice mic microphone ditado voz microfone speech parakeet stt jev',
      component: VoiceSetting,
    },
    {
      id: 'jev.mode',
      title: () => t('settings.dictationMode'),
      description: () => t('settings.dictationModeDesc', { shortcut: shortcut() }),
      keywords: 'dictation hold toggle ditado segurar alternar',
      component: ModeSetting,
    },
    {
      id: 'jev.microphone',
      title: () => t('settings.dictationMic'),
      description: () => t('settings.dictationMicDesc'),
      keywords: 'microphone mic input microfone entrada',
      component: MicrophoneSetting,
    },
    {
      id: 'jev.transcriber',
      title: () => t('settings.dictationProvider'),
      description: () => t('settings.dictationProviderDesc'),
      keywords: 'transcriber openrouter on-device local transcrição',
      component: TranscriberSetting,
    },
    {
      id: 'jev.model',
      title: () =>
        getSettings().provider === 'openrouter'
          ? t('settings.dictationCloudModel')
          : t('settings.dictationModel'),
      description: () =>
        getSettings().provider === 'openrouter'
          ? t('settings.dictationCloudModelDesc')
          : t('settings.dictationModelDesc'),
      keywords: 'model modelo parakeet gpt audio gemini download',
      component: ModelSetting,
    },
  ]
  for (const section of sections) context.contributes.settings(section)
}

async function activate(context: PluginContext) {
  bindHost(context)
  context.registerMessages('en', en)
  context.registerMessages('pt-BR', ptBR)
  context.registerMessages('zh-CN', zhCN)
  await loadSettings(context.storage)

  context.contributes.overlay({ id: 'jev.bar', component: VoiceBar })
  context.contributes.overlay({ id: 'jev.dictation', component: Dictation })
  context.registerView(HISTORY_VIEW_ID, History)
  contributeSettings(context)
}

// The host removes every overlay, view and setting after this returns, so nothing else is undone here.
function deactivate() {
  history.clear()
}

window.alethe?.registerPlugin(PLUGIN_ID, { activate, deactivate })
