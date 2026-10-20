import { describe, expect, test } from 'claude-code/testing'

import { parseYamlSubset, setFrontmatterScalar, splitFrontmatter } from '../hooks/lib/frontmatter'
import { guardWrite } from '../hooks/lib/guard'
import type { GuildFs } from '../hooks/lib/guild'
import { cardProblems, guildmasterSection, loadGuild, memberDescription, memberPrompt } from '../hooks/lib/guild'
import { applyProposal, bumpVersion, changelogWithEntry, parseProposal } from '../hooks/lib/proposals'
import { checkPacts, missingBriefFields, pactsFor, parsePacts, parseScroll } from '../hooks/lib/scroll'

const ROOT = 'C:/g'

const PROFILE = `---
id: seer
name: The Seer
archetype: Diviner
title: Research
tagline: Finds the truth
skills: [research, sources, forecasts]
sigil: "🔮"
version: 1.0.0
model: sonnet
tools: [Read, WebSearch]
max_turns: 30
summon_when:
  - a question needs sources
never_when:
  - judgement → Sorcerer
accepts: [Question, Scope, Depth?]
delivers: Sourced findings
perspective: >
  Skeptical of single
  sources.
---
# Visions
Look locally first.
`

const SORCERER = PROFILE.replace('id: seer', 'id: sorcerer').replace('The Seer', 'The Sorcerer')

const PACTS = `---
version: 2.0.0
---
| check | passes |
|---|---|
| x | y |

| id | from | to | guarantee | checks |
|---|---|---|---|---|
| baseline | any | guildmaster | complete | scroll-complete, confidence-set, handoff-valid, not-aborted |
| divination | seer | sorcerer | sourced | evidence-cited, gaps-stated |
`

const files: Record<string, string> = {
  [`${ROOT}/guild.md`]: '---\nversion: 1.2.0\n---\n# Charter\nSwear the oaths.',
  [`${ROOT}/pacts.md`]: PACTS,
  [`${ROOT}/guildmaster/PROFILE.md`]: '---\nname: The Guildmaster\nsigil: "👑"\nversion: 1.0.0\n---\nRoute well. See `grimoire/council.md`.',
  [`${ROOT}/members/seer/PROFILE.md`]: PROFILE,
  [`${ROOT}/members/sorcerer/PROFILE.md`]: SORCERER,
  [`${ROOT}/quests/divination.md`]: '---\nid: divination\nname: Divination\nsummary: Find then judge.\ntrigger: should we\nparty: [seer, sorcerer]\n---\n',
}

const dirs: Record<string, { name: string; kind: 'file' | 'dir' }[]> = {
  [`${ROOT}/members`]: [
    { name: 'seer', kind: 'dir' },
    { name: 'sorcerer', kind: 'dir' },
  ],
  [`${ROOT}/quests`]: [{ name: 'divination.md', kind: 'file' }],
  [`${ROOT}/guildmaster/grimoire`]: [{ name: 'council.md', kind: 'file' }],
}

const memoryFs: GuildFs = {
  read: async path => {
    const text = files[path]
    if (text === undefined) throw new Error(`missing ${path}`)
    return text
  },
  list: async path => dirs[path] ?? [],
  exists: async path => path in files || path in dirs,
}

const GOOD_SCROLL = `Working notes here.

## Verdict
Postgres wins.

## Confidence
high — three benchmarks agree.

## Evidence
- https://example.com/bench (2026-09)

## Deliverables
none

## Gaps & Risks
- write-heavy load untested

## Handoff
\`sorcerer\`: weigh cost vs. ops burden
`

describe('frontmatter', () => {
  test('reads the subset guild files use', async () => {
    const { data, body } = splitFrontmatter(PROFILE.replace(/\n/g, '\r\n'))
    expect(data.sigil).toBe('🔮')
    expect(data.tools).toEqual(['Read', 'WebSearch'])
    expect(data.summon_when).toEqual(['a question needs sources'])
    expect(data.perspective).toBe('Skeptical of single sources.')
    expect(body.startsWith('# Visions')).toBe(true)
  })

  test('rewrites one scalar in place', async () => {
    const next = setFrontmatterScalar(PROFILE, 'version', '1.0.1')
    expect(parseYamlSubset(next.split('---')[1] ?? '').version).toBe('1.0.1')
    expect(next.endsWith('Look locally first.\n')).toBe(true)
  })
})

describe('the Scroll and the pacts', () => {
  test('parses the last Scroll and its handoff', async () => {
    const scroll = parseScroll(GOOD_SCROLL)
    expect(scroll.missing).toEqual([])
    expect(scroll.confidence).toBe('high')
    expect(scroll.handoff).toBe('sorcerer')
  })

  test('reads only the pact table and picks pacts by handoff', async () => {
    const pacts = parsePacts(PACTS)
    expect(pacts.map(pact => pact.id)).toEqual(['baseline', 'divination'])
    expect(pactsFor(pacts, 'seer', 'sorcerer').map(pact => pact.id)).toEqual(['baseline', 'divination'])
    expect(pactsFor(pacts, 'seer', 'none').map(pact => pact.id)).toEqual(['baseline'])
  })

  test('a complete Scroll keeps its pacts', async () => {
    const pacts = parsePacts(PACTS)
    const scroll = parseScroll(GOOD_SCROLL)
    const results = checkPacts(pactsFor(pacts, 'seer', scroll.handoff), {
      scroll,
      isAborted: false,
      members: ['seer', 'sorcerer'],
    })
    expect(results.every(result => result.isKept)).toBe(true)
  })

  test('a Scroll without evidence breaches divination', async () => {
    const pacts = parsePacts(PACTS)
    const scroll = parseScroll(GOOD_SCROLL.replace('- https://example.com/bench (2026-09)', ''))
    const results = checkPacts(pactsFor(pacts, 'seer', scroll.handoff), {
      scroll,
      isAborted: false,
      members: ['seer', 'sorcerer'],
    })
    const divination = results.find(result => result.id === 'divination')
    expect(divination?.isKept).toBe(false)
    expect(divination?.failed).toEqual(['evidence-cited'])
    expect(results.find(result => result.id === 'baseline')?.failed).toEqual(['scroll-complete'])
  })

  test('a brief must carry every required field as a labelled line', async () => {
    const accepts = [
      { name: 'Question', isOptional: false },
      { name: 'Scope', isOptional: false },
      { name: 'Depth', isOptional: true },
    ]
    expect(missingBriefFields('Question: why?\n**Scope:** web', accepts)).toEqual([])
    expect(missingBriefFields('Question: why?', accepts)).toEqual(['Scope'])
  })
})

