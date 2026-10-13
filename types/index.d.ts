export type PulseToolStat = { count: number; errors: number; totalMs: number; maxMs: number; bySubagent: number }
export type PulseSkillStat = { count: number; lastAt: number }
export type PulseFileStat = { reads: number; edits: number }
export type PulseRunning = { id: string; tool: string; label: string; startedAt: number; isSubagent: boolean }
export type PulseEventKind = 'skill' | 'tool' | 'agent' | 'error' | 'turn' | 'alert' | 'plan'
export type PulseEvent = { at: number; kind: PulseEventKind; text: string }
export type PulseTokens = { input: number; output: number; cacheRead: number; cacheWrite: number }
export type PulseLimit = { kind: string; percentUsed: number }
export type PulseView = 'overview' | 'tools' | 'plans' | 'timeline' | 'settings'
export type PulseAgent = { id: string; type: string; description: string; model: string; startedAt: number; calls: number }

export type PulsePhaseStatus = 'pending' | 'active' | 'done'
/** files: what the phase changed, a path for a file tool and the command for a shell write. */
export type PulsePhase = { name: string; status: PulsePhaseStatus; startedAt?: number; endedAt?: number; tokens: number; files?: string[] }
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
  /** The last file change, the last test/typecheck/lint run and whether it passed, and whether finishing has been turned back for an unchecked change. */
  editedAt?: number
  checkedAt?: number
  isCheckOk?: boolean
  isDoneNudged?: boolean
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
  /** Main-conversation file edits since the last prompt with no plan running, and whether the plan gate has nudged yet. */
  unplannedEdits: number
  nudged: boolean
  plan?: PulsePlan
  /** Finished and cancelled plans, newest first, kept across sessions. */
  history: PulsePlan[]
  /** The local day the counters belong to; at midnight they start over. dayStart and costBase make uptime and cost today's. */
  day: string
  dayStart: number
  costBase: number
  /** The last skill counted and when: the Skill tool and skill.prompt can both report one load. */
  lastSkill?: { name: string; at: number }
}

/** powerline: chevron segments (Nerd Font); rounded: pills; plain: no special glyphs. */
export type PulseStyle = 'powerline' | 'rounded' | 'plain'
export type PulseOwlColor = 'night' | 'barn' | 'snowy' | 'lilac'
export type PulseMascot = 'owl' | 'cubeman'
/** auto: follow the skins mod's /skin when it is installed, Catppuccin Mocha when it is not. */
export type PulseTheme = 'auto' | 'mocha' | 'latte' | 'terminal'
/** planFlow: whether multi-step tasks wait for a plan's approval (the rule, the edit block). owl: whether a mascot shows at all. */
export type PulsePrefs = { style: PulseStyle; owl: boolean; owlColor: PulseOwlColor; mascot: PulseMascot; planFlow: boolean; theme: PulseTheme }

declare module 'claude-code' {
  interface PluginState {
    'skill-pulse': { stats: PulseStats; view: PulseView; prefs: PulsePrefs }
  }
}
