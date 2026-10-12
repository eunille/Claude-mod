export type PulseToolStat = { count: number; errors: number; totalMs: number; maxMs: number; bySubagent: number }
export type PulseSkillStat = { count: number; lastAt: number }
export type PulseFileStat = { reads: number; edits: number }
export type PulseRunning = { id: string; tool: string; label: string; startedAt: number; isSubagent: boolean }
export type PulseEventKind = 'skill' | 'tool' | 'agent' | 'error' | 'turn' | 'alert' | 'plan'
export type PulseEvent = { at: number; kind: PulseEventKind; text: string }
export type PulseTokens = { input: number; output: number; cacheRead: number; cacheWrite: number }
export type PulseLimit = { kind: string; percentUsed: number }
export type PulseView = 'overview' | 'tools' | 'timeline' | 'settings'
export type PulseAgent = { id: string; type: string; description: string; model: string; startedAt: number; calls: number }

export type PulsePhaseStatus = 'pending' | 'active' | 'done'
export type PulsePhase = { name: string; status: PulsePhaseStatus; startedAt?: number; endedAt?: number; tokens: number }
/** awaiting: proposed, waiting for the person; revising: they answered with changes. */
export type PulsePlanStatus = 'awaiting' | 'revising' | 'executing' | 'done' | 'cancelled'
export type PulsePlan = {
  title: string
  status: PulsePlanStatus
  phases: PulsePhase[]
  createdAt: number
  approvedAt?: number
  endedAt?: number
  planTokens: number
  revisions: number
}

export type PulseStats = {
  startedAt: number
  now: number
  isBusy: boolean
  turns: number
  turnSpent: number
  tools: Record<string, PulseToolStat>
  skills: Record<string, PulseSkillStat>
  allTimeSkills: Record<string, number>
  agents: Record<string, number>
  agentsDone: number
  liveAgents: PulseAgent[]
  running: PulseRunning[]
  timeline: PulseEvent[]
  activity: number[]
  activityAt: number
  tokens: PulseTokens
  turnTokens: number[]
  files: Record<string, PulseFileStat>
  recentCalls: string[]
  contextPercent?: number
  contextTokens?: number
  contextWindow?: number
  costUsd?: number
  limits: PulseLimit[]
  lastError?: { tool: string; text: string; at: number }
  alertedContext: number
  plan?: PulsePlan
}

/** powerline: chevron segments (Nerd Font); rounded: pills; plain: no special glyphs. */
export type PulseStyle = 'powerline' | 'rounded' | 'plain'
export type PulseOwlColor = 'night' | 'barn' | 'snowy' | 'lilac'
/** planFlow: whether multi-step tasks wait for a plan's approval (the rule, the edit block). */
export type PulsePrefs = { style: PulseStyle; owl: boolean; owlColor: PulseOwlColor; planFlow: boolean }

declare module 'claude-code' {
  interface PluginState {
    'skill-pulse': { stats: PulseStats; view: PulseView; prefs: PulsePrefs }
  }
}
