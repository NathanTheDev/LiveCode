/// <reference types="vite/client" />

interface ImportMetaEnv {
  // STUB (auth roadmap issue #2, Phase 0/2): populated once a real Firebase
  // project exists (Phase 6). Public client config, not secret.
  readonly VITE_FIREBASE_API_KEY?: string
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string
  readonly VITE_FIREBASE_PROJECT_ID?: string
  readonly VITE_FIREBASE_APP_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
