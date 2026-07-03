import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { GoogleAuthProvider, GithubAuthProvider, signInWithPopup } from 'firebase/auth'
import { auth } from '../../lib/firebase'
import { isDismissedPopupError, mapSocialSignInError } from '../../lib/auth-errors'

export function SocialSignInButtons({ onError }: { onError: (message: string) => void }) {
  const navigate = useNavigate()
  const [pending, setPending] = useState<'google' | 'github' | null>(null)

  async function handleSignIn(provider: GoogleAuthProvider | GithubAuthProvider, kind: 'google' | 'github') {
    onError('')
    setPending(kind)
    try {
      await signInWithPopup(auth, provider)
      navigate({ to: '/' })
    } catch (err) {
      if (!isDismissedPopupError(err)) {
        onError(await mapSocialSignInError(auth, err))
      }
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <div className="h-px flex-1 bg-zinc-800" />
        or
        <div className="h-px flex-1 bg-zinc-800" />
      </div>
      <button
        type="button"
        disabled={pending !== null}
        onClick={() => handleSignIn(new GoogleAuthProvider(), 'google')}
        className="text-sm px-3 py-2 rounded-md bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 font-medium disabled:opacity-50"
      >
        {pending === 'google' ? 'Continuing…' : 'Continue with Google'}
      </button>
      <button
        type="button"
        disabled={pending !== null}
        onClick={() => handleSignIn(new GithubAuthProvider(), 'github')}
        className="text-sm px-3 py-2 rounded-md bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 font-medium disabled:opacity-50"
      >
        {pending === 'github' ? 'Continuing…' : 'Continue with GitHub'}
      </button>
    </div>
  )
}
