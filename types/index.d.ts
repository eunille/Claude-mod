/** held: calls the plan gate turned back on purpose (waiting for approval, asking for a plan, asking for checks); never errors. */
export type CubeToolStat = { count: number; errors: number; held?: number; totalMs: number; maxMs: number; bySubagent: number }
export type CubeSkillStat = { count: number; lastAt: number }
export type CubeFileStat = { reads: number; edits: number }
export type CubeRunning = { id: string; tool: string; label: string; startedAt: number; isSubagent: boolean }
export type CubeEventKind = 'skill' | 'tool' | 'agent' | 'error' | 'turn' | 'alert' | 'plan'
export type CubeEvent = { at: number; kind: CubeEventKind; text: string }
export type CubeTokens = { input: number; output: number; cacheRead: number; cacheWrite: number }
export type CubeLimit = { kind: string; percentUsed: number }
export type CubeView = 'overview' | 'tools' | 'plans' | 'timeline' | 'settings'
export type CubeAgent = { id: string; type: string; description: string; model: string; startedAt: number; calls: number }

export type CubePhaseStatus = 'pending' | 'active' | 'done'
/** files: what the phase changed, a path for a file tool and the command for a shell write. */
export type CubePhase = { name: string; status: CubePhaseStatus; startedAt?: number; endedAt?: number; tokens: number; files?: string[] }
/** awaiting: proposed, waiting for the person; revising: they answered with changes. */
export type CubePlanStatus = 'awaiting' | 'revising' | 'executing' | 'done' | 'cancelled'
export type CubePlan = {
  title: string
  status: CubePlanStatus
  phases: CubePhase[]
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

export type CubeStats = {
  startedAt: number
  now: number
  isBusy: boolean
  turns: number
  turnSpent: number
  tools: Record<string, CubeToolStat>
  skills: Record<string, CubeSkillStat>
  allTimeSkills: Record<string, number>
  agents: Record<string, number>
  agentsDone: number
  liveAgents: CubeAgent[]
  running: CubeRunning[]
  timeline: CubeEvent[]
  activity: number[]
  activityAt: number
  tokens: CubeTokens
  turnTokens: number[]
  files: Record<string, CubeFileStat>
  recentCalls: string[]
  contextPercent?: number
  contextTokens?: number
  contextWindow?: number
  costUsd?: number
  limits: CubeLimit[]
  lastError?: { tool: string; text: string; at: number }
  alertedContext: number
  /** Main-conversation file edits since the last prompt with no plan running, and whether the plan gate has nudged yet. */
  unplannedEdits: number
  nudged: boolean
  plan?: CubePlan
  /** Finished and cancelled plans, newest first, kept across sessions. */
  history: CubePlan[]
  /** The local day the counters belong to; at midnight they start over. dayStart and costBase make uptime and cost today's. */
  day: string
  dayStart: number
  costBase: number
  /** Changes made this turn (file edits, shell writes, commits), and when the last turn that made some ended. */
  turnWork: number
  celebrateAt?: number
  /** The last skill counted and when: the Skill tool and skill.prompt can both report one load. */
  lastSkill?: { name: string; at: number }
  /** Arbitrage's gun for the task at hand: rolled at each prompt, kept through a plan's approval. */
  weapon?: CubeWeapon
  /** The most zombies Arbitrage has shot in one stretch of work, kept across sessions. */
  bestKills?: number
}

/** powerline: chevron segments (Nerd Font); rounded: pills; plain: no special glyphs. */
export type CubeStyle = 'powerline' | 'rounded' | 'plain'
export type CubeOwlColor = 'night' | 'barn' | 'snowy' | 'lilac'
export type CubeMascot = 'owl' | 'cubeman'
/** How Cubeman moves. classic: hops and jumps; arbitrage: a bandana, a gun, and waves of zombie cubes. */
export type CubeAnimation = 'classic' | 'arbitrage'
/** Arbitrage's gun, rolled per prompt. */
export type CubeWeapon = 'zapper' | 'shotgun' | 'blaster'
/** auto: follow the skins mod's /skin when it is installed, Catppuccin Mocha when it is not. */
export type CubeTheme = 'auto' | 'mocha' | 'latte' | 'terminal'
/** planFlow: whether multi-step tasks wait for a plan's approval (the rule, the edit block). owl: whether a mascot shows at all. */
export type CubePrefs = { style: CubeStyle; owl: boolean; owlColor: CubeOwlColor; mascot: CubeMascot; animation: CubeAnimation; planFlow: boolean; theme: CubeTheme }

declare module 'claude-code' {
  interface PluginState {
    'cubeman': { stats: CubeStats; view: CubeView; prefs: CubePrefs }
  }
}
