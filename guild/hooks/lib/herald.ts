// The Herald's end-of-turn report: the prompt the engine forks with, and the
// small reads it takes from the report it gets back.

const REPORT_LIMIT = 4000

export function heraldPrompt(profileBody: string, answer: string, previous: string, prepared = ''): string {
  return [
    'The turn above has ended. You are now The Herald of the guild, and you write the turn report described below. Write the report alone: no preamble, no tool calls, no code fences around it.',
    '',
    profileBody.trim(),
    ...(prepared.trim() ? ['', '## Your prepared spells (follow them in the report; your report format above still governs its structure)', prepared.trim()] : []),
    '',
    '## The final answer of this turn (the person sees it above your report)',
    answer.trim() || '(no visible answer)',
    '',
    '## Your previous report (carry forward every ask still unanswered)',
    previous.trim() || '(none this session)',
  ].join('\n')
}

// The fork answers inside the assistant's voice; keep the report only, from its banner on.
export function cleanReport(text: string): string {
  const unfenced = text.replace(/^\s*```[a-z]*\n?/i, '').replace(/\n?```\s*$/, '')
  const at = unfenced.indexOf('📯')
  const report = (at >= 0 ? unfenced.slice(at) : unfenced).trim()
  return report.length > REPORT_LIMIT ? `${report.slice(0, REPORT_LIMIT - 1)}…` : report
}

// How many asks the report lists: the number in "NEEDS YOU (n)", else 0.
export function askCount(report: string): number {
  const match = /NEEDS YOU\s*\((\d+)\)/i.exec(report)
  return match ? Number(match[1]) : 0
}
