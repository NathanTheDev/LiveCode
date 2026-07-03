import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import type { Awareness } from 'y-protocols/awareness'
import { EditorView, basicSetup } from 'codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { yCollab } from 'y-codemirror.next'
import { randomColor, randomDisplayName } from '../lib/presence'

export type ConnectionStatus = 'connected' | 'disconnected'

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
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const [peers, setPeers] = useState<PresenceUser[]>([])

  useEffect(() => {
    const ydoc = new Y.Doc()
    const provider = new WebsocketProvider(wsUrl, room, ydoc)
    const ytext = ydoc.getText('codemirror')
    const { awareness } = provider

    awareness.setLocalStateField('user', {
      name: randomDisplayName(),
      color: randomColor(),
    })

    provider.on('status', ({ status }: { status: string }) => {
      setStatus(status === 'connected' ? 'connected' : 'disconnected')
    })
    setStatus(provider.wsconnected ? 'connected' : 'disconnected')

    const observer = () => setContent(ytext.toString())
    ytext.observe(observer)

    const awarenessListener = () => setPeers(readPeers(awareness))
    awareness.on('change', awarenessListener)
    setPeers(readPeers(awareness))

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
      ytext.unobserve(observer)
      awareness.off('change', awarenessListener)
      view.destroy()
      provider.destroy()
      ydoc.destroy()
    }
  }, [wsUrl, room])

  return { editorContainerRef, content, status, peers }
}
