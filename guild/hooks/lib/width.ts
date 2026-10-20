// Cell widths for the terminal pane and band: how many cells a string takes,
// cutting to a width, and fitting whole segments into a line. Pure functions.

// An emoji (U+1F000 and up), or any character followed by VS16 (U+FE0F), takes
// two cells; VS16 itself takes none; everything else takes one.
export function cellWidth(text: string): number {
  const chars = [...text]
  let cells = 0
  chars.forEach((char, at) => {
    const code = char.codePointAt(0) ?? 0
    if (code === 0xfe0f) return
    cells += code >= 0x1f000 || chars[at + 1] === '️' ? 2 : 1
  })
  return cells
}

// `text` cut to `width` cells, ending in … when it was cut.
export function clip(text: string, width: number): string {
  if (cellWidth(text) <= width) return text
  if (width <= 0) return ''
  let out = ''
  for (const char of text) {
    if (cellWidth(`${out}${char}…`) > width) break
    out += char
  }
  return `${out}…`
}

// The segments that fit in `width` when joined by `gap` spaces, kept whole and
// in order; when some don't fit, a last `+N` segment says how many were dropped.
export function fitSegments(segments: readonly string[], width: number, gap = 3): string[] {
  const lineWidth = (parts: readonly string[]) =>
    parts.reduce((sum, part) => sum + cellWidth(part), 0) + gap * Math.max(0, parts.length - 1)
  if (lineWidth(segments) <= width) return [...segments]
  for (let keep = segments.length - 1; keep >= 0; keep -= 1) {
    const kept = [...segments.slice(0, keep), `+${segments.length - keep}`]
    if (lineWidth(kept) <= width) return kept
  }
  return [`+${segments.length}`]
}

// `text` wrapped at spaces into lines of at most `width` cells, `max` lines at
// most; the last line ends in … when text was left over.
export function clampLines(text: string, width: number, max: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (cellWidth(next) <= width) {
      line = next
      continue
    }
    if (line) lines.push(line)
    line = cellWidth(word) <= width ? word : clip(word, width)
  }
  if (line) lines.push(line)
  if (lines.length <= max) return lines
  const kept = lines.slice(0, max)
  kept[max - 1] = clip(`${kept[max - 1]} ${lines[max]}`, width)
  if (!kept[max - 1]?.endsWith('…')) kept[max - 1] = clip(`${kept[max - 1]}…`, width)
  return kept
}
