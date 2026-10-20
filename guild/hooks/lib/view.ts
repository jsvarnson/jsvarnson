// What the terminal pane and band show, worked out from the guild's state:
// the sections of design/card.md (At work, Needs attention, Ready), the
// Guildmaster card with its quest, proposals and profile problems, and the
// band's segments. Pure functions; register.tsx draws the result.

import type { GuildLeader, GuildMemberCard, GuildProposalCard, GuildQuest, GuildQuestStatus, GuildResult, GuildSummons } from '../../types'
import { formatElapsed } from './activity'
import { isQuestOpen, questProgress } from './quest'
import { cellWidth, clip } from './width'

export type Tone = 'ink' | 'bold' | 'dim' | 'warning' | 'error'

export type PaneInput = {
  roster: readonly GuildMemberCard[]
  leader: GuildLeader | null
  active: readonly GuildSummons[]
  recent: readonly GuildResult[]
  proposals: readonly GuildProposalCard[]
  loadErrors: readonly string[]
  quest: GuildQuest | null
  now: number
  isThinking: boolean
}

export type QuestStepView = { id: number; mark: string; sigil: string; task: string; tone: Tone; isSkipped: boolean; note?: string }
export type QuestView = { title: string; finished: number; total: number; fraction: number; steps: QuestStepView[] }

export type WorkView = {
  agentId: string
  member: string
  sigil: string
  name: string
  color: string
  chips: string
  elapsed: string
  steps: number
  task: string
  tools: string[]
  tome?: string
  origin?: string
}

export type MemberView = { id: string; sigil: string; name: string; chips: string; card: GuildMemberCard }
export type AttentionView = MemberView & { task: string; failed: string }

export type PaneView = {
  title: string
  summary: string
  gm: { sigil: string; name: string; chips: string; status: string; statusTone: Tone; quest?: QuestView; lastQuest?: string }
  atWork: WorkView[]
  attention: AttentionView[]
  ready: MemberView[]
  proposals: GuildProposalCard[]
  moreProposals: number
  problems: string[]
  moreProblems: number
}

export const MAX_PROPOSALS = 5
export const MAX_PROBLEMS = 3

const MARK: Record<GuildQuestStatus, string> = { pending: '○', active: '◐', done: '✓', failed: '✗', skipped: '–' }

export const chipsOf = (skills: readonly string[]): string => skills.join(' · ')
export const shortName = (name: string): string => name.replace(/^The /, '')

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

function questView(quest: GuildQuest, byId: ReadonlyMap<string, GuildMemberCard>, leader: GuildLeader | null): QuestView {
  const progress = questProgress(quest)
  return {
    title: quest.title,
    finished: progress.finished,
    total: progress.total,
    fraction: progress.fraction,
    steps: quest.steps.map(step => {
      const isYourTurn = step.member === 'you' && progress.current?.id === step.id && step.status !== 'failed'
      const sigil = step.member === 'you' ? '👤' : step.member === 'guildmaster' ? (leader?.sigil ?? '👑') : (byId.get(step.member)?.sigil ?? '✦')
      const tone: Tone =
        step.status === 'failed' ? 'error' : isYourTurn ? 'warning' : step.status === 'active' ? 'bold' : 'dim'
      return {
        id: step.id,
        mark: isYourTurn ? '▶' : MARK[step.status],
        sigil,
        task: step.task,
        tone,
        isSkipped: step.status === 'skipped',
        ...(step.status === 'failed' && step.note ? { note: step.note } : {}),
      }
    }),
  }
}

