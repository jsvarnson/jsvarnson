// Reading the ledger back: each member's last finished summons, so the pane's
// results survive /clear, /resume, /branch and a restart.

import type { GuildResult } from '../../types'

type SummonsRecord = {
  type?: string
  ts?: string
  id?: string
  member?: string
  description?: string
  durationMs?: number
  tokens?: number
  isBreach?: boolean
  scroll?: { confidence?: string; handoff?: string }
  pacts?: { id?: string; isKept?: boolean; failed?: string[] }[]
}

// One ledger line as a result; undefined for any other record, and for a line
// that is not JSON or not shaped as a summons, so one bad line skips alone.
function resultOf(line: string): GuildResult | undefined {
  try {
    const record = JSON.parse(line) as SummonsRecord
    if (record?.type !== 'summons' || typeof record.member !== 'string' || !record.member) return undefined
    return {
      ledgerId: record.id ?? '',
      member: record.member,
      description: record.description ?? '',
      isKept: record.isBreach !== true,
      failed: (record.pacts ?? [])
        .filter(pact => pact.isKept === false)
        .flatMap(pact => (pact.failed ?? []).map(check => `${pact.id ?? 'pact'}:${check}`)),
      durationMs: record.durationMs ?? 0,
      endedAt: Date.parse(record.ts ?? '') || 0,
      confidence: record.scroll?.confidence,
      handoff: record.scroll?.handoff,
      tokens: record.tokens,
    }
  } catch {
    return undefined
  }
}

// `text` is ledger JSONL in write order; returns one result per member, newest first.
export function latestResults(text: string): GuildResult[] {
  const byMember = new Map<string, GuildResult>()
  for (const line of text.split('\n')) {
    const result = line.trim() ? resultOf(line) : undefined
    if (!result) continue
    byMember.delete(result.member)
    byMember.set(result.member, result)
  }
  return [...byMember.values()].reverse()
}
