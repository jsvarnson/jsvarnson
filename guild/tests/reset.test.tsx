import type { RenderPropsOf } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { latestResults } from '../hooks/lib/ledger'

type TestOn = Parameters<TestBody>[1]

// /clear, /resume and /branch reset every $.state value and skip session.start;
// classic.SessionStart (source clear, resume or fork) is the only signal.

const PANE_PROPS = { title: 'Guild', isFocused: false, bodyColumns: 48, placement: 'dock' } as unknown as RenderPropsOf['Pane']

const profile = (id: string, name: string) => `---
id: ${id}
name: ${name}
archetype: Arcanist
title: Expert
tagline: Does the work
skills: [code]
sigil: "🧙"
version: 1.0.0
summon_when:
  - work
never_when:
  - other → Seer
accepts: [Question, Scope]
delivers: Results
perspective: Careful.
---
# Method
Work.
`

const PACTS = `---
version: 2.0.0
---
| id | from | to | guarantee | checks |
|---|---|---|---|---|
| baseline | any | guildmaster | complete | scroll-complete, confidence-set, handoff-valid, not-aborted |
`

const GOOD_SCROLL = `## Verdict
Done.

## Confidence
high — ran it.

## Evidence
- ran the tests

## Deliverables
none

## Gaps & Risks
none

## Handoff
\`none\`
`

const ledgerLine = (member: string, id: string, isBreach: boolean, description: string) =>
  JSON.stringify({
    ts: '2026-10-13T10:00:00.000Z',
    type: 'summons',
    id,
    member,
    agentId: `agent-${id}`,
    description,
    durationMs: 1000,
    tokens: 50,
    isAborted: false,
    scroll: { missing: [], confidence: 'high', handoff: 'none', verdict: 'ok' },
    pacts: [{ id: 'baseline', isKept: !isBreach, failed: isBreach ? ['scroll-complete'] : [] }],
    isBreach,
  })

type World = {
  files: Map<string, string>
  state: Map<string, unknown>
  resetState: () => void
  // Runs after each $.state write lands, to put a reset inside a hook's window.
  afterSet?: (key: string) => Promise<void>
}
type Options = { ledger?: string[]; live?: Record<string, 'running' | 'idle' | 'killed' | 'completed'> }

// A guild folder in memory and a $.state the test can reset, as /clear does.
function world(on: TestOn, { ledger = [], live }: Options = {}): World {
  const files = new Map<string, string>([
    ['guild.md', '---\nversion: 1.1.0\n---\n# Charter\n'],
    ['pacts.md', PACTS],
    ['guildmaster/PROFILE.md', '---\nname: The Guildmaster\nsigil: "👑"\nversion: 1.0.0\n---\nRoute well.'],
    ['members/seer/PROFILE.md', profile('seer', 'The Seer')],
    ['members/wizard/PROFILE.md', profile('wizard', 'The Wizard')],
  ])
  if (ledger.length > 0) files.set('ledger/2026-10.jsonl', `${ledger.join('\n')}\n`)
  const rel = (path: string) => path.replace(/\\/g, '/').replace(/^.*\/\.claude\/guild\/?/, '')
  const childrenOf = (dir: string) => {
    const prefix = dir ? `${dir}/` : ''
    const seen = new Map<string, 'file' | 'dir'>()
    for (const key of files.keys()) {
      if (!key.startsWith(prefix)) continue
      const [head = '', ...tail] = key.slice(prefix.length).split('/')
      seen.set(head, tail.length > 0 ? 'dir' : 'file')
    }
    return [...seen].map(([name, kind]) => ({ name, kind, size: 0, mtimeMs: 1, isLink: false }))
  }
  const isGuild = (path: string) => /\/\.claude\/guild(\/|$)/.test(path.replace(/\\/g, '/'))
  on('fs.exists', (_, e) => ({ value: isGuild(e.path) && (files.has(rel(e.path)) || childrenOf(rel(e.path)).length > 0) }))
  on('fs.list', (_, e) => ({ value: isGuild(e.path) ? childrenOf(rel(e.path)) : [] }))
  on('fs.read', (_, e) => {
    const text = files.get(rel(e.path))
    return text === undefined ? { deny: `missing ${e.path}` } : { value: text }
  })
  on('fs.write', (_, e) => {
    files.set(rel(e.path), e.text)
    return { value: undefined }
  })
  const state = new Map<string, unknown>()
  const versions = new Map<string, number>()
  const made: World = { files, state, resetState: () => state.clear() }
  on('state.get', (_, e) => ({ value: { value: state.get(e.key), version: versions.get(e.key) ?? 0 } }))
  on('state.set', async (_, e) => {
    state.set(e.key, e.value)
    versions.set(e.key, (versions.get(e.key) ?? 0) + 1)
    await made.afterSet?.(e.key)
    return { value: { isSet: true, version: versions.get(e.key) ?? 1 } }
  })
  // Without `live`, the agent listing fails and every summons at work is kept.
  on('agent.list', () =>
    live
      ? { value: Object.entries(live).map(([id, status]) => ({ id, status, description: id, type: 'guild:wizard' })) }
      : { deny: 'no agent listing' },
  )
  on('agent.register', (_, e) => ({ value: { agent: `guild:${e.name}` } }))
  on('session.usage', () => ({ deny: 'no listing in tests' }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  mock.clock(on, { now: 60_000 })
  on('classic.SessionStart', () => ({}))
  return made
}

for (const source of ['clear', 'resume', 'fork'] as const) {
  test(`after ${source}, the pane lists the whole roster again`, async ($, on) => {
    world(on)
    await $.classic.SessionStart({ source })
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'guild', surface, component: 'Pane', requestId: 'guild', props: PANE_PROPS })
      expect(await ui.find({ key: 'summon-seer' })).toBeDefined()
      expect(await ui.find({ key: 'summon-wizard' })).toBeDefined()
      await ui.unmount()
    }
  })
}

