import { expect, test } from 'claude-code/testing'

import { barSvg, formatTokens, iconSvg } from '../hooks/lib/sprites'

test('every member is drawn as its own icon in its own colour, pulsing only while busy', async () => {
  for (const sigil of ['🧙', '🔮', '🔥', '📜', '🪄', '⚒️', '📯']) {
    const idle = iconSvg(sigil, '#378ADD', false)
    expect(idle.startsWith('<svg')).toBe(true)
    expect(idle).toContain(sigil)
    expect(idle).toContain('#378ADD')
    expect(idle).not.toContain('<animate')
    expect(iconSvg(sigil, '#378ADD', true)).toContain('<animate')
  }
  expect(iconSvg('', '#378ADD', false)).toContain('✦')
  expect(iconSvg('<x>', '#378ADD', false)).toContain('&lt;x&gt;')
})

test('bars fill by fraction or sweep, and tokens read short', async () => {
  expect(barSvg(200, '#123456', 0.5, false)).toContain('width="100"')
  expect(barSvg(200, '#123456', 0, true)).toContain('<animate')
  expect(formatTokens(950)).toBe('950')
  expect(formatTokens(41_200)).toBe('41k')
  expect(formatTokens(1_250_000)).toBe('1.3M')
})
