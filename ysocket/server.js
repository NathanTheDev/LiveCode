// GH issue #2 Phase 5: loads a local `.env` if present, for `npm start`
// convenience - never required, since Docker/Fly inject real env vars
// directly and this silently no-ops if no `.env` file exists.
require('dotenv').config()

const http = require('http')
const WebSocket = require('ws')
const Y = require('yjs')
const admin = require('firebase-admin')
const { getAuth } = require('firebase-admin/auth')
const { setupWSConnection, setPersistence, getYDoc, docs } = require('y-websocket/bin/utils')

const PORT = process.env.PORT || 1234
// GH issue #2 Phase 5: '0.0.0.0' (not 'localhost') so the server accepts
// connections from outside its own container/host - required for Docker
// port-mapping and Fly.io to reach it at all; still overridable via HOST.
const HOST = process.env.HOST || '0.0.0.0'
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000'
const PERSIST_DEBOUNCE_MS = 1000
// GH issue #9 (helm): isNoteActive above only gates *new* upgrades - a
// client already connected when helm closes a note's link would otherwise
// stay connected indefinitely. Polling (rather than a push from the Rust
// backend) matches the existing pull-based active-check design and needs no
// cross-service changes there.
const ACTIVE_RECHECK_MS = 5000

// Notes-service repurpose: the Rust backend now requires this shared secret
// on every request (see backend/src/auth.rs) since it's no longer gated by
// per-end-user Firebase tokens - only helm's backend and this service call
// it, server-to-server. Must match the backend's INTERNAL_API_KEY exactly.
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY
if (!INTERNAL_API_KEY) {
  console.warn(
    'WARNING: INTERNAL_API_KEY not set - using dev stub. Must match the ' +
      "backend's INTERNAL_API_KEY or every call to it will be rejected.",
  )
}
const internalHeaders = {
  'X-Internal-Key': INTERNAL_API_KEY || 'livecode-dev-stub-internal-key',
}

// STUB (auth roadmap issue #2, Phase 4): no real Firebase project exists yet
// (that's Phase 6 - infra provisioning), mirroring the dev-stub pattern in
// backend/src/main.rs. verifyIdToken() below only needs a project id (not
// full service-account credentials) to check a token's signature/aud/iss,
// but no real Firebase ID token will ever match this placeholder id, so
// every connection is rejected until the real project id is set.
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID
if (!FIREBASE_PROJECT_ID) {
  console.warn(
    'WARNING: FIREBASE_PROJECT_ID not set - using dev stub. All WS ' +
      'connections will be rejected until a real Firebase project exists ' +
      'and FIREBASE_PROJECT_ID is set (see GH issue #2).',
  )
}
const firebaseApp = admin.initializeApp({ projectId: FIREBASE_PROJECT_ID || 'livecode-dev-stub' })

// GH issue #2 Phase 4: sign-in is required to join a room. Verifies the
// token the same way the Rust backend used to (RS256 signature + iss/aud/exp
// against Firebase's public JWKS), just via the official firebase-admin SDK
// instead of hand-rolled verification, since an official Node Admin SDK
// exists here (unlike Rust). Returns null - never throws - on any failure,
// so missing/malformed/wrong-project/expired/tampered tokens are all
// rejected identically by the caller below.
async function verifyToken(token) {
  if (!token) return null
  try {
    return await getAuth(firebaseApp).verifyIdToken(token)
  } catch {
    return null
  }
}

// Notes-service repurpose: a note only accepts live connections while
// helm has it published (`is_active`, flipped via the backend's
// PATCH /notes/:id/active). Checked on *every* upgrade attempt, not just
// the first - unlike hydration below, which only runs once per note's
// lifetime in this process's memory, "close link" needs every subsequent
// reconnect attempt to see the current state. A HEAD request reuses the
// backend's GET /notes/:id handler (Axum serves HEAD off the same route)
// without transferring the note's full ydoc bytes just to check one header.
// Fails closed: any error, non-OK response, or missing header rejects.
async function isNoteActive(docName) {
  try {
    const res = await fetch(`${BACKEND_URL}/notes/${encodeURIComponent(docName)}`, {
      method: 'HEAD',
      headers: internalHeaders,
    })
    return res.ok && res.headers.get('x-note-active') === 'true'
  } catch (err) {
    console.error(`Failed to check active state for note "${docName}":`, err)
    return false
  }
}

