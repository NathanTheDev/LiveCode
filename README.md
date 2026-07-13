<div align="center">
  <img src="https://img.icons8.com/?size=100&id=XBTSf3wxOZUm&format=png&color=000000"/>
</div>

# LiveCode — headless notes collaboration service

A **Rust/Axum + Postgres backend** and a Node **`ysocket`** service
(`y-websocket`, Yjs CRDT sync) that together provide real-time collaborative
editing of a "note": a plain blob of CRDT state with no title, ownership, or
UI of its own.

There is no frontend in this repo anymore. It's a backend service consumed by
[helm](https://github.com/NathanTheDev/helm)'s Notes feature: helm owns
notes' titles/ownership/listing and does regular (non-collaborative) editing
entirely on its own; it only creates a note here for the duration it's
published/shared, so this service only ever holds notes that are actively
(or were recently) live-collaborative.

---

## Architecture

- **`backend`** (Rust/Axum/sqlx/Postgres): stores a note's raw Yjs CRDT state
  (`ydoc_state`) and an `is_active` flag. `POST /notes` creates one (called by
  helm when publishing), `PATCH /notes/:id/active` opens/closes it (called by
  helm), `GET`/`PUT /notes/:id` read/write the raw bytes (called by `ysocket`
  for sync, and by helm to read back the final content on close). Every route
  except the `/hello` health check requires a shared secret
  (`X-Internal-Key`, see `INTERNAL_API_KEY`) - there is no per-end-user
  identity check in this service at all anymore.
- **`ysocket`** (Node, `y-websocket`): the actual WebSocket endpoint browsers
  connect to for live sync. Requires a valid Firebase ID token to join a
  room (`?token=...`), and separately checks the backend's `is_active` flag
  on every connection attempt - this is the real per-user/per-note access
  boundary, not the Rust backend.

---

## Local dev

```
docker compose up -d          # postgres + backend + ysocket
```

Backend on `http://localhost:3000`, ysocket on `ws://localhost:1234`. Point a
consuming app's `NOTES_BACKEND_URL` / `NOTES_WS_URL` (or equivalent) at
these. See `backend/.env.example` and `ysocket/.env.example` for the shared
`INTERNAL_API_KEY` both services need (must match), and `FIREBASE_PROJECT_ID`
for `ysocket`'s end-user token verification (works against the [Firebase Auth
Emulator](https://firebase.google.com/docs/emulator-suite) with no real
project - see the consuming app's docs).

## Tech Stack

- **Backend:** Rust, Axum, sqlx, Postgres
- **Realtime:** `y-websocket` / Yjs (CRDT) over WebSockets
- **Auth:** Firebase ID tokens (end users, checked by `ysocket`), a shared
  secret (service-to-service, checked by `backend`)