for (const source of ['startup', 'compact'] as const) {
  test(`${source} does not reload the guild`, async ($, on) => {
    const { state } = world(on)
    await $.classic.SessionStart({ source })
    expect(state.get('roster')).toBeUndefined()
  })
}

test('a summons started before /clear is settled and written to the ledger after it', async ($, on) => {
  const { files, state, resetState } = world(on)
  on('agent.spawn', () => ({ model: 'opus', agentId: 'a1' }))
  on('turn.complete', () => ({ text: '' }))
  await $.agent.spawn({
    tool_use_id: 't1',
    prompt: 'Question: does it work?\nScope: the mod',
    description: 'Check the mod',
    subagentType: 'guild:wizard',
  } as never)
  expect((state.get('active') as unknown[] | undefined)?.length).toBe(1)
  resetState()
  await $.classic.SessionStart({ source: 'clear' })

  const pane = await $.ui.mount({ plugin: 'guild', surface: 'desktop', component: 'Pane', requestId: 'guild', props: PANE_PROPS })
  expect(await pane.find({ type: 'Text', text: /Check the mod/ })).toBeDefined()
  await pane.unmount()

  await $.turn.complete({ turnId: 't2', agentId: 'a1', answer: GOOD_SCROLL, durationMs: 5000, isAborted: false, reason: 'answer' } as never)
  const ledger = [...files].find(([path]) => path.startsWith('ledger/'))?.[1] ?? ''
  const record = JSON.parse(ledger.trim().split('\n').pop() ?? '{}') as Record<string, unknown>
  expect(record).toMatchObject({ type: 'summons', member: 'wizard', agentId: 'a1', description: 'Check the mod', isBreach: false })
  expect(record.pacts).toEqual([{ id: 'baseline', isKept: true, failed: [] }])
  expect(state.get('active')).toEqual([])
})

test('after /clear, Needs attention is rebuilt from each member\'s latest ledger summons', async ($, on) => {
  world(on, { ledger: [
    ledgerLine('seer', 'L-1', false, 'Old seer work'),
    ledgerLine('wizard', 'L-2', true, 'Old wizard breach'),
    ledgerLine('seer', 'L-3', true, 'Latest seer breach'),
    ledgerLine('wizard', 'L-4', false, 'Latest wizard work'),
  ] })
  await $.classic.SessionStart({ source: 'clear' })
  const pane = await $.ui.mount({ plugin: 'guild', surface: 'desktop', component: 'Pane', requestId: 'guild', props: PANE_PROPS })
  expect(await pane.find({ key: 'head-attention' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /Needs attention 1/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /baseline:scroll-complete/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /Latest seer breach/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /Old wizard breach/ })).toBeUndefined()
  await pane.unmount()
})

const spawn = ($: Parameters<TestBody>[0], agentId: string, description: string) => $.agent.spawn({
  tool_use_id: `t-${agentId}`,
  prompt: 'Question: does it work?\nScope: the mod',
  description,
  subagentType: 'guild:wizard',
  // The agent.spawn stub answers with the agentId the test names here.
  agentId,
} as never)

test('a reset that lands while a summons settles does not bring it back as at work', async ($, on) => {
  const made = world(on)
  on('agent.spawn', (_, e) => ({ model: 'opus', agentId: (e as unknown as { agentId: string }).agentId }))
  on('turn.complete', () => ({ text: '' }))
  await spawn($, 'a1', 'Check the mod')
  made.afterSet = async key => {
    if (key !== 'recent') return
    made.afterSet = undefined
    await $.classic.SessionStart({ source: 'clear' })
  }
  await $.turn.complete({ turnId: 't2', agentId: 'a1', answer: GOOD_SCROLL, durationMs: 5000, isAborted: false, reason: 'answer' } as never)
  expect(made.state.get('active')).toEqual([])
})

