// Spells: the Claude skills (and guild-made skills) each member may use.
// `spells:` is a member's whole spellbook; `prepared:` is the part preloaded
// into every summons. The registry (spells/REGISTRY.md) rules every other
// installed skill retired or person-only. Pure functions; the engine does I/O.

import { asList, splitFrontmatter } from './frontmatter'

export type Registry = { retired: string[]; personOnly: string[] }

export const MAX_PREPARED = 2

export function parseRegistry(raw: string): Registry {
  const { data } = splitFrontmatter(raw)
  return { retired: asList(data.retired), personOnly: asList(data.person_only) }
}

// `plugin:skill` → plugin and base; a bare name has no plugin.
export function splitSpell(name: string): { plugin?: string; base: string } {
  const at = name.indexOf(':')
  return at < 0 ? { base: name } : { plugin: name.slice(0, at), base: name.slice(at + 1) }
}

// Names one skill answers to. A plugin skill's folder and the `name:` inside
// its SKILL.md can differ (taste-skill:minimalist-skill declares minimalist-ui),
// so the engine adds the declared name as an alias when it can read the file.
export type Aliases = ReadonlyMap<string, readonly string[]>

export function namesOf(spell: string, aliases: Aliases): string[] {
  const { plugin } = splitSpell(spell)
  const extra = (aliases.get(spell) ?? []).map(alias => (plugin && !alias.includes(':') ? `${plugin}:${alias}` : alias))
  return [spell, ...extra]
}

// Does a spellbook hold the skill the Skill tool was asked for?
export function holds(spells: readonly string[], skill: string, aliases: Aliases): boolean {
  const wanted = skill.trim().replace(/^\//, '')
  return spells.some(spell => namesOf(spell, aliases).includes(wanted))
}

export type Holder = { id: string; name: string; spells: readonly string[] }

export function holdersOf(holders: readonly Holder[], skill: string, aliases: Aliases): Holder[] {
  return holders.filter(holder => holds(holder.spells, skill, aliases))
}

// The engine's refusal when a member reaches for a skill outside its spellbook.
export function refusal(memberName: string, skill: string, holders: readonly Holder[], registry: Registry): string {
  const wanted = skill.trim().replace(/^\//, '')
  if (registry.retired.includes(wanted)) {
    return `"${wanted}" is a retired skill: no member may cast it. Do the work with your own spells, or hand off.`
  }
  const who = holders.filter(holder => holder.id !== 'guildmaster')
  const toWhom =
    who.length > 0
      ? `It is in the spellbook of ${who.map(holder => `${holder.name} (\`${holder.id}\`)`).join(', ')}: hand that part off to them in your Scroll.`
      : holders.some(holder => holder.id === 'guildmaster')
        ? 'Only the Guildmaster holds it: name `guildmaster` in your Handoff.'
        : 'No member holds it: name `guildmaster` in your Handoff.'
  return `"${wanted}" is not in ${memberName}'s spellbook, so the guild blocked it. ${toWhom}`
}

export type SpellOwner = { id: string; spells: readonly string[]; prepared: readonly string[]; tools?: readonly string[] }

// Problems /guild roster reports: shape rules that need no disk.
export function spellProblems(owner: SpellOwner, registry: Registry): string[] {
  const problems: string[] = []
  const id = owner.id
  for (const spell of owner.prepared) {
    if (!owner.spells.includes(spell)) problems.push(`${id}: prepared spell "${spell}" is not in its spells`)
  }
  if (owner.prepared.length > MAX_PREPARED) {
    problems.push(`${id}: ${owner.prepared.length} prepared spells (${MAX_PREPARED} max: each one loads into every summons)`)
  }
  for (const spell of owner.spells) {
    if (registry.retired.includes(spell)) problems.push(`${id}: spell "${spell}" is retired (spells/REGISTRY.md)`)
    if (registry.personOnly.includes(spell)) problems.push(`${id}: spell "${spell}" is person-only (spells/REGISTRY.md)`)
  }
  const seen = new Set<string>()
  for (const spell of owner.spells) {
    if (seen.has(spell)) problems.push(`${id}: spell "${spell}" is listed twice`)
    seen.add(spell)
  }
  const castable = owner.spells.filter(spell => !owner.prepared.includes(spell))
  if (owner.tools && castable.length > 0 && !owner.tools.includes('Skill')) {
    problems.push(`${id}: has spells to cast but no Skill tool`)
  }
  return problems
}

// Installed skills that nobody holds and the registry hasn't ruled on.
export function unclaimed(installed: readonly string[], holders: readonly Holder[], registry: Registry, aliases: Aliases): string[] {
  return installed.filter(
    skill =>
      !registry.retired.includes(skill) &&
      !registry.personOnly.includes(skill) &&
      !holders.some(holder => holds(holder.spells, skill, aliases)),
  )
}

// A SKILL.md body without its frontmatter: what a preloaded spell inlines.
export function skillBody(raw: string): string {
  return splitFrontmatter(raw).body.trim()
}

export const declaredName = (raw: string): string => {
  const { data } = splitFrontmatter(raw)
  return typeof data.name === 'string' ? data.name.trim() : ''
}
