import Markdown from 'react-markdown'
import type { ViewMode } from './ViewModeToggle'

export function PreviewPane({ content, viewMode }: { content: string; viewMode: ViewMode }) {
  if (viewMode === 'edit') return null

  return (
    <div className={`flex flex-col ${viewMode === 'split' ? 'w-1/2' : 'w-full'}`}>
      <div className="px-3 py-1 text-xs text-zinc-400 bg-zinc-900 border-b border-zinc-700 shrink-0">
        Preview
      </div>
      <div className="flex-1 overflow-y-auto p-4 prose prose-invert prose-sm max-w-none break-words">
        <Markdown>{content}</Markdown>
      </div>
    </div>
  )
}
