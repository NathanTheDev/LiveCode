import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useYjsEditor } from '../hooks/useYjsEditor'
import { ViewModeToggle, type ViewMode } from '../components/ws/ViewModeToggle'
import { ConnectionStatusBadge } from '../components/ws/ConnectionStatusBadge'
import { EditorPane } from '../components/ws/EditorPane'
import { PreviewPane } from '../components/ws/PreviewPane'

export const Route = createFileRoute('/ws')({
  component: RouteComponent,
})

function RouteComponent() {
  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const { editorContainerRef, content, status } = useYjsEditor('ws://localhost:1234', 'livecode')

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-700 shrink-0">
        <span className="text-sm font-semibold text-white">LiveCode</span>
        <div className="flex items-center gap-3">
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
          <ConnectionStatusBadge status={status} />
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <EditorPane containerRef={editorContainerRef} viewMode={viewMode} />
        <PreviewPane content={content} viewMode={viewMode} />
      </div>
    </div>
  )
}
