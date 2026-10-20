import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { GuildLeader, GuildMemberCard, GuildProposalCard, GuildQuest, GuildQuestStatus, GuildResult, GuildSummons } from '../types'
import { asText, setFrontmatterScalar, splitFrontmatter } from './lib/frontmatter'
import { guardWrite, writtenPath } from './lib/guard'
import type { Guild, GuildFs, Member } from './lib/guild'
import { agentType, guildmasterSection, join, loadGuild, memberDescription, memberPrompt } from './lib/guild'
import { activityBar, formatElapsed, memberHex, toolSummary, truncate } from './lib/activity'
import { latestResults } from './lib/ledger'
import { isQuestOpen, onSummonEnd, onSummonStart, questProgress, questText, setStep, startQuest, STEP_STATUSES } from './lib/quest'
import { askCount, cleanReport, heraldPrompt } from './lib/herald'
import { barSvg, formatTokens, iconSvg } from './lib/sprites'
import type { Proposal } from './lib/proposals'
import { applyProposal, bumpVersion, changelogWithEntry, parseProposal } from './lib/proposals'
import { briefTome, checkPacts, missingBriefFields, pactsFor, parseScroll } from './lib/scroll'
import type { Holder } from './lib/spells'
import { holdersOf, holds, refusal as spellRefusal, skillBody, unclaimed } from './lib/spells'
import { aliasesOf, INDEX_FILE, indexText, pathsOf, scanSkills, unindexed } from './lib/skillindex'

const PANE = 'guild'
const roster = atom({ plugin: 'guild', key: 'roster' } as const, [] as GuildMemberCard[])
const active = atom({ plugin: 'guild', key: 'active' } as const, [] as GuildSummons[])
const recent = atom({ plugin: 'guild', key: 'recent' } as const, [] as GuildResult[])
const proposals = atom({ plugin: 'guild', key: 'proposals' } as const, [] as GuildProposalCard[])
const loadErrors = atom({ plugin: 'guild', key: 'loadErrors' } as const, [] as string[])
const expanded = atom({ plugin: 'guild', key: 'expanded' } as const, '')
const tick = atom({ plugin: 'guild', key: 'tick' } as const, 0)
const collapsed = atom({ plugin: 'guild', key: 'collapsed' } as const, [] as string[])
const quest = atom({ plugin: 'guild', key: 'quest' } as const, null as GuildQuest | null)
const leader = atom({ plugin: 'guild', key: 'leader' } as const, null as GuildLeader | null)
const isThinking = atom({ plugin: 'guild', key: 'isThinking' } as const, false)

const QUEST_TOOL = 'mcp__guild__quest'

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
const PROPOSAL_FILES = /^(members\/[a-z][a-z0-9_-]*\/PROFILE\.md|guildmaster\/PROFILE\.md|pacts\.md|guild\.md)$/

type Options = { guildPath?: string; strictBriefs?: boolean; heraldReport?: boolean }
type FoundProposal = { path: string; raw: string; proposal: Proposal }

// Module state: rebuilt on every (re)load, which also re-runs session.start.
let root = 'C:/Users/Joseph/.claude/guild'
let isStrict = true
let guild: Guild | undefined
// The one load in flight, so every caller shares it instead of starting another.
let loading: Promise<Guild> | undefined
let fingerprint = ''
// Summonses at work by agentId: the truth behind `active`, which /clear, /resume
// and /branch reset while the members keep working.
const inFlight = new Map<string, GuildSummons>()
// The quest as last written, so the same resets can't drop it.
let lastQuest: GuildQuest | null = null
let ledgerQueue: Promise<void> = Promise.resolve()
// The Herald: main-loop tool calls this turn, whether it reports, its last report,
// the main loop's last answer, and whether a report is being written (and another asked for).
let mainToolCalls = 0
let isHeraldOn = true
let lastHerald = ''
let lastAnswer = ''
let isHeraldWriting = false
let heraldAgain: HeraldTrigger | undefined
// Spells: skill aliases and SKILL.md paths, as spells/index.json records them.
let aliases: ReadonlyMap<string, readonly string[]> = new Map()
let skillPaths: ReadonlyMap<string, string> = new Map()

type HeraldTrigger = 'turn' | 'asked'

const newId = (prefix: string, now: number) =>
  `${prefix}-${now.toString(36)}-${Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, '0')}`

const isoDate = (now: number) => new Date(now).toISOString().slice(0, 10)

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

const memberOf = (current: Guild, id: string): Member | undefined => current.members.find(member => member.id === id)

async function writeLedger($: EngineInterface, record: Record<string, unknown>): Promise<void> {
  const now = await $.clock.now()
  const path = join(root, 'ledger', `${new Date(now).toISOString().slice(0, 7)}.jsonl`)
  const before = (await $.fs.exists(path)) ? await $.fs.read(path) : ''
  const line = JSON.stringify({ ts: new Date(now).toISOString(), ...record })
  await $.fs.write(path, `${before}${before && !before.endsWith('\n') ? '\n' : ''}${line}\n`)
}

// Ledger writes are read-append-write, so they queue one behind another.
async function appendLedger($: EngineInterface, record: Record<string, unknown>): Promise<void> {
  const run = ledgerQueue.then(() => writeLedger($, record))
  ledgerQueue = run.catch(() => undefined)
  return run
}

async function readProposals($: EngineInterface): Promise<FoundProposal[]> {
  const dir = join(root, 'proposals')
  if (!(await $.fs.exists(dir))) return []
  const files = (await $.fs.list(dir)).filter(entry => entry.kind === 'file' && entry.name.endsWith('.md'))
  const found: FoundProposal[] = []
  for (const file of files) {
    const path = join(dir, file.name)
    const raw = await $.fs.read(path)
    found.push({ path, raw, proposal: parseProposal(raw, file.name.replace(/\.md$/, '')) })
  }
  return found
}

async function refreshProposals($: EngineInterface): Promise<FoundProposal[]> {
  const open = (await readProposals($)).filter(found => found.proposal.status === 'open')
  await update($, proposals, () =>
    open.map(({ proposal }) => ({
      id: proposal.id,
      target: proposal.target,
      kind: proposal.kind,
      title: proposal.title,
      toVersion: proposal.toVersion,
    })),
  )
  return open
}

async function stampDir($: EngineInterface, dir: string, parts: string[], depth: number): Promise<void> {
  if (!(await $.fs.exists(dir))) return
  for (const entry of await $.fs.list(dir)) {
    if (entry.kind === 'file' && /\.(md|json)$/.test(entry.name)) parts.push(`${dir}/${entry.name}:${entry.mtimeMs}`)
    if (entry.kind === 'dir' && depth > 0) await stampDir($, `${dir}/${entry.name}`, parts, depth - 1)
  }
}

// The modification times of every file that compiles into the roster.
async function computeFingerprint($: EngineInterface): Promise<string> {
  const parts: string[] = []
  await stampDir($, root, parts, 0)
  await stampDir($, join(root, 'guildmaster'), parts, 0)
  await stampDir($, join(root, 'members'), parts, 1)
  await stampDir($, join(root, 'quests'), parts, 0)
  await stampDir($, join(root, 'spells'), parts, 1)
  return parts.join('|')
}

async function registerMember($: EngineInterface, loaded: Guild, member: Member): Promise<void> {
  // Prepared Claude skills preload through the agent definition; prepared guild
  // spells are written into the prompt by memberPrompt instead.
  const made = new Set(loaded.guildSpells.map(spell => spell.name))
  const preload = member.prepared.filter(spell => !made.has(spell))
  await $.agent.register({
    name: member.id,
    description: memberDescription(member),
    prompt: memberPrompt(loaded, member),
    ...(member.tools ? { tools: member.tools } : {}),
    ...(member.model ? { model: member.model } : {}),
    ...(member.effort ? { effort: member.effort } : {}),
    ...(member.maxTurns ? { maxTurns: member.maxTurns } : {}),
    ...(preload.length > 0 ? { skills: preload } : {}),
  })
}

const fsOf = ($: EngineInterface): GuildFs => ({
  read: path => $.fs.read(path),
  list: path => $.fs.list(path),
  exists: path => $.fs.exists(path),
})

