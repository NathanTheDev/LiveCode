import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { mapSignInError } from '../lib/auth-errors'

export const Route = createFileRoute('/login')({
  component: RouteComponent,
})

function RouteComponent() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await signInWithEmailAndPassword(auth, email, password)
      navigate({ to: '/' })
    } catch {
      setError(mapSignInError())
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-zinc-950 text-white">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 w-full max-w-xs">
        <h1 className="text-lg font-semibold mb-2">Sign in</h1>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <input
          type="email"
          placeholder="Email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="text-sm px-3 py-2 rounded-md bg-zinc-900 border border-zinc-700 outline-none focus:border-zinc-500"
        />
        <input
          type="password"
          placeholder="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="text-sm px-3 py-2 rounded-md bg-zinc-900 border border-zinc-700 outline-none focus:border-zinc-500"
        />
        <button
          type="submit"
          disabled={submitting}
          className="text-sm px-3 py-2 rounded-md bg-zinc-700 hover:bg-zinc-600 font-medium disabled:opacity-50"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="text-xs text-zinc-400">
          Don't have an account?{' '}
          <Link to="/signup" className="text-zinc-200 hover:underline">
            Sign up
          </Link>
        </p>
      </form>
    </div>
  )
}
