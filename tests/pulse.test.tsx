import { expect, mock, test } from 'claude-code/testing'

import { OWLS, owlCells, STILL } from '../hooks/owl'

const PANE = {
  component: 'Pane',
  requestId: 'skill-pulse',
  props: {
    title: 'Pulse',
    isFocused: true,
    bodyColumns: 100,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

test('counts skills and tool calls and draws them on every surface', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('tool.call', () => ({ result: { ok: true } }))
  on('skill.prompt', ($, e) => ({ text: e.text }))

  await $.skill.prompt({ skill: 'dataviz', text: 'charts' })
  await $.tool.call({ tool: 'Read', file_path: 'C:/repo/src/app/page.tsx' })
  await $.tool.call({ tool: 'Read', file_path: 'C:/repo/src/app/page.tsx' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'skill-pulse', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: /dataviz/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /2 calls/ })).toBeDefined()

    await ui.press({ key: 'v-tools' })
    expect(await ui.find({ type: 'Text', text: /HOT FILES/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /read 2/ })).toBeDefined()

    await ui.press({ key: 'v-timeline' })
    expect(await ui.find({ type: 'Text', text: /skill loaded {2}dataviz/ })).toBeDefined()

    await ui.press({ key: 'v-overview' })
    await ui.unmount()
  }
})

const PLAN = 'mcp__skill-pulse__plan'
const RUN = { command: 'pulse', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } } as const

test('a plan waits for approval, then tracks its phases', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('tool.call', () => ({ result: { ok: true } }))
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context }))

  await $.tool.call({ tool: PLAN, action: 'propose', title: 'Add pagination', phases: ['Read the table', 'Add the API param', 'Build the UI'] })

  const early = await $.tool.call({ tool: PLAN, action: 'start', phase: 1 })
  expect(early.deny).toBeDefined()
  const edit = await $.tool.call({ tool: 'Edit', file_path: 'C:/repo/a.ts', old_string: 'a', new_string: 'b' })
  expect(edit.deny).toBeDefined()

  const ui = await $.ui.mount({ plugin: 'skill-pulse', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: /awaiting your approval/ })).toBeDefined()
  expect(await ui.find({ key: 'plan-approve' })).toBeDefined()

  const approved = await $.prompt.submit({ text: 'yes', wait: false, origin: { kind: 'composer' } })
  expect(approved.context?.some(c => c.includes('approved the plan'))).toBe(true)

  expect((await $.tool.call({ tool: PLAN, action: 'start', phase: 1 })).deny).toBeUndefined()
  expect((await $.tool.call({ tool: 'Edit', file_path: 'C:/repo/a.ts', old_string: 'a', new_string: 'b' })).deny).toBeUndefined()
  await $.tool.call({ tool: PLAN, action: 'start', phase: 2 })
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /executing 1\/3/ })).toBeDefined()

  await $.tool.call({ tool: PLAN, action: 'done', phase: 2 })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await $.tool.call({ tool: PLAN, action: 'done', phase: 3 })
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /done in/ })).toBeDefined()
  expect(await ui.find({ key: 'plan-clear' })).toBeDefined()
  await ui.unmount()
})

test('Cubeman is the default mascot; the owl and the bars draw on the terminal, no mascot on the desktop', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('tool.call', () => ({ result: { ok: true } }))

  await $.tool.call({ tool: PLAN, action: 'propose', title: 'Owl test', phases: ['One', 'Two', 'Three'] })

  const term = await $.ui.mount({ plugin: 'skill-pulse', surface: 'terminal', ...PANE })
  expect(await term.find({ key: 'cubeman' })).toBeDefined()
  expect(await term.find({ key: 'owl' })).toBeUndefined()
  expect(await term.find({ type: 'Text', text: /\? approve/ })).toBeDefined()

  await $.command.run({ ...RUN, args: 'mascot owl' })
  await term.redraw()
  expect(await term.find({ key: 'owl' })).toBeDefined()
  expect(await term.find({ type: 'Text', text: /hoo\? approve/ })).toBeDefined()
  expect(await term.find({ type: 'Text', text: /PULSE/ })).toBeDefined()
  expect(await term.find({ type: 'Text', text: /○ 1 One/ })).toBeDefined()
  expect(await term.find({ type: 'Text', text: /busier/ })).toBeDefined()
  await term.unmount()

  const desk = await $.ui.mount({ plugin: 'skill-pulse', surface: 'desktop', ...PANE })
  expect(await desk.find({ key: 'owl' })).toBeUndefined()
  expect(await desk.find({ key: 'cubeman' })).toBeUndefined()
  expect(await desk.find({ type: 'Text', text: /PULSE/ })).toBeDefined()
  await desk.unmount()
})

