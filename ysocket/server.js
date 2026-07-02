const http = require('http')
const WebSocket = require('ws')
const Y = require('yjs')
const { setupWSConnection, setPersistence, getYDoc } = require('y-websocket/bin/utils')

const PORT = process.env.PORT || 1234
const HOST = process.env.HOST || 'localhost'
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000'
const PERSIST_DEBOUNCE_MS = 1000

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
  const docName = (request.url || '').slice(1).split('?')[0]

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