// Spells a profile names that the skill index says this install can't load.
function missingSpells(current: Guild): string[] {
  const made = new Set(current.guildSpells.map(spell => spell.name))
  const owners = [...current.members.map(member => ({ id: member.id, spells: member.spells })), { id: 'guildmaster', spells: current.guildmaster.spells }]
  return owners.flatMap(owner => unindexed(owner.spells, current.spellIndex, made).map(spell => `${owner.id}: spell "${spell}" is not installed`))
}

const installedNames = (current: Guild): string[] | undefined => current.spellIndex?.skills.map(skill => skill.name)

const spellHolders = (current: Guild): Holder[] => [
  ...current.members.map(member => ({ id: member.id, name: `${member.sigil} ${member.name}`, spells: member.spells })),
  { id: 'guildmaster', name: `${current.guildmaster.sigil} ${current.guildmaster.name}`, spells: current.guildmaster.spells },
]

async function reload($: EngineInterface): Promise<Guild> {
  const loaded = await loadGuild(fsOf($), root)
  aliases = aliasesOf(loaded.spellIndex)
  skillPaths = pathsOf(loaded.spellIndex)
  const errors = [...loaded.errors, ...missingSpells(loaded)]
  for (const member of loaded.members) {
    try {
      await registerMember($, loaded, member)
    } catch (error) {
      errors.push(`${member.id}: registration refused (${errorText(error)})`)
    }
  }
  const current: Guild = { ...loaded, errors }
  guild = current
  fingerprint = await computeFingerprint($).catch(() => '')
  await update($, roster, () =>
    loaded.members.map(member => ({
      id: member.id,
      name: member.name,
      sigil: member.sigil,
      archetype: member.archetype,
      title: member.title,
      tagline: member.tagline,
      skills: member.skills,
      version: member.version,
      color: member.color,
      model: member.model,
      effort: member.effort,
      briefTemplate: member.accepts.map(field => `${field.name}: ${field.isOptional ? '(optional) ' : ''}`).join('\n'),
    })),
  )
  await update($, loadErrors, () => errors)
  const gm = loaded.guildmaster
  await update($, leader, () => ({
    name: gm.name,
    sigil: gm.sigil,
    tagline: gm.tagline,
    skills: gm.skills,
    color: gm.color,
    version: gm.version,
  }))
  await refreshProposals($).catch(() => [])
  return current
}

// Loads the guild once at a time: callers share the load in flight. A fresh load
// waits for that one and then reads the folder again, for callers that just wrote it.
function load($: EngineInterface, isFresh = false): Promise<Guild> {
  if (loading && !isFresh) return loading
  const run = (loading ?? Promise.resolve()).catch(() => undefined).then(() => reload($))
  const clear = () => {
    if (loading === run) loading = undefined
  }
  loading = run
  run.then(clear, clear)
  return run
}

async function ensureGuild($: EngineInterface): Promise<Guild> {
  return guild ?? load($)
}

async function pollForChanges($: EngineInterface): Promise<void> {
  if (loading) return
  const latest = await computeFingerprint($).catch(() => fingerprint)
  if (latest === fingerprint) return
  await load($, true)
  $.ui.toast('guild: profiles changed, so the roster was recompiled')
}

async function notifyMain($: EngineInterface, text: string): Promise<void> {
  await $.session.append({ message: { type: 'user', content: [{ type: 'text', text }] } }).catch(() => undefined)
}

// Every quest write goes through here, so lastQuest stays its source of truth.
async function setQuest($: EngineInterface, change: (current: GuildQuest | null) => GuildQuest | null): Promise<void> {
  await update($, quest, current => {
    lastQuest = change(current)
    return lastQuest
  })
}

async function trackSummons($: EngineInterface, summons: Omit<GuildSummons, 'startedAt'>): Promise<void> {
  inFlight.set(summons.agentId, { ...summons, startedAt: 0 })
  const startedAt = await $.clock.now()
  const tracked = { ...(inFlight.get(summons.agentId) ?? summons), startedAt }
  inFlight.set(summons.agentId, tracked)
  await update($, active, list => [...list.filter(one => one.agentId !== summons.agentId), tracked])
  await setQuest($, current => (isQuestOpen(current) ? onSummonStart(current, summons.member, summons.agentId) : current))
}

// Close out one summons: parse its Scroll, check the pacts, write the ledger.
async function settle(
  $: EngineInterface,
  summons: GuildSummons,
  answer: string,
  isAborted: boolean,
  durationMs: number,
  tokens: number | undefined,
): Promise<void> {
  const current = await ensureGuild($)
  const member = memberOf(current, summons.member)
  const scroll = parseScroll(answer)
  const results = checkPacts(pactsFor(current.pacts, summons.member, scroll.handoff), {
    scroll,
    isAborted,
    members: current.members.map(one => one.id),
  })
  const broken = results.filter(result => !result.isKept)
  const failed = broken.flatMap(result => result.failed.map(check => `${result.id}:${check}`))
  const now = await $.clock.now()
  const ledgerId = newId('L', now)
  await appendLedger($, {
    type: 'summons',
    id: ledgerId,
    member: summons.member,
    version: member?.version,
    agentId: summons.agentId,
    description: summons.description,
    tome: summons.tome,
    origin: summons.origin ?? 'guildmaster',
    durationMs,
    tokens,
    isAborted,
    scroll: {
      missing: scroll.missing,
      confidence: scroll.confidence,
      handoff: scroll.handoff,
      verdict: (scroll.sections.Verdict ?? '').slice(0, 600),
    },
    pacts: results,
    isBreach: broken.length > 0,
    ...(summons.spells?.length ? { spells: summons.spells } : {}),
    ...(summons.blocked?.length ? { spellsBlocked: summons.blocked } : {}),
  }).catch(() => undefined)

  // Forget it before `active` drops it, so a reset in between can't restore it.
  inFlight.delete(summons.agentId)
  await update($, active, list => list.filter(one => one.agentId !== summons.agentId))
  const result: GuildResult = {
    ledgerId,
    member: summons.member,
    description: summons.description,
    isKept: broken.length === 0,
    failed,
    durationMs,
    endedAt: now,
    confidence: scroll.confidence,
    handoff: scroll.handoff,
    tokens,
  }
  await update($, recent, list => [result, ...list].slice(0, 30))
  await setQuest($, current =>
    isQuestOpen(current) ? onSummonEnd(current, summons.agentId, broken.length === 0, failed.length > 0 ? failed.join(', ') : undefined) : current,
  )

  const who = member ? `${member.sigil} ${member.name}` : summons.member
  if (summons.member === 'artificer') await refreshProposals($).catch(() => [])
  if (summons.origin === 'engine') {
    $.ui.toast(
      broken.length > 0
        ? `guild: ${who} finished with breaches (${failed.join(', ')})`
        : summons.member === 'artificer'
          ? `guild: ${who} finished. Run /guild proposals to review.`
          : `guild: ${who} finished.`,
    )
    return
  }
  if (broken.length > 0) {
    $.ui.toast(`guild: ${who} breached ${failed.join(', ')}`)
    await notifyMain(
      $,
      `[Guild engine] Pact breach. ${who}'s Scroll for "${summons.description}" failed: ${broken
        .map(one => `${one.id} (${one.failed.join(', ')})`)
        .join('; ')}. Send it back to guild:${summons.member} once, quoting these failed checks. If it breaches again, tell the person.`,
    )
  }
}

// Each member's last finished summons, read back from the ledger, newest first.
async function ledgerResults($: EngineInterface): Promise<GuildResult[]> {
  const dir = join(root, 'ledger')
  if (!(await $.fs.exists(dir))) return []
  const months = (await $.fs.list(dir)).filter(entry => entry.kind === 'file' && entry.name.endsWith('.jsonl')).map(entry => entry.name)
  const texts: string[] = []
  for (const name of months.sort()) texts.push(await $.fs.read(join(dir, name)))
  return latestResults(texts.join('\n'))
}

// Adds each member's last ledger result to `recent`, unless this session has one.
// Intended: restored rows count toward the pane's stats and /guild rate.
async function restoreResults($: EngineInterface): Promise<void> {
  const latest = await ledgerResults($).catch(() => [])
  await update($, recent, list => [...list, ...latest.filter(one => !list.some(own => own.member === one.member))])
}

const LIVE_STATUSES: ReadonlySet<string> = new Set(['pending', 'running', 'waiting', 'idle'])

