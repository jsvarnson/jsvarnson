import { expect, mock, test } from 'claude-code/testing'
import type { MockClock, TestBody } from 'claude-code/testing'

type TestOn = Parameters<TestBody>[1]
type Engine = Parameters<TestBody>[0]

// Regressions for sessions that hung silently: a hook awaiting an engine call
// is never timed out (a $ call's time is not the hook's), so no hook the engine
// waits on may wait for the guild to load, for a context count or for a model.

const ROOT = 'C:/Users/Joseph/.claude'
// The test host's real timer: the mocked clock never moves on its own.
declare const setTimeout: (fn: () => void, ms: number) => unknown
const never = () => new Promise<never>(() => {})
// Resolves 'settled' or 'HUNG', so a stalled hook fails its test instead of the run.
const within = <T,>(run: Promise<T>) =>
  Promise.race([run.then(() => 'settled' as const), new Promise<'HUNG'>(resolve => setTimeout(() => resolve('HUNG'), 2_000))])

const HERALD = `---
id: herald
name: The Herald
archetype: Bard
title: Reports the turn
tagline: Says what needs you
skills: [report, asks, recap]
sigil: "📯"
version: 1.0.0
accepts: [Question]
delivers: Report
---
Write the report.
`

const WIZARD = `---
id: wizard
name: The Wizard
archetype: Arcanist
title: Builds
tagline: Builds it
skills: [code, tests, fix]
sigil: "🧙"
version: 1.0.0
accepts: [Question]
delivers: Code
tools: [Read, Skill]
spells: [taste-skill:minimalist-skill]
---
Build.
`

type World = { files: Map<string, string>; clock: MockClock; usageCalls: () => number; logs: string[] }

