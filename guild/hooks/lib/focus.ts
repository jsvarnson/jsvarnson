// Reveal on focus (design/card.md rule 6): which card a focused control
// belongs to, and whether a card shows its revealed action. Pure functions.

const CARD_KEYS: readonly [RegExp, (id: string) => string][] = [
  [/^summon-(.+)$/, id => `member:${id}`],
  [/^open-(.+)$/, id => `work:${id}`],
  [/^proposal-title-(.+)$/, id => `proposal:${id}`],
  [/^accept-(.+)$/, id => `proposal:${id}`],
  [/^reject-(.+)$/, id => `proposal:${id}`],
  [/^problem-(.+)$/, id => `problem:${id}`],
]

// The card a control's key belongs to: a card's name and its revealed actions
// share one id, so Tab from a name onto its action keeps the action drawn.
// '' for no key (the ring left the plugin's controls) or a key of no card.
export function cardOf(key: string): string {
  if (key === 'gm' || key === 'quest-end') return 'gm'
  for (const [pattern, card] of CARD_KEYS) {
    const id = pattern.exec(key)?.[1]
    if (id) return card(id)
  }
  return ''
}

// A card shows what focus reveals only while the pane holds the keyboard, so
// nothing stays revealed after Esc.
export const focusReveal = (focusCard: string, card: string, isFocused: boolean): boolean =>
  isFocused && focusCard !== '' && focusCard === card