export function paneView(input: PaneInput): PaneView {
  const byId = new Map(input.roster.map(member => [member.id, member]))
  const working = [...input.active].sort((a, b) => a.startedAt - b.startedAt)
  const busy = new Set(working.map(one => one.member))
  const lastOf = (id: string) => input.recent.find(one => one.member === id)
  const memberView = (card: GuildMemberCard): MemberView => ({ id: card.id, sigil: card.sigil, name: card.name, chips: chipsOf(card.skills), card })
  const idle = input.roster.filter(member => !busy.has(member.id))
  const attention = idle
    .filter(member => lastOf(member.id)?.isKept === false)
    .map(member => {
      const last = lastOf(member.id)
      const failed = last?.failed ?? []
      return {
        ...memberView(member),
        task: last?.description ?? '',
        failed: `✗ ${failed[0] ?? 'breach'}${failed.length > 1 ? ` +${failed.length - 1}` : ''}`,
      }
    })
  const ready = idle.filter(member => lastOf(member.id)?.isKept !== false).map(memberView)
  const atWork = working.map(one => {
    const card = byId.get(one.member)
    return {
      agentId: one.agentId,
      member: one.member,
      sigil: card?.sigil ?? '✦',
      name: card?.name ?? one.member,
      color: card?.color ?? 'gray',
      chips: chipsOf(card?.skills ?? []),
      elapsed: formatElapsed(input.now - one.startedAt),
      steps: one.toolCount ?? 0,
      task: one.description,
      tools: one.tools ?? [],
      ...(one.tome ? { tome: one.tome } : {}),
      ...(one.origin ? { origin: one.origin } : {}),
    }
  })

  // Oldest first: proposal ids start with their date (YYYY-MM-DD-target-n).
  const proposals = [...input.proposals].sort((a, b) => a.id.localeCompare(b.id))

  const plan = isQuestOpen(input.quest) ? input.quest : undefined
  const progress = plan ? questProgress(plan) : undefined
  const current = progress?.current
  const [status, statusTone]: [string, Tone] =
    current?.member === 'you' && current.status !== 'failed'
      ? ['▶ waiting on you', 'warning']
      : current?.status === 'failed'
        ? [`✗ step ${current.id} failed`, 'error']
        : working.length > 0
          ? [`directing ${working.length}`, 'dim']
          : input.isThinking
            ? ['thinking', 'dim']
            : plan
              ? [`next: step ${current?.id ?? '–'}`, 'dim']
              : ['', 'dim']

  const counts = [
    working.length > 0 ? `${working.length} at work` : '',
    attention.length > 0 ? `${attention.length} needs attention` : '',
    proposals.length > 0 ? plural(proposals.length, 'proposal', 'proposals') : '',
    input.loadErrors.length > 0 ? plural(input.loadErrors.length, 'problem', 'problems') : '',
  ].filter(Boolean)
  const summary = [...counts.slice(0, 2), `${ready.length} ready`].join(' · ')

  return {
    title: '⚜ The Guild',
    summary,
    gm: {
      sigil: input.leader?.sigil ?? '👑',
      name: input.leader?.name ?? 'The Guildmaster',
      chips: chipsOf(input.leader?.skills ?? []),
      status,
      statusTone,
      ...(plan ? { quest: questView(plan, byId, input.leader) } : {}),
      ...(!plan && input.quest?.closedAt ? { lastQuest: `Last quest: ${input.quest.title} · ${input.quest.outcome ?? 'done'}` } : {}),
    },
    atWork,
    attention,
    ready,
    proposals: proposals.slice(0, MAX_PROPOSALS),
    moreProposals: Math.max(0, proposals.length - MAX_PROPOSALS),
    problems: input.loadErrors.slice(0, MAX_PROBLEMS),
    moreProblems: Math.max(0, input.loadErrors.length - MAX_PROBLEMS),
  }
}

// A determinate bar of `width` cells: the filled run and the track.
export function fillBar(width: number, fraction: number): { filled: string; track: string } {
  const cells = Math.max(1, width)
  const filled = Math.round(cells * Math.max(0, Math.min(1, fraction)))
  return { filled: '━'.repeat(filled), track: '━'.repeat(cells - filled) }
}

export type BandPart = { text: string; tone: Tone }
export type BandSegment = BandPart[]

export const BAND_BAR = 12

export const segmentText = (segment: BandSegment): string => segment.map(part => part.text).join('')

// The band's segments in priority order (plan §4.5): the quest and its status,
// then each member at work with their own elapsed time, oldest first.
// `width` lets a lone member's task shrink so its elapsed time is never cut.
export function bandSegments(view: PaneView, width = Number.POSITIVE_INFINITY): BandSegment[] {
  const quest = view.gm.quest
  const members = view.atWork.map(one => [{ text: `${one.sigil} ${shortName(one.name)} ${one.elapsed}`, tone: 'ink' as Tone }])
  if (quest) {
    const bar = fillBar(BAND_BAR, quest.fraction)
    const head: BandSegment = [
      { text: `${view.gm.sigil} ${quest.title}  `, tone: 'bold' },
      { text: bar.filled, tone: 'ink' },
      { text: bar.track, tone: 'dim' },
      { text: ` ${quest.finished}/${quest.total}`, tone: 'dim' },
    ]
    const yours = quest.steps.find(step => step.mark === '▶')
    const failed = view.gm.statusTone === 'error' ? quest.steps.find(step => step.tone === 'error') : undefined
    if (yours) return [head, [{ text: `▶ waiting on you: ${yours.task}`, tone: 'warning' }]]
    if (failed) return [head, [{ text: `✗ step ${failed.id} failed: ${failed.task}`, tone: 'error' }]]
    return [head, ...members]
  }
  const [only] = view.atWork
  if (only && view.atWork.length === 1) {
    const head = `${only.sigil} ${shortName(only.name)} · `
    const tail = ` · ${only.elapsed}`
    const room = width - cellWidth(head) - cellWidth(tail)
    const task = room >= 4 ? clip(only.task, room) : ''
    return [[{ text: task ? `${head}${task}${tail}` : `${only.sigil} ${shortName(only.name)}${tail}`, tone: 'ink' }]]
  }
  if (view.atWork.length === 0) return []
  return [[{ text: `⚜ ${view.atWork.length} at work`, tone: 'bold' }], ...members]
}
