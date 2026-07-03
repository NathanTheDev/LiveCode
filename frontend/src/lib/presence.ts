const COLORS = [
  '#f87171', '#fb923c', '#fbbf24', '#a3e635', '#4ade80', '#34d399',
  '#22d3ee', '#60a5fa', '#818cf8', '#a78bfa', '#e879f9', '#fb7185',
]

export function randomColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)]
}

// Picks the lowest unused "User N" number among currently connected peers,
// so numbers stay small and get reused once someone disconnects.
export function assignUserName(existingNames: string[]): string {
  const taken = new Set(
    existingNames
      .map((name) => Number(name.replace(/^User /, '')))
      .filter((n) => Number.isFinite(n)),
  )
  let n = 1
  while (taken.has(n)) n++
  return `User ${n}`
}