test('style and owl commands change the drawing and are kept', async ($, on) => {
  mock.clock(on)
  mock.store(on)

  expect((await $.command.run({ ...RUN, args: 'style plain' })).text).toContain('plain')
  expect((await $.command.run({ ...RUN, args: 'owl off' })).text).toContain('off')
  expect((await $.command.run({ ...RUN, args: 'style neon' })).text).toContain('Style is plain')

  const ui = await $.ui.mount({ plugin: 'skill-pulse', surface: 'terminal', ...PANE })
  expect(await ui.find({ key: 'owl' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: // })).toBeUndefined()
  await ui.unmount()
})

test('the Settings tab and the owl button change colours and style', async ($, on) => {
  mock.clock(on)
  mock.store(on)

  await $.command.run({ ...RUN, args: 'mascot owl' })
  const ui = await $.ui.mount({ plugin: 'skill-pulse', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: /◂ night ▸/ })).toBeDefined()
  await ui.press({ key: 'owl-cycle' })
  expect(await ui.find({ type: 'Text', text: /◂ barn ▸/ })).toBeDefined()

  await ui.press({ key: 'v-settings' })
  expect(await ui.find({ type: 'Text', text: /● barn/ })).toBeDefined()
  await ui.press({ key: 'owl-snowy' })
  expect(await ui.find({ type: 'Text', text: /● snowy/ })).toBeDefined()
  await ui.press({ key: 'style-rounded' })
  expect(await ui.find({ type: 'Text', text: /● rounded/ })).toBeDefined()
  await ui.press({ key: 'owl-off' })
  expect(await ui.find({ key: 'owl' })).toBeUndefined()
  expect((await $.command.run({ ...RUN, args: 'owl lilac' })).text).toContain('lilac')
  await ui.unmount()
})

test('pressing Approve in the pane approves the plan', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('tool.call', () => ({ result: { ok: true } }))
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context }))

  await $.tool.call({ tool: PLAN, action: 'propose', title: 'Button test', phases: ['One', 'Two'] })
  const ui = await $.ui.mount({ plugin: 'skill-pulse', surface: 'terminal', ...PANE })
  await ui.press({ key: 'plan-approve' })
  expect((await $.tool.call({ tool: PLAN, action: 'start', phase: 1 })).deny).toBeUndefined()
  await ui.unmount()
})

test('errors lose their tags and the stepper never cuts a word', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('tool.call', ($, e) =>
    e.tool === 'Read' ? { deny: '<tool_use_error>File has not been read yet.</tool_use_error>' } : { result: { ok: true } },
  )

  await $.tool.call({ tool: 'Read', file_path: 'C:/repo/missing.ts' })
  await $.tool.call({
    tool: PLAN,
    action: 'propose',
    title: 'Long names',
    phases: ['Add owl colourways night barn snowy and lilac', 'Add a Settings tab with pill buttons', 'Make the caption a button', 'Update tests and validate'],
  })

  const ui = await $.ui.mount({ plugin: 'skill-pulse', surface: 'terminal', ...PANE, props: { ...PANE.props, bodyColumns: 70 } })
  expect(await ui.find({ type: 'Text', text: /File has not been read yet/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /tool_use_error/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /○ 1 Add owl/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /○ 1 Add owl col…/ })).toBeUndefined()
  await ui.unmount()
})

