const COLORS = [
  '#f87171', '#fb923c', '#fbbf24', '#a3e635', '#4ade80', '#34d399',
  '#22d3ee', '#60a5fa', '#818cf8', '#a78bfa', '#e879f9', '#fb7185',
]

export function randomColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)]
}

// GH issue #2 Phase 4: presence now seeds from the real signed-in Firebase
// user instead of an auto-assigned "User N" label. `displayName` isn't
// guaranteed (plain email/password sign-up never sets one), so fall back to
// the email's local part, and finally a generic label if even that's absent.
export function resolveDisplayName(user: { displayName: string | null; email: string | null }): string {
  return user.displayName || user.email?.split('@')[0] || 'Anonymous'
}
