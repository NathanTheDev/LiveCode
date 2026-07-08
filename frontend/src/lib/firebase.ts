import { initializeApp, type FirebaseOptions } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'

// STUB (auth roadmap issue #2, Phase 2): no real Firebase project exists yet
// (that's Phase 6 - infra provisioning). `initializeApp` doesn't validate
// credentials, so these placeholders let the app boot and the UI render in
// dev without a .env file. Actual sign-in/sign-up calls will fail with a
// Firebase network/config error until real values are supplied via
// VITE_FIREBASE_* env vars (see .env.example).
const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'stub-api-key',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? 'stub-project.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'stub-project',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? 'stub-app-id',
}

export const firebaseApp = initializeApp(firebaseConfig)
export const auth = getAuth(firebaseApp)

// Local-dev-only escape hatch (GH issue #2 Phase 2 validation): with no real
// Firebase project until Phase 6, this is what lets sign up/in/out actually
// be exercised end-to-end in a browser today, against the Firebase Auth
// Emulator instead of real Firebase. Never set VITE_FIREBASE_AUTH_EMULATOR_HOST
// outside local dev.
if (import.meta.env.DEV && import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST) {
  connectAuthEmulator(auth, `http://${import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST}`, {
    disableWarnings: true,
  })
}
