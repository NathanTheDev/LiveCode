import type { ConnectionStatus } from '../../hooks/useYjsEditor'

export function ConnectionStatusBadge({ status }: { status: ConnectionStatus }) {
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
        status === 'connected'
          ? 'bg-green-900 text-green-300'
          : 'bg-red-900 text-red-300'
      }`}
    >
      {status}
    </span>
  )
}
