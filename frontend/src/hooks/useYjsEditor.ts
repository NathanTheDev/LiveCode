import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { EditorView, basicSetup } from 'codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { yCollab } from 'y-codemirror.next'

export type ConnectionStatus = 'connected' | 'disconnected'

export function useYjsEditor(wsUrl: string, room: string) {
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')

  useEffect(() => {
    const ydoc = new Y.Doc()
    const provider = new WebsocketProvider(wsUrl, room, ydoc)
    const ytext = ydoc.getText('codemirror')

    provider.on('status', ({ status }: { status: string }) => {
      setStatus(status === 'connected' ? 'connected' : 'disconnected')
    })
    setStatus(provider.wsconnected ? 'connected' : 'disconnected')

    const observer = () => setContent(ytext.toString())
    ytext.observe(observer)

    const view = new EditorView({
      doc: ytext.toString(),
      extensions: [
        basicSetup,
        markdown(),
        oneDark,
        EditorView.lineWrapping,
        yCollab(ytext, null),
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
      view.destroy()
      provider.destroy()
      ydoc.destroy()
    }
  }, [wsUrl, room])

  return { editorContainerRef, content, status }
}