// Puts the summonses the runtime still runs back in `active`. One it lists as
// ended, or no longer lists, stays in inFlight unshown: its Scroll may still
// arrive and must settle. If the listing fails, every summons comes back.
async function restoreActive($: EngineInterface): Promise<void> {
  const agents = await $.agent.list().catch(() => undefined)
  const statuses = agents ? new Map(agents.map(agent => [agent.id, agent.status])) : undefined
  const isShown = (id: string) => !statuses || LIVE_STATUSES.has(statuses.get(id) ?? '')
  await update($, active, list =>
    [...list.filter(one => !inFlight.has(one.agentId)), ...inFlight.values()].filter(one => isShown(one.agentId)),
  )
}

// /clear, /resume and /branch reset every $.state value and skip session.start:
// put the summonses at work and the quest back, reread results, then recompile the roster.
async function restoreState($: EngineInterface): Promise<void> {
  await restoreActive($)
  await update($, quest, current => current ?? lastQuest)
  await restoreResults($)
  await load($, true).catch(error => $.ui.toast(`guild: could not load ${root} (${errorText(error)})`))
}

// The session's first load, off the startup path: nothing waits on it.
async function startGuild($: EngineInterface): Promise<void> {
  await load($).catch(error => $.ui.toast(`guild: could not load ${root} (${errorText(error)})`))
  await restoreResults($)
  void $.ui.open({ id: PANE, title: 'Guild', columns: 56 }).catch(() => undefined)
}

async function commandOpen($: EngineInterface): Promise<string> {
  const opened = await $.ui.open({ id: PANE, title: 'Guild', columns: 56 })
  return opened.isPlaced ? 'The Guild panel is open.' : 'The Guild panel is waiting for room (widen the window).'
}

async function commandRoster($: EngineInterface): Promise<string> {
  const current = await load($, true)
  const lines = current.members.map(
    member => `${member.sigil} ${member.name} (guild:${member.id}) v${member.version}: ${member.title}`,
  )
  const errors = current.errors.length > 0 ? `\nProblems:\n${current.errors.map(error => `- ${error}`).join('\n')}` : ''
  return `The Guild (${current.members.length} members, pacts v${current.pactsVersion}, charter v${current.charterVersion})\n${lines.join('\n')}${errors}`
}

async function commandReload($: EngineInterface): Promise<string> {
  const current = await load($, true)
  const problems = current.errors.length > 0 ? ` Problems: ${current.errors.join('; ')}` : ''
  return `Recompiled ${current.members.length} members, ${current.pacts.length} pacts, ${current.quests.length} quests, ${current.tomes.length} tomes.${problems}`
}

async function commandRate($: EngineInterface, rest: readonly string[]): Promise<string> {
  const [memberId = '', scoreText = '', ...noteWords] = rest
  const current = await ensureGuild($)
  const member = memberOf(current, memberId.toLowerCase())
  if (!member) return `Usage: /guild rate <member> <1-5|+|-> [note]. Members: ${current.members.map(one => one.id).join(', ')}`
  const score = scoreText === '+' ? 5 : scoreText === '-' ? 1 : Number.parseInt(scoreText, 10)
  if (!Number.isInteger(score) || score < 1 || score > 5) return 'The score must be 1-5, + or -.'
  const last = (await read($, recent)).find(one => one.member === member.id)
  await appendLedger($, {
    type: 'rating',
    member: member.id,
    version: member.version,
    score,
    note: noteWords.join(' '),
    ref: last?.ledgerId,
  })
  return `Recorded ${score}/5 for ${member.sigil} ${member.name}${last ? ` (summons "${last.description}")` : ''}.`
}

async function commandRefine($: EngineInterface, rest: readonly string[]): Promise<string> {
  const [target = '', ...concernWords] = rest
  const current = await ensureGuild($)
  const key = target.toLowerCase()
  const isKnown = key === 'pacts' || key === 'charter' || key === 'guildmaster' || memberOf(current, key) !== undefined
  if (!isKnown) return 'Usage: /guild refine <member|guildmaster|pacts|charter> [concern]'
  if (!memberOf(current, 'artificer')) return 'The guild has no artificer member to do refinements.'
  const brief = [
    `Member: ${key}`,
    `Concern: ${concernWords.join(' ') || 'routine review'}`,
    'Context:',
    'The person asked for a refinement through /guild refine. Follow your workshop method and write at most one proposal.',
    'Done when: a proposal file exists in the proposals folder, or your Verdict explains why none is needed.',
  ].join('\n')
  const spawned = await $.agent.spawn({ prompt: brief, subagentType: 'guild:artificer', description: `Refine ${key}` })
  if ('deny' in spawned && typeof spawned.deny === 'string') return `The Artificer could not be summoned: ${spawned.deny}`
  if (spawned.agentId) {
    await trackSummons($, { agentId: spawned.agentId, member: 'artificer', description: `Refine ${key}`, origin: 'engine' })
  }
  return `⚒️ The Artificer is studying ${key}. You'll get a notice when the proposal is ready (/guild proposals).`
}

async function commandProposals($: EngineInterface): Promise<string> {
  const open = await refreshProposals($)
  if (open.length === 0) return 'No open proposals.'
  return open
    .map(
      ({ proposal, path }) =>
        `• ${proposal.id} [${proposal.kind}] ${proposal.target} ${proposal.fromVersion} → ${proposal.toVersion || '(auto)'}: ${proposal.title}\n  ${proposal.rationale.split('\n')[0] ?? ''}\n  ${path}`,
    )
    .join('\n')
}

async function commandAccept($: EngineInterface, rest: readonly string[]): Promise<string> {
  const id = rest[0] ?? ''
  const found = (await readProposals($)).find(one => one.proposal.id === id)
  if (!found) return `No proposal "${id}". See /guild proposals.`
  const { proposal } = found
  if (proposal.status !== 'open') return `Proposal ${id} is already ${proposal.status}.`
  if (!PROPOSAL_FILES.test(proposal.file)) return `Proposal ${id} targets "${proposal.file}", which proposals may not change.`
  const targetPath = join(root, proposal.file)
  if (!(await $.fs.exists(targetPath))) return `The target ${proposal.file} does not exist.`
  const targetRaw = await $.fs.read(targetPath)
  const fromVersion = asText(splitFrontmatter(targetRaw).data.version, '0.0.0')
  const toVersion = proposal.toVersion || bumpVersion(fromVersion, proposal.kind)
  const outcome = applyProposal(targetRaw, { ...proposal, toVersion })
  if (!outcome.isApplied) return `Proposal ${id} was not applied: ${outcome.reason}. Nothing changed.`
  const date = isoDate(await $.clock.now())
  const changelogPath = proposal.file.endsWith('/PROFILE.md')
    ? join(root, proposal.file.replace(/PROFILE\.md$/, 'CHANGELOG.md'))
    : join(root, 'CHANGELOG.md')
  const changelogRaw = (await $.fs.exists(changelogPath)) ? await $.fs.read(changelogPath) : `# Changelog: ${proposal.target}\n`
  await $.fs.write(targetPath, outcome.text)
  await $.fs.write(changelogPath, changelogWithEntry(changelogRaw, toVersion, date, proposal.changelogLine, proposal.id))
  await $.fs.write(found.path, setFrontmatterScalar(setFrontmatterScalar(found.raw, 'status', 'accepted'), 'decided', date))
  await appendLedger($, { type: 'decision', proposal: proposal.id, target: proposal.target, decision: 'accepted', toVersion })
  await load($, true)
  return `Accepted ${id}: ${proposal.file} is now v${toVersion}, the changelog is updated, and the guild is recompiled.`
}

async function commandReject($: EngineInterface, rest: readonly string[]): Promise<string> {
  const [id = '', ...reasonWords] = rest
  const reason = reasonWords.join(' ').trim()
  if (!reason) return 'Usage: /guild reject <id> <reason>. The reason teaches the Artificer.'
  const found = (await readProposals($)).find(one => one.proposal.id === id)
  if (!found) return `No proposal "${id}".`
  const date = isoDate(await $.clock.now())
  const marked = setFrontmatterScalar(
    setFrontmatterScalar(setFrontmatterScalar(found.raw, 'status', 'rejected'), 'decided', date),
    'reason',
    JSON.stringify(reason),
  )
  await $.fs.write(found.path, marked)
  await appendLedger($, { type: 'decision', proposal: id, target: found.proposal.target, decision: 'rejected', reason })
  await refreshProposals($)
  return `Rejected ${id}. The reason is recorded for the Artificer.`
}

