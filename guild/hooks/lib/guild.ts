// Loading the guild's data folder and compiling it: member prompts for
// `$.agent.register`, and the Guildmaster's section of the system prompt.

import type { FsEntry } from 'claude-code'

import { asList, asText, splitFrontmatter } from './frontmatter'
import type { Pact } from './scroll'
import { parsePacts } from './scroll'
import type { Registry } from './spells'
import { parseRegistry, skillBody, spellProblems } from './spells'

export type BriefField = { name: string; isOptional: boolean }

export type Member = {
  id: string
  name: string
  archetype: string
  title: string
  tagline: string
  skills: string[]
  sigil: string
  color: string
  version: string
  model?: string
  effort?: string
  tools?: string[]
  maxTurns?: number
  summonWhen: string[]
  neverWhen: string[]
  accepts: BriefField[]
  delivers: string
  perspective: string
  tomes: string[]
  writes: string[]
  spells: string[]
  prepared: string[]
  body: string
  grimoire: string[]
}

export type Quest = { id: string; name: string; summary: string; trigger: string; party: string[]; path: string; tome?: string }
export type Tome = { id: string; name: string; summary: string; attachWhen: string[]; path: string }
export type Guildmaster = {
  name: string
  sigil: string
  version: string
  tagline: string
  skills: string[]
  color: string
  perspective: string
  spells: string[]
  body: string
  grimoire: string[]
}

// A spell the guild made itself: spells/<name>/SKILL.md, named in profiles by <name>.
export type GuildSpell = { name: string; path: string; body: string }

export type Guild = {
  root: string
  charter: string
  charterVersion: string
  pactsVersion: string
  pacts: Pact[]
  guildmaster: Guildmaster
  members: Member[]
  quests: Quest[]
  tomes: Tome[]
  registry: Registry
  guildSpells: GuildSpell[]
  errors: string[]
}

// The slice of `$.fs` loading needs, so tests can hand in a map of files.
export type GuildFs = {
  read: (path: string) => Promise<string>
  list: (path: string) => Promise<readonly Pick<FsEntry, 'name' | 'kind'>[]>
  exists: (path: string) => Promise<boolean>
}

export const join = (...parts: string[]): string =>
  parts
    .filter(Boolean)
    .map((part, at) => (at === 0 ? part.replace(/[\\/]+$/, '') : part.replace(/^[\\/]+|[\\/]+$/g, '')))
    .join('/')

const ID = /^[a-z][a-z0-9_-]{0,63}$/

const listNames = async (fs: GuildFs, path: string, kind: 'file' | 'dir'): Promise<string[]> => {
  if (!(await fs.exists(path))) return []
  const entries = await fs.list(path)
  return entries
    .filter(entry => entry.kind === kind)
    .map(entry => entry.name)
    .sort()
}

// The member card's limits (design/card.md): a short tagline, three short chips.
export function cardProblems(id: string, tagline: string, skills: readonly string[]): string[] {
  const problems: string[] = []
  if (!tagline) problems.push(`${id}: card needs a tagline`)
  else if (tagline.length > 40) problems.push(`${id}: tagline is ${tagline.length} characters (40 max)`)
  if (skills.length !== 3) problems.push(`${id}: card needs exactly 3 skills (has ${skills.length})`)
  for (const skill of skills) {
    if (skill.length > 14) problems.push(`${id}: skill "${skill}" is over 14 characters`)
  }
  return problems
}

const parseAccepts = (raw: string[]): BriefField[] =>
  raw.map(item => ({ name: item.replace(/\?$/, '').trim(), isOptional: item.trim().endsWith('?') }))

