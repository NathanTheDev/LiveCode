import { auth } from './firebase'

// GH issue #2 Phase 5: env-driven instead of hardcoded, so the same build
// can point at a real deployed backend/ysocket. Falls back to the local dev
// defaults (matching backend's/ysocket's own local-dev fallbacks) so `npm
// run dev` still boots with no `.env`; any non-local deployment must set
// these explicitly via Cloudflare Pages' build env vars.
export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000'
export const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:1234'

// Attaches a fresh Firebase ID token when signed in, so the backend can
// identify the caller on routes that support optional/required auth (see
// GH issue #2 Phase 1). No-op (returns {}) when signed out - existing
// anonymous flows are unaffected.
export async function authHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser
  if (!user) return {}
  const token = await user.getIdToken()
  return { Authorization: `Bearer ${token}` }
}
