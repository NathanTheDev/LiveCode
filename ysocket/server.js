const http = require('http')
const WebSocket = require('ws')
const Y = require('yjs')
const admin = require('firebase-admin')
const { setupWSConnection, setPersistence, getYDoc } = require('y-websocket/bin/utils')

const PORT = process.env.PORT || 1234
const HOST = process.env.HOST || 'localhost'
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000'
const PERSIST_DEBOUNCE_MS = 1000

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
admin.initializeApp({ projectId: FIREBASE_PROJECT_ID || 'livecode-dev-stub' })

// GH issue #2 Phase 4: sign-in is required to join a room. Verifies the
// token the same way the Rust backend does (RS256 signature + iss/aud/exp
// against Firebase's public JWKS), just via the official firebase-admin SDK
// instead of hand-rolled verification, since an official Node Admin SDK
// exists here (unlike Rust). Returns null - never throws - on any failure,
// so missing/malformed/wrong-project/expired/tampered tokens are all
// rejected identically by the caller below.
async function verifyToken(token) {
  if (!token) return null
  try {
    return await admin.auth().verifyIdToken(token)
  } catch {
    return null
  }
}

// Resolves once a doc's initial state has been hydrated from the backend.
// bindState below is invoked fire-and-forget by y-websocket's getYDoc, so we
// stash its promise here and await it before completing the WS upgrade -
// otherwise a client can finish syncing against an empty doc before the
// fetch from the backend resolves.
const hydrated = new Map()

async function persistDoc(docName, ydoc) {
  const state = Y.encodeStateAsUpdate(ydoc)
  try {
    await fetch(`${BACKEND_URL}/documents/${encodeURIComponent(docName)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: state,
    })
  } catch (err) {
    console.error(`Failed to persist document "${docName}":`, err)
  }
}

setPersistence({
  bindState: (docName, ydoc) => {
    const promise = (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/documents/${encodeURIComponent(docName)}`)
        if (res.ok) {
          const buf = new Uint8Array(await res.arrayBuffer())
          if (buf.length > 0) Y.applyUpdate(ydoc, buf)
        }
      } catch (err) {
        console.error(`Failed to load document "${docName}":`, err)
      }

      let debounceTimer = null
      ydoc.on('update', () => {
        clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => persistDoc(docName, ydoc), PERSIST_DEBOUNCE_MS)
      })
    })()
    hydrated.set(docName, promise)
    return promise
  },
  writeState: async (docName, ydoc) => {
    hydrated.delete(docName)
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

  // Ensures the doc exists and hydration has kicked off (idempotent - a doc
  // already in memory won't re-trigger bindState or re-fetch).
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
