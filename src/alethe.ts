import type { ComponentType } from 'react'

export type Disposable = { dispose: () => void }

export type Locale = 'en' | 'pt-BR' | 'zh-CN'

export type Translate = (key: string, params?: Record<string, string | number>) => string

export type WorkspaceProject = { id: string; name: string; path: string }

export type WorkspaceTerminal = {
  id: string
  projectId: string
  projectName: string
  name: string
  agent: string
  agentLabel: string
  cwd: string
  running: boolean
  busy: boolean
}

export type WorkspaceAgent = { id: string; label: string }

export type WorkspaceSnapshot = {
  projects: WorkspaceProject[]
  terminals: WorkspaceTerminal[]
  agents: WorkspaceAgent[]
  focusedProjectId: string | null
  focusedTerminalId: string | null
}

export type PluginWorkspace = {
  snapshot: () => WorkspaceSnapshot
  focusTerminal: (terminalId: string) => void
  closeTerminal: (terminalId: string) => void
  openAgentTerminal: (
    projectId: string,
    options: { agent: string; name?: string; prompt?: string },
  ) => Promise<string>
  writeToTerminal: (terminalId: string, text: string) => Promise<void>
}

export type PluginStorage = {
  read: () => Promise<Record<string, unknown>>
  get: <T>(key: string, fallback: T) => Promise<T>
  set: (key: string, value: unknown) => Promise<void>
  remove: (key: string) => Promise<void>
  clear: () => Promise<void>
}

export type SidebarTabProps = {
  projectId: string | null
  cwd: string | null
  ptyId: string | null
  terminalName: string | null
}

export type PluginContext = {
  readonly id: string
  readonly subscriptions: Disposable[]
  readonly contributes: {
    overlay: (definition: { id: string; component: ComponentType }) => Disposable
    settings: (definition: {
      id: string
      title: () => string
      description?: () => string
      keywords?: string
      component: ComponentType
    }) => Disposable
  }
  registerView: (viewId: string, component: ComponentType<SidebarTabProps>) => Disposable
  registerCommand: (commandId: string, run: () => void | Promise<void>) => Disposable
  readonly ui: {
    revealView: (viewId: string) => void
    toast: (toast: { title: string; body?: string }) => void
  }
  readonly workspace: PluginWorkspace
  registerMessages: (locale: Locale, messages: Record<string, string>) => Disposable
  t: Translate
  useT: () => Translate
  invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>
  listen: <T>(event: string, handler: (payload: T) => void) => Disposable
  readonly storage: PluginStorage
}

export type PluginModule = {
  activate?: (context: PluginContext) => void | Promise<void>
  deactivate?: (context: PluginContext) => void | Promise<void>
}

export type AletheGlobal = {
  apiVersion: number
  registerPlugin: (id: string, module: PluginModule) => void
}

declare global {
  interface Window {
    alethe?: AletheGlobal
  }
}
