import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import type { Awareness } from 'y-protocols/awareness'
import { EditorView, basicSetup } from 'codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { yCollab } from 'y-codemirror.next'
import { assignUserName, randomColor } from '../lib/presence'

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline'

export type PresenceUser = {
  clientId: number
  name: string
  color: string
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
      isLocal: clientId === localClientId,
    }))
}

export function useYjsEditor(wsUrl: string, room: string) {
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [synced, setSynced] = useState(false)
  const [peers, setPeers] = useState<PresenceUser[]>([])

  useEffect(() => {
    const ydoc = new Y.Doc()
    const provider = new WebsocketProvider(wsUrl, room, ydoc)
    const ytext = ydoc.getText('codemirror')
    const { awareness } = provider

    // Once a session has connected at least once, any subsequent 'connecting'
    // status (y-websocket's built-in exponential-backoff retry loop) means
    // we're reconnecting rather than establishing the first connection.
    let hasConnectedOnce = false

    // 'sync' fires on every (re)sync, not just the first - the loading
    // overlay needs to clear again after a reconnect, not just once.
    provider.on('sync', (isSynced: boolean) => setSynced(isSynced))

    // Wait for the initial sync so existing peers' awareness state (and thus
    // their names) has arrived before picking a "User N" - otherwise two
    // clients connecting at the same instant could both pick "User 1".
    provider.once('sync', () => {
      const existingNames = Array.from(awareness.getStates().values())
        .map((state) => state.user?.name)
        .filter((name): name is string => Boolean(name))
      awareness.setLocalStateField('user', {
        name: assignUserName(existingNames),
        color: randomColor(),
      })
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

    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
      ytext.unobserve(observer)
      awareness.off('change', awarenessListener)
      view.destroy()
      provider.destroy()
      ydoc.destroy()
    }
  }, [wsUrl, room])

  return { editorContainerRef, content, status, synced, peers }
}
