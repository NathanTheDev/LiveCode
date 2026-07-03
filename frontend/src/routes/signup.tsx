import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { mapSignUpError } from '../lib/auth-errors'

export const Route = createFileRoute('/signup')({
  component: RouteComponent,
})

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 6

function RouteComponent() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!EMAIL_RE.test(email)) {
      setError('Enter a valid email address.')
      return
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password should be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }

    setSubmitting(true)
    try {
      await createUserWithEmailAndPassword(auth, email, password)
      navigate({ to: '/' })
    } catch (err) {
      setError(mapSignUpError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-zinc-950 text-white">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 w-full max-w-xs">
        <h1 className="text-lg font-semibold mb-2">Create account</h1>
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
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="text-sm px-3 py-2 rounded-md bg-zinc-900 border border-zinc-700 outline-none focus:border-zinc-500"
        />
        <button
          type="submit"
          disabled={submitting}
          className="text-sm px-3 py-2 rounded-md bg-zinc-700 hover:bg-zinc-600 font-medium disabled:opacity-50"
        >
          {submitting ? 'Creating account…' : 'Sign up'}
        </button>
        <p className="text-xs text-zinc-400">
          Already have an account?{' '}
          <Link to="/login" className="text-zinc-200 hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  )
}
