import { useRef, useState } from 'react'

export function DocumentTitle({
  title,
  isLoading,
  onSave,
}: {
  title: string
  isLoading: boolean
  onSave: (title: string) => void
}) {
  const [draft, setDraft] = useState(title)
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Keep the draft in sync with the committed title while not editing,
  // e.g. when it changes from another client's rename.
  const [prevTitle, setPrevTitle] = useState(title)
  if (title !== prevTitle && !editing) {
    setPrevTitle(title)
    setDraft(title)
  }

  function commit() {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed && trimmed !== title) {
      onSave(trimmed)
    } else {
      setDraft(title)
    }
  }

  if (isLoading) {
    return <span className="h-5 w-32 rounded bg-zinc-800 animate-pulse" />
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setEditing(true)
          requestAnimationFrame(() => inputRef.current?.select())
        }}
        className="text-sm font-medium text-white hover:text-zinc-300 truncate max-w-[16rem] text-left"
        title="Click to rename"
      >
        {title}
      </button>
    )
  }

  return (
    <input
      ref={inputRef}
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setDraft(title)
          setEditing(false)
        }
      }}
      className="text-sm font-medium text-white bg-zinc-800 rounded px-1.5 py-0.5 max-w-[16rem] outline-none ring-1 ring-zinc-600 focus:ring-zinc-400"
    />
  )
}
