export function fuzzyScore(query: string, target: string): number | null {
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  if (q.length === 0) return 0
  let score = 0
  let ti = 0
  let prevMatch = -2
  for (const ch of q) {
    const found = t.indexOf(ch, ti)
    if (found === -1) return null
    if (found === prevMatch + 1) score += 8
    if (found === 0 || t[found - 1] === ' ') score += 10
    score -= (found - ti) * 0.5
    prevMatch = found
    ti = found + 1
  }
  return score
}
