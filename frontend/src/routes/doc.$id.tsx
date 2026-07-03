import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useYjsEditor } from '../hooks/useYjsEditor'
import { ViewModeToggle, type ViewMode } from '../components/ws/ViewModeToggle'
import { ConnectionStatusBadge } from '../components/ws/ConnectionStatusBadge'
import { EditorPane } from '../components/ws/EditorPane'
import { PreviewPane } from '../components/ws/PreviewPane'
import { PresenceBar } from '../components/ws/PresenceBar'

export const Route = createFileRoute('/doc/$id')({
  component: RouteComponent,
})

function RouteComponent() {
  const { id } = Route.useParams()
  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const { editorContainerRef, content, status, peers } = useYjsEditor('ws://localhost:1234', id)

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-700 shrink-0">
        <Link to="/" className="text-sm font-semibold text-white hover:text-zinc-300">
          LiveCode
        </Link>
        <div className="flex items-center gap-3">
          <PresenceBar users={peers} />
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
