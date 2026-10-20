import type { RenderPropsOf } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const PANE_PROPS = {
  title: 'Guild',
  isFocused: false,
  bodyColumns: 40,
  placement: 'dock',
} as unknown as RenderPropsOf['Pane']

const SEER = {
  id: 'seer',
  name: 'The Seer',
  sigil: '🔮',
  archetype: 'Diviner',
  title: 'Research and foresight',
  tagline: 'Finds the truth and what comes next',
  skills: ['research', 'sources', 'forecasts'],
  version: '1.0.0',
  color: 'violet',
  briefTemplate: 'Question: \nScope: ',
}
const WIZARD = { ...SEER, id: 'wizard', name: 'The Wizard', sigil: '🧙', title: 'Technical expert', color: 'blue' }

test('an empty guild draws its header and an empty bench on every surface that docks a pane', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'guild', surface, component: 'Pane', requestId: 'guild', props: PANE_PROPS })
    if (surface === 'desktop') {
      expect(await ui.find({ type: 'Text', text: /^at work$/ })).toBeDefined()
      expect(await ui.find({ key: 'fold-active' })).toBeUndefined()
    } else {
      expect(await ui.find({ type: 'Text', text: /The Guild/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Nobody is at work/ })).toBeDefined()
    }
    await ui.unmount()
  }
})

const ACTIVE = [
  {
    agentId: 'a1',
    member: 'seer',
    description: 'Benchmark event stores',
    startedAt: 1_000,
    toolCount: 2,
    tools: ['WebSearch: dynamo vs postgres', 'Read: notes.md'],
  },
]

test('active members get a card; benched members are buttons', async ($, on) => {
  const seeded: Record<string, unknown> = { roster: [SEER, WIZARD], active: ACTIVE, tick: 133_000 }
  on('state.get', async (_, e, next) => {
    const value = e.plugin === 'guild' ? seeded[e.key] : undefined
    return value === undefined ? next(e) : { value: { value, version: 1 } }
  })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'guild', surface, component: 'Pane', requestId: 'guild', props: PANE_PROPS })
    expect(await ui.find({ type: 'Text', text: /Benchmark event stores/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /2:12/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Read: notes\.md/ })).toBeDefined()
    expect(await ui.find({ key: 'summon-wizard' })).toBeDefined()
    expect(await ui.find({ key: 'summon-seer' })).toBeUndefined()
    expect(await ui.find({ key: 'open-a1' })).toBeDefined()
    await ui.unmount()
  }
})

test('the desktop pane draws sprites and summon buttons; the band shows who is at work', async ($, on) => {
  const seeded: Record<string, unknown> = { roster: [SEER, WIZARD], active: ACTIVE, tick: 133_000 }
  on('state.get', async (_, e, next) => {
    const value = e.plugin === 'guild' ? seeded[e.key] : undefined
    return value === undefined ? next(e) : { value: { value, version: 1 } }
  })
  const pane = await $.ui.mount({ plugin: 'guild', surface: 'desktop', component: 'Pane', requestId: 'guild', props: PANE_PROPS })
  expect(await pane.find({ type: 'Svg' })).toBeDefined()
  expect(await pane.find({ key: 'fold-ready' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /pacts kept/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /^sources$/ })).toBeDefined()
  expect(await pane.find({ key: 'summon-wizard' })).toBeDefined()
  await pane.unmount()

  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({
      plugin: 'guild',
      surface,
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: true, maxRows: 3 } as unknown as RenderPropsOf['AbovePrompt'],
    })
    expect(await band.find({ type: 'Text', text: /Seer at work/ })).toBeDefined()
    await band.unmount()
  }
})
