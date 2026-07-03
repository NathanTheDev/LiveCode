import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BACKEND_URL } from '../lib/api'

type DocumentSummary = {
  id: string
  title: string
  updated_at: string
}

async function fetchDocuments(): Promise<DocumentSummary[]> {
  const res = await fetch(`${BACKEND_URL}/documents`)
  if (!res.ok) throw new Error('Failed to load documents')
  return res.json()
}

async function createDocument(): Promise<DocumentSummary> {
  const res = await fetch(`${BACKEND_URL}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  if (!res.ok) throw new Error('Failed to create document')
  return res.json()
}

export const Route = createFileRoute('/')({
  component: RouteComponent,
})

function RouteComponent() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: documents, isLoading, isError } = useQuery({
    queryKey: ['documents'],
    queryFn: fetchDocuments,
  })

  const createMutation = useMutation({
    mutationFn: createDocument,
    onSuccess: (doc) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      navigate({ to: '/doc/$id', params: { id: doc.id } })
    },
  })

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-white">
      <header className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-700 shrink-0">
        <span className="text-sm font-semibold">LiveCode</span>
        <button
          type="button"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          className="text-xs px-3 py-1.5 rounded-md bg-zinc-700 hover:bg-zinc-600 font-medium disabled:opacity-50"
        >
          {createMutation.isPending ? 'Creating…' : 'New Document'}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading && <p className="text-sm text-zinc-400">Loading…</p>}
        {isError && <p className="text-sm text-red-400">Failed to load documents.</p>}
        {documents && documents.length === 0 && (
          <p className="text-sm text-zinc-400">No documents yet — create one to get started.</p>
        )}
        {documents && documents.length > 0 && (
          <ul className="divide-y divide-zinc-800 border border-zinc-800 rounded-md overflow-hidden">
            {documents.map((doc: DocumentSummary) => (
              <li key={doc.id}>
                <Link
                  to="/doc/$id"
                  params={{ id: doc.id }}
                  className="flex items-center justify-between px-4 py-3 hover:bg-zinc-900"
                >
                  <span className="text-sm font-medium">{doc.title}</span>
                  <span className="text-xs text-zinc-500">
                    {new Date(doc.updated_at).toLocaleString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
