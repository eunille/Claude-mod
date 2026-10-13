import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register } from 'claude-code'

import type { PulseEventKind, PulseMascot, PulsePhase, PulsePlan, PulsePrefs, PulseStats, PulseStyle, PulseTheme, PulseView } from '../types'
import { DARK as CUBE_DARK, frameAt, LIGHT as CUBE_LIGHT, TERMINAL_SIZE, toCells } from './cubeman'
import type { Mood as CubeMood } from './cubeman'
import { OWL_COLORWAYS, OWL_COLUMNS, OWL_ROWS, OWLS, owlCells, STILL } from './owl'
import type { OwlMood, OwlPose } from './owl'

const PANE = 'skill-pulse'
const TITLE = 'Pulse'
const PLAN_TOOL = 'mcp__skill-pulse__plan'
const BUCKET_MS = 10_000
const BUCKETS = 48
const TICK_MS = 2_000
const TIMELINE_MAX = 80
const LOOP_REPEATS = 3
const POLLING_TOOLS = new Set(['TaskOutput', 'BashOutput', 'Monitor', 'TaskList', 'TaskGet'])
const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit'])
const SHELL_TOOLS = new Set(['Bash', 'PowerShell'])
// ponytail: a pattern, not a parser; it misses writes done by scripts and catches a few harmless redirects.
const SHELL_WRITE =
  /\bsed\s+-i|\btee\b|\b(?:rm|mv|cp|touch|mkdir)\s|\b(?:Set-Content|Add-Content|Out-File|New-Item|Remove-Item|Move-Item|Copy-Item|Rename-Item)\b|(?:^|[^\d&>])>{1,2}\s*[^\s&|>]/i
const SHELL_DISCARD = /\d?>{1,2}\s*(?:\/dev\/null|\$null|nul\b|&\d)/gi
const CHECK =
  /\b(?:(?:npm|pnpm|yarn|bun)(?:\s+run)?\s+(?:test|lint|typecheck|check|build)|vitest|jest|pytest|tsc|eslint|biome|mypy|ruff|cargo\s+(?:test|check|clippy)|go\s+(?:test|vet)|plugin\s+(?:test|validate)|dotnet\s+test|mvn\s+test|gradlew?\s+test)\b/i
const HISTORY_MAX = 20
const FRAME_MS = 500
/** Cubeman's jump has short frames: redraw this often while it is lively, and stretch every frame to at least this. */
const CUBE_FRAME_MS = 150
const USAGE_EVERY_MS = 10_000
const APPROVE = /^(y|yes|yep|yeah|ok|okay|sure|approve|approved|go|go ahead|proceed|continue|lgtm|ship it|do it|good|great|perfect|nice|sounds good|looks good)\b/i
const HEDGE = /\b(but|change|instead|except|first|wait|no|not|don't|dont)\b/i
const HELD =
  'The plan is waiting for the user\'s approval, so file edits are blocked. Stop and ask "Approve this plan?". ' +
  'If the user has moved on to a different request, call the plan tool with action "cancel" first.'
const NUDGE =
  'Plan-first is on and this is the second file edit without a plan, so this task looks multi-step. ' +
  'Call the plan tool with action "propose" and ask "Approve this plan?" before editing. ' +
  'If it really is one small change, or the user asked to skip planning, repeat this call and it will go through.'
const UNCHECKED =
  'Files changed after the last passing test, typecheck or lint run. Run the project\'s checks now, fix what fails, then mark this phase done. ' +
  'If this task has nothing to check (docs, config), repeat this call and it will go through.'

const PLAN_RULE = `# Plan-first workflow (skill-pulse)
When the user asks for a task that takes several steps (a feature, a refactor, changes across files, a multi-step fix), follow this before changing anything. Skip it for questions, explanations, quick lookups and one-line edits. Subagents ignore this section.
1. Analyze: read only what you need to understand the task. Check the available skills and load each one that fits with the Skill tool (for example superpowers:brainstorming for a new feature, superpowers:systematic-debugging for a bug); skip this when none fits.
2. Plan: call the \`plan\` tool (${PLAN_TOOL}) with action "propose", a short title and 3-7 phases, each one short imperative line.
3. Ask: end your turn with the phases as a brief numbered list and the question "Approve this plan?". Do not edit files or run commands that change anything until the user approves.
4. Execute: once approved, run all phases straight through without pausing. Call plan "start" with the phase number before each phase and "done" after it.
If the user asks for changes, call "propose" again with the revised phases and ask again. If they move on to something else, call "cancel".`

const PLAN_TOOL_DESCRIPTION = `Records the plan for a multi-step task and tracks its phases in the user's Pulse monitor pane.
- propose { title, phases }: show a plan for approval. Afterwards stop, list the phases briefly and ask "Approve this plan?". File edits are blocked until the user approves.
- start { phase } / done { phase }: mark a phase (1-based) of the approved plan as begun or finished.
- cancel: drop the plan (the user moved on).`

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['propose', 'start', 'done', 'cancel'] },
    title: { type: 'string', description: 'propose: the task in a few words' },
    phases: { type: 'array', items: { type: 'string' }, description: 'propose: 3-7 short imperative phases' },
    phase: { type: 'integer', minimum: 1, description: 'start / done: the phase number, from 1' },
  },
  required: ['action'],
}

const fresh = (now: number): PulseStats => ({
  startedAt: now,
  now,
  isBusy: false,
  turns: 0,
  turnSpent: 0,
  tools: {},
  skills: {},
  allTimeSkills: {},
  agents: {},
  agentsDone: 0,
  liveAgents: [],
  running: [],
  timeline: [],
  activity: Array(BUCKETS).fill(0),
  activityAt: now - (now % BUCKET_MS),
  tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  turnTokens: [],
  files: {},
  recentCalls: [],
  limits: [],
  alertedContext: 0,
  unplannedEdits: 0,
  nudged: false,
  history: [],
  day: '',
  dayStart: 0,
  costBase: 0,
})

const stats = atom({ plugin: 'skill-pulse', key: 'stats' } as const, fresh(0))
const view = atom({ plugin: 'skill-pulse', key: 'view' } as const, 'overview' as PulseView)
const DEFAULT_PREFS: PulsePrefs = { style: 'powerline', owl: true, owlColor: 'night', mascot: 'owl', planFlow: true, theme: 'auto' }
const prefs = atom({ plugin: 'skill-pulse', key: 'prefs' } as const, DEFAULT_PREFS)

type Dollar = EngineInterface
type UI = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'>

// ── palette: Catppuccin while the skins mod wears it, the theme's own keys otherwise ──

type Palette = {
  accent: string
  skill: string
  tool: string
  agent: string
  file: string
  spark: string
  ok: string
  warn: string
  err: string
  muted: string
  fg: string
  info: string
  plan: string
  /** Text drawn on a coloured segment. */
  ink: string
  /** An unfilled segment: an inactive tab, a pending phase. */
  surface: string
  /** Activity levels 0-7, cool to warm. */
  heat: string[]
  /** Which of an owl colourway's two versions to draw. */
  isLight: boolean
}

const MOCHA: Palette = {
  accent: '#cba6f7', // mauve
  skill: '#f5c2e7', // pink
  tool: '#89b4fa', // blue
  agent: '#94e2d5', // teal
  file: '#fab387', // peach
  spark: '#74c7ec', // sapphire
  ok: '#a6e3a1', // green
  warn: '#f9e2af', // yellow
  err: '#f38ba8', // red
  muted: '#7f849c', // overlay1
  fg: '#cdd6f4', // text
  info: '#89dceb', // sky
  plan: '#b4befe', // lavender
  ink: '#11111b', // crust
  surface: '#313244', // surface0
  heat: ['#45475a', '#74c7ec', '#74c7ec', '#89b4fa', '#b4befe', '#cba6f7', '#f5c2e7', '#f38ba8'],
  isLight: false,
}

const LATTE: Palette = {
  accent: '#8839ef',
  skill: '#ea76cb',
  tool: '#1e66f5',
  agent: '#179299',
  file: '#fe640b',
  spark: '#209fb5',
  ok: '#40a02b',
  warn: '#df8e1d',
  err: '#d20f39',
  muted: '#8c8fa1',
  fg: '#4c4f69',
  info: '#04a5e5',
  plan: '#7287fd',
  ink: '#eff1f5', // base
  surface: '#ccd0da', // surface0
  heat: ['#bcc0cc', '#209fb5', '#209fb5', '#1e66f5', '#7287fd', '#8839ef', '#ea76cb', '#d20f39'],
  isLight: true,
}

const THEMED: Palette = {
  accent: 'claude',
  skill: 'merged',
  tool: 'suggestion',
  agent: 'autoAccept',
  file: 'warning',
  spark: 'claude',
  ok: 'success',
  warn: 'warning',
  err: 'error',
  muted: 'subtle',
  fg: 'text',
  info: 'suggestion',
  plan: 'planMode',
  ink: 'inverseText',
  surface: 'inactive',
  heat: ['inactive', 'claude', 'claude', 'claude', 'claude', 'claude', 'claude', 'claude'],
  isLight: false,
}

/** Set at the top of each draw, before any tree is built; the helpers below read them. */
let P: Palette = MOCHA
let STYLE: PulseStyle = 'powerline'

// ── powerline primitives ─────────────────────────────────────────────────────

/** Nerd Font powerline glyphs: the chevron and the two round caps. */
const ARROW = ''
const ROUND_L = ''
const ROUND_R = ''

type Seg = { text: string; bg: string; fg?: string; bold?: boolean }

/** A run of coloured segments as Text children: chevrons, pills or plain blocks, by STYLE. */
function segs(ui: UI, list: Seg[]): any[] {
  const { Text } = ui
  const out: any[] = []
  list.forEach((s, i) => {
    const body = (
      <Text backgroundColor={s.bg} color={s.fg ?? P.ink} bold={s.bold}>
        {` ${s.text} `}
      </Text>
    )
    if (STYLE === 'powerline') {
      const next = list[i + 1]
      if (i === 0) out.push(<Text color={s.bg}>{ROUND_L}</Text>)
      out.push(body)
      out.push(next ? <Text color={s.bg} backgroundColor={next.bg}>{ARROW}</Text> : <Text color={s.bg}>{ARROW}</Text>)
    } else if (STYLE === 'rounded') {
      out.push(<Text color={s.bg}>{ROUND_L}</Text>, body, <Text color={s.bg}>{ROUND_R}</Text>, ' ')
    } else {
      out.push(body, ' ')
    }
  })
  return out
}