describe('compilation', () => {
  test('loads the guild and compiles prompts and the roster', async () => {
    const guild = await loadGuild(memoryFs, ROOT)
    expect(guild.errors).toEqual([])
    expect(guild.members.map(member => member.id)).toEqual(['seer', 'sorcerer'])
    const seer = guild.members[0]
    if (!seer) throw new Error('no seer')
    expect(seer.accepts).toEqual([
      { name: 'Question', isOptional: false },
      { name: 'Scope', isOptional: false },
      { name: 'Depth', isOptional: true },
    ])
    const prompt = memberPrompt(guild, seer)
    expect(prompt.startsWith('# Charter')).toBe(true)
    expect(prompt).toContain('# You are 🔮 The Seer, Diviner')
    expect(prompt).toContain('| divination | seer → sorcerer |')
    expect(memberDescription(seer)).toContain('Brief as labelled lines: Question: · Scope: · Depth: (optional)')
    const section = guildmasterSection(guild)
    expect(section).toContain('`guild:seer` v1.0.0')
    expect(section).toContain('**Divination** (`divination`)')
    expect(section).toContain('C:/g/guildmaster/grimoire/council.md')
  })
})

describe('proposals', () => {
  const PROPOSAL = `---
id: 2026-10-09-seer-1
target: seer
file: members/seer/PROFILE.md
from_version: 1.0.0
to_version: 1.0.1
kind: clarifying
status: open
---
# Proposal: Check local files first, every time

## Rationale
Three summons went to the web first.

## Evidence
- L-1: skipped the vault

## Changes
### Change 1
\`\`\`find
Look locally first.
\`\`\`
\`\`\`replace
Look locally first, always, and list what you checked.
\`\`\`

## Changelog line
Seer lists local lookups before web research.
`

  test('applies exactly-once changes and bumps the version', async () => {
    const proposal = parseProposal(PROPOSAL, 'x')
    expect(proposal.changes.length).toBe(1)
    expect(proposal.changelogLine).toBe('Seer lists local lookups before web research.')
    const outcome = applyProposal(PROFILE, proposal)
    if (!outcome.isApplied) throw new Error(outcome.reason)
    expect(outcome.text).toContain('Look locally first, always, and list what you checked.')
    expect(splitFrontmatter(outcome.text).data.version).toBe('1.0.1')
  })

  test('refuses a stale or ambiguous change and changes nothing', async () => {
    const proposal = parseProposal(PROPOSAL, 'x')
    const stale = applyProposal(PROFILE.replace('version: 1.0.0', 'version: 1.1.0'), proposal)
    expect(stale.isApplied).toBe(false)
    const twice = applyProposal(`${PROFILE}Look locally first.\n`, proposal)
    expect(twice.isApplied).toBe(false)
  })

  test('bumps by kind and writes the changelog under its title', async () => {
    expect(bumpVersion('1.2.3', 'clarifying')).toBe('1.2.4')
    expect(bumpVersion('1.2.3', 'behavioral')).toBe('1.3.0')
    expect(bumpVersion('1.2.3', 'identity')).toBe('2.0.0')
    const log = changelogWithEntry('# Changelog: seer\n\n## 1.0.0 (2026-10-09)\n- Founded.\n', '1.0.1', '2026-10-10', 'Sharper.', 'p-1')
    expect(log).toBe('# Changelog: seer\n\n## 1.0.1 (2026-10-10)\n- Sharper.\n- Proposal: p-1\n\n## 1.0.0 (2026-10-09)\n- Founded.\n')
  })
})

describe('the write guard', () => {
  test('members may not edit guild files; the Artificer may write proposals', async () => {
    expect(guardWrite(ROOT, [], 'C:\\g\\members\\seer\\PROFILE.md')).toBeDefined()
    expect(guardWrite(ROOT, [], 'C:/elsewhere/notes.md')).toBeUndefined()
    expect(guardWrite(ROOT, ['proposals'], 'c:/G/proposals/2026-10-09-seer-1.md')).toBeUndefined()
    expect(guardWrite(ROOT, ['proposals'], 'C:/g/pacts.md')).toBeDefined()
  })
})

describe('the member card', () => {
  test('cards need a short tagline and exactly three short skills', async () => {
    expect(cardProblems('seer', 'Finds the truth', ['research', 'sources', 'forecasts'])).toEqual([])
    expect(cardProblems('seer', '', ['a', 'b'])).toEqual(['seer: card needs a tagline', 'seer: card needs exactly 3 skills (has 2)'])
    expect(cardProblems('seer', 'x'.repeat(41), ['a', 'b', 'a-very-long-skill'])).toEqual([
      'seer: tagline is 41 characters (40 max)',
      'seer: skill "a-very-long-skill" is over 14 characters',
    ])
  })
})