export async function loadGuild(fs: GuildFs, root: string): Promise<Guild> {
  const errors: string[] = []
  const readIf = async (path: string): Promise<string | undefined> =>
    (await fs.exists(path)) ? fs.read(path) : undefined

  const charterRaw = (await readIf(join(root, 'guild.md'))) ?? ''
  if (!charterRaw) errors.push(`guild.md not found in ${root}`)
  const charter = splitFrontmatter(charterRaw)

  const pactsRaw = (await readIf(join(root, 'pacts.md'))) ?? ''
  if (!pactsRaw) errors.push('pacts.md not found')
  const pacts = parsePacts(pactsRaw)

  const gmRaw = (await readIf(join(root, 'guildmaster', 'PROFILE.md'))) ?? ''
  const gm = splitFrontmatter(gmRaw)
  const guildmaster: Guildmaster = {
    name: asText(gm.data.name, 'The Guildmaster'),
    sigil: asText(gm.data.sigil, '👑'),
    version: asText(gm.data.version, '0.0.0'),
    tagline: asText(gm.data.tagline, 'Plans the quest, routes the craft'),
    skills: asList(gm.data.skills),
    color: asText(gm.data.color, 'gold'),
    perspective: asText(gm.data.perspective),
    spells: asList(gm.data.spells),
    body: gm.body.trim(),
    grimoire: await listNames(fs, join(root, 'guildmaster', 'grimoire'), 'file'),
  }

  const members: Member[] = []
  for (const dir of await listNames(fs, join(root, 'members'), 'dir')) {
    const path = join(root, 'members', dir, 'PROFILE.md')
    const raw = await readIf(path)
    if (raw === undefined) continue
    const { data, body } = splitFrontmatter(raw)
    const id = asText(data.id, dir).toLowerCase()
    if (!ID.test(id)) {
      errors.push(`members/${dir}: id "${id}" must be lowercase letters, digits, - or _`)
      continue
    }
    if (id === 'guildmaster' || id === 'any' || id === 'none') {
      errors.push(`members/${dir}: id "${id}" is reserved`)
      continue
    }
    const tagline = asText(data.tagline)
    const skills = asList(data.skills)
    errors.push(...cardProblems(id, tagline, skills))
    const maxTurns = Number.parseInt(asText(data.max_turns), 10)
    const tools = asList(data.tools)
    members.push({
      id,
      name: asText(data.name, id),
      archetype: asText(data.archetype),
      title: asText(data.title),
      tagline,
      skills,
      sigil: asText(data.sigil, '✦'),
      color: asText(data.color, 'gray'),
      version: asText(data.version, '0.0.0'),
      model: asText(data.model) || undefined,
      effort: asText(data.effort) || undefined,
      tools: tools.length > 0 ? tools : undefined,
      maxTurns: Number.isFinite(maxTurns) && maxTurns > 0 ? maxTurns : undefined,
      summonWhen: asList(data.summon_when),
      neverWhen: asList(data.never_when),
      accepts: parseAccepts(asList(data.accepts)),
      delivers: asText(data.delivers),
      perspective: asText(data.perspective),
      tomes: asList(data.tomes),
      writes: asList(data.writes),
      spells: asList(data.spells),
      prepared: asList(data.prepared),
      body: body.trim(),
      grimoire: await listNames(fs, join(root, 'members', dir, 'grimoire'), 'file'),
    })
  }
  if (members.length === 0) errors.push('no members found under members/')

  const tomes: Tome[] = []
  const quests: Quest[] = []
  const readQuests = async (dir: string, tome?: string) => {
    for (const file of await listNames(fs, dir, 'file')) {
      if (!file.endsWith('.md')) continue
      const { data } = splitFrontmatter(await fs.read(join(dir, file)))
      quests.push({
        id: asText(data.id, file.replace(/\.md$/, '')),
        name: asText(data.name, file),
        summary: asText(data.summary),
        trigger: asText(data.trigger),
        party: asList(data.party),
        path: join(dir, file),
        tome,
      })
    }
  }
  await readQuests(join(root, 'quests'))
  for (const dir of await listNames(fs, join(root, 'tomes'), 'dir')) {
    const path = join(root, 'tomes', dir, 'TOME.md')
    const raw = await readIf(path)
    if (raw === undefined) continue
    const { data } = splitFrontmatter(raw)
    const id = asText(data.id, dir)
    tomes.push({
      id,
      name: asText(data.name, dir),
      summary: asText(data.summary),
      attachWhen: asList(data.attach_when),
      path,
    })
    await readQuests(join(root, 'tomes', dir, 'quests'), id)
  }

  const registryRaw = await readIf(join(root, 'spells', 'REGISTRY.md'))
  const registry: Registry = registryRaw ? parseRegistry(registryRaw) : { retired: [], personOnly: [] }
  const guildSpells: GuildSpell[] = []
  for (const dir of await listNames(fs, join(root, 'spells'), 'dir')) {
    const path = join(root, 'spells', dir, 'SKILL.md')
    const raw = await readIf(path)
    if (raw !== undefined) guildSpells.push({ name: dir, path, body: skillBody(raw) })
  }
  for (const member of members) errors.push(...spellProblems(member, registry))
  errors.push(...spellProblems({ id: 'guildmaster', spells: guildmaster.spells, prepared: [] }, registry))

  const memberIds = new Set(members.map(member => member.id))
  for (const pact of pacts) {
    for (const end of [pact.from, pact.to]) {
      if (end !== 'any' && end !== 'guildmaster' && !memberIds.has(end)) {
        errors.push(`pact ${pact.id}: "${end}" is not a member`)
      }
    }
  }

  return {
    root,
    charter: charter.body.trim(),
    charterVersion: asText(charter.data.version, '0.0.0'),
    pactsVersion: asText(splitFrontmatter(pactsRaw).data.version, '0.0.0'),
    pacts,
    guildmaster,
    members,
    quests,
    tomes,
    registry,
    guildSpells,
    errors,
  }
}