/** One line of segments, an oh-my-posh bar. */
function Bar(ui: UI, list: Seg[]) {
  const { Text } = ui
  return <Text wrap="truncate-end">{segs(ui, list)}</Text>
}

/** A single label on a coloured pill: round caps unless the style is plain. */
function pill(ui: UI, text: string, bg: string, fg?: string): any[] {
  const { Text } = ui
  const body = (
    <Text backgroundColor={bg} color={fg ?? P.ink} bold>
      {` ${text} `}
    </Text>
  )
  return STYLE === 'plain' ? [body] : [<Text color={bg}>{ROUND_L}</Text>, body, <Text color={bg}>{ROUND_R}</Text>]
}

/** How many cells a run of segments takes, to fit a bar to the room. */
function segsWidth(list: Seg[]): number {
  const caps = STYLE === 'powerline' ? 1 + list.length : STYLE === 'rounded' ? 3 * list.length : list.length
  return list.reduce((n, s) => n + s.text.length + 2, 0) + caps
}

/**
 * The person's chosen theme; `auto` follows the skins mod's /skin where skins is installed
 * (Catppuccin in its light or dark flavour, the terminal's own colours for any other skin),
 * and is Catppuccin Mocha where it is not, so the pane looks finished with nothing else installed.
 */
async function paletteFor($: Dollar, theme: PulseTheme): Promise<Palette> {
  if (theme === 'mocha') return MOCHA
  if (theme === 'latte') return LATTE
  if (theme === 'terminal') return THEMED
  try {
    const skins = (await $.state.get({ plugin: 'skins', key: 'prefs' } as never)) as { value?: { skin?: string } } | undefined
    const skin = skins?.value?.skin
    if (skin === undefined) return MOCHA
    const custom = (await $.state.get({ plugin: 'skins', key: 'custom' } as never)) as { value?: Record<string, { base?: string }> }
    const light = (await $.state.get({ plugin: 'skins', key: 'isLight' } as never)) as { value?: boolean }
    if (skin === 'catppuccin' || custom?.value?.[skin]?.base === 'catppuccin') return light?.value ? LATTE : MOCHA
    return THEMED
  } catch {
    return MOCHA
  }
}

// ── state helpers ────────────────────────────────────────────────────────────

const dayKey = (at: number) => new Date(at).toDateString()

/**
 * A new local day: the counters start over. The plan, the plan history, all-time skills and the
 * live context and limits carry on; cost from here on is counted from what it is now.
 */
function newDay(s: PulseStats, now: number): PulseStats {
  const keep = {
    allTimeSkills: s.allTimeSkills,
    history: s.history,
    plan: s.plan,
    contextPercent: s.contextPercent,
    contextTokens: s.contextTokens,
    contextWindow: s.contextWindow,
    limits: s.limits,
    alertedContext: s.alertedContext,
    costUsd: s.costUsd,
  }
  return withEvent({ ...fresh(now), ...keep, day: dayKey(now), dayStart: now, costBase: s.costUsd ?? 0 }, 'turn', 'new day — counters start over')
}

/** Moves the activity window forward so its last bucket holds `now`, and starts a new day at midnight. */
function roll(s: PulseStats, now: number): PulseStats {
  if (s.day && s.day !== dayKey(now)) return newDay(s, now)
  if (!s.day) s = { ...s, day: dayKey(now) }
  const k = Math.floor((now - s.activityAt) / BUCKET_MS)
  if (k <= 0) return { ...s, now }
  const shift = Math.min(k, BUCKETS)
  return {
    ...s,
    now,
    activity: [...s.activity.slice(shift), ...Array(shift).fill(0)],
    activityAt: s.activityAt + k * BUCKET_MS,
  }
}

function withEvent(s: PulseStats, kind: PulseEventKind, text: string): PulseStats {
  return { ...s, timeline: [...s.timeline, { at: s.now, kind, text }].slice(-TIMELINE_MAX) }
}

function shortPath(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean)
  return parts.length <= 2 ? parts.join('/') : `…/${parts.slice(-2).join('/')}`
}

function argsOf(e: object): Record<string, unknown> {
  const { tool, tool_use_id, agentId, requestMeta, ...rest } = e as Record<string, unknown>
  return rest
}

function labelFor(tool: string, a: Record<string, unknown>): string {
  const str = (k: string) => (typeof a[k] === 'string' ? (a[k] as string) : '')
  switch (tool) {
    case 'Bash':
    case 'PowerShell':
      return str('command').split('\n')[0] ?? ''
    case 'Read':
    case 'Write':
    case 'Edit':
      return shortPath(str('file_path'))
    case 'NotebookEdit':
      return shortPath(str('notebook_path'))
    case 'Grep':
    case 'Glob':
      return str('pattern')
    case 'Agent':
      return `${str('subagent_type') || 'general-purpose'} · ${str('description')}`
    case 'Skill':
      return str('skill')
    case 'WebFetch':
      return str('url')
    case 'WebSearch':
      return str('query')
    case PLAN_TOOL:
      return `${str('action')}${typeof a.phase === 'number' ? ` ${a.phase}` : ''}${str('title') ? ` · ${str('title')}` : ''}`
  }
  return str('description')
}

function filePathOf(tool: string, a: Record<string, unknown>): string | undefined {
  if (!['Read', 'Write', 'Edit', 'NotebookEdit'].includes(tool)) return undefined
  const p = a.file_path ?? a.notebook_path
  return typeof p === 'string' && p ? p : undefined
}

/**
 * The tokens a request really added: its uncached input, what it wrote to the cache and its
 * output. A cache read re-reads the whole conversation on every request, so summing those
 * counts the same context over and over.
 */
const newTokens = (u: { input_tokens: number; output_tokens: number; cache_creation_input_tokens: number }) =>
  u.input_tokens + u.output_tokens + u.cache_creation_input_tokens

const isOpen = (plan: PulsePlan | undefined) => plan?.status === 'awaiting' || plan?.status === 'revising'

/** Ends the active phase (if any) and starts phase `index`. */
function startPhase(phases: PulsePhase[], index: number, now: number): PulsePhase[] {
  return phases.map((p, i) => {
    if (i === index) return { ...p, status: 'active', startedAt: p.startedAt ?? now, endedAt: undefined }
    if (p.status === 'active') return { ...p, status: 'done', endedAt: now }
    return p
  })
}

const commandOf = (tool: string, a: Record<string, unknown>) => (SHELL_TOOLS.has(tool) && typeof a.command === 'string' ? a.command : '')
const isShellWrite = (tool: string, a: Record<string, unknown>) => SHELL_WRITE.test(commandOf(tool, a).replace(SHELL_DISCARD, ''))
const isCheck = (tool: string, a: Record<string, unknown>) => CHECK.test(commandOf(tool, a))

/** Ends the plan as done or cancelled and files it in the history, newest first. */
function endPlan(s: PulseStats, status: 'done' | 'cancelled', now: number): PulseStats {
  if (!s.plan) return s
  const ended: PulsePlan = { ...s.plan, status, endedAt: s.plan.endedAt ?? now }
  return { ...s, plan: ended, history: [ended, ...s.history].slice(0, HISTORY_MAX) }
}

async function saveHistory($: Dollar, s: PulseStats): Promise<void> {
  try {
    await $.store.set('history', s.history)
  } catch {}
}

async function refreshUsage($: Dollar & { session: { usage: () => Promise<any> }; ui: { toast: (t: string) => void } }) {
  const u = await $.session.usage()
  let alert: string | undefined
  await update($, stats, s => {
    const percent: number | undefined = u.context.percent
    let alertedContext = s.alertedContext
    alert = undefined
    if (percent !== undefined) {
      if (percent < 50) alertedContext = 0
      for (const mark of [90, 80]) {
        if (percent >= mark && alertedContext < mark) {
          alertedContext = mark
          alert = `Context ${percent}% full — consider /compact`
          break
        }
      }
    }
    const updated: PulseStats = {
      ...s,
      // Uptime counts from the session's start, or from midnight once a new day has begun.
      startedAt: Math.max(u.startedAt || s.startedAt, s.dayStart),
      contextPercent: percent,
      contextTokens: u.context.tokens,
      contextWindow: u.context.window,
      costUsd: u.cost?.usd,
      limits: (u.rateLimits ?? []).map((l: { kind: string; percentUsed: number }) => ({ kind: l.kind, percentUsed: l.percentUsed })),
      alertedContext,
    }
    return alert ? withEvent(updated, 'alert', alert) : updated
  })
  if (alert) $.ui.toast(`⚠ ${alert}`)
}

function statusText(s: PulseStats): string {
  const calls = Object.values(s.tools).reduce((n, t) => n + t.count, 0)
  const latest = Object.entries(s.skills).sort((a, b) => b[1].lastAt - a[1].lastAt)[0]?.[0]
  const parts = [s.isBusy ? '◉ pulse' : '○ pulse']
  if (s.plan && s.plan.status !== 'cancelled') {
    const done = s.plan.phases.filter(p => p.status === 'done').length
    parts.push(isOpen(s.plan) ? '▤ plan awaiting approval' : `▤ ${done}/${s.plan.phases.length}`)
  }
  if (latest) parts.push(`✦ ${latest}`)
  parts.push(`${calls} calls`)
  if (s.liveAgents.length) parts.push(`${s.liveAgents.length} agents`)
  if (s.contextPercent !== undefined) parts.push(`ctx ${s.contextPercent}%`)
  return parts.join(' · ')
}

/** Changes the person's display choices and keeps them for the next session. */
async function savePrefs($: Dollar, change: Partial<PulsePrefs>): Promise<PulsePrefs> {
  const next = await update($, prefs, current => ({ ...current, ...change }))
  try {
    await $.store.set('prefs', next)
  } catch {}
  return next
}

