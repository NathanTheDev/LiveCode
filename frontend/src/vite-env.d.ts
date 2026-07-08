/// <reference types="vite/client" />

interface ImportMetaEnv {
  // STUB (auth roadmap issue #2, Phase 0/2): populated once a real Firebase
  // project exists (Phase 6). Public client config, not secret.
  readonly VITE_FIREBASE_API_KEY?: string
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string
  readonly VITE_FIREBASE_PROJECT_ID?: string
  readonly VITE_FIREBASE_APP_ID?: string
  // Local-dev-only: when set (e.g. "localhost:9099"), the client SDK talks to
  // the Firebase Auth Emulator instead of real Firebase. Never set in prod.
  readonly VITE_FIREBASE_AUTH_EMULATOR_HOST?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
