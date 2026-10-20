import { expect, test } from 'claude-code/testing'

import type { GuildFs } from '../hooks/lib/guild'
import { guildmasterSection, loadGuild, memberPrompt } from '../hooks/lib/guild'
import { holdersOf, holds, parseRegistry, refusal, skillBody, spellProblems, unclaimed } from '../hooks/lib/spells'

const ROOT = 'C:/g'

const profile = (id: string, extra: string) => `---
id: ${id}
name: The ${id[0]!.toUpperCase()}${id.slice(1)}
archetype: A
title: T
tagline: Short line
skills: [one, two, three]
sigil: "✦"
version: 1.0.0
tools: [Read, Skill]
${extra}
---
# Body
`

const REGISTRY = `---
retired:
  - anthropic-skills:wizard
person_only:
  - loop
---
# Registry
`

const files: Record<string, string> = {
  [`${ROOT}/guild.md`]: '---\nversion: 1.0.0\n---\n# Charter',
  [`${ROOT}/pacts.md`]: '---\nversion: 1.0.0\n---\n',
  [`${ROOT}/guildmaster/PROFILE.md`]: '---\nname: The Guildmaster\nsigil: "👑"\nspells:\n  - superpowers:brainstorming\n---\nRoute.',
  [`${ROOT}/members/wizard/PROFILE.md`]: profile(
    'wizard',
    'spells:\n  - superpowers:systematic-debugging\n  - superpowers:verification-before-completion\n  - house-style\nprepared: [superpowers:verification-before-completion, house-style]',
  ),
  [`${ROOT}/members/seer/PROFILE.md`]: profile('seer', 'spells:\n  - research\n  - anthropic-skills:wizard\n  - loop\nprepared: [deep-research]'),
  [`${ROOT}/members/herald/PROFILE.md`]: profile('herald', '').replace('tools: [Read, Skill]', 'tools: [Read]'),
  [`${ROOT}/spells/REGISTRY.md`]: REGISTRY,
  [`${ROOT}/spells/house-style/SKILL.md`]: '---\nname: house-style\ndescription: x\n---\n# House style\nWrite plainly.',
}

const dirs: Record<string, { name: string; kind: 'file' | 'dir' }[]> = {
  [`${ROOT}/members`]: [
    { name: 'herald', kind: 'dir' },
    { name: 'seer', kind: 'dir' },
    { name: 'wizard', kind: 'dir' },
  ],
  [`${ROOT}/spells`]: [
    { name: 'REGISTRY.md', kind: 'file' },
    { name: 'house-style', kind: 'dir' },
  ],
}

const fs: GuildFs = {
  read: async path => {
    const text = files[path]
    if (text === undefined) throw new Error(`missing ${path}`)
    return text
  },
  list: async path => dirs[path] ?? [],
  exists: async path => path in files || path in dirs,
}

const NONE = new Map<string, string[]>()

test('a spellbook holds exactly its own skills, and plugin aliases count', async () => {
  const spells = ['superpowers:systematic-debugging', 'taste-skill:minimalist-skill']
  const aliases = new Map([['taste-skill:minimalist-skill', ['minimalist-ui']]])
  expect(holds(spells, 'superpowers:systematic-debugging', NONE)).toBe(true)
  expect(holds(spells, '/superpowers:systematic-debugging', NONE)).toBe(true)
  expect(holds(spells, 'systematic-debugging', NONE)).toBe(false)
  expect(holds(spells, 'research', NONE)).toBe(false)
  expect(holds(spells, 'taste-skill:minimalist-ui', aliases)).toBe(true)
  expect(holds(spells, 'taste-skill:minimalist-ui', NONE)).toBe(false)
  expect(holds([], 'research', NONE)).toBe(false)
})

test('a blocked member is told who holds the skill, or that it is retired', async () => {
  const holders = [
    { id: 'seer', name: '🔮 The Seer', spells: ['research'] },
    { id: 'guildmaster', name: '👑 The Guildmaster', spells: ['superpowers:brainstorming'] },
  ]
  const registry = parseRegistry(REGISTRY)
  const toSeer = refusal('🧙 The Wizard', 'research', holdersOf(holders, 'research', NONE), registry)
  expect(toSeer).toContain("not in 🧙 The Wizard's spellbook")
  expect(toSeer).toContain('`seer`')
  expect(refusal('🧙 The Wizard', 'superpowers:brainstorming', holdersOf(holders, 'superpowers:brainstorming', NONE), registry)).toContain(
    'Only the Guildmaster holds it',
  )
  expect(refusal('🧙 The Wizard', 'nothing-here', [], registry)).toContain('No member holds it')
  expect(refusal('🧙 The Wizard', 'anthropic-skills:wizard', [], registry)).toContain('retired')
})

