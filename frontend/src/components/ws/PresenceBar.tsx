import type { PresenceUser } from '../../hooks/useYjsEditor'

export function PresenceBar({ users }: { users: PresenceUser[] }) {
  if (users.length === 0) return null

  return (
    <div className="flex items-center gap-1.5">
      {users.map((user) => (
        <span
          key={user.clientId}
          title={user.isLocal ? `${user.name} (you)` : user.name}
          className="flex items-center gap-1 pl-0.5 pr-2 py-0.5 rounded-full text-xs font-medium text-zinc-950"
          style={{ backgroundColor: user.color }}
        >
          {user.photoURL && (
            <img
              src={user.photoURL}
              alt=""
              referrerPolicy="no-referrer"
              className="h-4 w-4 rounded-full object-cover"
            />
          )}
          {user.name}
          {user.isLocal && <span className="opacity-70">(you)</span>}
        </span>
      ))}
    </div>
  )
}
