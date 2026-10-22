import type { PluginContext, Translate } from './alethe'

let current: PluginContext | null = null

export function bindHost(context: PluginContext | null): void {
  current = context
}

export function host(): PluginContext {
  if (!current) throw new Error('Jev is not active')
  return current
}

export function useT(): Translate {
  return host().useT()
}
