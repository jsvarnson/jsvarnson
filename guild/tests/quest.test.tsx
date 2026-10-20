import type { RenderPropsOf } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

import { onSummonEnd, onSummonStart, questProgress, setStep, startQuest } from '../hooks/lib/quest'

const PANE_PROPS = { title: 'Guild', isFocused: false, bodyColumns: 48, placement: 'dock' } as unknown as RenderPropsOf['Pane']
const BAND_PROPS = { hasSurvey: false, isWorking: true, maxRows: 3 } as unknown as RenderPropsOf['AbovePrompt']

describe('quest steps', () => {
  test('steps tick as members are summoned and their Scrolls land', async () => {
    let quest = startQuest('Q1', 'Event store pick', [
      { member: 'guild:Seer', task: 'Benchmark stores' },
      { member: 'sorcerer', task: 'Make the call' },
      { member: 'you', task: 'Approve the pick' },
    ], 0)
    expect(quest.steps.map(step => step.member)).toEqual(['seer', 'sorcerer', 'you'])
    quest = onSummonStart(quest, 'seer', 'a1')
    expect(questProgress(quest).current?.id).toBe(1)
    quest = onSummonEnd(quest, 'a1', true)
    quest = onSummonStart(quest, 'sorcerer', 'a2')
    quest = onSummonEnd(quest, 'a2', false, 'counsel:acceptance-criteria')
    expect(quest.steps[1]?.status).toBe('failed')
    expect(questProgress(quest).current?.id).toBe(2)
    quest = setStep(quest, 2, 'done')
    expect(questProgress(quest)).toEqual({ finished: 2, total: 3, fraction: 2 / 3, current: quest.steps[2] })
  })
})

test('the quest tool plans a quest the pane and band show', async ($, on) => {
  on('clock.now', () => ({ value: 60_000 }))
  const planned = await $.tool.call({
    tool: 'mcp__guild__quest',
    action: 'plan',
    title: 'Event store pick',
    steps: [
      { member: 'you', task: 'Confirm the scope' },
      { member: 'you', task: 'Approve the pick' },
    ],
  } as never)
  expect(JSON.stringify(planned)).toContain('Event store pick')

  await $.tool.call({ tool: 'mcp__guild__quest', action: 'update', step: 1, status: 'done' } as never)

  const pane = await $.ui.mount({ plugin: 'guild', surface: 'desktop', component: 'Pane', requestId: 'guild', props: PANE_PROPS })
  expect(await pane.find({ type: 'Text', text: /Event store pick/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /waiting on you/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /✓ Confirm the scope/ })).toBeDefined()
  await pane.unmount()

  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ plugin: 'guild', surface, component: 'AbovePrompt', props: BAND_PROPS })
    expect(await band.find({ type: 'Text', text: /Step 2\/2 · 50%/ })).toBeDefined()
    await band.unmount()
  }

  const closed = await $.tool.call({ tool: 'mcp__guild__quest', action: 'close', outcome: 'picked Postgres' } as never)
  expect(JSON.stringify(closed)).toContain('closed: picked Postgres')
})
