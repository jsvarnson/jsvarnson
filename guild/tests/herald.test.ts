import { expect, test } from 'claude-code/testing'

import { askCount, cleanReport, heraldPrompt } from '../hooks/lib/herald'

test('the fork prompt carries the profile, the answer and the last report', async () => {
  const prompt = heraldPrompt('## The report\nAsks first.', 'Pushed the branch.', '📯 HERALD\n▶ NEEDS YOU (1)')
  expect(prompt.includes('Asks first.')).toBe(true)
  expect(prompt.includes('Pushed the branch.')).toBe(true)
  expect(prompt.includes('▶ NEEDS YOU (1)')).toBe(true)
  expect(heraldPrompt('x', '', '').includes('(none this session)')).toBe(true)
})

test('the report is cut from its banner and unfenced', async () => {
  expect(cleanReport('Sure, here it is:\n📯 HERALD\n▶ NEEDS YOU (0)')).toBe('📯 HERALD\n▶ NEEDS YOU (0)')
  expect(cleanReport('```\n📯 HERALD\n✔ DONE\n```')).toBe('📯 HERALD\n✔ DONE')
  expect(cleanReport('x'.repeat(5000)).length).toBe(4000)
})

test('the ask count reads NEEDS YOU (n)', async () => {
  expect(askCount('📯 HERALD\n▶ NEEDS YOU (3)\n  1. …')).toBe(3)
  expect(askCount('▶ NEEDS YOU (0) — nothing waits on you')).toBe(0)
  expect(askCount('no banner')).toBe(0)
})
