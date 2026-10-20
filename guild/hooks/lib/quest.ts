// The Guildmaster's quest: a named plan of steps, each owned by a member (or
// by `you` for a human gate). The engine ticks steps as summons start and
// Scrolls land; the Guildmaster can also set a step by hand.

import type { GuildQuest, GuildQuestStep, GuildQuestStatus } from '../../types'

export const STEP_STATUSES: readonly GuildQuestStatus[] = ['pending', 'active', 'done', 'failed', 'skipped']

export function startQuest(
  id: string,
  title: string,
  steps: readonly { member: string; task: string }[],
  now: number,
): GuildQuest {
  return {
    id,
    title: title.trim() || 'Untitled quest',
    startedAt: now,
    steps: steps.map((step, at) => ({
      id: at + 1,
      member: step.member.trim().toLowerCase().replace(/^guild:/, ''),
      task: step.task.trim(),
      status: 'pending',
    })),
  }
}

const withStep = (quest: GuildQuest, at: number, change: Partial<GuildQuestStep>): GuildQuest => ({
  ...quest,
  steps: quest.steps.map((step, index) => (index === at ? { ...step, ...change } : step)),
})

// A member was summoned: the first pending step it owns becomes active.
export function onSummonStart(quest: GuildQuest, member: string, agentId: string): GuildQuest {
  const at = quest.steps.findIndex(step => step.member === member && step.status === 'pending')
  return at < 0 ? quest : withStep(quest, at, { status: 'active', agentId })
}

// A Scroll landed: that summons' step is done, or failed on a breach.
export function onSummonEnd(quest: GuildQuest, agentId: string, isKept: boolean, note?: string): GuildQuest {
  const at = quest.steps.findIndex(step => step.agentId === agentId)
  return at < 0 ? quest : withStep(quest, at, { status: isKept ? 'done' : 'failed', note })
}

export function setStep(quest: GuildQuest, stepId: number, status: GuildQuestStatus, note?: string): GuildQuest {
  const at = quest.steps.findIndex(step => step.id === stepId)
  if (at < 0) throw new Error(`quest "${quest.title}" has no step ${stepId}`)
  return withStep(quest, at, { status, ...(note ? { note } : {}) })
}

export type QuestProgress = { finished: number; total: number; fraction: number; current?: GuildQuestStep }

export function questProgress(quest: GuildQuest): QuestProgress {
  const total = quest.steps.length
  const finished = quest.steps.filter(step => step.status === 'done' || step.status === 'skipped').length
  const current =
    quest.steps.find(step => step.status === 'active') ??
    quest.steps.find(step => step.status === 'failed') ??
    quest.steps.find(step => step.status === 'pending')
  return { finished, total, fraction: total === 0 ? 0 : finished / total, current }
}

export const isQuestOpen = (quest: GuildQuest | null): quest is GuildQuest => quest !== null && quest.closedAt === undefined

const MARK: Record<GuildQuestStatus, string> = { pending: '○', active: '◐', done: '✓', failed: '✗', skipped: '–' }

export function questText(quest: GuildQuest): string {
  const { finished, total } = questProgress(quest)
  const lines = quest.steps.map(step => `${MARK[step.status]} ${step.id}. [${step.member}] ${step.task}${step.note ? ` — ${step.note}` : ''}`)
  const state = quest.closedAt ? `closed: ${quest.outcome ?? 'done'}` : `${finished}/${total} steps finished`
  return `Quest "${quest.title}" (${state})\n${lines.join('\n')}`
}
