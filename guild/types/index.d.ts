export type GuildMemberCard = {
  id: string
  name: string
  sigil: string
  archetype: string
  title: string
  tagline: string
  skills: string[]
  version: string
  color: string
  model?: string
  effort?: string
  briefTemplate: string
}

export type GuildSummons = {
  agentId: string
  member: string
  description: string
  startedAt: number
  tome?: string
  origin?: 'guildmaster' | 'engine'
  toolCount?: number
  tools?: string[]
  spells?: string[]
  blocked?: string[]
}

export type GuildResult = {
  ledgerId: string
  member: string
  description: string
  isKept: boolean
  failed: string[]
  durationMs: number
  endedAt: number
  confidence?: string
  handoff?: string
  tokens?: number
}

export type GuildProposalCard = {
  id: string
  target: string
  kind: string
  title: string
  toVersion: string
}

export type GuildQuestStatus = 'pending' | 'active' | 'done' | 'failed' | 'skipped'

export type GuildQuestStep = {
  id: number
  member: string
  task: string
  status: GuildQuestStatus
  agentId?: string
  note?: string
}

export type GuildQuest = {
  id: string
  title: string
  startedAt: number
  steps: GuildQuestStep[]
  closedAt?: number
  outcome?: string
}

export type GuildLeader = {
  name: string
  sigil: string
  tagline: string
  skills: string[]
  color: string
  version: string
}

declare module 'claude-code' {
  interface PluginState {
    guild: {
      roster: GuildMemberCard[]
      active: GuildSummons[]
      recent: GuildResult[]
      proposals: GuildProposalCard[]
      loadErrors: string[]
      expanded: string
      tick: number
      collapsed: string[]
      quest: GuildQuest | null
      leader: GuildLeader | null
      isThinking: boolean
    }
  }
}