// A guild member's tool call: count it and keep its last few lines for the pane.
// A member's skill call, cast or blocked: kept on the summons for its ledger record.
async function recordSpell($: EngineInterface, agentId: string, skill: string, outcome: 'cast' | 'blocked'): Promise<void> {
  const key = outcome === 'cast' ? 'spells' : 'blocked'
  await editSummons($, agentId, one => ({ ...one, [key]: [...new Set([...(one[key] ?? []), skill])] }))
}

async function recordActivity($: EngineInterface, agentId: string, line: string): Promise<void> {
  await editSummons($, agentId, one => ({ ...one, toolCount: (one.toolCount ?? 0) + 1, tools: [...(one.tools ?? []), line].slice(-5) }))
}

// Change one summons at work, in inFlight and in the pane's copy.
async function editSummons($: EngineInterface, agentId: string, change: (one: GuildSummons) => GuildSummons): Promise<void> {
  const held = inFlight.get(agentId)
  if (held) inFlight.set(agentId, change(held))
  await update($, active, list => list.map(one => (one.agentId === agentId ? change(one) : one)))
}

// Moves the pane's clock once a second, only while someone is at work.
async function tickIfActive($: EngineInterface): Promise<void> {
  if ((await read($, active)).length === 0) return
  const now = await $.clock.now()
  await update($, tick, () => now)
}

// A benched member pressed: put a ready-to-fill summons in the prompt.
async function summonFromBench($: EngineInterface, member: GuildMemberCard): Promise<void> {
  const text = `Summon ${member.sigil} ${member.name} (guild:${member.id}).\n${member.briefTemplate}\n`
  const filled = await $.prompt.fill({ text, mode: 'replace' })
  if (!filled.isFilled) $.ui.toast(`guild: type your brief for guild:${member.id} in the prompt`)
}

async function acceptFromPanel($: EngineInterface, id: string): Promise<void> {
  $.ui.toast(await commandAccept($, [id]).catch(error => `guild: accept failed (${errorText(error)})`))
}

async function fillPrompt($: EngineInterface, text: string): Promise<void> {
  await $.prompt.fill({ text, mode: 'replace' })
}

type QuestInput = {
  action?: string
  title?: string
  steps?: { member?: string; task?: string }[]
  step?: number
  status?: string
  note?: string
  outcome?: string
}

// The Guildmaster's quest tool: plan, update a step, or close.
async function handleQuestTool($: EngineInterface, input: QuestInput): Promise<string> {
  const now = await $.clock.now()
  const current = await read($, quest)
  if (input.action === 'plan') {
    const steps = (input.steps ?? []).filter(step => step.member && step.task) as { member: string; task: string }[]
    if (steps.length === 0) throw new Error('a plan needs steps, each { member, task }')
    const known = new Set([...(guild?.members.map(member => member.id) ?? []), 'you', 'guildmaster'])
    const unknown = steps.map(step => step.member.toLowerCase().replace(/^guild:/, '')).filter(id => !known.has(id))
    if (unknown.length > 0) throw new Error(`unknown members: ${unknown.join(', ')}. Use guild ids, "you" or "guildmaster".`)
    const next = startQuest(newId('Q', now), input.title ?? '', steps, now)
    await setQuest($, () => next)
    await appendLedger($, { type: 'quest', event: 'plan', id: next.id, title: next.title, steps: next.steps.map(step => [step.member, step.task]) }).catch(() => undefined)
    void $.ui.open({ id: PANE, title: 'Guild', columns: 56 }).catch(() => undefined)
    return `${questText(next)}
The panel shows it now. Summon members in plan order; steps tick as Scrolls land.`
  }
  if (!isQuestOpen(current)) throw new Error('there is no open quest; start one with action "plan"')
  if (input.action === 'update') {
    const status = input.status as GuildQuestStatus
    if (!STEP_STATUSES.includes(status)) throw new Error(`status must be one of ${STEP_STATUSES.join(', ')}`)
    const next = setStep(current, Number(input.step), status, input.note)
    await setQuest($, () => next)
    return questText(next)
  }
  if (input.action === 'close') {
    const next: GuildQuest = { ...current, closedAt: now, outcome: input.outcome?.trim() || 'done' }
    await setQuest($, () => next)
    const { finished, total } = questProgress(next)
    await appendLedger($, { type: 'quest', event: 'close', id: next.id, title: next.title, finished, total, outcome: next.outcome }).catch(() => undefined)
    return questText(next)
  }
  throw new Error('action must be "plan", "update" or "close"')
}

async function endQuestFromPanel($: EngineInterface): Promise<void> {
  await handleQuestTool($, { action: 'close', outcome: 'ended from the panel' }).catch(() => '')
}

const SUBCOMMANDS = ['open', 'roster', 'reload', 'rate', 'refine', 'proposals', 'accept', 'reject', 'herald', 'spells']
const NO_INDEX = `There is no skill index yet (spells/${INDEX_FILE}). Run /guild spells index to build it.`

// The text of a member's prepared spells, for the Herald's turn report: it runs
// as a fork of the main loop, not as a summons, so nothing else preloads them.
async function preparedText($: EngineInterface, current: Guild, member: Member): Promise<string> {
  const made = new Map(current.guildSpells.map(spell => [spell.name, spell.body]))
  const parts: string[] = []
  for (const spell of member.prepared) {
    const path = skillPaths.get(spell)
    const body = made.get(spell) ?? (path ? skillBody(await $.fs.read(path).catch(() => '')) : '')
    if (body) parts.push(`### Prepared spell: ${spell}\n${body}`)
  }
  return parts.join('\n\n')
}

// /guild spells index: the intentional skill task. Scans the disk for installed
// skills and rewrites spells/index.json, the only thing loading reads about them.
async function commandSpellsIndex($: EngineInterface): Promise<string> {
  const claudeDir = root.slice(0, root.lastIndexOf('/'))
  const skills = await scanSkills(fsOf($), claudeDir)
  const indexedAt = new Date(await $.clock.now()).toISOString()
  await $.fs.write(join(root, 'spells', INDEX_FILE), indexText({ indexedAt, skills }))
  const current = await load($, true)
  const problems = current.errors.filter(error => /spell/.test(error))
  return `Indexed ${skills.length} installed skills into spells/${INDEX_FILE}.${problems.length > 0 ? `\nProblems:\n${problems.map(problem => `- ${problem}`).join('\n')}` : ''}`
}

// /guild spells [member|unclaimed|review|index]
async function commandSpells($: EngineInterface, rest: readonly string[]): Promise<string> {
  const [what = ''] = rest.map(word => word.toLowerCase())
  if (what === 'index') return commandSpellsIndex($)
  const current = await load($, true)
  const holders = spellHolders(current)
  const installed = installedNames(current)
  if (what === 'unclaimed') {
    if (!installed) return NO_INDEX
    const loose = unclaimed(installed, holders, current.registry, aliases)
    return loose.length === 0
      ? `Every indexed skill (${installed.length}) is held, person-only or retired.`
      : `${loose.length} installed skill(s) nobody holds and the registry hasn't ruled on:\n${loose.map(skill => `- ${skill}`).join('\n')}\nRun /guild spells review to have the Artificer propose where they go.`
  }
  if (what === 'review') {
    if (!installed) return NO_INDEX
    const loose = unclaimed(installed, holders, current.registry, aliases)
    const brief = [
      'Member: all members and the guildmaster',
      `Concern: Spellbook review. Compare every installed skill against the spellbooks and the registry (${join(root, 'spells', 'REGISTRY.md')}). Propose: spells to add, move or drop per member (one proposal per member), new guild spells to forge under spells/<name>/SKILL.md (draft them inside a proposal), refinements to existing guild spells, and registry changes (retire, person-only). Use the ledger's \`spells\` and \`spellsBlocked\` fields as evidence of what members reach for.`,
      `Installed skills (${installed.length}, indexed ${current.spellIndex?.indexedAt || 'at an unknown time'}): ${installed.join(', ') || '(none)'}`,
      `Unclaimed: ${loose.join(', ') || '(none)'}`,
    ].join('\n')
    const spawned = await $.agent.spawn({ prompt: brief, subagentType: 'guild:artificer', description: 'Spellbook review' })
    if (spawned.agentId) await trackSummons($, { agentId: spawned.agentId, member: 'artificer', description: 'Spellbook review', origin: 'engine' })
    return '⚒️ The Artificer is reviewing the spellbooks. You will get a notice when its proposals are ready (/guild proposals).'
  }
  const pick = what ? holders.filter(holder => holder.id === what) : holders
  if (pick.length === 0) return `No member "${what}". Try: ${holders.map(holder => holder.id).join(', ')}, unclaimed, review`
  const prepared = (id: string) => current.members.find(member => member.id === id)?.prepared ?? []
  const lines = pick.map(
    holder =>
      `${holder.name}: ${holder.spells.map(spell => (prepared(holder.id).includes(spell) ? `${spell} (prepared)` : spell)).join(', ') || '(none)'}`,
  )
  const problems = current.errors.filter(error => /spell/.test(error))
  const indexed = current.spellIndex ? `${current.spellIndex.skills.length} skills indexed ${current.spellIndex.indexedAt}` : 'no skill index (/guild spells index)'
  return `${lines.join('\n')}${problems.length > 0 ? `\nProblems:\n${problems.map(problem => `- ${problem}`).join('\n')}` : ''}\nRetired: ${current.registry.retired.length} · person-only: ${current.registry.personOnly.length} · guild spells: ${current.guildSpells.map(spell => spell.name).join(', ') || '(none)'} · ${indexed}`
}

