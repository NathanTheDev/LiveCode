import { auth } from './firebase'

export const BACKEND_URL = 'http://localhost:3000'

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
