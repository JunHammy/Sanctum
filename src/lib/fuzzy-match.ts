// Simple fuzzy match for filenames — rewards matches at word starts (after
// a space or hyphen) so "qs" ranks "Quick Switcher" above a coincidental
// mid-word match. Returns 0 for no match (every query character has to
// appear in order somewhere in the target).
export function fuzzyMatch(query: string, target: string): number {
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  let score = 0
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += ti === 0 || t[ti - 1] === ' ' || t[ti - 1] === '-' ? 2 : 1
      qi++
    }
  }
  return qi === q.length ? score : 0
}
