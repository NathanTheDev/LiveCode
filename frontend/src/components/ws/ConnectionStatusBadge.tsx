import type { ConnectionStatus } from '../../hooks/useYjsEditor'

const STYLES: Record<ConnectionStatus, string> = {
  connected: 'bg-green-900 text-green-300',
  connecting: 'bg-yellow-900 text-yellow-300',
  reconnecting: 'bg-yellow-900 text-yellow-300 animate-pulse',
  offline: 'bg-red-900 text-red-300',
}

const LABELS: Record<ConnectionStatus, string> = {
  connected: 'connected',
  connecting: 'connecting…',
  reconnecting: 'reconnecting…',
  offline: 'offline',
}

export function ConnectionStatusBadge({ status }: { status: ConnectionStatus }) {
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${STYLES[status]}`}
      title={`Connection: ${LABELS[status]}`}
    >
      {LABELS[status]}
    </span>
  )
}
