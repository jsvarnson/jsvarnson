import { join } from './guild'

export const normPath = (path: string) => path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '').toLowerCase()

export const writtenPath = (e: unknown): string | undefined => {
  const input = e as { file_path?: unknown; notebook_path?: unknown }
  const path = input.file_path ?? input.notebook_path
  return typeof path === 'string' ? path : undefined
}

// Which guild paths a member may write: none, or only the folders its
// profile's `writes` names. Answers the refusal, or undefined to allow.
export function guardWrite(root: string, writes: readonly string[], path: string | undefined): string | undefined {
  if (path === undefined) return undefined
  const target = normPath(path)
  const base = normPath(root)
  const isAbsolute = /^([a-z]:\/|\/)/.test(target)
  const isInGuild = isAbsolute ? target === base || target.startsWith(`${base}/`) : /(^|\/)\.claude\/guild(\/|$)/.test(target)
  if (!isInGuild) return undefined
  const isAllowed = writes.some(dir => target.startsWith(`${normPath(join(root, dir))}/`))
  return isAllowed
    ? undefined
    : `Guild members may not edit the guild's own files (${path}). Changes to profiles, pacts and the charter go through an Artificer proposal and /guild accept.`
}

