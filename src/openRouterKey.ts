import { useEffect, useSyncExternalStore } from 'react'

import { host } from './host'

const OPENROUTER = 'openrouter'

let hasKey = false
let pending: Promise<boolean> | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

async function readHasKey(): Promise<boolean> {
  const catalog = await host().voice.providers()
  return catalog.some((entry) => entry.provider === OPENROUTER && entry.hasKey)
}

export function refreshOpenRouterKey(): Promise<boolean> {
  pending ??= readHasKey()
    .then((next) => {
      if (next !== hasKey) {
        hasKey = next
        emit()
      }
      return next
    })
    .finally(() => {
      pending = null
    })
  return pending
}

export function hasOpenRouterKey(): boolean {
  return hasKey
}

export function resetOpenRouterKey(): void {
  hasKey = false
  pending = null
  emit()
}

export function openVoiceSettings(): Promise<boolean> {
  host().voice.openSettings()
  return refreshOpenRouterKey()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useOpenRouterKey(): boolean {
  const value = useSyncExternalStore(subscribe, hasOpenRouterKey, hasOpenRouterKey)
  useEffect(() => {
    const refresh = () => void refreshOpenRouterKey().catch(() => undefined)
    refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])
  return value
}
