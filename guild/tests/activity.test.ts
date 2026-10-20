import { expect, test } from 'claude-code/testing'

import { activityBar, formatElapsed, memberHex, toolSummary } from '../hooks/lib/activity'

test('tool summaries name the tool and its telling argument', async () => {
  expect(toolSummary('Read', { file_path: 'C:\\repo\\src\\schema.sql' })).toBe('Read: schema.sql')
  expect(toolSummary('Bash', { command: 'npm test -- --watch=false' })).toBe('Bash: npm test -- --watch=false')
  expect(toolSummary('WebFetch', { url: 'https://docs.aws.amazon.com/dynamodb' })).toBe('WebFetch: docs.aws.amazon.com/dynamodb')
  expect(toolSummary('mcp__guild__thing', {})).toBe('thing')
})

test('elapsed time reads as m:ss, then hours', async () => {
  expect(formatElapsed(0)).toBe('0:00')
  expect(formatElapsed(132_000)).toBe('2:12')
  expect(formatElapsed(3_900_000)).toBe('1h05')
})

test('the activity bar keeps its width and sweeps back and forth', async () => {
  const widths = [0, 1, 5, 9, 15, 30].map(step => {
    const bar = activityBar(20, step)
    return bar.before.length + bar.lit.length + bar.after.length
  })
  expect(widths.every(width => width === 20)).toBe(true)
  expect(activityBar(20, 0).before).toBe('')
  expect(activityBar(20, 15).after).toBe('')
  expect(activityBar(20, 30).before).toBe('')
})

test('profile colour names map to hex', async () => {
  expect(memberHex('violet')).toBe('#7F77DD')
  expect(memberHex('#123456')).toBe('#123456')
  expect(memberHex('unknown')).toBe('#888780')
})