// /guild herald: a summary now. `last` shows the last one; `on`/`off` sets the
// report after each turn that did work.
function commandHerald($: EngineInterface, rest: readonly string[]): string {
  const [mode = ''] = rest.map(word => word.toLowerCase())
  if (mode === 'on' || mode === 'off') {
    isHeraldOn = mode === 'on'
    return `📯 The Herald's turn report is ${mode} for this session.`
  }
  if (mode === 'last') return lastHerald || '📯 The Herald has not reported yet this session.'
  scheduleHerald($, 'asked')
  return '📯 The Herald is writing a summary. It appears here when it is ready.'
}

// The Herald writes off the turn's path: the turn ends at once and the report
// lands in the transcript when the fork answers, however long that takes.
function scheduleHerald($: EngineInterface, trigger: HeraldTrigger): void {
  if (isHeraldWriting) {
    heraldAgain = heraldAgain === 'asked' ? 'asked' : trigger
    return
  }
  isHeraldWriting = true
  $.clock.after(0, () => void writeHerald($, trigger))
}

async function writeHerald($: EngineInterface, trigger: HeraldTrigger): Promise<void> {
  try {
    const report = await heraldReport($, trigger)
    if (report) $.ui.log(report)
  } catch (error) {
    if (trigger === 'asked') $.ui.log(`📯 The Herald could not write a summary (${errorText(error)}).`)
  } finally {
    isHeraldWriting = false
    const again = heraldAgain
    heraldAgain = undefined
    if (again) scheduleHerald($, again)
  }
}

// Fork the transcript as the Herald and return its report; undefined when there
// is nothing to report.
async function heraldReport($: EngineInterface, trigger: HeraldTrigger): Promise<string | undefined> {
  const current = await ensureGuild($)
  const herald = memberOf(current, 'herald')
  if (!herald) {
    if (trigger === 'asked') throw new Error('the guild has no herald member')
    return undefined
  }
  const prompt = heraldPrompt(herald.body, lastAnswer, lastHerald, await preparedText($, current, herald), trigger === 'asked')
  const reply = await $.model.fork({ prompt })
  if (!reply.isAnswered) {
    if (trigger === 'asked') throw new Error(reply.reason)
    return undefined
  }
  const report = cleanReport(reply.text)
  if (!report) return undefined
  lastHerald = report
  const asks = askCount(report)
  $.ui.status(asks > 0 ? `📯 ${asks} need${asks === 1 ? 's' : ''} you` : undefined)
  return report
}

async function runSubcommand($: EngineInterface, sub: string, rest: readonly string[]): Promise<string> {
  switch (sub) {
    case 'open':
      return commandOpen($)
    case 'roster':
      return commandRoster($)
    case 'reload':
      return commandReload($)
    case 'rate':
      return commandRate($, rest)
    case 'refine':
      return commandRefine($, rest)
    case 'proposals':
      return commandProposals($)
    case 'accept':
      return commandAccept($, rest)
    case 'reject':
      return commandReject($, rest)
    case 'herald':
      return commandHerald($, rest)
    case 'spells':
      return commandSpells($, rest)
    default:
      return `Unknown /guild subcommand "${sub}". Try: ${SUBCOMMANDS.join(', ')}`
  }
}

