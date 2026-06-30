import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { EditorView, basicSetup } from 'codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { yCollab } from 'y-codemirror.next'
import Markdown from 'react-markdown'

export const Route = createFileRoute('/ws')({
  component: RouteComponent,
})

function RouteComponent() {
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const [mdContent, setMdContent] = useState('')
  const [status, setStatus] = useState<'connected' | 'disconnected'>('disconnected')

  useEffect(() => {
    const ydoc = new Y.Doc()
    const provider = new WebsocketProvider('ws://localhost:1234', 'livecode', ydoc)
    const ytext = ydoc.getText('codemirror')

    provider.on('status', ({ status }: { status: string }) => {
      setStatus(status === 'connected' ? 'connected' : 'disconnected')
    })
    setStatus(provider.wsconnected ? 'connected' : 'disconnected')

    const observer = () => setMdContent(ytext.toString())
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
  }, [])

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-700 shrink-0">
        <span className="text-sm font-semibold text-white">LiveCode</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          status === 'connected'
            ? 'bg-green-900 text-green-300'
            : 'bg-red-900 text-red-300'
        }`}>
          {status}
        </span>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col w-1/2 border-r border-zinc-700">
          <div className="px-3 py-1 text-xs text-zinc-400 bg-zinc-900 border-b border-zinc-700 shrink-0">
            Markdown
          </div>
          <div
            ref={editorContainerRef}
            className="flex-1 overflow-hidden [&_.cm-editor]:h-full [&_.cm-editor]:text-sm"
          />
        </div>
        <div className="flex flex-col w-1/2">
          <div className="px-3 py-1 text-xs text-zinc-400 bg-zinc-900 border-b border-zinc-700 shrink-0">
            Preview
          </div>
          <div className="flex-1 overflow-y-auto p-4 prose prose-invert prose-sm max-w-none break-words">
            <Markdown>{mdContent}</Markdown>
          </div>
        </div>
      </div>
    </div>
  )
}
