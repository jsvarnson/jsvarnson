// The Artificer's proposals: parse one, apply its exact find → replace changes
// to the target text, bump the version, and write the changelog entry.

import { asText, normalizeNewlines, setFrontmatterScalar, splitFrontmatter } from './frontmatter'

export type ProposalChange = { find: string; replace: string }

export type Proposal = {
  id: string
  target: string
  file: string
  fromVersion: string
  toVersion: string
  kind: string
  status: string
  title: string
  rationale: string
  changelogLine: string
  changes: ProposalChange[]
}

export function parseProposal(raw: string, fallbackId: string): Proposal {
  const { data, body } = splitFrontmatter(raw)
  const section = (name: string) =>
    new RegExp(`^##\\s+${name}\\s*\\n([\\s\\S]*?)(?=^##\\s|$(?![\\s\\S]))`, 'm').exec(body)?.[1]?.trim() ?? ''
  const changes: ProposalChange[] = []
  const pattern = /```find\n([\s\S]*?)\n```\s*\n```replace\n([\s\S]*?)\n?```/g
  for (const match of body.matchAll(pattern)) {
    changes.push({ find: match[1] ?? '', replace: match[2] ?? '' })
  }
  return {
    id: asText(data.id, fallbackId),
    target: asText(data.target),
    file: asText(data.file),
    fromVersion: asText(data.from_version),
    toVersion: asText(data.to_version),
    kind: asText(data.kind, 'clarifying'),
    status: asText(data.status, 'open'),
    title: /^#\s+(?:Proposal:\s*)?(.+)$/m.exec(body)?.[1]?.trim() ?? fallbackId,
    rationale: section('Rationale'),
    changelogLine: section('Changelog line').split('\n')[0]?.replace(/^[-*]\s*/, '') ?? '',
    changes,
  }
}

export type ApplyOutcome =
  | { isApplied: true; text: string }
  | { isApplied: false; reason: string }

const occurrences = (haystack: string, needle: string): number => {
  if (needle === '') return 0
  let count = 0
  let at = haystack.indexOf(needle)
  while (at >= 0) {
    count += 1
    at = haystack.indexOf(needle, at + needle.length)
  }
  return count
}

// All or nothing: every `find` must match exactly once, or nothing changes.
export function applyProposal(targetRaw: string, proposal: Proposal): ApplyOutcome {
  if (proposal.changes.length === 0) return { isApplied: false, reason: 'the proposal has no find/replace changes' }
  let text = normalizeNewlines(targetRaw)
  const current = asText(splitFrontmatter(text).data.version)
  if (proposal.fromVersion && current && current !== proposal.fromVersion) {
    return {
      isApplied: false,
      reason: `the target is at version ${current}, the proposal was written against ${proposal.fromVersion}`,
    }
  }
  for (const [index, change] of proposal.changes.entries()) {
    const find = normalizeNewlines(change.find)
    const count = occurrences(text, find)
    if (count !== 1) {
      return {
        isApplied: false,
        reason: `change ${index + 1}: its find text matches ${count} times (it must match exactly once)`,
      }
    }
    text = text.replace(find, () => normalizeNewlines(change.replace))
  }
  if (proposal.toVersion) text = setFrontmatterScalar(text, 'version', proposal.toVersion)
  return { isApplied: true, text }
}

export function bumpVersion(version: string, kind: string): string {
  const [major = 0, minor = 0, patch = 0] = version.split('.').map(part => Number.parseInt(part, 10) || 0)
  if (kind === 'identity') return `${major + 1}.0.0`
  if (kind === 'behavioral') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

export function changelogWithEntry(raw: string, version: string, date: string, line: string, proposalId: string): string {
  const text = normalizeNewlines(raw).trimEnd()
  const entry = `## ${version} (${date})\n- ${line || 'Refinement accepted.'}\n- Proposal: ${proposalId}\n`
  const lines = text.split('\n')
  const titleAt = lines.findIndex(row => row.startsWith('# '))
  if (titleAt < 0) return `${entry}\n${text}\n`
  const head = lines.slice(0, titleAt + 1).join('\n')
  const rest = lines.slice(titleAt + 1).join('\n').replace(/^\n+/, '')
  return `${head}\n\n${entry}\n${rest}\n`
}