export const register: Register = (on, options) => {
  const settings = options as Options
  root = (settings.guildPath ?? root).replace(/\\/g, '/').replace(/\/$/, '')
  isStrict = settings.strictBriefs !== false
  isHeraldOn = settings.heraldReport !== false

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'guild',
      description: 'Open the Guild panel, or manage it: roster, reload, rate, refine, proposals, accept, reject, herald, spells',
      argumentHint: '[roster|reload|rate|refine|proposals|accept|reject|herald [last|on|off]|spells [member|unclaimed|review|index]]',
    })
    // A module reload empties the module's maps but keeps $.state: refill them.
    for (const one of await read($, active)) if (!inFlight.has(one.agentId)) inFlight.set(one.agentId, one)
    lastQuest ??= await read($, quest)
    $.clock.every(20_000, () => pollForChanges($))
    $.clock.every(1000, () => tickIfActive($))
    await $.tool.register({
      name: 'quest',
      isDeferred: false,
      description:
        'Guild quests: declare a multi-member plan so the person can watch it in the Guild panel. action "plan" (title, steps: [{ member, task }], member is a guild id or "you"), "update" (step, status: done|skipped|failed|active|pending, note), "close" (outcome). Steps tick automatically as members are summoned and their Scrolls land.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['plan', 'update', 'close'] },
          title: { type: 'string', description: 'Short quest name, 5 words max' },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: { member: { type: 'string' }, task: { type: 'string', description: '6 words max' } },
              required: ['member', 'task'],
            },
          },
          step: { type: 'number' },
          status: { type: 'string', enum: ['pending', 'active', 'done', 'failed', 'skipped'] },
          note: { type: 'string' },
          outcome: { type: 'string' },
        },
        required: ['action'],
      },
    })
    // The startup the engine awaits ends here; the guild loads after it.
    $.clock.after(0, () => void startGuild($))
    return next(e)
  })

  // Startup and compaction keep $.state, so only the three resets reload, after the reset.
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    $.clock.after(0, () => void restoreState($).catch(error => $.ui.toast(`guild: could not restore (${errorText(error)})`)))
    return next(e)
  }).catch(($, e, next) => next(e))

  // The hooks below read the guild as loaded so far and never wait for a load.
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const current = guild
    if (!current || current.members.length === 0) return composed
    return {
      ...composed,
      sections: [...composed.sections, { id: 'guild:guildmaster', text: guildmasterSection(current), scope: 'session' as const }],
    }
  })

  on('agent.offer', async ($, e, next) => {
    if (!e.agent.startsWith('guild:')) return next(e)
    const isMember = guild?.members.some(member => agentType(member) === e.agent) ?? true
    return isMember ? next(e) : { isOffered: false }
  }).catch(($, e, next) => (next.called || !e.agent.startsWith('guild:') ? next(e) : { isOffered: false }))

  on('agent.spawn', async ($, e, next) => {
    if (!e.subagentType.startsWith('guild:')) return next(e)
    const current = guild
    if (!current) return { deny: 'The guild is still loading. Summon again in a moment.' }
    const id = e.subagentType.slice('guild:'.length)
    const member = memberOf(current, id)
    if (!member) return { deny: `There is no guild member "${id}". Members: ${current.members.map(one => one.id).join(', ')}.` }
    const missing = missingBriefFields(e.prompt, member.accepts)
    if (isStrict && missing.length > 0) {
      return {
        deny: `${member.sigil} ${member.name}'s brief is missing ${missing.map(field => `"${field}:"`).join(', ')}. Write each as its own labelled line (${member.accepts.map(field => `${field.name}:`).join(' ')}), then summon again.`,
      }
    }
    const spawned = await next(e)
    if (spawned.agentId && !inFlight.has(spawned.agentId)) {
      await trackSummons($, { agentId: spawned.agentId, member: id, description: e.description, tome: briefTome(e.prompt) })
    }
    return spawned
  }).catch(($, e, next) =>
    next.called || !e.subagentType.startsWith('guild:') ? next(e) : { deny: 'The guild could not check this summons, so it was not started.' },
  )

  on('turn.start', async ($, e, next) => {
    mainToolCalls = 0
    await update($, isThinking, () => true)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) {
      await update($, isThinking, () => false)
      const didWork = mainToolCalls > 0
      mainToolCalls = 0
      lastAnswer = e.answer
      // Work completed: the Herald reports after the turn, never holding it.
      if (isHeraldOn && didWork && e.reason === 'answer') scheduleHerald($, 'turn')
      return result
    }
    const agentId = e.agentId
    const summons = inFlight.get(agentId) ?? (await read($, active)).find(one => one.agentId === agentId)
    const tokens = e.usage
      ? e.usage.input_tokens + e.usage.output_tokens + (e.usage.cache_read_input_tokens ?? 0) + (e.usage.cache_creation_input_tokens ?? 0)
      : undefined
    if (summons) await settle($, summons, e.answer, e.isAborted, e.durationMs, tokens)
    return result
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId === undefined) mainToolCalls += 1
    if (String(e.tool) === QUEST_TOOL) {
      try {
        return { result: await handleQuestTool($, e as unknown as QuestInput) }
      } catch (error) {
        return { deny: `quest: ${errorText(error)}` }
      }
    }
    if (e.agentId === undefined) return next(e)
    const agentId = e.agentId
    const id = inFlight.get(agentId)?.member ?? (await read($, active)).find(one => one.agentId === agentId)?.member
    if (id === undefined) return next(e)
    await recordActivity($, agentId, toolSummary(String(e.tool), e)).catch(() => undefined)
    if (e.tool === 'Skill') {
      const current = guild
      // Not loaded: the .catch below blocks the skill rather than let it through unchecked.
      if (!current) throw new Error('the guild is not loaded')
      const caster = memberOf(current, id)
      const skill = String(e.skill)
      if (caster && !holds(caster.spells, skill, aliases)) {
        await recordSpell($, agentId, skill, 'blocked').catch(() => undefined)
        return { deny: spellRefusal(`${caster.sigil} ${caster.name}`, skill, holdersOf(spellHolders(current), skill, aliases), current.registry) }
      }
      await recordSpell($, agentId, skill, 'cast').catch(() => undefined)
      return next(e)
    }
    if (!WRITE_TOOLS.has(String(e.tool))) return next(e)
    const member = guild ? memberOf(guild, id) : undefined
    const refusal = guardWrite(root, member?.writes ?? [], writtenPath(e))
    return refusal ? { deny: refusal } : next(e)
  }).catch(($, e, next) =>
    next.called
      ? next(e)
      : e.agentId !== undefined && WRITE_TOOLS.has(String(e.tool)) && guardWrite(root, [], writtenPath(e))
        ? { deny: 'The guild guard could not verify this write to the guild folder.' }
        : e.agentId !== undefined && e.tool === 'Skill' && inFlight.has(e.agentId)
          ? { deny: 'The guild could not check this skill against your spellbook, so it is blocked. Name `guildmaster` in your Handoff.' }
          : next(e),
  )

  on('command.run', { command: 'guild' }, async ($, e) => {
    const [sub = 'open', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    try {
      return { text: await runSubcommand($, sub.toLowerCase(), rest) }
    } catch (error) {
      return { text: `guild ${sub} failed: ${errorText(error)}` }
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const working = await read($, active)
    const plan = await read($, quest)
    const planOpen = isQuestOpen(plan) ? plan : undefined
    if (e.props.hasSurvey || (working.length === 0 && !planOpen)) return next(e)
    const members = await read($, roster)
    const progress = planOpen ? questProgress(planOpen) : undefined
    const stepText = progress
      ? `${progress.current ? `Step ${progress.current.id}/${progress.total}` : `${progress.finished}/${progress.total}`} · ${Math.round(progress.fraction * 100)}%`
      : ''
    const youText = progress?.current?.member === 'you' ? ' · waiting on you' : ''
    const byId = new Map(members.map(member => [member.id, member]))
    const now = Math.max(await read($, tick), ...working.map(one => one.startedAt))
    const longest = working.length > 0 ? Math.max(...working.map(one => now - one.startedAt)) : 0
    const names = working
      .map(one => byId.get(one.member)?.name.replace(/^The /, '') ?? one.member)
      .join(', ')
    if (e.surface === 'desktop') {
      const { Box, Text, Button, Svg } = $.ui.resolve(e)
      return (
        <Box flexDirection="row" gap={1} alignItems="center">
          <Text bold>{planOpen ? `⚜ ${planOpen.title}` : '⚜ Guild'}</Text>
          {progress && (
            <Svg
              source={barSvg(120, memberHex('gold'), progress.fraction, false)}
              alt={stepText}
              width={120}
              height={4}
            />
          )}
          {progress && (
            <Text color={youText ? 'warning' : undefined} dimColor={!youText}>
              {stepText}
              {youText}
            </Text>
          )}
          {working.slice(0, 6).map(one => (
            <Svg
              key={`band-${one.agentId}`}
              source={iconSvg(byId.get(one.member)?.sigil ?? '✦', memberHex(byId.get(one.member)?.color ?? 'gray'), true)}
              alt={byId.get(one.member)?.name ?? one.member}
              width={22}
              height={22}
              isInteractive
            />
          ))}
          {working.length > 0 && (
            <Text dimColor wrap="truncate-end">
              {planOpen ? `×${working.length}` : `${names} at work`} · {formatElapsed(longest)}
            </Text>
          )}
          <Button key="band-open" plain dimColor label="Open panel" onPress={() => void $.ui.open({ id: PANE, title: 'Guild', columns: 56 }).catch(() => undefined)} />
        </Box>
      )
    }
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" gap={1}>
        <Text bold>{planOpen ? `⚜ ${planOpen.title}` : '⚜ Guild'}</Text>
        {progress && (
          <Text color={youText ? 'warning' : undefined} dimColor={!youText}>
            {stepText}
            {youText}
          </Text>
        )}
        {working.length > 0 && <Text color="warning">●</Text>}
        {working.length > 0 && (
          <Text dimColor wrap="truncate-end">
            {names} at work · {formatElapsed(longest)}
          </Text>
        )}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    if (e.surface === 'desktop') {
      const { Box, Text, Button, Svg } = $.ui.resolve(e)
      const columns = Math.max(30, e.props.bodyColumns || 48)
      const members = await read($, roster)
      const working = await read($, active)
      const results = await read($, recent)
      const open = await read($, proposals)
      const errors = await read($, loadErrors)
      const openCard = await read($, expanded)
      const folded = new Set(await read($, collapsed))
      const now = Math.max(await read($, tick), ...working.map(one => one.startedAt))
      const byId = new Map(members.map(member => [member.id, member]))
      const busyIds = new Set(working.map(one => one.member))
      const lastOf = (id: string) => results.find(one => one.member === id)
      const idle = members.filter(member => !busyIds.has(member.id))
      const attention = idle.filter(member => lastOf(member.id)?.isKept === false)
      const ready = idle.filter(member => lastOf(member.id)?.isKept !== false)
      const barPx = Math.max(80, Math.round(columns * 7.4) - 56)
      const tokensTotal = results.reduce((sum, one) => sum + (one.tokens ?? 0), 0)
      const keptShare =
        results.length > 0 ? Math.round((100 * results.filter(one => one.isKept).length) / results.length) : undefined
      const toggle = (name: string) =>
        void update($, collapsed, list => (list.includes(name) ? list.filter(one => one !== name) : [...list, name]))

      const gm = await read($, leader)
      const plan = await read($, quest)
      const thinking = await read($, isThinking)
      const gmHex = memberHex(gm?.color ?? 'gold')
      const planOpen = isQuestOpen(plan) ? plan : undefined
      const progress = planOpen ? questProgress(planOpen) : undefined
      const waitingOnYou = progress?.current?.member === 'you'
      const gmStatus = waitingOnYou
        ? 'waiting on you'
        : working.length > 0
          ? `directing ${working.length}`
          : thinking
            ? 'thinking'
            : planOpen
              ? `next: step ${progress?.current?.id ?? '–'}`
              : ''
      const stepMark: Record<GuildQuestStatus, string> = { pending: '○', active: '◐', done: '✓', failed: '✗', skipped: '–' }

      const leaderCard = (
        <Box key="leader" flexDirection="row" gap={1} hover={{ backgroundColor: 'subtle', scope: 'leader' }}>
          <Svg
            source={iconSvg(gm?.sigil ?? '👑', gmHex, thinking || working.length > 0)}
            alt={gm?.name ?? 'The Guildmaster'}
            width={40}
            height={40}
            isInteractive
          />
          <Box flexDirection="column" flexGrow={1}>
            <Box flexDirection="row" justifyContent="space-between">
              <Text bold>{gm?.name ?? 'The Guildmaster'}</Text>
              <Text color={waitingOnYou ? 'warning' : gmHex} dimColor={!waitingOnYou && working.length === 0 && !thinking}>
                {gmStatus}
              </Text>
            </Box>
            {planOpen && progress ? (
              <Box flexDirection="column">
                <Box flexDirection="row" justifyContent="space-between">
                  <Text wrap="truncate-end">{planOpen.title}</Text>
                  <Text dimColor>
                    {progress.finished}/{progress.total}
                  </Text>
                </Box>
                <Svg
                  source={barSvg(barPx - 8, gmHex, progress.fraction, false)}
                  alt={`${progress.finished} of ${progress.total} steps`}
                  width={barPx - 8}
                  height={4}
                />
                {planOpen.steps.map(step => {
                  const owner = byId.get(step.member)
                  const isCurrent = progress.current?.id === step.id
                  const color =
                    step.status === 'failed'
                      ? 'error'
                      : step.status === 'active'
                        ? memberHex(owner?.color ?? 'gray')
                        : isCurrent && step.member === 'you'
                          ? 'warning'
                          : undefined
                  return (
                    <Box key={`step-${planOpen.id}-${step.id}`} flexDirection="row" gap={1} alignItems="center">
                      {owner ? (
                        <Svg
                          source={iconSvg(owner.sigil, memberHex(owner.color), step.status === 'active')}
                          alt={owner.name}
                          width={14}
                          height={14}
                          isInteractive={step.status === 'active'}
                        />
                      ) : (
                        <Text dimColor>{step.member === 'you' ? '👤' : '👑'}</Text>
                      )}
                      <Text
                        color={color}
                        dimColor={color === undefined && step.status !== 'pending'}
                        bold={step.status === 'active' || (isCurrent && step.member === 'you')}
                        strikethrough={step.status === 'skipped'}
                        wrap="truncate-end"
                      >
                        {stepMark[step.status]} {step.task}
                      </Text>
                    </Box>
                  )
                })}
                <Box display="none" hover={{ display: 'flex', scope: 'leader' }}>
                  <Button key="quest-end" plain dimColor label="End quest" onPress={() => void endQuestFromPanel($)} />
                </Box>
              </Box>
            ) : (
              <Box flexDirection="column">
                <Box flexDirection="row" gap={1}>
                  {(gm?.skills ?? []).map(skill => (
                    <Text key={`gm-chip-${skill}`} dimColor>
                      {skill}
                    </Text>
                  ))}
                </Box>
                <Text dimColor italic wrap="truncate-end">
                  {plan?.closedAt ? `Last quest: ${plan.title} · ${plan.outcome ?? 'done'}` : (gm?.tagline ?? '')}
                </Text>
              </Box>
            )}
          </Box>
        </Box>
      )

      const stat = (label: string, value: string) => (
        <Box key={`stat-${label}`} flexDirection="column" flexGrow={1}>
          <Text bold>{value}</Text>
          <Text dimColor>{label}</Text>
        </Box>
      )

      const section = (name: string, label: string, count: number) => (
        <Box key={`head-${name}`} flexDirection="row" justifyContent="space-between" marginTop={1}>
          <Text dimColor>
            {label} {count}
          </Text>
          <Button
            key={`fold-${name}`}
            plain
            dimColor
            label={folded.has(name) ? 'Show' : 'Hide'}
            onPress={() => toggle(name)}
          />
        </Box>
      )

      const chips = (member: GuildMemberCard) => (
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          {member.skills.map(skill => (
            <Text key={`chip-${member.id}-${skill}`} dimColor>
              {skill}
            </Text>
          ))}
        </Box>
      )

      // One card, one anatomy (design/card.md): icon, name ↔ status, chips ↔ hover action.
      const idleCard = (member: GuildMemberCard) => {
        const last = lastOf(member.id)
        const isBreach = last?.isKept === false
        return (
          <Box
            key={`card-${member.id}`}
            flexDirection="row"
            gap={1}
            marginTop={1}
            hover={{ backgroundColor: 'subtle', scope: `card-${member.id}` }}
          >
            <Svg source={iconSvg(member.sigil, memberHex(member.color), false)} alt={member.name} width={32} height={32} />
            <Box flexDirection="column" flexGrow={1}>
              <Box flexDirection="row" justifyContent="space-between">
                <Text bold>{member.name}</Text>
                {isBreach && last && (
                  <Text color="error" wrap="truncate-end">
                    ✗ {last.failed[0] ?? 'breach'}
                  </Text>
                )}
              </Box>
              <Box flexDirection="row" justifyContent="space-between">
                {chips(member)}
                <Box display="none" hover={{ display: 'flex', scope: `card-${member.id}` }}>
                  <Button key={`summon-${member.id}`} plain label="Summon →" onPress={() => void summonFromBench($, member)} />
                </Box>
              </Box>
              <Box display="none" hover={{ display: 'flex', scope: `card-${member.id}` }}>
                <Text dimColor italic wrap="truncate-end">
                  {member.tagline}
                  {isBreach && last ? ` · last: ${last.description}` : ''}
                </Text>
              </Box>
            </Box>
          </Box>
        )
      }

      const workCard = (summons: GuildSummons) => {
        const member = byId.get(summons.member)
        const hex = memberHex(member?.color ?? 'gray')
        const isOpen = openCard === summons.agentId
        const tools = summons.tools ?? []
        const name = member?.name ?? summons.member
        return (
          <Box
            key={`work-${summons.agentId}`}
            flexDirection="row"
            gap={1}
            marginTop={1}
            hover={{ backgroundColor: 'subtle', scope: `work-${summons.agentId}` }}
          >
            <Svg source={iconSvg(member?.sigil ?? '✦', hex, true)} alt={name} width={32} height={32} isInteractive />
            <Box flexDirection="column" flexGrow={1}>
              <Box flexDirection="row" justifyContent="space-between">
                <Text bold>{name}</Text>
                <Text color={hex}>{formatElapsed(now - summons.startedAt)}</Text>
              </Box>
              <Box flexDirection="row" justifyContent="space-between">
                <Text wrap="truncate-end">{summons.description}</Text>
                <Text dimColor>{summons.toolCount ?? 0} steps</Text>
              </Box>
              <Svg source={barSvg(barPx, hex, 0, true)} alt="at work" width={barPx} height={4} isInteractive />
              <Box flexDirection="row" justifyContent="space-between">
                <Text dimColor wrap="truncate-end">
                  {tools[tools.length - 1] ?? 'reading the brief'}
                </Text>
                <Box display="none" hover={{ display: 'flex', scope: `work-${summons.agentId}` }}>
                  <Button
                    key={`open-${summons.agentId}`}
                    plain
                    label={isOpen ? 'Fewer' : 'Steps'}
                    onPress={() =>
                      void update($, expanded, current => (current === summons.agentId ? '' : summons.agentId))
                    }
                  />
                </Box>
              </Box>
              {isOpen &&
                tools.slice(0, -1).map((line, at) => (
                  <Text key={`step-${summons.agentId}-${at}`} dimColor wrap="truncate-end">
                    ✓ {line}
                  </Text>
                ))}
            </Box>
          </Box>
        )
      }

      return (
        <Box flexDirection="column" paddingX={1}>
          {leaderCard}
          <Box flexDirection="row" gap={2} marginTop={1}>
            {stat('at work', `${working.length}/${members.length}`)}
            {stat('tokens', formatTokens(tokensTotal))}
            {stat('pacts kept', keptShare === undefined ? '–' : `${keptShare}%`)}
          </Box>

          {working.length > 0 && section('active', 'At work', working.length)}
          {!folded.has('active') && working.map(workCard)}

          {attention.length > 0 && section('attention', 'Needs attention', attention.length)}
          {!folded.has('attention') && attention.map(idleCard)}

          {section('ready', working.length === 0 && attention.length === 0 ? 'The guild' : 'Ready', ready.length)}
          {!folded.has('ready') && ready.map(idleCard)}

          {open.length > 0 && section('proposals', 'Proposals', open.length)}
          {!folded.has('proposals') &&
            open.map(proposal => (
              <Box
                key={`proposal-${proposal.id}`}
                flexDirection="column"
                marginTop={1}
                hover={{ backgroundColor: 'subtle', scope: `proposal-${proposal.id}` }}
              >
                <Box flexDirection="row" justifyContent="space-between">
                  <Text bold wrap="truncate-end">
                    {proposal.title}
                  </Text>
                  <Button
                    key={`accept-${proposal.id}`}
                    label="Accept"
                    variant="primary"
                    onPress={() => void acceptFromPanel($, proposal.id)}
                  />
                </Box>
                <Box flexDirection="row" justifyContent="space-between">
                  <Text dimColor wrap="truncate-end">
                    {byId.get(proposal.target)?.name ?? proposal.target} · v{proposal.toVersion || '?'} · {proposal.kind}
                  </Text>
                  <Box display="none" hover={{ display: 'flex', scope: `proposal-${proposal.id}` }} gap={1}>
                    <Button
                      key={`review-${proposal.id}`}
                      plain
                      label="Review"
                      onPress={() =>
                        void fillPrompt($, `Review guild proposal ${proposal.id}: show its rationale, evidence and diff.`)
                      }
                    />
                    <Button
                      key={`reject-${proposal.id}`}
                      plain
                      label="Reject"
                      onPress={() => void fillPrompt($, `/guild reject ${proposal.id} `)}
                    />
                  </Box>
                </Box>
              </Box>
            ))}

          {errors.length > 0 && section('errors', 'Profile problems', errors.length)}
          {!folded.has('errors') &&
            errors.map((error, at) => (
              <Text key={`error-${at}`} color="error" wrap="truncate-end">
                {error}
              </Text>
            ))}
        </Box>
      )
    }

    const { Box, Text, Button } = $.ui.resolve(e)
    const width = Math.max(24, e.props.bodyColumns || 40)
    const plan = await read($, quest)
    const members = await read($, roster)
    const working = await read($, active)
    const results = await read($, recent)
    const open = await read($, proposals)
    const errors = await read($, loadErrors)
    const openCard = await read($, expanded)
    const now = Math.max(await read($, tick), ...working.map(one => one.startedAt))
    const step = Math.floor(now / 1000)
    const byId = new Map(members.map(member => [member.id, member]))
    const busyIds = new Set(working.map(one => one.member))
    const bench = members.filter(member => !busyIds.has(member.id))
    const barWidth = Math.max(6, width - 4)

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold>⚜ The Guild</Text>
          <Text dimColor>
            {members.length} sworn{open.length > 0 ? ` · ${open.length} proposal${open.length > 1 ? 's' : ''}` : ''}
          </Text>
        </Box>
        {isQuestOpen(plan) && (
          <Box flexDirection="column" marginTop={1}>
            <Text>
              <Text bold>👑 {plan.title}</Text>
              <Text dimColor>
                {' '}
                {questProgress(plan).finished}/{questProgress(plan).total}
              </Text>
            </Text>
            {plan.steps.map(step => (
              <Text
                key={`tstep-${step.id}`}
                dimColor={step.status !== 'active'}
                color={step.status === 'failed' ? 'error' : undefined}
                wrap="truncate-end"
              >
                {{ pending: '○', active: '◐', done: '✓', failed: '✗', skipped: '–' }[step.status]} {step.member}: {step.task}
              </Text>
            ))}
          </Box>
        )}
        <Text> </Text>
        <Text bold>
          At work <Text dimColor>{working.length}</Text>
        </Text>
        {working.length === 0 && <Text dimColor>Nobody is at work. Pick someone from the bench.</Text>}
        {working.map(summons => {
          const member = byId.get(summons.member)
          const hex = memberHex(member?.color ?? 'gray')
          const isOpen = openCard === summons.agentId
          const bar = activityBar(barWidth, step)
          const tools = summons.tools ?? []
          const latest = tools[tools.length - 1]
          return (
            <Box key={`card-${summons.agentId}`} flexDirection="column" borderStyle="round" borderColor={hex} paddingX={1}>
              <Box flexDirection="row" justifyContent="space-between">
                <Button
                  key={`open-${summons.agentId}`}
                  plain
                  label={`${member?.sigil ?? '✦'} ${member?.name ?? summons.member}`}
                  onPress={() => void update($, expanded, current => (current === summons.agentId ? '' : summons.agentId))}
                />
                <Text>
                  <Text color="success">{step % 2 === 0 ? '●' : '○'}</Text>
                  <Text dimColor> {formatElapsed(now - summons.startedAt)}</Text>
                </Text>
              </Box>
              <Text dimColor wrap="truncate-end">
                {summons.description}
              </Text>
              <Text>
                <Text dimColor>{bar.before}</Text>
                <Text color={hex}>{bar.lit}</Text>
                <Text dimColor>{bar.after}</Text>
              </Text>
              {!isOpen && (
                <Text dimColor wrap="truncate-end">
                  › {latest ?? 'reading the brief…'}
                </Text>
              )}
              {isOpen &&
                tools.map((line, at) => (
                  <Text key={`tool-${summons.agentId}-${at}`} dimColor={at < tools.length - 1} wrap="truncate-end">
                    {at < tools.length - 1 ? '✓' : '›'} {line}
                  </Text>
                ))}
              {isOpen && (
                <Text dimColor wrap="truncate-end">
                  {summons.toolCount ?? 0} tool calls{summons.tome ? ` · tome ${summons.tome}` : ''}
                  {summons.origin === 'engine' ? ' · started by /guild' : ''}
                </Text>
              )}
            </Box>
          )
        })}
        <Text> </Text>
        <Text bold>
          On the bench <Text dimColor>{bench.length}</Text>
        </Text>
        {bench.map(member => {
          const last = results.find(one => one.member === member.id)
          const room = Math.max(8, width - member.name.length - 6)
          return (
            <Box key={`bench-${member.id}`} flexDirection="column">
              <Box flexDirection="row" justifyContent="space-between">
                <Button
                  key={`summon-${member.id}`}
                  plain
                  label={`${member.sigil} ${member.name}`}
                  onPress={() => void summonFromBench($, member)}
                />
                {last ? (
                  <Text color={last.isKept ? 'success' : 'error'} wrap="truncate-end">
                    {last.isKept ? '✓' : '✗'} {truncate(last.isKept ? last.description : last.failed.join(', '), room)}
                  </Text>
                ) : (
                  <Text dimColor>ready</Text>
                )}
              </Box>
              <Text dimColor wrap="truncate-end">
                {'   '}
                {member.title}
              </Text>
            </Box>
          )
        })}
        {open.length > 0 && <Text> </Text>}
        {open.length > 0 && (
          <Text bold>
            Proposals <Text dimColor>{open.length}</Text>
          </Text>
        )}
        {open.map(proposal => (
          <Box key={`proposal-${proposal.id}`} flexDirection="column">
            <Text wrap="truncate-end">
              ⚒️ {proposal.target} → v{proposal.toVersion || '?'} <Text dimColor>({proposal.kind})</Text>
            </Text>
            <Text dimColor wrap="truncate-end">
              {'   '}
              {proposal.title}
            </Text>
            <Box flexDirection="row" gap={1}>
              <Button key={`accept-${proposal.id}`} label="Accept" variant="primary" onPress={() => void acceptFromPanel($, proposal.id)} />
              <Button
                key={`review-${proposal.id}`}
                label="Review"
                onPress={() => void fillPrompt($, `Review guild proposal ${proposal.id}: show its rationale, evidence and diff.`)}
              />
              <Button key={`reject-${proposal.id}`} label="Reject" onPress={() => void fillPrompt($, `/guild reject ${proposal.id} `)} />
            </Box>
          </Box>
        ))}
        {errors.length > 0 && <Text> </Text>}
        {errors.map((error, at) => (
          <Text key={`error-${at}`} color="error" wrap="truncate-end">
            ⚠ {error}
          </Text>
        ))}
      </Box>
    )
  })
}