export const agentType = (member: Pick<Member, 'id'>) => `guild:${member.id}`

export const briefTemplate = (member: Member): string =>
  member.accepts.map(field => `${field.name}:${field.isOptional ? ' (optional)' : ''}`).join(' · ')

export function memberDescription(member: Member): string {
  const when = member.summonWhen.length > 0 ? ` Summon when: ${member.summonWhen.join('; ')}.` : ''
  const never = member.neverWhen.length > 0 ? ` Not for: ${member.neverWhen.join('; ')}.` : ''
  const brief = member.accepts.length > 0 ? ` Brief as labelled lines: ${briefTemplate(member)}.` : ''
  return `${member.sigil} ${member.name}, ${member.archetype}: ${member.title}.${when}${never}${brief}`
}

const pactRows = (pacts: readonly Pact[]) =>
  pacts.map(pact => `| ${pact.id} | ${pact.from} → ${pact.to} | ${pact.guarantee} | ${pact.checks.join(', ')} |`).join('\n')

export function memberPrompt(guild: Guild, member: Member): string {
  const mine = guild.pacts.filter(
    pact => pact.from === member.id || pact.to === member.id || pact.from === 'any',
  )
  const grimoireDir = join(guild.root, 'members', member.id, 'grimoire')
  const grimoire =
    member.grimoire.length > 0
      ? member.grimoire.map(file => `- \`${join(grimoireDir, file)}\``).join('\n')
      : '- (empty)'
  const tomes =
    guild.tomes.length > 0
      ? guild.tomes.map(tome => `- \`${tome.id}\`: ${tome.summary} Index: \`${tome.path}\``).join('\n')
      : '- (none)'
  const defaults = member.tomes.length > 0 ? `\nAlways read these tomes' TOME.md first: ${member.tomes.join(', ')}.` : ''
  const writes =
    member.writes.length > 0
      ? `\nInside the guild folder you may write only under: ${member.writes.map(dir => `\`${join(guild.root, dir)}\``).join(', ')}.`
      : ''
  const workshop =
    member.writes.includes('proposals')
      ? `\n\n## Workshop paths\n- Guild root: \`${guild.root}\`\n- Members: \`${join(guild.root, 'members')}\`\n- Ledger: \`${join(guild.root, 'ledger')}\` (JSONL, one record per summons; ratings are records with \`"type":"rating"\`)\n- Proposals: \`${join(guild.root, 'proposals')}\`\n- Pacts: \`${join(guild.root, 'pacts.md')}\` · Charter: \`${join(guild.root, 'guild.md')}\` · Guildmaster: \`${join(guild.root, 'guildmaster', 'PROFILE.md')}\``
      : ''
  return [
    guild.charter,
    '---',
    `# You are ${member.sigil} ${member.name}, ${member.archetype}`,
    `**Craft:** ${member.title}`,
    member.perspective ? `**Perspective:** ${member.perspective}` : '',
    `**Profile version:** ${member.version}`,
    '',
    `## Summon when\n${member.summonWhen.map(line => `- ${line}`).join('\n') || '- (any fitting task)'}`,
    `## Never (hand off instead)\n${member.neverWhen.map(line => `- ${line}`).join('\n') || '- (no listed boundaries)'}`,
    `## Your brief contract\nYou accept: ${briefTemplate(member) || '(free-form)'}\nYou deliver: ${member.delivers}`,
    '',
    member.body,
    '',
    `## Your pacts\n| id | parties | guarantee | checks |\n|---|---|---|---|\n${pactRows(mine)}\nThe engine checks your Scroll against these. Name the next member in Handoff exactly by id.`,
    spellSection(guild, member),
    `## Your grimoire (read on demand)\n${grimoire}`,
    `## Tomes in the guild library\n${tomes}${defaults}\nWhen your brief has a \`Tome:\` line, read that tome's TOME.md before anything else.${writes}${workshop}`,
    `## Guild members (for Handoff)\n${guild.members.map(other => `- \`${other.id}\`: ${other.sigil} ${other.name}, ${other.title}`).join('\n')}\n- \`guildmaster\`: when no member fits or the person must decide`,
  ]
    .filter(part => part !== undefined)
    .join('\n')
}