test('the registry parses, and spell problems catch bad spellbooks', async () => {
  const registry = parseRegistry(REGISTRY)
  expect(registry.retired).toEqual(['anthropic-skills:wizard'])
  expect(registry.personOnly).toEqual(['loop'])
  const problems = spellProblems(
    { id: 'seer', spells: ['research', 'research', 'anthropic-skills:wizard', 'loop'], prepared: ['deep-research', 'a', 'b'], tools: ['Read'] },
    registry,
  )
  expect(problems.some(line => line.includes('"deep-research" is not in its spells'))).toBe(true)
  expect(problems.some(line => line.includes('3 prepared spells'))).toBe(true)
  expect(problems.some(line => line.includes('is retired'))).toBe(true)
  expect(problems.some(line => line.includes('is person-only'))).toBe(true)
  expect(problems.some(line => line.includes('listed twice'))).toBe(true)
  expect(problems.some(line => line.includes('no Skill tool'))).toBe(true)
  // A preload-only member (the Herald) needs no Skill tool.
  expect(spellProblems({ id: 'herald', spells: ['i-have-adhd:i-have-adhd'], prepared: ['i-have-adhd:i-have-adhd'], tools: ['Read'] }, registry)).toEqual([])
})

test('unclaimed skills are those nobody holds and the registry has not ruled on', async () => {
  const registry = parseRegistry(REGISTRY)
  const holders = [{ id: 'seer', name: 'Seer', spells: ['research'] }]
  expect(unclaimed(['research', 'loop', 'anthropic-skills:wizard', 'teach'], holders, registry, NONE)).toEqual(['teach'])
})

test('loading the guild reads spells, prepared, the registry and guild-made spells', async () => {
  const guild = await loadGuild(fs, ROOT)
  const wizard = guild.members.find(member => member.id === 'wizard')!
  expect(wizard.spells).toEqual(['superpowers:systematic-debugging', 'superpowers:verification-before-completion', 'house-style'])
  expect(wizard.prepared).toEqual(['superpowers:verification-before-completion', 'house-style'])
  expect(guild.guildmaster.spells).toEqual(['superpowers:brainstorming'])
  expect(guild.registry.retired).toEqual(['anthropic-skills:wizard'])
  expect(guild.guildSpells.map(spell => spell.name)).toEqual(['house-style'])
  expect(guild.guildSpells[0]!.body).toBe('# House style\nWrite plainly.')
  expect(guild.errors.some(error => error.startsWith('seer: spell "anthropic-skills:wizard" is retired'))).toBe(true)
  expect(guild.errors.some(error => error.startsWith('seer: prepared spell "deep-research"'))).toBe(true)
  expect(guild.errors.some(error => error.startsWith('wizard:'))).toBe(false)
})

test('a member prompt lists its spells and writes out prepared guild spells', async () => {
  const guild = await loadGuild(fs, ROOT)
  const wizard = guild.members.find(member => member.id === 'wizard')!
  const prompt = memberPrompt(guild, wizard)
  expect(prompt).toContain('## Your spells')
  expect(prompt).toContain('`superpowers:systematic-debugging`: cast with the Skill tool')
  expect(prompt).toContain('`superpowers:verification-before-completion`: prepared')
  expect(prompt).toContain('### Prepared guild spell: house-style\n# House style\nWrite plainly.')
  const herald = memberPrompt(guild, guild.members.find(member => member.id === 'herald')!)
  expect(herald).toContain('Every skill is blocked for you')
})

test('the Guildmaster sees every spellbook, its own spells, and the registry', async () => {
  const section = guildmasterSection(await loadGuild(fs, ROOT))
  expect(section).toContain('## Spellbooks')
  expect(section).toContain('`wizard`: superpowers:systematic-debugging, superpowers:verification-before-completion (prepared), house-style (prepared)')
  expect(section).toContain('yours (guidance; not blocked): superpowers:brainstorming')
  expect(section).toContain('Retired (never cast or assign): anthropic-skills:wizard.')
  expect(section).toContain('Person-only (the person starts these; never cast them unasked): loop.')
})

test('a skill body drops its frontmatter', async () => {
  expect(skillBody('---\nname: x\n---\n\n# X\nDo it.\n')).toBe('# X\nDo it.')
})
