import { FirebaseError } from 'firebase/app'

// Maps Firebase Auth error codes to user-facing copy. Sign-in errors are
// intentionally collapsed to one generic message so a failed attempt can't
// be used to enumerate which emails have accounts (see GH issue #2 Phase 2
// validation: "don't reveal whether a given email is already registered").
//
// Signup's "email already in use" is a partial exception: Firebase's client
// SDK has no built-in way to create an account without confirming a
// collision, so full enumeration-resistance isn't achievable here without a
// different flow (e.g. email-link / OTP). Treated as an accepted tradeoff,
// noted on the GH issue rather than solved.
export function mapSignInError(): string {
  return 'Invalid email or password.'
}

export function mapSignUpError(error: unknown): string {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'auth/invalid-email':
        return 'Enter a valid email address.'
      case 'auth/weak-password':
        return 'Password should be at least 6 characters.'
      case 'auth/email-already-in-use':
        return 'An account with this email already exists. Try signing in instead.'
    }
  }
  return 'Something went wrong. Please try again.'
}
