import type { WorkspaceSnapshot } from './alethe'
import { host } from './host'
import type { VoiceWorkspace } from './voiceCommand'

export type JevWorkspace = VoiceWorkspace & { labels: Record<string, string> }

export function toVoiceWorkspace(snapshot: WorkspaceSnapshot): JevWorkspace {
  const labels: Record<string, string> = {}
  for (const agent of snapshot.agents) labels[agent.id] = agent.label
  for (const terminal of snapshot.terminals) labels[terminal.agent] ??= terminal.agentLabel
  return {
    projects: snapshot.projects,
    terminals: snapshot.terminals.map((terminal) => ({
      id: terminal.id,
      projectId: terminal.projectId,
      projectName: terminal.projectName,
      running: terminal.running,
      agent: terminal.agent,
      cwd: terminal.cwd,
      busy: terminal.busy,
      name: terminal.name,
    })),
    agents: snapshot.agents.map((agent) => agent.id),
    focusedProjectId: snapshot.focusedProjectId,
    focusedTerminalId: snapshot.focusedTerminalId,
    labels,
  }
}

export function readWorkspace(): JevWorkspace {
  return toVoiceWorkspace(host().workspace.snapshot())
}

export function agentName(workspace: { labels: Record<string, string> }, agent: string): string {
  return workspace.labels[agent] ?? agent
}