test('with the plan workflow off, a plan is tracked but nothing waits', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('tool.call', () => ({ result: { ok: true } }))

  const ui = await $.ui.mount({ plugin: 'skill-pulse', surface: 'terminal', ...PANE })
  await ui.press({ key: 'v-settings' })
  await ui.press({ key: 'plan-off' })
  expect(await ui.find({ type: 'Text', text: /● off/ })).toBeDefined()

  await $.tool.call({ tool: PLAN, action: 'propose', title: 'Free run', phases: ['One', 'Two'] })
  expect((await $.tool.call({ tool: 'Edit', file_path: 'C:/repo/a.ts', old_string: 'a', new_string: 'b' })).deny).toBeUndefined()
  expect((await $.tool.call({ tool: PLAN, action: 'start', phase: 1 })).deny).toBeUndefined()
  await ui.unmount()
})

test('bars are pixel-art segments with an icon cap, and NOW shows the last event', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('tool.call', () => ({ result: { ok: true } }))

  await $.tool.call({ tool: 'Read', file_path: 'C:/repo/a.ts' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })

  const ui = await $.ui.mount({ plugin: 'skill-pulse', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: /^•$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /▰/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /NOW/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Bash {2}npm test/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /█{6,}/ })).toBeUndefined()
  await ui.unmount()
})

test('the theme row defaults to auto and switches palettes', async ($, on) => {
  mock.clock(on)
  mock.store(on)

  const ui = await $.ui.mount({ plugin: 'skill-pulse', surface: 'terminal', ...PANE })
  await ui.press({ key: 'v-settings' })
  expect(await ui.find({ type: 'Text', text: /● auto/ })).toBeDefined()
  await ui.press({ key: 'theme-latte' })
  expect(await ui.find({ type: 'Text', text: /● latte/ })).toBeDefined()
  await ui.press({ key: 'theme-terminal' })
  expect(await ui.find({ type: 'Text', text: /● terminal/ })).toBeDefined()
  await ui.unmount()
})

test('"good" approves a waiting plan', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('tool.call', () => ({ result: { ok: true } }))
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context }))

  await $.tool.call({ tool: PLAN, action: 'propose', title: 'Words', phases: ['One'] })
  await $.prompt.submit({ text: 'good', wait: false, origin: { kind: 'composer' } })
  expect((await $.tool.call({ tool: PLAN, action: 'start', phase: 1 })).deny).toBeUndefined()
})

test('a second edit with no plan is turned back once, then goes through', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('tool.call', () => ({ result: { ok: true } }))
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context }))
  const edit = () => $.tool.call({ tool: 'Edit', file_path: 'C:/repo/a.ts', old_string: 'a', new_string: 'b' })

  expect((await edit()).deny).toBeUndefined()
  expect((await edit()).deny).toContain('propose')
  expect((await edit()).deny).toBeUndefined()

  await $.prompt.submit({ text: 'next task', wait: false, origin: { kind: 'composer' } })
  expect((await edit()).deny).toBeUndefined()
  expect((await edit()).deny).toContain('propose')

  await $.tool.call({ tool: PLAN, action: 'propose', title: 'Planned', phases: ['One'] })
  await $.prompt.submit({ text: 'yes', wait: false, origin: { kind: 'composer' } })
  await $.tool.call({ tool: PLAN, action: 'start', phase: 1 })
  expect((await edit()).deny).toBeUndefined()
  expect((await edit()).deny).toBeUndefined()
})

test('a finished plan stays until the next prompt, then clears', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('tool.call', () => ({ result: { ok: true } }))
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context }))

  await $.tool.call({ tool: PLAN, action: 'propose', title: 'Short job', phases: ['One'] })
  await $.prompt.submit({ text: 'yes', wait: false, origin: { kind: 'composer' } })
  await $.tool.call({ tool: PLAN, action: 'done', phase: 1 })

  const ui = await $.ui.mount({ plugin: 'skill-pulse', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: /done in/ })).toBeDefined()
  await $.prompt.submit({ text: 'something else', wait: false, origin: { kind: 'composer' } })
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /done in/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Multi-step tasks get a phased plan/ })).toBeDefined()
  await ui.unmount()
})

