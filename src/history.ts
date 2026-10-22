import { useSyncExternalStore } from 'react'

import type { JevDecision } from './tauri'
import type { VoicePlan, VoiceWarning } from './voiceCommand'

export type HistoryStatus = 'deciding' | 'ran' | 'waiting' | 'blocked' | 'failed'

export type HistoryEntry = {
  id: string
  at: number
  spoken: string
  status: HistoryStatus
  summary: string
  decision: JevDecision | null
  plan: VoicePlan | null
  warnings: VoiceWarning[]
  error: string | null
  transcribeMs: number | null
  decideMs: number | null
  actions: string[]
}

const LIMIT = 50

let entries: readonly HistoryEntry[] = []
const listeners = new Set<() => void>()

function commit(next: readonly HistoryEntry[]) {
  entries = next
  for (const listener of listeners) listener()
}

export const history = {
  entries: () => entries,
  start(summary: string): string {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const entry: HistoryEntry = {
      id,
      at: Date.now(),
      spoken: '',
      status: 'deciding',
      summary,
      decision: null,
      plan: null,
      warnings: [],
      error: null,
      transcribeMs: null,
      decideMs: null,
      actions: [],
    }
    commit([entry, ...entries].slice(0, LIMIT))
    return id
  },
  settle(id: string, patch: Partial<Omit<HistoryEntry, 'id' | 'at'>>): void {
    commit(entries.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  },
  clear(): void {
    commit([])
  },
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useHistory(): readonly HistoryEntry[] {
  return useSyncExternalStore(subscribe, history.entries, history.entries)
}
