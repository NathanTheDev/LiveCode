export type ViewMode = 'edit' | 'split' | 'preview'

const OPTIONS: [ViewMode, string][] = [
  ['edit', 'Edit'],
  ['split', 'Split'],
  ['preview', 'Preview'],
]

export function ViewModeToggle({
  value,
  onChange,
}: {
  value: ViewMode
  onChange: (mode: ViewMode) => void
}) {
  return (
    <div className="flex rounded-md overflow-hidden border border-zinc-700">
      {OPTIONS.map(([mode, label]) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          className={`px-2 py-0.5 text-xs font-medium ${
            value === mode
              ? 'bg-zinc-700 text-white'
              : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