// The member's spellbook as its prompt states it. Claude skills are cast with
// the Skill tool (prepared ones are already loaded); guild-made spells are read
// from their file, or inlined here when prepared.
export function spellSection(guild: Guild, member: Pick<Member, 'spells' | 'prepared'>): string {
  if (member.spells.length === 0) {
    return '## Your spells\n- (none) Every skill is blocked for you. Hand off work that needs one.'
  }
  const made = new Map(guild.guildSpells.map(spell => [spell.name, spell]))
  const lines = member.spells.map(spell => {
    const own = made.get(spell)
    const isPrepared = member.prepared.includes(spell)
    if (own) return `- \`${spell}\` (guild spell): ${isPrepared ? 'prepared, written out below' : `read \`${own.path}\` and follow it`}`
    return `- \`${spell}\`: ${isPrepared ? 'prepared (already in your context; follow it)' : 'cast with the Skill tool when the work calls for it'}`
  })
  const inlined = member.prepared
    .map(spell => made.get(spell))
    .filter((spell): spell is GuildSpell => spell !== undefined)
    .map(spell => `### Prepared guild spell: ${spell.name}\n${spell.body}`)
  return [
    '## Your spells',
    "These are the only skills you may use. When one fits the work, use it: a spell's method outranks improvising your own. The engine blocks any other skill and tells you who holds it; hand that part off.",
    ...lines,
    ...inlined,
  ].join('\n')
}

export function guildmasterSection(guild: Guild): string {
  const gm = guild.guildmaster
  const roster = guild.members
    .map(
      member =>
        `| ${member.sigil} **${member.name}** \`guild:${member.id}\` v${member.version} | ${member.title} | ${member.summonWhen.join('; ')} | ${member.neverWhen.join('; ')} | ${briefTemplate(member)} | ${member.delivers} |`,
    )
    .join('\n')
  const quests = guild.quests
    .map(quest => `- **${quest.name}** (\`${quest.id}\`${quest.tome ? `, tome ${quest.tome}` : ''}): ${quest.summary} _When:_ ${quest.trigger} _Read:_ \`${quest.path}\``)
    .join('\n')
  const tomes = guild.tomes
    .map(tome => `- **${tome.name}** (\`Tome: ${tome.id}\`): ${tome.summary} Attach when: ${tome.attachWhen.join('; ')}. Index: \`${tome.path}\``)
    .join('\n')
  const grimoire = gm.grimoire.map(file => `\`${join(guild.root, 'guildmaster', 'grimoire', file)}\``).join(', ')
  return [
    `# ${gm.sigil} The Guild: you are ${gm.name}`,
    gm.perspective ? `_${gm.perspective}_` : '',
    '',
    gm.body.replace(/`grimoire\//g, `\`${join(guild.root, 'guildmaster', 'grimoire')}/`),
    '',
    `## The roster (summon with the Agent tool, \`subagent_type: "guild:<id>"\`)`,
    '| Member | Craft | Summon when | Not for | Brief fields (`?` optional) | Delivers |',
    '|---|---|---|---|---|---|',
    roster,
    '',
    `## The pacts (v${guild.pactsVersion})`,
    '| id | parties | guarantee | checks |',
    '|---|---|---|---|',
    pactRows(guild.pacts),
    '',
    `## Spellbooks (the skills each member may use; the engine blocks the rest for members)`,
    ...guild.members.map(
      member =>
        `- ${member.sigil} \`${member.id}\`: ${member.spells.map(spell => (member.prepared.includes(spell) ? `${spell} (prepared)` : spell)).join(', ') || '(none)'}`,
    ),
    `- ${gm.sigil} yours (guidance; not blocked): ${gm.spells.join(', ') || '(none)'}. When the work fits one, cast it with the Skill tool.`,
    '- Route by spellbook: when the person names a skill, or the work needs one, summon the member who holds it rather than casting it yourself.',
    `- Retired (never cast or assign): ${guild.registry.retired.join(', ') || '(none)'}.`,
    `- Person-only (the person starts these; never cast them unasked): ${guild.registry.personOnly.join(', ') || '(none)'}.`,
    '',
    `## Quests\n${quests || '- (none)'}`,
    '',
    `## Tomes\n${tomes || '- (none)'}`,
    '',
    `## Engine notes`,
    `- The engine refuses a guild summons whose brief lacks a required field. Fix the brief and summon again.`,
    `- After each Scroll the engine checks the pacts. A breach notice tells you which checks failed; send the Scroll back once for repair.`,
    `- The person manages the guild with \`/guild\` (panel), \`/guild roster\`, \`/guild rate <member> <1-5|+|-> [note]\`, \`/guild refine <member> [concern]\`, \`/guild proposals\`, \`/guild accept <id>\`, \`/guild reject <id> <reason>\`, \`/guild reload\`.`,
    `- Guild data lives in \`${guild.root}\`. Grimoire: ${grimoire || '(none)'}.`,
  ].join('\n')
}
