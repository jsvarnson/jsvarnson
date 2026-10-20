// The skill index: spells/index.json, the installed skills the spellbooks are
// checked against. Loading the guild only reads it; it changes only when the
// person runs `/guild spells index` (by hand or from a scheduled task), which
// scans the user's skills folder and the installed plugins on disk.

import type { GuildFs } from './guild'
import { join } from './guild'
import type { Aliases } from './spells'
import { declaredName, splitSpell } from './spells'

// One installed skill: its name as spellbooks write it (`plugin:folder`, or the
// folder alone for a user skill), its SKILL.md, and any name it also answers to.
export type IndexedSkill = { name: string; path: string; aliases: string[] }
export type SkillIndex = { indexedAt: string; skills: IndexedSkill[] }

export const INDEX_FILE = 'index.json'

export function parseIndex(raw: string): SkillIndex {
  const data = JSON.parse(raw) as { indexedAt?: unknown; skills?: unknown }
  if (!Array.isArray(data.skills)) throw new Error('"skills" must be a list')
  const skills = data.skills.flatMap((one): IndexedSkill[] => {
    const skill = one as { name?: unknown; path?: unknown; aliases?: unknown }
    if (typeof skill.name !== 'string' || !skill.name) return []
    return [{
      name: skill.name,
      path: typeof skill.path === 'string' ? skill.path : '',
      aliases: Array.isArray(skill.aliases) ? skill.aliases.filter((alias): alias is string => typeof alias === 'string') : [],
    }]
  })
  return { indexedAt: typeof data.indexedAt === 'string' ? data.indexedAt : '', skills }
}

export const indexText = (index: SkillIndex): string => `${JSON.stringify(index, null, 2)}\n`

// Both directions of every alias, in the shape `holds` and `namesOf` read.
export function aliasesOf(index: SkillIndex | undefined): Aliases {
  const map = new Map<string, string[]>()
  for (const skill of index?.skills ?? []) {
    const { plugin, base } = splitSpell(skill.name)
    for (const alias of skill.aliases) {
      const aliasBase = splitSpell(alias).base
      map.set(skill.name, [...(map.get(skill.name) ?? []), aliasBase])
      const full = plugin ? `${plugin}:${aliasBase}` : aliasBase
      map.set(full, [...(map.get(full) ?? []), base])
    }
  }
  return map
}

// Every name a SKILL.md can be found under, aliases included.
export function pathsOf(index: SkillIndex | undefined): ReadonlyMap<string, string> {
  const map = new Map<string, string>()
  for (const skill of index?.skills ?? []) {
    if (!skill.path) continue
    map.set(skill.name, skill.path)
    const { plugin } = splitSpell(skill.name)
    for (const alias of skill.aliases) map.set(plugin && !alias.includes(':') ? `${plugin}:${alias}` : alias, skill.path)
  }
  return map
}

// Spells a spellbook names that the index says this install can't load. Only
// what the index can speak for is checked: a `plugin:skill` whose plugin is
// indexed, or a bare name that is no indexed user skill and no guild spell is
// left alone (it may be a built-in skill the disk scan never sees).
export function unindexed(spells: readonly string[], index: SkillIndex | undefined, guildMade: ReadonlySet<string>): string[] {
  if (!index) return []
  const known = pathsOf(index)
  const plugins = new Set(index.skills.map(skill => splitSpell(skill.name).plugin).filter(Boolean))
  return spells.filter(spell => {
    if (guildMade.has(spell) || known.has(spell)) return false
    const { plugin } = splitSpell(spell)
    return plugin !== undefined && plugins.has(plugin)
  })
}

// Scan the disk for installed skills: <claude dir>/skills/<name>/SKILL.md and
// each installed plugin's skills folders, as installed_plugins.json lists them.
export async function scanSkills(fs: GuildFs, claudeDir: string): Promise<IndexedSkill[]> {
  const found: IndexedSkill[] = []
  const userSkills = join(claudeDir, 'skills')
  if (await fs.exists(userSkills)) {
    for (const entry of await fs.list(userSkills)) {
      const path = join(userSkills, entry.name, 'SKILL.md')
      if (entry.kind === 'dir' && (await fs.exists(path))) found.push({ name: entry.name, path, aliases: [] })
    }
  }
  const installedPath = join(claudeDir, 'plugins', 'installed_plugins.json')
  const installed = (await fs.exists(installedPath))
    ? (JSON.parse(await fs.read(installedPath)) as { plugins?: Record<string, { installPath?: string }[]> })
    : {}
  for (const [key, installs] of Object.entries(installed.plugins ?? {})) {
    const plugin = key.includes('@') ? key.slice(0, key.indexOf('@')) : key
    const base = installs[0]?.installPath?.replace(/\\/g, '/')
    if (!plugin || !base) continue
    const manifestPath = join(base, '.claude-plugin', 'plugin.json')
    const manifest = (await fs.exists(manifestPath))
      ? (JSON.parse(await fs.read(manifestPath)) as { skills?: string | string[] })
      : {}
    const dirs = [manifest.skills ?? './skills'].flat().map(dir => join(base, dir.replace(/^\.\//, '')))
    for (const dir of dirs) {
      if (!(await fs.exists(dir))) continue
      for (const entry of await fs.list(dir)) {
        const path = join(dir, entry.name, 'SKILL.md')
        if (entry.kind !== 'dir' || !(await fs.exists(path))) continue
        const declared = declaredName(await fs.read(path))
        found.push({ name: `${plugin}:${entry.name}`, path, aliases: declared && declared !== entry.name ? [declared] : [] })
      }
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name))
}
