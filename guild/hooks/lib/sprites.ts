// SVG drawings for the desktop pane: each member's icon, the progress bars,
// and the strip of busy icons in the band above the prompt.

// Each member is drawn as its own icon (the profile's `sigil`), set on a soft
// disc of the member's colour. The icon is the identity across every surface.
const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function iconSvg(sigil: string, hex: string, isBusy: boolean): string {
  const ring = isBusy
    ? `<circle cx="12" cy="12" r="11" fill="none" stroke="${hex}" stroke-width="1.5"><animate attributeName="stroke-opacity" values="1;0.3;1" dur="1.2s" repeatCount="indefinite"/></circle>`
    : ''
  const disc = `<circle cx="12" cy="12" r="11" fill="${hex}" fill-opacity="${isBusy ? 0.3 : 0.16}"/>`
  const glyph = `<text x="12" y="12.5" font-size="13" text-anchor="middle" dominant-baseline="central">${escapeXml(sigil || '✦')}</text>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${disc}${ring}${glyph}</svg>`
}

// A 4px rounded bar: `fraction` filled, or with `isSweeping` an animated
// segment for work whose length nobody knows.
export function barSvg(width: number, hex: string, fraction: number, isSweeping: boolean): string {
  const w = Math.max(40, Math.round(width))
  const track = `<rect x="0" y="0" width="${w}" height="4" rx="2" fill="#888780" fill-opacity="0.25"/>`
  if (isSweeping) {
    const seg = Math.round(w * 0.3)
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="4" viewBox="0 0 ${w} 4">${track}<rect y="0" width="${seg}" height="4" rx="2" fill="${hex}"><animate attributeName="x" values="0;${w - seg};0" dur="2.4s" repeatCount="indefinite"/></rect></svg>`
  }
  const filled = Math.round(w * Math.max(0, Math.min(1, fraction)))
  const fill = filled > 0 ? `<rect x="0" y="0" width="${filled}" height="4" rx="2" fill="${hex}"/>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="4" viewBox="0 0 ${w} 4">${track}${fill}</svg>`
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}k`
  return String(tokens)
}
