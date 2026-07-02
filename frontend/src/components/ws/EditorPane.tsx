import type { RefObject } from 'react'
import type { ViewMode } from './ViewModeToggle'

export function EditorPane({
  containerRef,
  viewMode,
}: {
  containerRef: RefObject<HTMLDivElement | null>
  viewMode: ViewMode
}) {
  return (
    <div
      className={`flex-col border-r border-zinc-700 ${
        viewMode === 'preview'
          ? 'hidden'
          : viewMode === 'split'
            ? 'flex w-1/2'
            : 'flex w-full border-r-0'
      }`}
    >
      <div className="px-3 py-1 text-xs text-zinc-400 bg-zinc-900 border-b border-zinc-700 shrink-0">
        Markdown
      </div>
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden [&_.cm-editor]:h-full [&_.cm-editor]:text-sm"
      />
    </div>
  )
}
