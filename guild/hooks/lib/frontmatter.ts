// A small reader for the YAML subset guild files use: `key: value`, quoted
// strings, inline lists `[a, b]`, block lists of `- item`, and folded `>` /
// literal `|` scalars. Anything richer belongs in the markdown body.

export type FrontmatterValue = string | string[]
export type Frontmatter = Record<string, FrontmatterValue>

export type Split = { data: Frontmatter; body: string; hasFrontmatter: boolean }

const unquote = (value: string): string => {
  const trimmed = value.trim()
  const isQuoted =
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  return isQuoted ? trimmed.slice(1, -1) : trimmed.replace(/\s+#.*$/, '')
}

const inlineList = (value: string): string[] =>
  value
    .trim()
    .slice(1, -1)
    .split(',')
    .map(unquote)
    .filter(item => item !== '')

export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}

export function splitFrontmatter(raw: string): Split {
  const text = normalizeNewlines(raw)
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text)
  if (!match) return { data: {}, body: text, hasFrontmatter: false }
  return {
    data: parseYamlSubset(match[1] ?? ''),
    body: text.slice(match[0].length),
    hasFrontmatter: true,
  }
}

export function parseYamlSubset(source: string): Frontmatter {
  const data: Frontmatter = {}
  const lines = source.split('\n')
  let index = 0
  while (index < lines.length) {
    const line = lines[index] ?? ''
    index += 1
    if (/^\s*(#.*)?$/.test(line)) continue
    const pair = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line)
    if (!pair) continue
    const key = pair[1] ?? ''
    const value = (pair[2] ?? '').trim()

    if (value.startsWith('[') && value.endsWith(']')) {
      data[key] = inlineList(value)
    } else if (value === '>' || value === '|' || value === '>-' || value === '|-') {
      const block: string[] = []
      while (index < lines.length && /^(\s+\S|\s*$)/.test(lines[index] ?? '')) {
        block.push((lines[index] ?? '').trim())
        index += 1
      }
      data[key] = value.startsWith('>')
        ? block.join(' ').replace(/\s+/g, ' ').trim()
        : block.join('\n').trim()
    } else if (value === '') {
      const items: string[] = []
      while (index < lines.length && /^\s*-\s/.test(lines[index] ?? '')) {
        items.push(unquote((lines[index] ?? '').replace(/^\s*-\s/, '')))
        index += 1
      }
      data[key] = items
    } else {
      data[key] = unquote(value)
    }
  }
  return data
}

export const asText = (value: FrontmatterValue | undefined, fallback = ''): string =>
  value === undefined ? fallback : Array.isArray(value) ? value.join(', ') : value

export const asList = (value: FrontmatterValue | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : value === '' ? [] : [value]

// Rewrites (or adds) one scalar key inside a file's frontmatter, leaving the
// rest of the file byte-for-byte as it was.
export function setFrontmatterScalar(raw: string, key: string, value: string): string {
  const text = normalizeNewlines(raw)
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text)
  if (!match) return `---\n${key}: ${value}\n---\n${text}`
  const head = match[1] ?? ''
  const pattern = new RegExp(`^${key}:.*$`, 'm')
  const nextHead = pattern.test(head) ? head.replace(pattern, `${key}: ${value}`) : `${head}\n${key}: ${value}`
  return `---\n${nextHead}\n---\n${text.slice(match[0].length)}`
}