const APPROVED_CONTEXT =
  'The user approved the plan. Execute every phase now without pausing; call the plan tool with action "start" before each phase and "done" after it.'

/**
 * Approves the waiting plan from a press in the pane. The prompt this module submits does not
 * pass through its own prompt.submit hook, so the approval is written here, not there.
 */
async function approvePlan($: Dollar): Promise<void> {
  const now = await $.clock.now()
  let isApproved = false
  await update($, stats, prev => {
    if (!prev.plan || !isOpen(prev.plan)) return prev
    isApproved = true
    return withEvent({ ...roll(prev, now), plan: { ...prev.plan, status: 'executing' as const, approvedAt: now } }, 'plan', `plan approved · ${prev.plan.title}`)
  })
  if (isApproved) await $.prompt.submit({ text: 'Approved — execute the plan: run every phase without pausing, marking each one started and done.' })
}

// ── formatting ───────────────────────────────────────────────────────────────

const SPARK = '▁▂▃▄▅▆▇█'
const SPINNER = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'

/**
 * A pixel-art bar, as a game draws health or mana: an icon cap, ▰ segments for the share filled,
 * ▱ for the rest, and a pointed tip that lights up when full. Takes `segments + 2` cells.
 */
function pix(ui: UI, value: number, max: number, segments: number, color: string, icon: string): any[] {
  const { Text } = ui
  const n = Math.max(1, Math.round(segments))
  const share = max > 0 ? value / max : 0
  const filled = value > 0 ? Math.min(n, Math.max(1, Math.round(share * n))) : 0
  return [
    <Text color={color}>{icon}</Text>,
    <Text color={color}>{'▰'.repeat(filled)}</Text>,
    <Text color={P.surface}>{'▱'.repeat(n - filled)}</Text>,
    <Text color={filled === n ? color : P.surface}>{STYLE === 'plain' ? '▸' : ARROW}</Text>,
  ]
}

/** A sparkline whose bars warm with their height (P.heat), one Text per run of a colour. */
function heatSpark(ui: UI, values: number[], w: number): any[] {
  const { Text } = ui
  const vs = values.slice(-Math.max(1, w))
  const max = Math.max(1, ...vs)
  const runs: { level: number; text: string }[] = []
  for (const v of vs) {
    const level = v === 0 ? 0 : Math.min(7, Math.max(1, Math.round((v / max) * 7)))
    const glyph = SPARK[level] ?? '▁'
    const last = runs[runs.length - 1]
    if (last && last.level === level) last.text += glyph
    else runs.push({ level, text: glyph })
  }
  return runs.map(r => <Text color={P.heat[r.level] ?? P.spark}>{r.text}</Text>)
}