test('finishing waits once for checks after the last change, and the Plans tab keeps the history', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('tool.call', () => ({ result: { ok: true } }))
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context }))
  const edit = (path: string) => $.tool.call({ tool: 'Edit', file_path: path, old_string: 'a', new_string: 'b' })

  await $.tool.call({ tool: PLAN, action: 'propose', title: 'Checked job', phases: ['Change it'] })
  await $.prompt.submit({ text: 'yes', wait: false, origin: { kind: 'composer' } })
  await $.tool.call({ tool: PLAN, action: 'start', phase: 1 })
  await edit('C:/repo/src/a.ts')

  const ui = await $.ui.mount({ plugin: 'skill-pulse', surface: 'terminal', ...PANE })
  await ui.press({ key: 'v-plans' })
  expect(await ui.find({ type: 'Text', text: /src\/a\.ts/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /not run since the last change/ })).toBeDefined()

  expect((await $.tool.call({ tool: PLAN, action: 'done', phase: 1 })).deny).toContain('checks')
  await $.tool.call({ tool: 'PowerShell', command: 'npx tsc -p tsconfig.json' })
  expect((await $.tool.call({ tool: PLAN, action: 'done', phase: 1 })).deny).toBeUndefined()

  await $.prompt.submit({ text: 'thanks', wait: false, origin: { kind: 'composer' } })
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /PAST PLANS/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Checked job/ })).toBeDefined()
  await ui.unmount()
})

test('an unchecked finish goes through when repeated', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('tool.call', () => ({ result: { ok: true } }))
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context }))

  await $.tool.call({ tool: PLAN, action: 'propose', title: 'Docs', phases: ['Write it'] })
  await $.prompt.submit({ text: 'yes', wait: false, origin: { kind: 'composer' } })
  await $.tool.call({ tool: PLAN, action: 'start', phase: 1 })
  await $.tool.call({ tool: 'Write', file_path: 'C:/repo/README.md', content: 'x' })
  expect((await $.tool.call({ tool: PLAN, action: 'done', phase: 1 })).deny).toBeDefined()
  expect((await $.tool.call({ tool: PLAN, action: 'done', phase: 1 })).deny).toBeUndefined()
})

test('shell writes count as edits, discarded output does not', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('tool.call', () => ({ result: { ok: true } }))

  expect((await $.tool.call({ tool: 'Bash', command: 'ls src 2>/dev/null' })).deny).toBeUndefined()
  expect((await $.tool.call({ tool: 'PowerShell', command: 'Get-ChildItem 2>$null' })).deny).toBeUndefined()
  expect((await $.tool.call({ tool: 'Bash', command: 'echo hi > notes.txt' })).deny).toBeUndefined()
  expect((await $.tool.call({ tool: 'Bash', command: "sed -i 's/a/b/' src/a.ts" })).deny).toContain('propose')
})

test('a skill loaded by the Skill tool shows in SKILLS, once even when skill.prompt also fires', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('tool.call', () => ({ result: { ok: true } }))
  on('skill.prompt', ($, e) => ({ text: e.text }))

  // The Skill tool alone, as in a live session where skill.prompt never arrives.
  await $.tool.call({ tool: 'Skill', skill: 'superpowers:brainstorming' })
  const ui = await $.ui.mount({ plugin: 'skill-pulse', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: /1 used this session/ })).toBeDefined()

  // When skill.prompt does follow for the same load, it isn't counted a second time.
  await $.skill.prompt({ skill: 'superpowers:brainstorming', text: 'brainstorm' })
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /all-time 1/ })).toBeDefined()
  await ui.unmount()
})

test('arrows in inline scripts are not file writes', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('tool.call', () => ({ result: { ok: true } }))

  const run = (command: string) => $.tool.call({ tool: 'PowerShell', command })
  expect((await run('node -e "[1].map(r=>r)"')).deny).toBeUndefined()
  expect((await run("node -e 'a->b; x => y'")).deny).toBeUndefined()
  expect((await run('if (a >= b) { echo ok }')).deny).toBeUndefined()
})