// A guild folder and a ~/.claude in memory. `isFsStuck` makes every guild read
// hang, as a slow or unreachable disk would.
function world(on: TestOn, { isFsStuck = false } = {}): World {
  const files = new Map<string, string>([
    [`${ROOT}/guild/guild.md`, '---\nversion: 1.0.0\n---\n# Charter\n'],
    [`${ROOT}/guild/pacts.md`, '---\nversion: 1.0.0\n---\n'],
    [`${ROOT}/guild/members/herald/PROFILE.md`, HERALD],
    [`${ROOT}/guild/members/wizard/PROFILE.md`, WIZARD],
    [`${ROOT}/plugins/installed_plugins.json`, JSON.stringify({ plugins: { 'taste-skill@market': [{ installPath: 'C:\\plugins\\taste' }] } })],
    ['C:/plugins/taste/skills/minimalist-skill/SKILL.md', '---\nname: minimalist-ui\n---\nBe minimal.'],
    ['C:/plugins/taste/skills/brutalist-skill/SKILL.md', '---\nname: brutalist-skill\n---\nBe bold.'],
  ])
  // The engine may hand a Windows path back resolved under the session's directory.
  const norm = (path: string) => path.replace(/\\/g, '/').replace(/\/$/, '').replace(/^.*(?=C:\/)/, '')
  const childrenOf = (dir: string) => {
    const prefix = `${norm(dir)}/`
    const seen = new Map<string, 'file' | 'dir'>()
    for (const key of files.keys()) {
      if (!key.startsWith(prefix)) continue
      const [head = '', ...tail] = key.slice(prefix.length).split('/')
      seen.set(head, tail.length > 0 ? 'dir' : 'file')
    }
    return [...seen].map(([name, kind]) => ({ name, kind, size: 0, mtimeMs: 1, isLink: false }))
  }
  const stuck = (path: string) => isFsStuck && norm(path).includes('/guild')
  on('fs.exists', (_, e) => (stuck(e.path) ? never() : { value: files.has(norm(e.path)) || childrenOf(e.path).length > 0 }))
  on('fs.list', (_, e) => (stuck(e.path) ? never() : { value: childrenOf(e.path) }))
  on('fs.read', (_, e) => {
    if (stuck(e.path)) return never()
    const text = files.get(norm(e.path))
    return text === undefined ? { deny: `missing ${e.path}` } : { value: text }
  })
  on('fs.write', (_, e) => {
    files.set(norm(e.path), e.text)
    return { value: undefined }
  })
  const state = new Map<string, unknown>()
  on('state.get', (_, e) => ({ value: { value: state.get(e.key), version: 0 } }))
  on('state.set', (_, e) => {
    state.set(e.key, e.value)
    return { value: { isSet: true, version: 1 } }
  })
  let usage = 0
  on('session.usage', () => {
    usage += 1
    return never()
  })
  const logs: string[] = []
  on('ui.log', (_, e) => {
    logs.push(e.text)
    return { value: undefined }
  })
  on('agent.list', () => ({ value: [] }))
  on('agent.register', (_, e) => ({ value: { agent: `guild:${e.name}` } }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('command.register', () => ({ value: { command: 'guild' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__guild__quest' } }))
  on('session.start', () => ({ cwd: '/work' }))
  on('classic.SessionStart', () => ({}))
  const clock = mock.clock(on, { now: 60_000 })
  return { files, clock, usageCalls: () => usage, logs }
}

const startSession = ($: Engine) => $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
const guildCommand = ($: Engine, args: string) => $.command.run({ command: 'guild', args } as never) as Promise<unknown>

test('startup does not wait for the guild to load', async ($, on) => {
  world(on, { isFsStuck: true })
  expect(await within(startSession($))).toBe('settled')
})

for (const source of ['clear', 'resume', 'fork'] as const) {
  test(`${source} does not wait for the guild to reload`, async ($, on) => {
    world(on, { isFsStuck: true })
    expect(await within($.classic.SessionStart({ source }))).toBe('settled')
  })
}

test('loading the guild never counts the context', async ($, on) => {
  const { clock, usageCalls } = world(on)
  await startSession($)
  await clock.settle()
  expect(await within($.classic.SessionStart({ source: 'resume' }))).toBe('settled')
  await clock.settle()
  expect(await guildCommand($, 'spells')).toBeDefined()
  expect(usageCalls()).toBe(0)
})

test('before the guild has loaded, offers, the system prompt and summonses do not wait for it', async ($, on) => {
  world(on, { isFsStuck: true })
  on('agent.offer', () => ({ isOffered: true }))
  on('prompt.compose', () => ({ sections: [] }))
  on('agent.spawn', () => ({ model: 'opus', agentId: 'a1' }))
  await startSession($)
  expect(await within($.agent.offer({ agent: 'guild:wizard' } as never))).toBe('settled')
  expect(await within($.prompt.compose({ traits: [] } as never))).toBe('settled')
  const spawned = await $.agent.spawn({ tool_use_id: 't1', prompt: 'Question: x', description: 'x', subagentType: 'guild:wizard' } as never)
  expect(JSON.stringify(spawned)).toContain('still loading')
})

test('once loaded, a guild summons is tracked as before', async ($, on) => {
  const { clock } = world(on)
  on('agent.spawn', () => ({ model: 'opus', agentId: 'a1' }))
  await startSession($)
  await clock.settle()
  const spawned = await $.agent.spawn({ tool_use_id: 't1', prompt: 'Question: does it build?', description: 'Build it', subagentType: 'guild:wizard' } as never)
  expect(spawned).toMatchObject({ agentId: 'a1' })
})

test('the turn ends at once while the Herald writes, and the report lands in the transcript', async ($, on) => {
  const { clock, logs } = world(on)
  let answer: (text: string) => void = () => {}
  on('model.fork', () => new Promise(resolve => {
    answer = text => resolve({ value: { isAnswered: true, text, usage: { input_tokens: 1, output_tokens: 1 } } } as never)
  }))
  on('turn.complete', () => ({ text: 'The answer.' }))
  on('tool.call', () => ({ result: 'ok' }))
  await startSession($)
  await clock.settle()
  await $.tool.call({ tool: 'Read', file_path: '/x' } as never)
  const ended = $.turn.complete({ turnId: 't', answer: 'The answer.', durationMs: 1, isAborted: false, reason: 'answer' } as never)
  expect(await within(ended)).toBe('settled')
  expect(await ended).toEqual({ text: 'The answer.' })
  await clock.settle()
  expect(logs).toEqual([])
  answer('📯 HERALD\nBuilt the thing.\n▶ NEEDS YOU (0)')
  await clock.settle()
  expect(logs).toEqual(['📯 HERALD\nBuilt the thing.\n▶ NEEDS YOU (0)'])
})

test('a turn that did no work gets no Herald report', async ($, on) => {
  const { clock } = world(on)
  let forks = 0
  on('model.fork', () => {
    forks += 1
    return { value: { isAnswered: true, text: '📯 report', usage: { input_tokens: 1, output_tokens: 1 } } } as never
  })
  on('turn.complete', () => ({ text: 'Hello.' }))
  await startSession($)
  await clock.settle()
  await $.turn.complete({ turnId: 't', answer: 'Hello.', durationMs: 1, isAborted: false, reason: 'answer' } as never)
  await clock.settle()
  expect(forks).toBe(0)
})

test('/guild herald summarizes on request without holding the command', async ($, on) => {
  const { clock, logs } = world(on)
  const prompts: string[] = []
  on('model.fork', (_, e) => {
    prompts.push((e as { prompt: string }).prompt)
    return { value: { isAnswered: true, text: '📯 HERALD\nSummary.', usage: { input_tokens: 1, output_tokens: 1 } } } as never
  })
  await startSession($)
  await clock.settle()
  const reply = await guildCommand($, 'herald')
  expect(JSON.stringify(reply)).toContain('writing a summary')
  await clock.settle()
  expect(prompts[0]).toContain('asked for a summary')
  expect(logs).toEqual(['📯 HERALD\nSummary.'])
  expect(JSON.stringify(await guildCommand($, 'herald last'))).toContain('Summary.')
})

test('/guild spells index writes the index the spellbooks are checked against', async ($, on) => {
  const { clock, files } = world(on)
  await startSession($)
  await clock.settle()
  expect(JSON.stringify(await guildCommand($, 'spells unclaimed'))).toContain('no skill index')
  const reply = await guildCommand($, 'spells index')
  expect(JSON.stringify(reply)).toContain('Indexed 2 installed skills')
  const index = JSON.parse(files.get(`${ROOT}/guild/spells/index.json`) ?? '{}') as { skills: { name: string; aliases: string[] }[] }
  expect(index.skills.map(skill => skill.name)).toEqual(['taste-skill:brutalist-skill', 'taste-skill:minimalist-skill'])
  expect(index.skills[1]?.aliases).toEqual(['minimalist-ui'])
  expect(JSON.stringify(await guildCommand($, 'spells unclaimed'))).toContain('taste-skill:brutalist-skill')
})