function num(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`
  return String(Math.round(n))
}

function dur(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${(ms / 1000).toFixed(s < 10 ? 1 : 0)}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
}

/** An error's words without the markup tools wrap them in (`<tool_use_error>`). */
const plainText = (t: string) => t.replace(/<\/?[a-z_][\w-]*>/gi, '').trim()

/** A rate-limit window by a short name: `five_hour` → 5h, `seven_day_opus` → 7d opus. */
const limitLabel = (kind: string) =>
  kind
    .replace(/^five_hour/, '5h')
    .replace(/^seven_day/, '7d')
    .replace(/_/g, ' ')
    .trim()

const ago = (s: PulseStats, at: number) => (s.now - at < 5000 ? 'now' : `${dur(s.now - at)} ago`)
const pctColor = (p: number) => (p >= 80 ? P.err : p >= 60 ? P.warn : P.ok)
const clip = (t: string, w: number) => (t.length > w ? `${t.slice(0, Math.max(0, w - 1))}…` : t.padEnd(w))
const clock = (at: number) => new Date(at).toTimeString().slice(0, 8)

const GLYPH: Record<PulseEventKind, string> = { skill: '✦', tool: '•', agent: '◈', error: '✖', turn: '◇', alert: '⚠', plan: '▤' }
const kindColor = (k: PulseEventKind) =>
  ({ skill: P.skill, tool: P.tool, agent: P.agent, error: P.err, turn: P.muted, alert: P.warn, plan: P.plan })[k]

// ── drawing ──────────────────────────────────────────────────────────────────

/** A section's title on a pill of its own colour, and a dim note beside it. */
function Section(ui: UI, title: string, note?: string, color: string = P.accent) {
  const { Text } = ui
  return (
    <Text wrap="truncate-end">
      {pill(ui, title, color)}
      {note ? <Text color={P.muted}>{`  ${note}`}</Text> : ''}
    </Text>
  )
}

/** The oh-my-posh bar: name, state, uptime, turns, cost; the least needed segments drop first. */
function Header(ui: UI, s: PulseStats, W: number) {
  const frame = SPINNER[Math.floor(s.now / TICK_MS) % SPINNER.length]
  const state: Seg = s.isBusy ? { text: `${frame} working`, bg: P.ok } : { text: '○ idle', bg: P.surface, fg: P.muted }
  const list: Seg[] = [
    { text: '◉ PULSE', bg: P.accent, bold: true },
    state,
    { text: `◷ ${dur(s.now - s.startedAt)}`, bg: P.agent },
    { text: `↻ ${s.turns} turns`, bg: P.tool },
  ]
  if (s.costUsd !== undefined) list.push({ text: `$${(s.costUsd - s.costBase).toFixed(2)}`, bg: P.file })
  while (list.length > 2 && segsWidth(list) > W) list.pop()
  return Bar(ui, list)
}

/** Whether the owl has something to act out, and so redraws every FRAME_MS rather than every TICK_MS. */
function isLively(s: PulseStats): boolean {
  return (
    s.isBusy ||
    s.running.length > 0 ||
    isOpen(s.plan) ||
    (s.lastError !== undefined && s.now - s.lastError.at < 8_000) ||
    (s.plan?.status === 'done' && s.now - (s.plan.endedAt ?? 0) < 60_000)
  )
}

/**
 * What the owl shows: an error first, then a plan waiting, a plan just done, work, idleness.
 * Eyes change per mood; the pose moves the body: a shake, a twitch, a hop, a bob and flap, a breath.
 */
function owlMood(s: PulseStats): { mood: OwlMood; pose: OwlPose; cube: CubeMood; caption: string; color: string } {
  const f = Math.floor(s.now / FRAME_MS)
  const tick = Math.floor(s.now / TICK_MS)
  const lastAt = s.timeline[s.timeline.length - 1]?.at ?? s.startedAt
  if (s.lastError && s.now - s.lastError.at < 8_000) {
    return { mood: 'alarm', pose: { ...STILL, dx: f % 2 ? 0 : 2, isFlap: f % 4 < 2 }, cube: 'error', caption: '!! error', color: P.err }
  }
  if (isOpen(s.plan)) {
    return { mood: f % 12 < 2 ? 'blink' : 'curious', pose: { ...STILL, isTwitch: f % 6 === 0, dy: f % 6 === 3 ? 0 : 1 }, cube: 'waiting', caption: 'hoo? approve', color: P.warn }
  }
  if (s.plan?.status === 'done' && s.now - (s.plan.endedAt ?? 0) < 60_000) {
    // Hops for the first few seconds, then now and then.
    const isHopping = s.now - (s.plan.endedAt ?? 0) < 4_000 || f % 8 < 2
    const isUp = isHopping && f % 2 === 0
    return { mood: 'happy', pose: { ...STILL, dy: isUp ? 0 : 2, isFlap: isUp }, cube: 'done', caption: '✓ hoot!', color: P.ok }
  }
  if (s.isBusy || s.running.length > 0) {
    const glance = (['look', 'glanceL', 'look', 'glanceR'] as const)[Math.floor(f / 4) % 4] ?? 'look'
    return { mood: f % 14 === 0 ? 'blink' : glance, pose: { ...STILL, dy: f % 2 ? 1 : 2, isFlap: f % 4 === 1 }, cube: 'working', caption: 'working', color: P.ok }
  }
  // Idle and asleep the owl stays put: only a blink or an ear twitch now and then.
  if (s.now - lastAt > 120_000) return { mood: 'sleep', pose: STILL, cube: 'sleep', caption: tick % 2 ? 'z Z z' : 'Z z Z', color: P.muted }
  return { mood: tick % 9 === 0 ? 'blink' : 'sleepy', pose: { ...STILL, isTwitch: tick % 7 === 3 }, cube: 'idle', caption: 'idle', color: P.muted }
}

/** The owl's column: its canvas, a cell of air each side, and a row of air above. */
const OWL_BOX = Math.max(OWL_COLUMNS, TERMINAL_SIZE) + 2
/** Cubeman's own words where the owl's are owlish. */
const CUBE_CAPTION: Partial<Record<CubeMood, string>> = { waiting: '? approve', done: '✓ done!' }

type RasterElement = Elements['terminal']['Raster']

function Owl(ui: UI, $: Dollar, Raster: RasterElement, s: PulseStats, p: PulsePrefs) {
  const { Box, Button, Text } = ui
  const m = owlMood(s)
  const colors = OWLS[p.owlColor][P.isLight ? 'light' : 'dark']
  const next = OWL_COLORWAYS[(OWL_COLORWAYS.indexOf(p.owlColor) + 1) % OWL_COLORWAYS.length] ?? 'night'
  const isCube = p.mascot === 'cubeman'
  return (
    <Box flexDirection="column" alignItems="center" width={OWL_BOX} marginTop={1}>
      {isCube ? (
        <Raster
          key="cubeman"
          columns={TERMINAL_SIZE}
          rows={TERMINAL_SIZE / 2}
          cells={toCells(frameAt(m.cube, s.now, TERMINAL_SIZE, CUBE_FRAME_MS), P.isLight ? CUBE_LIGHT : CUBE_DARK)}
        />
      ) : (
        <Raster key="owl" columns={OWL_COLUMNS} rows={OWL_ROWS} cells={owlCells(m.mood, colors, m.pose)} />
      )}
      <Text color={m.color} wrap="truncate-end">
        {(isCube && CUBE_CAPTION[m.cube]) || m.caption}
      </Text>
      {!isCube && (
        <Button key="owl-cycle" plain hotkey="o" onPress={() => savePrefs($, { owlColor: next })}>
          <Text color={P.muted}>{`◂ ${p.owlColor} ▸`}</Text>
        </Button>
      )}
    </Box>
  )
}

/** Display choices as rows of pills: the current one filled, a press applies and keeps it. */
function Settings(ui: UI, $: Dollar, p: PulsePrefs) {
  const { Box, Button, Text } = ui
  const choice = (key: string, label: string, isOn: boolean, change: Partial<PulsePrefs>, swatch: string[] = []) => (
    <Button key={key} plain onPress={() => savePrefs($, change)}>
      {swatch.map(c => (
        <Text color={c}>█</Text>
      ))}
      {swatch.length ? ' ' : ''}
      {isOn ? pill(ui, `● ${label}`, P.accent) : pill(ui, label, P.surface, P.fg)}
    </Button>
  )
  const row = (title: string, items: any[]) => (
    <Box marginTop={1} gap={1} flexWrap="wrap">
      <Text bold>{title.padEnd(7)}</Text>
      {items}
    </Box>
  )
  const tone = P.isLight ? 'light' : 'dark'
  return (
    <Box flexDirection="column" marginTop={1}>
      {Section(ui, '⚙ SETTINGS', 'press a choice (click, or Tab then Enter) · kept for every session', P.accent)}
      {row('THEME', [
        choice('theme-auto', 'auto', p.theme === 'auto', { theme: 'auto' }),
        choice('theme-mocha', 'mocha', p.theme === 'mocha', { theme: 'mocha' }, [MOCHA.accent, MOCHA.skill, MOCHA.tool]),
        choice('theme-latte', 'latte', p.theme === 'latte', { theme: 'latte' }, [LATTE.accent, LATTE.skill, LATTE.tool]),
        choice('theme-terminal', 'terminal', p.theme === 'terminal', { theme: 'terminal' }),
      ])}
      {row('MASCOT', [
        choice('mascot-owl', 'owl', p.owl && p.mascot !== 'cubeman', { owl: true, mascot: 'owl' }),
        choice('mascot-cubeman', 'cubeman', p.owl && p.mascot === 'cubeman', { owl: true, mascot: 'cubeman' }),
        choice('mascot-off', 'off', !p.owl, { owl: false }),
      ])}
      {row('OWL', [
        ...OWL_COLORWAYS.map(c => {
          const o = OWLS[c][tone]
          return choice(`owl-${c}`, c, p.owl && p.mascot !== 'cubeman' && p.owlColor === c, { owl: true, owlColor: c, mascot: 'owl' }, [o.body, o.face, o.eye])
        }),
        choice('owl-off', 'off', !p.owl, { owl: false }),
      ])}
      {row('STYLE', [
        choice('style-powerline', 'powerline', p.style === 'powerline', { style: 'powerline' }),
        choice('style-rounded', 'rounded', p.style === 'rounded', { style: 'rounded' }),
        choice('style-plain', 'plain', p.style === 'plain', { style: 'plain' }),
      ])}
      {row('PLAN', [
        choice('plan-on', 'ask before executing', p.planFlow, { planFlow: true }),
        choice('plan-off', 'off', !p.planFlow, { planFlow: false }),
      ])}
      {row('DATA', [
        <Button
          key="reset"
          plain
          hotkey="r"
          onPress={() => update($, stats, s => ({ ...fresh(s.now), allTimeSkills: s.allTimeSkills, startedAt: s.startedAt, plan: s.plan, history: s.history }))}
        >
          {pill(ui, '↺ reset counters', P.surface, P.fg)}
        </Button>,
      ])}
      <Box marginTop={1}>
        <Text color={P.muted}>
          auto: Catppuccin Mocha, or your /skin when the skins mod is installed · terminal: your terminal's own colours · press o by the owl to cycle its colours
        </Text>
      </Box>
    </Box>
  )
}

/** Five tabs on one line: each takes `n: ` for its hotkey, its label and a pill's four cells. */
function Nav(ui: UI, $: Dollar, v: PulseView, W: number) {
  const { Box, Button } = ui
  const go = (to: PulseView) => () => update($, view, () => to)
  const labels = W >= 68 ? ['Overview', 'Tools', 'Plans', 'Timeline', '⚙'] : ['Main', 'Tools', 'Plan', 'Log', '⚙']
  const tab = (key: string, to: PulseView, label: string, hotkey: string) => (
    <Button key={key} plain hotkey={hotkey} onPress={go(to)}>
      {v === to ? pill(ui, label, P.accent) : pill(ui, label, P.surface, P.fg)}
    </Button>
  )
  return (
    <Box gap={1}>
      {tab('v-overview', 'overview', labels[0] ?? 'Overview', '1')}
      {tab('v-tools', 'tools', labels[1] ?? 'Tools', '2')}
      {tab('v-plans', 'plans', labels[2] ?? 'Plans', '3')}
      {tab('v-timeline', 'timeline', labels[3] ?? 'Timeline', '4')}
      {tab('v-settings', 'settings', labels[4] ?? '⚙', '5')}
    </Box>
  )
}

function Gauges(ui: UI, s: PulseStats, W: number) {
  const { Box, Text } = ui
  const mw = Math.max(10, Math.min(24, W - 36))
  const t = s.tokens
  const input = t.input + t.cacheRead + t.cacheWrite
  const hit = input > 0 ? Math.round((t.cacheRead / input) * 100) : undefined
  const calls = s.activity.reduce((a, b) => a + b, 0)
  const sw = Math.max(8, Math.min(BUCKETS, W - 30))
  const running = s.running[s.running.length - 1]
  const last = s.timeline[s.timeline.length - 1]
  const frame = SPINNER[Math.floor(s.now / TICK_MS) % SPINNER.length] ?? '•'
  return (
    <Box flexDirection="column">
      <Text wrap="truncate-end">
        <Text bold>{'NOW      '}</Text>
        {running
          ? [
              <Text color={P.ok}>{`${frame} `}</Text>,
              <Text bold>{running.tool}</Text>,
              <Text color={P.muted}>{`${running.label ? `  ${running.label}` : ''} · ${dur(s.now - running.startedAt)}`}</Text>,
            ]
          : last
            ? [<Text color={kindColor(last.kind)}>{`${GLYPH[last.kind]} `}</Text>, <Text color={P.muted}>{`${last.text} · ${ago(s, last.at)}`}</Text>]
            : [<Text color={P.muted}>waiting for the first prompt</Text>]}
      </Text>
      {s.contextPercent !== undefined ? (
        <Text wrap="truncate-end">
          <Text bold>{'CONTEXT  '}</Text>
          {pix(ui, s.contextPercent, 100, mw, pctColor(s.contextPercent), '◆')}
          <Text color={pctColor(s.contextPercent)} bold>
            {` ${String(s.contextPercent).padStart(3)}%`}
          </Text>
          <Text color={P.muted}>{` ${num(s.contextTokens ?? 0)} / ${num(s.contextWindow ?? 0)}`}</Text>
        </Text>
      ) : (
        <Text>
          <Text bold>{'CONTEXT  '}</Text>
          <Text color={P.muted}>measured after the first reply</Text>
        </Text>
      )}
      {s.limits.length > 0 && (
        <Text wrap="truncate-end">
          <Text bold>{'LIMITS   '}</Text>
          {s.limits.map(l => (
            <Text>
              <Text color={P.muted}>{`${limitLabel(l.kind)} `}</Text>
              {pix(ui, l.percentUsed, 100, 8, pctColor(l.percentUsed), '⧗')}
              <Text bold>{` ${Math.round(l.percentUsed)}%`}</Text>
              <Text>{'   '}</Text>
            </Text>
          ))}
        </Text>
      )}
      <Text wrap="truncate-end">
        <Text bold>{'TOKENS   '}</Text>
        <Text>in </Text>
        <Text color={P.info}>{num(input)}</Text>
        <Text> out </Text>
        <Text color={P.info}>{num(t.output)}</Text>
        {hit !== undefined && (
          <Text>
            <Text> cache </Text>
            <Text color={hit >= 70 ? P.ok : hit >= 40 ? P.warn : P.err}>{hit}% hit</Text>
          </Text>
        )}
        {s.turnTokens.length > 1 && (
          <Text>
            <Text color={P.muted}> per turn </Text>
            {heatSpark(ui, s.turnTokens, 20)}
          </Text>
        )}
      </Text>
      <Text wrap="truncate-end">
        <Text bold>{'ACTIVITY '}</Text>
        {heatSpark(ui, s.activity, sw)}
        <Text color={P.muted}>{` ${calls} calls / ${Math.round((sw * BUCKET_MS) / 60000)}m`}</Text>
      </Text>
    </Box>
  )
}

function Running(ui: UI, s: PulseStats, W: number) {
  const { Box, Text } = ui
  if (s.running.length === 0 && s.liveAgents.length === 0) return ''
  const frame = SPINNER[Math.floor(s.now / TICK_MS) % SPINNER.length]
  return (
    <Box flexDirection="column" marginTop={1}>
      {Section(ui, 'RUNNING NOW', `${s.running.length} tool calls · ${s.liveAgents.length} subagents`, P.ok)}
      {s.running.slice(-6).map(r => {
        const el = s.now - r.startedAt
        return (
          <Text wrap="truncate-end">
            <Text color={P.ok}>{`  ${frame} `}</Text>
            <Text bold>{clip(r.tool, 10)}</Text>
            <Text color={P.muted}>{` ${clip(r.label + (r.isSubagent ? '  (subagent)' : ''), Math.max(8, W - 24))} `}</Text>
            <Text color={el > 120_000 ? P.err : el > 30_000 ? P.warn : P.fg}>{dur(el).padStart(7)}</Text>
          </Text>
        )
      })}
      {s.liveAgents.map(a => (
        <Text wrap="truncate-end">
          <Text color={P.agent}>{`  ${frame} ◈ `}</Text>
          <Text bold>{a.type}</Text>
          <Text color={P.muted}>{` ${a.description} · ${a.model.replace(/^claude-/, '')} · ${a.calls} calls · ${dur(s.now - a.startedAt)}`}</Text>
        </Text>
      ))}
    </Box>
  )
}

function Skills(ui: UI, s: PulseStats, W: number) {
  const { Box, Text } = ui
  const rows = Object.entries(s.skills).sort((a, b) => b[1].lastAt - a[1].lastAt)
  const latest = rows[0]?.[0]
  const nw = Math.min(26, Math.max(8, ...rows.map(([n]) => n.length)))
  const max = Math.max(1, ...rows.map(([, v]) => v.count))
  const bw = Math.max(4, Math.min(14, W - nw - 34))
  return (
    <Box flexDirection="column" marginTop={1}>
      {Section(ui, 'SKILLS', rows.length ? `${rows.length} used this session` : 'none yet', P.skill)}
      {rows.length === 0 && <Text color={P.muted}>  Skills appear here the moment one is loaded (Skill tool, /command or preload).</Text>}
      {rows.slice(0, 8).map(([name, v]) => (
        <Text wrap="truncate-end">
          <Text color={name === latest ? P.skill : P.fg} bold={name === latest}>{`  ${clip(name, nw)} `}</Text>
          {pix(ui, v.count, max, bw, P.skill, '✦')}
          <Text bold>{` ${String(v.count).padStart(3)}`}</Text>
          <Text color={P.muted}>{`  ${ago(s, v.lastAt).padEnd(10)} all-time ${s.allTimeSkills[name] ?? v.count}`}</Text>
          {name === latest ? <Text color={P.skill}> ◀ latest</Text> : ''}
        </Text>
      ))}
    </Box>
  )
}

function Tools(ui: UI, s: PulseStats, W: number, limit: number) {
  const { Box, Text } = ui
  const rows = Object.entries(s.tools).sort((a, b) => b[1].count - a[1].count)
  const total = rows.reduce((n, [, t]) => n + t.count, 0)
  const bySub = rows.reduce((n, [, t]) => n + t.bySubagent, 0)
  const errors = rows.reduce((n, [, t]) => n + t.errors, 0)
  const nw = Math.min(22, Math.max(6, ...rows.map(([n]) => n.length)))
  const max = Math.max(1, ...rows.map(([, t]) => t.count))
  const bw = Math.max(4, Math.min(16, W - nw - 34))
  const note = total ? `${total} calls · ${bySub} by subagents · ${errors} errors` : 'none yet'
  return (
    <Box flexDirection="column" marginTop={1}>
      {Section(ui, 'TOOLS', note, P.tool)}
      {rows.length > 0 && <Text color={P.muted}>{`  ${''.padEnd(nw)} ${''.padEnd(bw + 2)} calls  err     avg     max`}</Text>}
      {rows.slice(0, limit).map(([name, t]) => (
        <Text wrap="truncate-end">
          <Text>{`  ${clip(name.replace(/^mcp__/, ''), nw)} `}</Text>
          {pix(ui, t.count, max, bw, P.tool, '•')}
          <Text bold>{` ${String(t.count).padStart(5)}`}</Text>
          <Text color={t.errors ? P.err : P.muted}>{` ${String(t.errors).padStart(4)}`}</Text>
          <Text color={P.muted}>{` ${dur(t.count ? t.totalMs / t.count : 0).padStart(7)} ${dur(t.maxMs).padStart(7)}`}</Text>
        </Text>
      ))}
      {rows.length > limit && <Text color={P.muted}>{`  +${rows.length - limit} more · press 2 for all`}</Text>}
    </Box>
  )
}

function Agents(ui: UI, s: PulseStats, W: number) {
  const { Box, Text } = ui
  const rows = Object.entries(s.agents).sort((a, b) => b[1] - a[1])
  if (rows.length === 0) return ''
  const spawned = rows.reduce((n, [, c]) => n + c, 0)
  const max = Math.max(1, ...rows.map(([, c]) => c))
  const nw = Math.min(24, Math.max(6, ...rows.map(([n]) => n.length)))
  const bw = Math.max(4, Math.min(14, W - nw - 14))
  return (
    <Box flexDirection="column" marginTop={1}>
      {Section(ui, 'SUBAGENTS', `${spawned} spawned · ${s.agentsDone} finished · ${s.liveAgents.length} running`, P.agent)}
      {rows.map(([type, c]) => (
        <Text wrap="truncate-end">
          <Text>{`  ${clip(type, nw)} `}</Text>
          {pix(ui, c, max, bw, P.agent, '◈')}
          <Text bold>{` ${c}`}</Text>
        </Text>
      ))}
    </Box>
  )
}

function Files(ui: UI, s: PulseStats, W: number) {
  const { Box, Text } = ui
  const rows = Object.entries(s.files).sort((a, b) => b[1].reads + b[1].edits - (a[1].reads + a[1].edits))
  if (rows.length === 0) return ''
  const max = Math.max(1, ...rows.map(([, f]) => f.reads + f.edits))
  const nw = Math.min(40, Math.max(10, W - 34))
  return (
    <Box flexDirection="column" marginTop={1}>
      {Section(ui, 'HOT FILES', `${rows.length} touched`, P.file)}
      {rows.slice(0, 10).map(([path, f]) => (
        <Text wrap="truncate-end">
          <Text>{`  ${clip(shortPath(path), nw)} `}</Text>
          {pix(ui, f.reads + f.edits, max, 10, P.file, '▤')}
          <Text color={P.muted}>{`  read ${f.reads} · edit ${f.edits}`}</Text>
        </Text>
      ))}
    </Box>
  )
}

function Insights(ui: UI, s: PulseStats) {
  const { Box, Text } = ui
  const tools = Object.entries(s.tools)
  if (tools.length === 0) return ''
  const total = tools.reduce((n, [, t]) => n + t.count, 0)
  const errors = tools.reduce((n, [, t]) => n + t.errors, 0)
  const slowest = [...tools].sort((a, b) => b[1].maxMs - a[1].maxMs)[0]
  const busiest = [...tools].sort((a, b) => b[1].count - a[1].count)[0]
  if (!slowest || !busiest) return ''
  return (
    <Box flexDirection="column" marginTop={1}>
      {Section(ui, 'INSIGHTS', undefined, P.info)}
      <Text wrap="truncate-end" color={P.muted}>
        {`  busiest ${busiest[0]} (${Math.round((busiest[1].count / total) * 100)}%) · slowest ${slowest[0]} ${dur(slowest[1].maxMs)} · error rate ${((errors / total) * 100).toFixed(1)}%`}
      </Text>
      {s.lastError && (
        <Text wrap="truncate-end">
          <Text color={P.err}>{`  ✖ last error  ${s.lastError.tool}: `}</Text>
          <Text color={P.muted}>{`${plainText(s.lastError.text)} · ${ago(s, s.lastError.at)}`}</Text>
        </Text>
      )}
    </Box>
  )
}

/** The phases as one breadcrumb bar: done green, the running one lavender, the rest dim. Labels shrink to fit. */
/**
 * The phases as one breadcrumb bar: done green, the running one lavender, the rest dim. Each
 * carries its first two words when they all fit, its number alone otherwise; never a cut word.
 */
function Stepper(ui: UI, phases: PulsePhase[], frame: string, W: number) {
  const { Text } = ui
  const build = (isNamed: boolean): Seg[] =>
    phases.map((p, i) => {
      const glyph = p.status === 'done' ? '✓' : p.status === 'active' ? frame : '○'
      const text = isNamed ? `${glyph} ${i + 1} ${p.name.split(/\s+/).slice(0, 2).join(' ')}` : `${glyph} ${i + 1}`
      return p.status === 'done'
        ? { text, bg: P.ok }
        : p.status === 'active'
          ? { text, bg: P.plan, bold: true }
          : { text, bg: P.surface, fg: P.muted }
    })
  const named = build(true)
  return (
    <Text wrap="truncate-end">
      {'  '}
      {segs(ui, segsWidth(named) <= W - 2 ? named : build(false))}
    </Text>
  )
}

/** The plan: on the overview its bar and buttons, on the Plans tab every phase with what it changed and the checks. */
function Plan(ui: UI, $: Dollar, s: PulseStats, W: number, isFull: boolean) {
  const { Box, Text, Button } = ui
  const plan = s.plan
  if (!plan) {
    return (
      <Box flexDirection="column" marginTop={1}>
        {Section(ui, 'PLAN', isFull ? 'none running' : 'none · press 3 for past plans', P.plan)}
        <Text color={P.muted}>  Multi-step tasks get a phased plan here; Claude waits for your approval before executing.</Text>
      </Box>
    )
  }
  const checks =
    plan.editedAt === undefined
      ? { text: 'no files changed yet', color: P.muted }
      : plan.checkedAt === undefined || plan.checkedAt < plan.editedAt
        ? { text: '○ not run since the last change', color: P.warn }
        : plan.isCheckOk
          ? { text: `✓ passed ${ago(s, plan.checkedAt)}`, color: P.ok }
          : { text: `✖ failed ${ago(s, plan.checkedAt)}`, color: P.err }
  const total = plan.phases.length
  const done = plan.phases.filter(p => p.status === 'done').length
  const pct = total ? Math.round((done / total) * 100) : 0
  const spent = plan.phases.reduce((n, p) => n + p.tokens, 0)
  const frame = SPINNER[Math.floor(s.now / TICK_MS) % SPINNER.length]
  const state = {
    awaiting: { text: 'awaiting your approval', color: P.warn },
    revising: { text: 'revising', color: P.file },
    executing: { text: `executing ${done}/${total}`, color: P.tool },
    done: { text: `done in ${dur((plan.endedAt ?? s.now) - (plan.approvedAt ?? plan.createdAt))}`, color: P.ok },
    cancelled: { text: 'cancelled', color: P.muted },
  }[plan.status]
  const nw = Math.max(12, Math.min(44, W - 36))
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text wrap="truncate-end">
        {pill(ui, 'PLAN', P.plan)}
        {' '}
        {pill(ui, state.text, state.color)}
        <Text bold>{`  ${plan.title}`}</Text>
      </Text>
      {Stepper(ui, plan.phases, frame ?? '•', W)}
      <Text wrap="truncate-end">
        <Text>{'  '}</Text>
        {pix(ui, done, total, Math.min(14, Math.max(total * 2, 6)), plan.status === 'done' ? P.ok : P.plan, '▤')}
        <Text bold>{` ${pct}%`}</Text>
        <Text color={P.muted}>{`  new tokens: planning ${num(plan.planTokens ?? 0)} · phases ${num(spent)}${plan.revisions ? ` · ${plan.revisions} revision${plan.revisions > 1 ? 's' : ''}` : ''}`}</Text>
      </Text>
      {isFull && (
        <Text wrap="truncate-end">
          <Text color={P.muted}>{'  checks  '}</Text>
          <Text color={checks.color}>{checks.text}</Text>
        </Text>
      )}
      {isFull &&
        plan.phases.map((p, i) => {
          const glyph = p.status === 'done' ? '✓' : p.status === 'active' ? frame : '○'
          const color = p.status === 'done' ? P.ok : p.status === 'active' ? P.plan : P.muted
          const took = p.startedAt ? dur((p.endedAt ?? s.now) - p.startedAt) : ''
          return (
            <Box flexDirection="column">
              <Text wrap="truncate-end">
                <Text color={color}>{`  ${glyph} ${String(i + 1).padStart(2)} `}</Text>
                <Text color={p.status === 'pending' ? P.muted : P.fg} bold={p.status === 'active'}>
                  {clip(p.name, nw)}
                </Text>
                <Text color={P.muted}>{` ${took.padStart(7)} ${(p.tokens ? `${num(p.tokens)} tok` : '').padStart(10)}`}</Text>
              </Text>
              {(p.files ?? []).slice(0, 6).map(f => (
                <Text wrap="truncate-end" color={P.file}>{`        ▤ ${f.startsWith('$ ') ? f : shortPath(f)}`}</Text>
              ))}
              {(p.files?.length ?? 0) > 6 && <Text color={P.muted}>{`        +${(p.files?.length ?? 0) - 6} more`}</Text>}
            </Box>
          )
        })}
      {isOpen(plan) && (
        <Box gap={1} marginTop={1} paddingLeft={2}>
          <Button key="plan-approve" plain hotkey="a" onPress={() => approvePlan($)}>
            {pill(ui, '✓ Approve & run', P.ok)}
          </Button>
          <Button key="plan-revise" plain hotkey="e" onPress={() => $.prompt.fill({ text: 'Revise the plan: ', mode: 'replace' })}>
            {pill(ui, '✎ Revise', P.surface, P.fg)}
          </Button>
          <Button
            key="plan-cancel"
            plain
            hotkey="x"
            onPress={async () => saveHistory($, await update($, stats, st => (st.plan ? withEvent(endPlan(st, 'cancelled', st.now), 'plan', 'plan cancelled') : st)))}
          >
            {pill(ui, '✕ Cancel', P.surface, P.err)}
          </Button>
        </Box>
      )}
      {(plan.status === 'done' || plan.status === 'cancelled') && (
        <Box marginTop={1} paddingLeft={2}>
          <Button key="plan-clear" plain hotkey="c" onPress={() => update($, stats, st => ({ ...st, plan: undefined }))}>
            {pill(ui, '✕ Clear plan', P.surface, P.fg)}
          </Button>
        </Box>
      )}
    </Box>
  )
}

/** Past plans, newest first: how each ended, how long it ran, what it cost and whether its checks passed. */
function History(ui: UI, s: PulseStats, W: number) {
  const { Box, Text } = ui
  const nw = Math.max(12, Math.min(40, W - 44))
  return (
    <Box flexDirection="column" marginTop={1}>
      {Section(ui, 'PAST PLANS', s.history.length ? `${s.history.length} kept across sessions` : 'none yet', P.plan)}
      {s.history.map(past => {
        const done = past.phases.filter(p => p.status === 'done').length
        const files = new Set(past.phases.flatMap(p => p.files ?? [])).size
        const tokens = past.planTokens + past.phases.reduce((n, p) => n + p.tokens, 0)
        const took = past.endedAt ? dur(past.endedAt - (past.approvedAt ?? past.createdAt)) : ''
        const check = past.editedAt === undefined ? '–' : past.isCheckOk && (past.checkedAt ?? 0) >= past.editedAt ? '✓' : '✖'
        return (
          <Text wrap="truncate-end">
            <Text color={past.status === 'done' ? P.ok : P.muted}>{`  ${past.status === 'done' ? '✓' : '✕'} `}</Text>
            <Text color={P.fg}>{clip(past.title, nw)}</Text>
            <Text color={P.muted}>{` ${done}/${past.phases.length} · ${took.padStart(6)} · ${num(tokens).padStart(6)} tok · ${files} files · checks `}</Text>
            <Text color={check === '✓' ? P.ok : check === '✖' ? P.err : P.muted}>{check}</Text>
            <Text color={P.muted}>{`  ${new Date(past.createdAt).toLocaleDateString()} ${clock(past.createdAt).slice(0, 5)}`}</Text>
          </Text>
        )
      })}
    </Box>
  )
}

/** What each glyph and colour means, along the foot of the pane. */
function Legend(ui: UI) {
  const { Box, Text } = ui
  const keys: [PulseEventKind, string][] = [
    ['skill', 'skill'],
    ['tool', 'tool'],
    ['agent', 'subagent'],
    ['plan', 'plan'],
    ['error', 'error'],
    ['alert', 'alert'],
  ]
  return (
    <Box marginTop={1}>
      <Text wrap="truncate-end">
        {keys.map(([kind, label]) => (
          <Text>
            <Text color={kindColor(kind)}>{GLYPH[kind]}</Text>
            <Text color={P.muted}>{` ${label}   `}</Text>
          </Text>
        ))}
        <Text color={P.muted}>{'activity '}</Text>
        {P.heat.slice(1).map(c => (
          <Text color={c}>▰</Text>
        ))}
        <Text color={P.muted}> busier</Text>
      </Text>
    </Box>
  )
}

function Timeline(ui: UI, s: PulseStats, rows: number) {
  const { Box, Text } = ui
  const list = s.timeline.slice(-Math.max(5, rows)).reverse()
  return (
    <Box flexDirection="column" marginTop={1}>
      {Section(ui, 'TIMELINE', `newest first · ${s.timeline.length} events`, P.accent)}
      {list.length === 0 && <Text color={P.muted}>  Nothing yet.</Text>}
      {list.map(ev => (
        <Text wrap="truncate-end">
          <Text color={P.muted}>{`  ${clock(ev.at)} `}</Text>
          <Text color={kindColor(ev.kind)}>{`${GLYPH[ev.kind]} `}</Text>
          <Text color={ev.kind === 'error' || ev.kind === 'alert' ? kindColor(ev.kind) : P.fg}>{ev.text}</Text>
        </Text>
      ))}
    </Box>
  )
}

function report(s: PulseStats): string {
  const tools = Object.entries(s.tools).sort((a, b) => b[1].count - a[1].count)
  const skills = Object.entries(s.skills).sort((a, b) => b[1].count - a[1].count)
  const total = tools.reduce((n, [, t]) => n + t.count, 0)
  const lines = [
    `Pulse report — up ${dur(s.now - s.startedAt)}, ${s.turns} turns, ${total} tool calls` +
      (s.costUsd !== undefined ? `, $${(s.costUsd - s.costBase).toFixed(2)} today` : '') +
      (s.contextPercent !== undefined ? `, context ${s.contextPercent}%` : ''),
    '',
    `Skills: ${skills.length ? skills.map(([n, v]) => `${n} ×${v.count}`).join(', ') : 'none'}`,
    `Tools: ${tools.length ? tools.map(([n, t]) => `${n} ×${t.count}${t.errors ? ` (${t.errors} err)` : ''}`).join(', ') : 'none'}`,
    `Subagents: ${Object.entries(s.agents).map(([n, c]) => `${n} ×${c}`).join(', ') || 'none'}`,
    `Tokens: in ${num(s.tokens.input + s.tokens.cacheRead + s.tokens.cacheWrite)}, out ${num(s.tokens.output)}, cache read ${num(s.tokens.cacheRead)}`,
  ]
  if (s.plan) {
    lines.push(
      `Plan: ${s.plan.title} (${s.plan.status}) — planning ${num(s.plan.planTokens)} tok; ` +
        s.plan.phases.map((p, i) => `${i + 1}. ${p.name} [${p.status}${p.tokens ? `, ${num(p.tokens)} tok` : ''}]`).join('; '),
    )
  }
  return lines.join('\n')
}

// ── hooks ────────────────────────────────────────────────────────────────────

export const register: Register = on => {

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pulse',
      description: 'Live monitor of skills, tools, subagents, plan phases, context and tokens',
      argumentHint: '[reset | report | style powerline|rounded|plain | mascot owl|cubeman|off | owl night|barn|snowy|lilac|off]',
    })
    try {
      const saved = (await $.store.get('prefs')) as Partial<PulsePrefs> | undefined
      if (saved) await update($, prefs, () => ({ ...DEFAULT_PREFS, ...saved }))
    } catch {}
    await $.tool.register({ name: 'plan', description: PLAN_TOOL_DESCRIPTION, inputSchema: PLAN_SCHEMA, isDeferred: false })
    const now = await $.clock.now()
    let allTime: Record<string, number> = {}
    let history: PulsePlan[] = []
    try {
      allTime = ((await $.store.get('allTimeSkills')) ?? {}) as Record<string, number>
      history = ((await $.store.get('history')) ?? []) as PulsePlan[]
    } catch {}
    // A value kept from an older version lacks the newer fields: fill them in.
    await update($, stats, s => (s.startedAt === 0 ? { ...fresh(now), allTimeSkills: allTime, history } : roll({ ...fresh(now), ...s, history: s.history ?? history }, now)))

    // While the mascot has something to act out, every FRAME_MS (owl) or CUBE_FRAME_MS (Cubeman); every TICK_MS otherwise.
    let lastDrawAt = 0
    let lastUsageAt = 0
    $.clock.every(CUBE_FRAME_MS, () => {
      void (async () => {
        const t = await $.clock.now()
        const p = await read($, prefs)
        const isCube = p.owl && p.mascot === 'cubeman'
        const interval = !isLively(await read($, stats)) ? TICK_MS : isCube ? CUBE_FRAME_MS : FRAME_MS
        // Half a tick of slack: the time is read after an await, so 499 ms must still count as 500.
        if (t - lastDrawAt < interval - CUBE_FRAME_MS / 2) return
        lastDrawAt = t
        const s = await update($, stats, prev => roll(prev, t))
        $.ui.status(statusText(s))
        if (t - lastUsageAt >= USAGE_EVERY_MS) {
          lastUsageAt = t
          await refreshUsage($)
        }
      })().catch(() => {})
    })
    void refreshUsage($).catch(() => {})
    void $.ui.open({ id: PANE, title: TITLE }).catch(() => {})

    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!(await read($, prefs)).planFlow) return composed
    return { sections: [...composed.sections, { id: 'skill-pulse-plan', text: PLAN_RULE, scope: 'session' }] }
  })

  on('command.run', { command: 'pulse' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'reset') {
      await update($, stats, s => ({ ...fresh(s.now), allTimeSkills: s.allTimeSkills, startedAt: s.startedAt, plan: s.plan, history: s.history }))
      return { text: 'Pulse counters reset.' }
    }
    if (arg === 'report') return { text: report(await read($, stats)) }
    const [word, value] = arg.split(/\s+/)
    if (word === 'style' || word === 'owl' || word === 'mascot') {
      const current = await read($, prefs)
      const colorway = OWL_COLORWAYS.find(c => c === value)
      let change: Partial<PulsePrefs> | undefined
      if (word === 'style' && (value === 'powerline' || value === 'rounded' || value === 'plain')) change = { style: value }
      if (word === 'owl' && value === 'on') change = { owl: true, mascot: 'owl' }
      if (word === 'owl' && value === 'off') change = { owl: false }
      if (word === 'owl' && colorway) change = { owl: true, owlColor: colorway, mascot: 'owl' }
      if (word === 'mascot' && (value === 'owl' || value === 'cubeman')) change = { owl: true, mascot: value as PulseMascot }
      if (word === 'mascot' && value === 'off') change = { owl: false }
      if (!change) {
        return {
          text:
            word === 'style'
              ? `Style is ${current.style}. Use /pulse style powerline, rounded or plain — or the ⚙ Settings tab.`
              : word === 'mascot'
                ? `The mascot is ${current.owl ? current.mascot : 'off'}. Use /pulse mascot owl|cubeman|off — or the ⚙ Settings tab.`
                : `The owl is ${current.owl ? current.owlColor : 'off'}. Use /pulse owl ${OWL_COLORWAYS.join('|')}|off — or the ⚙ Settings tab.`,
        }
      }
      const chosen = await savePrefs($, change)
      if (word === 'style') return { text: `Pulse style: ${chosen.style}.` }
      if (word === 'mascot') return { text: chosen.owl ? `Pulse mascot: ${chosen.mascot}.` : 'Pulse mascot off.' }
      return { text: chosen.owl ? `Pulse owl: ${chosen.owlColor} — hoo!` : 'Pulse owl off.' }
    }
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: 'Pulse monitor opened. Keys in the pane: 1 overview · 2 tools & files · 3 plans · 4 timeline · 5 settings · o owl colours · r reset · a approve plan.' }
  })

  // Each prompt resets the plan gate and drops a finished plan; an answer to a plan awaiting approval approves it, or marks it being revised.
  on('prompt.submit', async ($, e, next) => {
    const isFinished = (plan: PulsePlan | undefined) => plan?.status === 'done' || plan?.status === 'cancelled'
    const s = await update($, stats, prev => ({ ...prev, unplannedEdits: 0, nudged: false, plan: isFinished(prev.plan) ? undefined : prev.plan }))
    if (!isOpen(s.plan)) return next(e)
    const text = e.text.trim()
    const isApproval = text.length <= 40 && APPROVE.test(text) && !HEDGE.test(text)
    const now = await $.clock.now()
    await update($, stats, prev => {
      if (!prev.plan || !isOpen(prev.plan)) return prev
      const st = roll(prev, now)
      return isApproval
        ? withEvent({ ...st, plan: { ...prev.plan, status: 'executing' as const, approvedAt: now } }, 'plan', `plan approved · ${prev.plan.title}`)
        : { ...st, plan: { ...prev.plan, status: 'revising' as const } }
    })
    if (!isApproval) return next(e)
    return next({
      ...e,
      context: [...(e.context ?? []), APPROVED_CONTEXT],
    })
  })

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    const args = argsOf(e)
    const label = labelFor(tool, args)
    const file = filePathOf(tool, args)
    const isSubagent = e.agentId !== undefined
    const sig = `${tool}:${JSON.stringify(args).slice(0, 400)}`
    const startedAt = await $.clock.now()
    let loop: string | undefined

    await update($, stats, prev => {
      const s = roll(prev, startedAt)
      const t = s.tools[tool] ?? { count: 0, errors: 0, totalMs: 0, maxMs: 0, bySubagent: 0 }
      const activity = [...s.activity]
      activity[activity.length - 1] = (activity[activity.length - 1] ?? 0) + 1
      const recentCalls = POLLING_TOOLS.has(tool) ? s.recentCalls : [...s.recentCalls, sig].slice(-8)
      loop = recentCalls.filter(c => c === sig).length === LOOP_REPEATS ? `${tool} repeated ${LOOP_REPEATS}× with the same input: ${label}` : undefined
      const files = { ...s.files }
      if (file) {
        const f = files[file] ?? { reads: 0, edits: 0 }
        files[file] = tool === 'Read' ? { ...f, reads: f.reads + 1 } : { ...f, edits: f.edits + 1 }
      }
      const updated: PulseStats = {
        ...s,
        tools: { ...s.tools, [tool]: { ...t, count: t.count + 1, bySubagent: t.bySubagent + (isSubagent ? 1 : 0) } },
        activity,
        recentCalls,
        files,
        running: [...s.running, { id: e.tool_use_id, tool, label, startedAt, isSubagent }],
        liveAgents: s.liveAgents.map(a => (a.id === e.agentId ? { ...a, calls: a.calls + 1 } : a)),
      }
      const withTool = withEvent(updated, 'tool', `${tool}${label ? `  ${label}` : ''}${isSubagent ? '  (subagent)' : ''}`)
      return loop ? withEvent(withTool, 'alert', `Possible loop — ${loop}`) : withTool
    })
    if (loop) $.ui.toast(`⚠ Possible loop: ${loop}`)

    const isEdit = EDIT_TOOLS.has(tool) || isShellWrite(tool, args)
    const ranCheck = isCheck(tool, args)
    let ran: Awaited<ReturnType<typeof next>> | undefined
    try {
      // File edits wait while a plan waits for approval; without any plan, the second edit of a prompt is turned back once.
      let deny: string | undefined
      if (isEdit && !isSubagent && (await read($, prefs)).planFlow) {
        await update($, stats, prev => {
          if (isOpen(prev.plan)) {
            deny = HELD
            return prev
          }
          if (prev.plan?.status === 'executing') return prev
          const unplannedEdits = prev.unplannedEdits + 1
          if (unplannedEdits < 2 || prev.nudged) return { ...prev, unplannedEdits }
          deny = NUDGE
          return withEvent({ ...prev, unplannedEdits, nudged: true }, 'plan', 'edits without a plan — nudged to propose one')
        })
      }
      ran = deny ? { deny } : await next(e)
      return ran
    } finally {
      const end = await $.clock.now()
      const ms = end - startedAt
      const denied = ran === undefined || typeof ran.deny === 'string'
      const isError = denied || ran?.isError === true
      const why = ran === undefined ? 'interrupted' : typeof ran.deny === 'string' ? `denied: ${ran.deny}` : (ran.text ?? '')
      await update($, stats, prev => {
        const s = roll(prev, end)
        const t = s.tools[tool] ?? { count: 1, errors: 0, totalMs: 0, maxMs: 0, bySubagent: 0 }
        // While a plan runs: what each phase changed, and when the checks last ran and how they went.
        let plan = s.plan
        if (plan?.status === 'executing' && !denied) {
          if (isEdit && !isError) {
            const what = file ?? `$ ${label.slice(0, 60)}`
            plan = {
              ...plan,
              editedAt: end,
              phases: plan.phases.map(p => (p.status === 'active' && !(p.files ?? []).includes(what) ? { ...p, files: [...(p.files ?? []), what] } : p)),
            }
          }
          if (ranCheck) plan = { ...plan, checkedAt: end, isCheckOk: !isError }
        }
        const updated: PulseStats = {
          ...s,
          plan,
          running: s.running.filter(r => r.id !== e.tool_use_id),
          tools: { ...s.tools, [tool]: { ...t, errors: t.errors + (isError ? 1 : 0), totalMs: t.totalMs + ms, maxMs: Math.max(t.maxMs, ms) } },
        }
        if (!isError) return updated
        const text = plainText(why).split('\n').find(l => l.trim())?.trim().slice(0, 160) ?? 'error'
        return withEvent({ ...updated, lastError: { tool, text, at: end } }, 'error', `${tool} failed · ${text}`)
      })
    }
  })

  on('tool.call', { tool: PLAN_TOOL }, async ($, e) => {
    if (e.agentId !== undefined) return { deny: 'The plan tool is for the main conversation only.' }
    const a = argsOf(e)
    const action = a.action
    const now = await $.clock.now()
    const s = await read($, stats)
    const plan = s.plan

    if (action === 'propose') {
      const title = typeof a.title === 'string' && a.title.trim() ? a.title.trim() : 'Untitled task'
      const phases = Array.isArray(a.phases) ? a.phases.filter((p): p is string => typeof p === 'string' && p.trim() !== '').map(p => p.trim()) : []
      if (phases.length === 0) return { deny: 'propose needs a non-empty "phases" list of short imperative lines.' }
      const isRevision = isOpen(plan)
      // With the workflow switched off a plan is tracked, never held for approval.
      const isGated = (await read($, prefs)).planFlow
      await update($, stats, prev => {
        const st = roll(prev, now)
        const proposed: PulsePlan = {
          title,
          status: isGated ? 'awaiting' : 'executing',
          approvedAt: isGated ? undefined : now,
          phases: phases.slice(0, 12).map(name => ({ name, status: 'pending', tokens: 0 })),
          createdAt: now,
          planTokens: (isRevision ? (prev.plan?.planTokens ?? 0) : 0) + prev.turnSpent,
          revisions: isRevision ? (prev.plan?.revisions ?? 0) + 1 : 0,
        }
        return withEvent({ ...st, plan: proposed }, 'plan', `plan ${isRevision ? 'revised' : 'proposed'} · ${title} · ${phases.length} phases`)
      })
      void $.ui.open({ id: PANE, title: TITLE }).catch(() => {})
      if (!isGated) {
        return {
          result: `Plan "${title}" (${phases.length} phases) is recorded in the user's Pulse pane. The plan workflow is off, so go ahead: run the phases now, calling plan "start" and "done" for each.`,
        }
      }
      $.ui.toast('▤ Plan ready — reply "yes" or press a in the Pulse pane to approve')
      return {
        result:
          `Plan "${title}" (${phases.length} phases) is shown in the user's Pulse pane and awaits approval. ` +
          'End your turn now: list the phases as a brief numbered list and ask "Approve this plan?". Do not edit files or start phase 1 until the user approves.',
      }
    }

    if (action === 'cancel') {
      if (!plan || plan.status === 'done' || plan.status === 'cancelled') return { result: 'No plan to cancel.' }
      await saveHistory($, await update($, stats, prev => (prev.plan ? withEvent(endPlan(roll(prev, now), 'cancelled', now), 'plan', 'plan cancelled') : prev)))
      return { result: 'Plan cancelled.' }
    }

    if (action === 'start' || action === 'done') {
      if (!plan || plan.status === 'cancelled') return { deny: 'There is no active plan. Call plan with action "propose" first.' }
      if (isOpen(plan)) return { deny: 'The user has not approved this plan yet. Stop and ask "Approve this plan?".' }
      const n = typeof a.phase === 'number' ? Math.floor(a.phase) : NaN
      if (!(n >= 1 && n <= plan.phases.length)) return { deny: `"phase" must be a number from 1 to ${plan.phases.length}.` }
      const name = plan.phases[n - 1]?.name ?? ''
      // Finishing the last phase waits, once, for checks that ran after the last file change.
      const isLast = action === 'done' && plan.phases.every((p, i) => i === n - 1 || p.status === 'done')
      const isUnchecked = plan.editedAt !== undefined && !(plan.isCheckOk && (plan.checkedAt ?? 0) >= plan.editedAt)
      if (isLast && isUnchecked && !plan.isDoneNudged) {
        await update($, stats, prev =>
          prev.plan ? withEvent({ ...roll(prev, now), plan: { ...prev.plan, isDoneNudged: true } }, 'plan', 'finish held — files changed since the last passing check') : prev,
        )
        return { deny: UNCHECKED }
      }
      let isFinished = false
      const s2 = await update($, stats, prev => {
        if (!prev.plan) return prev
        const st = roll(prev, now)
        const phases: PulsePhase[] =
          action === 'start'
            ? startPhase(prev.plan.phases, n - 1, now)
            : prev.plan.phases.map((p, i) => (i === n - 1 ? { ...p, status: 'done', startedAt: p.startedAt ?? now, endedAt: now } : p))
        isFinished = phases.every(p => p.status === 'done')
        const text = action === 'start' ? `phase ${n} started · ${name}` : `phase ${n} done · ${name}${isFinished ? ' · plan complete' : ''}`
        const withPhases = { ...st, plan: { ...prev.plan, phases } }
        return withEvent(isFinished ? endPlan(withPhases, 'done', now) : withPhases, 'plan', text)
      })
      if (isFinished) {
        await saveHistory($, s2)
        $.ui.toast(`✓ Plan complete: ${plan.title}`)
      }
      return { result: action === 'start' ? `Phase ${n} started: ${name}` : `Phase ${n} done: ${name}${isFinished ? '. All phases are complete.' : ''}` }
    }

    return { deny: 'action must be one of propose, start, done, cancel.' }
  })

  on('skill.prompt', async ($, e, next) => {
    const now = await $.clock.now()
    let allTime: Record<string, number> | undefined
    try {
      const stored = ((await $.store.get('allTimeSkills')) ?? {}) as Record<string, number>
      allTime = { ...stored, [e.skill]: (stored[e.skill] ?? 0) + 1 }
      await $.store.set('allTimeSkills', allTime)
    } catch {}
    const s = await update($, stats, prev => {
      const s = roll(prev, now)
      const k = s.skills[e.skill] ?? { count: 0, lastAt: now }
      return withEvent(
        { ...s, skills: { ...s.skills, [e.skill]: { count: k.count + 1, lastAt: now } }, allTimeSkills: allTime ?? s.allTimeSkills },
        'skill',
        `skill loaded  ${e.skill}`,
      )
    })
    $.ui.status(statusText(s))
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (typeof r.deny === 'string') return r
    const now = await $.clock.now()
    await update($, stats, prev => {
      const s = roll(prev, now)
      const live = r.agentId
        ? [...s.liveAgents, { id: r.agentId, type: e.subagentType, description: e.description, model: r.model, startedAt: now, calls: 0 }]
        : s.liveAgents
      return withEvent(
        { ...s, agents: { ...s.agents, [e.subagentType]: (s.agents[e.subagentType] ?? 0) + 1 }, liveAgents: live },
        'agent',
        `subagent started  ${e.subagentType} · ${e.description}${e.background ? ' (background)' : ''}`,
      )
    })
    return r
  })

  on('turn.start', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, stats, prev => ({ ...roll(prev, now), isBusy: true, turnSpent: 0 }))
    return next(e)
  })

  // Each model request's tokens, as it ends: the live totals, and the phase running now.
  on('turn.step', async function* ($, e, next) {
    const r = yield* next(e)
    const u = r.usage
    if (u) {
      const spent = newTokens(u)
      await update($, stats, prev => {
        const plan = prev.plan
        return {
          ...prev,
          turnSpent: (prev.turnSpent ?? 0) + (e.agentId ? 0 : spent),
          tokens: {
            input: prev.tokens.input + u.input_tokens,
            output: prev.tokens.output + u.output_tokens,
            cacheRead: prev.tokens.cacheRead + u.cache_read_input_tokens,
            cacheWrite: prev.tokens.cacheWrite + u.cache_creation_input_tokens,
          },
          // Work while a plan is executing is its active phase's; talk while it waits is planning.
          plan:
            plan?.status === 'executing'
              ? { ...plan, phases: plan.phases.map(p => (p.status === 'active' ? { ...p, tokens: p.tokens + spent } : p)) }
              : isOpen(plan) && plan && !e.agentId
                ? { ...plan, planTokens: (plan.planTokens ?? 0) + spent }
                : plan,
        }
      })
    }
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    const now = await $.clock.now()
    const u = e.usage
    const spent = u ? newTokens(u) : 0
    await update($, stats, prev => {
      const s = roll(prev, now)
      if (e.agentId) {
        const agent = s.liveAgents.find(a => a.id === e.agentId)
        return withEvent(
          { ...s, agentsDone: s.agentsDone + 1, liveAgents: s.liveAgents.filter(a => a.id !== e.agentId) },
          'agent',
          `subagent finished  ${agent?.type ?? 'agent'} · ${dur(e.durationMs)} · ${num(spent)} tok`,
        )
      }
      return withEvent(
        { ...s, isBusy: false, turns: s.turns + 1, turnTokens: [...s.turnTokens, spent].slice(-30) },
        'turn',
        `turn ${s.turns + 1} ${e.reason === 'answer' ? 'done' : e.reason} · ${dur(e.durationMs)} · ${num(spent)} tok`,
      )
    })
    await refreshUsage($).catch(() => {})
    return r
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const ui = table as unknown as UI
    const Raster = e.surface === 'terminal' ? (table as Elements['terminal']).Raster : undefined
    const { Box, Text } = ui
    const p = await read($, prefs)
    const palette = await paletteFor($, p.theme)
    const s = await read($, stats)
    const v = await read($, view)
    P = palette
    STYLE = p.style
    const W = Math.max(36, e.props.bodyColumns)
    const bodyRows = e.props.scroll?.bodyRows ?? 30
    const isEmpty = s.timeline.length === 0
    const showOwl = p.owl && Raster !== undefined && W >= 60
    // The owl's column and the gap beside it.
    const RW = showOwl ? W - OWL_BOX - 3 : W

    return (
      <Box flexDirection="column" width={W}>
        <Box flexDirection="row" gap={3}>
          {showOwl && Raster ? Owl(ui, $, Raster, s, p) : ''}
          <Box flexDirection="column" width={RW}>
            {Header(ui, s, RW)}
            {Nav(ui, $, v, RW)}
            <Box marginTop={1}>{Gauges(ui, s, RW)}</Box>
          </Box>
        </Box>
        <Text color={P.surface}>{'─'.repeat(W)}</Text>
        {v === 'overview' && (
          <Box flexDirection="column">
            {isEmpty && (
              <Box marginTop={1}>
                <Text color={P.muted}>Waiting for activity — skills, tool calls and subagents show up here live.</Text>
              </Box>
            )}
            {Running(ui, s, W)}
            {Skills(ui, s, W)}
            {Tools(ui, s, W, 6)}
            {Agents(ui, s, W)}
            {Insights(ui, s)}
            {Plan(ui, $, s, W, false)}
            {Legend(ui)}
          </Box>
        )}
        {v === 'plans' && (
          <Box flexDirection="column">
            {Plan(ui, $, s, W, true)}
            {History(ui, s, W)}
          </Box>
        )}
        {v === 'tools' && (
          <Box flexDirection="column">
            {Tools(ui, s, W, 40)}
            {Files(ui, s, W)}
            {Agents(ui, s, W)}
          </Box>
        )}
        {v === 'timeline' && Timeline(ui, s, Math.max(10, bodyRows - 12))}
        {v === 'timeline' && Legend(ui)}
        {v === 'settings' && Settings(ui, $, p)}
      </Box>
    )
  })
}