test('the owl moves between poses', () => {
  const colors = OWLS.night.dark
  const still = owlCells('look', colors)
  expect(owlCells('look', colors, { ...STILL, dy: 2 })).not.toBe(still)
  expect(owlCells('look', colors, { ...STILL, dx: 0 })).not.toBe(still)
  expect(owlCells('look', colors, { ...STILL, isFlap: true })).not.toBe(still)
  expect(owlCells('look', colors, { ...STILL, isTwitch: true })).not.toBe(still)
})

test('the mascot switches to Cubeman and back', async ($, on) => {
  mock.clock(on)
  mock.store(on)

  const ui = await $.ui.mount({ plugin: 'skill-pulse', surface: 'terminal', ...PANE })
  await ui.press({ key: 'v-settings' })
  await ui.press({ key: 'mascot-cubeman' })
  expect(await ui.find({ key: 'cubeman' })).toBeDefined()
  expect(await ui.find({ key: 'owl' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /● cubeman/ })).toBeDefined()

  expect((await $.command.run({ ...RUN, args: 'mascot owl' })).text).toContain('owl')
  await ui.redraw()
  expect(await ui.find({ key: 'owl' })).toBeDefined()
  expect(await ui.find({ key: 'cubeman' })).toBeUndefined()

  // Picking an owl colour while Cubeman shows brings the owl back, in that colour.
  await ui.press({ key: 'mascot-cubeman' })
  expect(await ui.find({ type: 'Text', text: /● night/ })).toBeUndefined()
  await ui.press({ key: 'owl-snowy' })
  expect(await ui.find({ key: 'owl' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /● snowy/ })).toBeDefined()
  await ui.unmount()
})

test('a turn that changed files ends with the done jump; a read-only turn does not', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('tool.call', () => ({ result: { ok: true } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  const turn = async (id: string, work: () => Promise<unknown>) => {
    await $.turn.start({ text: 'go', turnId: id })
    await work()
    await $.turn.complete({ answer: 'ok', durationMs: 1000, isAborted: false, turnId: id, reason: 'answer' })
  }

  await turn('t1', () => $.tool.call({ tool: 'Read', file_path: 'C:/repo/a.ts' }))
  const ui = await $.ui.mount({ plugin: 'skill-pulse', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: /✓ done!/ })).toBeUndefined()

  await turn('t2', () => $.tool.call({ tool: 'Edit', file_path: 'C:/repo/a.ts', old_string: 'a', new_string: 'b' }))
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /✓ done!/ })).toBeDefined()

  await clock.advance(10_000)
  await $.tool.call({ tool: 'Read', file_path: 'C:/repo/a.ts' })
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /✓ done!/ })).toBeUndefined()
  await ui.unmount()
})

test('counters start over at local midnight', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('tool.call', () => ({ result: { ok: true } }))

  await $.tool.call({ tool: 'Read', file_path: 'C:/repo/a.ts' })
  await $.tool.call({ tool: 'Read', file_path: 'C:/repo/a.ts' })
  await clock.advance(24 * 60 * 60 * 1000)
  await $.tool.call({ tool: 'Read', file_path: 'C:/repo/b.ts' })

  const ui = await $.ui.mount({ plugin: 'skill-pulse', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: /1 calls/ })).toBeDefined()
  await ui.press({ key: 'v-timeline' })
  expect(await ui.find({ type: 'Text', text: /new day/ })).toBeDefined()
  await ui.unmount()
})

test('an answer with changes keeps the plan waiting', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('tool.call', () => ({ result: { ok: true } }))
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context }))

  await $.tool.call({ tool: PLAN, action: 'propose', title: 'Refactor', phases: ['One', 'Two'] })
  const reply = await $.prompt.submit({ text: 'yes but split phase two', wait: false, origin: { kind: 'composer' } })
  expect(reply.context?.some(c => c.includes('approved the plan')) ?? false).toBe(false)
  expect((await $.tool.call({ tool: PLAN, action: 'start', phase: 1 })).deny).toBeDefined()
})
