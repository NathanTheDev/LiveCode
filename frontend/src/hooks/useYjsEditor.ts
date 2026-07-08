import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import type { Awareness } from 'y-protocols/awareness'
import type { User } from 'firebase/auth'
import { EditorView, basicSetup } from 'codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { yCollab } from 'y-codemirror.next'
import { resolveDisplayName, randomColor } from '../lib/presence'

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline'

export type PresenceUser = {
  clientId: number
  name: string
  color: string
  photoURL: string | null
  isLocal: boolean
}

function readPeers(awareness: Awareness): PresenceUser[] {
  const localClientId = awareness.doc.clientID
  return Array.from(awareness.getStates().entries())
    .filter(([, state]) => state.user)
    .map(([clientId, state]) => ({
      clientId,
      name: state.user.name,
      color: state.user.color,
      photoURL: state.user.photoURL ?? null,
      isLocal: clientId === localClientId,
    }))
}

// GH issue #2 Phase 4: sign-in is required app-wide, so `user` should always
// be non-null by the time a route mounts this hook (routes redirect signed-
// out visitors to /login first) - but the check stays defensive here since
// this hook has no way to enforce that itself, and briefly runs during the
// auth-state-loading window before a redirect can happen.
export function useYjsEditor(wsUrl: string, room: string, user: User | null) {
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [synced, setSynced] = useState(false)
  const [peers, setPeers] = useState<PresenceUser[]>([])

  useEffect(() => {
    let cancelled = false
    let cleanup: (() => void) | undefined

    // GH issue #2 Phase 4: sign-in is required to join a room at all now -
    // ysocket's WS upgrade handler rejects a connection with no token before
    // any Yjs sync happens, so there's no point opening a provider without
    // one. Bail out here instead and let the caller's own auth redirect
    // (routes redirect signed-out visitors to /login) take over.
    if (!user) return

    // getIdToken() is async, so the provider is created inside this IIFE once
    // a fresh token is available. The token is attached as a query param,
    // since a raw WS upgrade can't carry custom headers - see GH issue #2
    // Phase 2. Note this token is captured once at provider construction:
    // y-websocket's own reconnect loop reuses it on every retry rather than
    // fetching a fresh one, so a session left open past the token's ~1hr
    // expiry will start failing ysocket's verification on its next
    // reconnect attempt. That's an accepted tradeoff for Phase 4 (the
    // validation checklist only requires *rejecting* a stale token on
    // reconnect, which this does) - transparently refreshing a live
    // connection's token is follow-up work, not solved here.
    ;(async () => {
      const token = await user.getIdToken()
      if (cancelled) return

      const ydoc = new Y.Doc()
      const provider = new WebsocketProvider(wsUrl, room, ydoc, {
        params: { token },
      })
      const ytext = ydoc.getText('codemirror')
      const { awareness } = provider

      // Once a session has connected at least once, any subsequent 'connecting'
      // status (y-websocket's built-in exponential-backoff retry loop) means
      // we're reconnecting rather than establishing the first connection.
      let hasConnectedOnce = false

      // 'sync' fires on every (re)sync, not just the first - the loading
      // overlay needs to clear again after a reconnect, not just once.
      provider.on('sync', (isSynced: boolean) => setSynced(isSynced))

      // Real identity now (GH issue #2 Phase 4), no more "User N" numbering -
      // every peer is a signed-in Firebase user, so this can be set
      // immediately rather than waiting on sync to avoid name collisions.
      awareness.setLocalStateField('user', {
        name: resolveDisplayName(user),
        color: randomColor(),
        photoURL: user.photoURL,
      })

      const applyWsStatus = (wsStatus: string) => {
        if (!navigator.onLine) return
        if (wsStatus === 'connected') {
          hasConnectedOnce = true
          setStatus('connected')
        } else if (wsStatus === 'connecting') {
          setStatus(hasConnectedOnce ? 'reconnecting' : 'connecting')
        } else {
          setSynced(false)
          setStatus(hasConnectedOnce ? 'reconnecting' : 'connecting')
        }
      }

      provider.on('status', ({ status }: { status: string }) => applyWsStatus(status))

      const goOffline = () => {
        setSynced(false)
        setStatus('offline')
      }
      const goOnline = () => applyWsStatus(provider.wsconnected ? 'connected' : 'connecting')
      window.addEventListener('offline', goOffline)
      window.addEventListener('online', goOnline)
      if (!navigator.onLine) queueMicrotask(goOffline)

      const observer = () => setContent(ytext.toString())
      ytext.observe(observer)

      const awarenessListener = () => setPeers(readPeers(awareness))
      awareness.on('change', awarenessListener)
      queueMicrotask(awarenessListener)

      const view = new EditorView({
        doc: ytext.toString(),
        extensions: [
          basicSetup,
          markdown(),
          oneDark,
          EditorView.lineWrapping,
          yCollab(ytext, awareness),
          EditorView.theme({
            '&': { height: '100%', backgroundColor: '#171615' },
            '.cm-scroller': { overflow: 'auto' },
            '.cm-content': { fontFamily: 'ui-monospace, monospace' },
          }),
        ],
        parent: editorContainerRef.current!,
      })

      cleanup = () => {
        window.removeEventListener('offline', goOffline)
        window.removeEventListener('online', goOnline)
        ytext.unobserve(observer)
        awareness.off('change', awarenessListener)
        view.destroy()
        provider.destroy()
        ydoc.destroy()
      }
    })()

    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [wsUrl, room, user])

  return { editorContainerRef, content, status, synced, peers }
}
