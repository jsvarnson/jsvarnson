// Pure helpers the Guild pane draws with: what a tool call was doing, how
// long a summons has run, and the moving activity bar.

const COLORS: Record<string, string> = {
  blue: '#378ADD',
  violet: '#7F77DD',
  purple: '#7F77DD',
  red: '#D85A30',
  coral: '#D85A30',
  amber: '#BA7517',
  gold: '#BA7517',
  pink: '#D4537E',
  teal: '#1D9E75',
  green: '#639922',
  gray: '#888780',
}

export const memberHex = (color: string): string =>
  /^#[0-9a-f]{6}$/i.test(color) ? color : (COLORS[color.toLowerCase()] ?? '#888780')

const clip = (text: string, size: number): string => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > size ? `${flat.slice(0, size - 1)}…` : flat
}

const baseName = (path: string): string => path.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? path

// One short line for a tool call: the tool and its most telling argument.
export function toolSummary(tool: string, input: unknown): string {
  const args = (input ?? {}) as Record<string, unknown>
  const text = (key: string) => (typeof args[key] === 'string' ? (args[key] as string) : undefined)
  const detail =
    (text('file_path') && baseName(text('file_path') ?? '')) ??
    (text('notebook_path') && baseName(text('notebook_path') ?? '')) ??
    text('command') ??
    text('query') ??
    text('pattern') ??
    text('url')?.replace(/^https?:\/\//, '') ??
    text('description') ??
    ''
  const name = tool.startsWith('mcp__') ? tool.split('__').slice(-1)[0] ?? tool : tool
  return detail ? `${name}: ${clip(detail, 48)}` : name
}

export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(seconds / 60)
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`
    : `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

// An indeterminate bar: a lit segment that sweeps across `width` cells, one
// step per tick. Answers the three runs to draw: before, lit, after.
export function activityBar(width: number, step: number): { before: string; lit: string; after: string } {
  const cells = Math.max(6, width)
  const size = Math.max(3, Math.round(cells / 4))
  const travel = cells - size
  const cycle = travel * 2
  const at = cycle === 0 ? 0 : step % cycle
  const offset = at <= travel ? at : cycle - at
  return {
    before: '━'.repeat(offset),
    lit: '━'.repeat(size),
    after: '━'.repeat(cells - size - offset),
  }
}

export const truncate = clip