test('after a reset, only summonses the runtime still runs come back; ended and unlisted ones still settle', async ($, on) => {
  const { files, state, resetState } = world(on, { live: { a1: 'running', a2: 'killed' } })
  on('agent.spawn', (_, e) => ({ model: 'opus', agentId: (e as unknown as { agentId: string }).agentId }))
  on('turn.complete', () => ({ text: '' }))
  await spawn($, 'a1', 'Still running')
  await spawn($, 'a2', 'Killed by clear')
  await spawn($, 'a3', 'From another conversation')
  resetState()
  await $.classic.SessionStart({ source: 'clear' })
  expect((state.get('active') as { agentId: string }[]).map(one => one.agentId)).toEqual(['a1'])

  const ledgerIds = () => (([...files].find(([path]) => path.startsWith('ledger/'))?.[1] ?? '').match(/"agentId":"a\d"/g) ?? [])
  await $.turn.complete({ turnId: 't3', agentId: 'a2', answer: GOOD_SCROLL, durationMs: 5000, isAborted: true, reason: 'aborted' } as never)
  await $.turn.complete({ turnId: 't4', agentId: 'a3', answer: GOOD_SCROLL, durationMs: 5000, isAborted: true, reason: 'aborted' } as never)
  expect(ledgerIds()).toEqual(['"agentId":"a2"', '"agentId":"a3"'])
})

test('session.start merges ledger results into recent and keeps the session\'s own', async ($, on) => {
  const { state } = world(on, { ledger: [
    ledgerLine('seer', 'L-1', true, 'Seer breach from the ledger'),
    ledgerLine('wizard', 'L-2', true, 'Old wizard breach'),
  ] })
  state.set('recent', [
    { ledgerId: 'L-9', member: 'wizard', description: 'This session', isKept: true, failed: [], durationMs: 1, endedAt: 1 },
  ])
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', () => ({ value: { command: 'guild' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__guild__quest' } }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect((state.get('recent') as { ledgerId: string }[]).map(one => one.ledgerId)).toEqual(['L-9', 'L-1'])
})

test('one malformed ledger record is skipped, not the whole restore', async () => {
  const results = latestResults([
    ledgerLine('seer', 'L-1', false, 'Good seer work'),
    '{"type":"summons","member":"seer","id":"L-2","pacts":"not a list"}',
    '{"type":"summons","member":"wizard","id":"L-3","isBreach":true,"pacts":[{"isKept":false,"failed":["scroll-complete"]}]}',
    '{"type":"summons","member":"sorcerer","id":"L-4","pacts":[{"id":"baseline","isKept":false,"failed":"oops"}]}',
    '{"type":"summ',
  ].join('\n'))
  expect(results.map(one => one.ledgerId)).toEqual(['L-3', 'L-1'])
  expect(results[0]?.failed).toEqual(['pact:scroll-complete'])
})

const planQuest = ($: Parameters<TestBody>[0]) =>
  $.tool.call({
    tool: 'mcp__guild__quest',
    action: 'plan',
    title: 'Event store pick',
    steps: [
      { member: 'you', task: 'Confirm the scope' },
      { member: 'you', task: 'Approve the pick' },
    ],
  } as never)

test('after /clear the open quest is shown again and still takes updates', async ($, on) => {
  const { state, resetState } = world(on)
  await planQuest($)
  resetState()
  await $.classic.SessionStart({ source: 'clear' })
  const pane = await $.ui.mount({ plugin: 'guild', surface: 'desktop', component: 'Pane', requestId: 'guild', props: PANE_PROPS })
  expect(await pane.find({ type: 'Text', text: /Event store pick/ })).toBeDefined()
  await pane.unmount()
  const updated = await $.tool.call({ tool: 'mcp__guild__quest', action: 'update', step: 1, status: 'done' } as never)
  expect(JSON.stringify(updated)).not.toContain('no open quest')
  expect((state.get('quest') as { steps: { status: string }[] }).steps[0]?.status).toBe('done')
})

for (const source of ['startup', 'compact'] as const) {
  test(`${source} leaves the quest alone`, async ($, on) => {
    const { state, resetState } = world(on)
    await planQuest($)
    resetState()
    await $.classic.SessionStart({ source })
    expect(state.get('quest')).toBeUndefined()
  })
}

test('a module reload keeps summonses and the quest through a later /clear', async ($, on) => {
  const { state, resetState } = world(on, { live: { a1: 'running' } })
  // What $.state still holds after a module reload; the fresh module's maps are empty.
  state.set('active', [{ agentId: 'a1', member: 'wizard', description: 'Spans the reload', startedAt: 1 }])
  state.set('quest', { id: 'Q1', title: 'Event store pick', startedAt: 1, steps: [{ id: 1, member: 'you', task: 'Approve', status: 'pending' }] })
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', () => ({ value: { command: 'guild' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__guild__quest' } }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  resetState()
  await $.classic.SessionStart({ source: 'clear' })
  expect((state.get('active') as { agentId: string }[]).map(one => one.agentId)).toEqual(['a1'])
  expect((state.get('quest') as { title: string } | undefined)?.title).toBe('Event store pick')
})