// Resolves once a note's initial state has been hydrated from the backend.
// bindState below is invoked fire-and-forget by y-websocket's getYDoc, so we
// stash its promise here and await it before completing the WS upgrade -
// otherwise a client can finish syncing against an empty doc before the
// fetch from the backend resolves.
const hydrated = new Map()

// One recheck timer per currently-live room; started on hydration, stopped
// once the room's last connection closes (see writeState below) - mirrors
// `hydrated`'s lifecycle exactly.
const activeCheckTimers = new Map()

// Closes every open socket for a room immediately. Each one's own 'close'
// handler (registered by y-websocket's setupWSConnection) does the normal
// conns/awareness/persistence cleanup - this just triggers that, same as if
// the client had disconnected itself.
function forceDisconnectRoom(docName) {
  const doc = docs.get(docName)
  if (!doc) return
  for (const conn of doc.conns.keys()) {
    conn.close(4403, 'note deactivated')
  }
}

function startActiveRecheck(docName) {
  const timer = setInterval(async () => {
    if (!(await isNoteActive(docName))) {
      forceDisconnectRoom(docName)
    }
  }, ACTIVE_RECHECK_MS)
  activeCheckTimers.set(docName, timer)
}

function stopActiveRecheck(docName) {
  const timer = activeCheckTimers.get(docName)
  if (timer) {
    clearInterval(timer)
    activeCheckTimers.delete(docName)
  }
}

async function persistDoc(docName, ydoc) {
  const state = Y.encodeStateAsUpdate(ydoc)
  try {
    await fetch(`${BACKEND_URL}/notes/${encodeURIComponent(docName)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream', ...internalHeaders },
      body: state,
    })
  } catch (err) {
    console.error(`Failed to persist note "${docName}":`, err)
  }
}

setPersistence({
  bindState: (docName, ydoc) => {
    const promise = (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/notes/${encodeURIComponent(docName)}`, {
          headers: internalHeaders,
        })
        if (res.ok) {
          const buf = new Uint8Array(await res.arrayBuffer())
          if (buf.length > 0) Y.applyUpdate(ydoc, buf)
        }
      } catch (err) {
        console.error(`Failed to load note "${docName}":`, err)
      }

      let debounceTimer = null
      ydoc.on('update', () => {
        clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => persistDoc(docName, ydoc), PERSIST_DEBOUNCE_MS)
      })
    })()
    hydrated.set(docName, promise)
    startActiveRecheck(docName)
    return promise
  },
  writeState: async (docName, ydoc) => {
    hydrated.delete(docName)
    stopActiveRecheck(docName)
    await persistDoc(docName, ydoc)
  },
})

const server = http.createServer((_req, res) => {
  res.writeHead(200)
  res.end('y-websocket server')
})

const wss = new WebSocket.Server({ noServer: true })
wss.on('connection', setupWSConnection)

server.on('upgrade', async (request, socket, head) => {
  const [pathPart, queryPart] = (request.url || '').slice(1).split('?')
  const docName = pathPart
  const token = new URLSearchParams(queryPart || '').get('token')

  // GH issue #2 Phase 4: reject before any Yjs sync data is exchanged, and
  // before getYDoc/hydration even runs below - an unauthenticated request
  // shouldn't be able to trigger a DB read either. Never log the raw token;
  // it's a bearer credential, not diagnostic data.
  const decoded = await verifyToken(token)
  if (!decoded) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
    return
  }

  if (!(await isNoteActive(docName))) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
    socket.destroy()
    return
  }

  // Ensures the note exists and hydration has kicked off (idempotent - a
  // note already in memory won't re-trigger bindState or re-fetch).
  getYDoc(docName)
  await (hydrated.get(docName) || Promise.resolve())

  if (socket.destroyed) return

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request)
  })
})

server.listen(PORT, HOST, () => {
  console.log(`y-websocket server running on ws://${HOST}:${PORT}`)
})
