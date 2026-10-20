// The Scroll every member returns, the pacts that bind it, and the checks
// the engine runs on it.

import { normalizeNewlines } from './frontmatter'

export const SCROLL_SECTIONS = [
  'Verdict',
  'Confidence',
  'Evidence',
  'Deliverables',
  'Gaps & Risks',
  'Handoff',
] as const
export type ScrollSection = (typeof SCROLL_SECTIONS)[number]

export type Scroll = {
  sections: Partial<Record<ScrollSection, string>>
  missing: ScrollSection[]
  confidence?: 'high' | 'medium' | 'low'
  handoff?: string
}

export type Pact = {
  id: string
  from: string
  to: string
  guarantee: string
  checks: string[]
}

export type PactResult = { id: string; isKept: boolean; failed: string[] }

const sectionKey = (heading: string): ScrollSection | undefined => {
  const plain = heading.replace(/[*_`]/g, '').trim().toLowerCase()
  if (plain.startsWith('gaps')) return 'Gaps & Risks'
  return SCROLL_SECTIONS.find(name => name.toLowerCase() === plain)
}

export function parseScroll(answer: string): Scroll {
  const text = normalizeNewlines(answer)
  const sections: Partial<Record<ScrollSection, string>> = {}
  // The Scroll is the last run of these headings; earlier text is working notes.
  const headings = [...text.matchAll(/^#{1,4}\s+(.+?)\s*$/gm)]
  let lastVerdict = -1
  headings.forEach((match, at) => {
    if (sectionKey(match[1] ?? '') === 'Verdict') lastVerdict = at
  })
  const scrollHeadings = lastVerdict < 0 ? headings : headings.slice(lastVerdict)
  scrollHeadings.forEach((match, at) => {
    const key = sectionKey(match[1] ?? '')
    if (!key) return
    const start = (match.index ?? 0) + match[0].length
    const following = scrollHeadings[at + 1]
    const end = following?.index ?? text.length
    sections[key] = text.slice(start, end).trim()
  })
  const missing = SCROLL_SECTIONS.filter(name => !(sections[name] ?? '').trim())
  const level = /^\W*(high|medium|low)\b/i.exec(sections.Confidence ?? '')?.[1]?.toLowerCase()
  const confidence =
    level === 'high' || level === 'medium' || level === 'low' ? level : undefined
  const handoffText = (sections.Handoff ?? '').trim()
  const named = /`?([a-z][\w-]*)`?/i.exec(handoffText)?.[1]?.toLowerCase()
  return {
    sections,
    missing,
    confidence,
    handoff: named === undefined || named === 'none' ? (handoffText ? 'none' : undefined) : named,
  }
}

const cells = (row: string): string[] =>
  row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim())

// The pact table is the markdown table whose header starts `| id | from | to |`.
export function parsePacts(markdown: string): Pact[] {
  const lines = normalizeNewlines(markdown).split('\n')
  const start = lines.findIndex(line => {
    const head = cells(line).map(cell => cell.toLowerCase())
    return line.trim().startsWith('|') && head[0] === 'id' && head[1] === 'from' && head[2] === 'to'
  })
  if (start < 0) return []
  const pacts: Pact[] = []
  for (const line of lines.slice(start + 2)) {
    if (!line.trim().startsWith('|')) break
    const [id = '', from = '', to = '', guarantee = '', checks = ''] = cells(line)
    if (!id) continue
    pacts.push({
      id,
      from: from.toLowerCase(),
      to: to.toLowerCase(),
      guarantee,
      checks: checks
        .split(',')
        .map(check => check.trim())
        .filter(Boolean),
    })
  }
  return pacts
}

// Baseline pacts (to the guildmaster) always apply; the Handoff picks the
// member-to-member pact.
export function pactsFor(pacts: readonly Pact[], member: string, handoff: string | undefined): Pact[] {
  const isFrom = (pact: Pact) => pact.from === 'any' || pact.from === member
  return pacts.filter(
    pact =>
      isFrom(pact) &&
      (pact.to === 'guildmaster' || (handoff !== undefined && handoff !== 'none' && pact.to === handoff)),
  )
}

const hasPath = (text: string) => /([A-Za-z]:[\\/]|~[\\/]|\/)[^\s`'")]+|\b[\w.-]+\.[a-z0-9]{1,5}\b/i.test(text)
const isNone = (text: string) => /^\W*none\b/i.test(text.trim())
const hasEvidence = (text: string) =>
  /^\s*([-*]|\d+\.)\s+\S/m.test(text) || /https?:\/\//.test(text) || hasPath(text)

export type CheckContext = { scroll: Scroll; isAborted: boolean; members: readonly string[] }

export const CHECKS: Record<string, (context: CheckContext) => boolean> = {
  'scroll-complete': ({ scroll }) => scroll.missing.length === 0,
  'verdict-set': ({ scroll }) => (scroll.sections.Verdict ?? '').trim() !== '',
  'confidence-set': ({ scroll }) => scroll.confidence !== undefined,
  'evidence-cited': ({ scroll }) => hasEvidence(scroll.sections.Evidence ?? ''),
  'deliverables-listed': ({ scroll }) => {
    const text = scroll.sections.Deliverables ?? ''
    return isNone(text) || hasPath(text)
  },
  'deliverables-paths': ({ scroll }) => hasPath(scroll.sections.Deliverables ?? ''),
  'gaps-stated': ({ scroll }) => (scroll.sections['Gaps & Risks'] ?? '').trim() !== '',
  'handoff-valid': ({ scroll, members }) =>
    scroll.handoff === 'none' ||
    (scroll.handoff !== undefined && (members.includes(scroll.handoff) || scroll.handoff === 'guildmaster')),
  'acceptance-criteria': ({ scroll }) => {
    const whole = Object.values(scroll.sections).join('\n')
    return /(acceptance|done when)[^\n]*\n(\s*([-*]|\d+\.)\s+\S[^\n]*\n?)+/i.test(whole)
  },
  'not-aborted': ({ isAborted }) => !isAborted,
}

export function checkPacts(applicable: readonly Pact[], context: CheckContext): PactResult[] {
  return applicable.map(pact => {
    const failed = pact.checks.filter(check => {
      const run = CHECKS[check]
      return run === undefined ? true : !run(context)
    })
    return { id: pact.id, isKept: failed.length === 0, failed }
  })
}

// Required brief fields: each written as its own `Field:` line.
export function missingBriefFields(brief: string, accepts: readonly { name: string; isOptional: boolean }[]): string[] {
  return accepts
    .filter(field => !field.isOptional)
    .filter(field => !new RegExp(`^[\\s>*_-]*${escapeRegExp(field.name)}[*_]*\\s*:`, 'im').test(brief))
    .map(field => field.name)
}

export const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function briefTome(brief: string): string | undefined {
  return /^[\s>*_-]*tome[*_]*\s*:\s*`?([\w-]+)`?/im.exec(brief)?.[1]?.toLowerCase()
}
