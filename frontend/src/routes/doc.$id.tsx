import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useYjsEditor } from '../hooks/useYjsEditor'
import { ViewModeToggle, type ViewMode } from '../components/ws/ViewModeToggle'
import { ConnectionStatusBadge } from '../components/ws/ConnectionStatusBadge'
import { EditorPane } from '../components/ws/EditorPane'
import { PreviewPane } from '../components/ws/PreviewPane'
import { PresenceBar } from '../components/ws/PresenceBar'
import { DocumentTitle } from '../components/ws/DocumentTitle'
import { EditorErrorBoundary } from '../components/ws/EditorErrorBoundary'
import { BACKEND_URL, authHeaders } from '../lib/api'
import { useRequireAuth } from '../lib/auth-context'

export const Route = createFileRoute('/doc/$id')({
  component: RouteComponent,
})

type DocumentMeta = {
  id: string
  title: string
  updated_at: string
}

async function fetchDocumentMeta(id: string): Promise<DocumentMeta> {
  const res = await fetch(`${BACKEND_URL}/documents/${id}/meta`, { headers: await authHeaders() })
  if (!res.ok) throw new Error('Failed to load document')
  return res.json()
}

async function updateDocumentTitle(id: string, title: string): Promise<DocumentMeta> {
  const res = await fetch(`${BACKEND_URL}/documents/${id}/title`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ title }),
  })
  if (!res.ok) throw new Error('Failed to rename document')
  return res.json()
}

function RouteComponent() {
  const { id } = Route.useParams()
  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const { user } = useRequireAuth()
  const { editorContainerRef, content, status, synced, peers } = useYjsEditor(
    'ws://localhost:1234',
    id,
    user,
  )

  const queryClient = useQueryClient()
  const { data: meta } = useQuery({
    queryKey: ['document-meta', id],
    queryFn: () => fetchDocumentMeta(id),
    enabled: !!user,
  })

  const titleMutation = useMutation({
    mutationFn: (title: string) => updateDocumentTitle(id, title),
    onSuccess: (doc) => {
      queryClient.setQueryData(['document-meta', id], doc)
      queryClient.invalidateQueries({ queryKey: ['documents'] })
    },
  })

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-700 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/" className="text-sm font-semibold text-white hover:text-zinc-300 shrink-0">
            LiveCode
          </Link>
          <span className="text-zinc-600">/</span>
          <DocumentTitle
            title={meta?.title ?? ''}
            isLoading={!meta}
            onSave={(title) => titleMutation.mutate(title)}
          />
        </div>
        <div className="flex items-center gap-3">
          <PresenceBar users={peers} />
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
          <ConnectionStatusBadge status={status} />
        </div>
      </header>
      <EditorErrorBoundary>
        <div className="relative flex flex-1 overflow-hidden">
          <EditorPane containerRef={editorContainerRef} viewMode={viewMode} />
          <PreviewPane content={content} viewMode={viewMode} />
          {!synced && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-950/80 text-zinc-300">
              <div className="h-5 w-5 rounded-full border-2 border-zinc-600 border-t-white animate-spin" />
              <p className="text-xs text-zinc-400">
                {status === 'offline' ? "You're offline — waiting to reconnect…" : 'Loading document…'}
              </p>
            </div>
          )}
        </div>
      </EditorErrorBoundary>
    </div>
  )
}
