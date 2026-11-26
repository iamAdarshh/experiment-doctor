import { useState } from 'react'
import { createAccount } from './api'
import { useFlagsmith } from '@flagsmith/flagsmith/react'

type Props = { onSuccess: (firstName: string) => void; variant: string }

export function SignupForm({ onSuccess, variant }: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const flagsmith = useFlagsmith()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>
    setSubmitting(true)
    setError(null)
    try {
      await createAccount(data)
      flagsmith.trackEvent('signup_completed')
      const nameToDisplay = data.fullName ? data.fullName.split(' ')[0] : (data.email ? data.email.split('@')[0] : 'User')
      onSuccess(nameToDisplay)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (variant === 'three_field') {
    return (
      <form className="form" onSubmit={handleSubmit}>
        <h2>Create your account</h2>
        <p className="muted">Free for teams up to 10. No credit card.</p>

        <label>
          Full name
          <input name="fullName" autoComplete="name" required />
        </label>
        <label>
          Work email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="new-password" minLength={8} required />
        </label>

        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    )
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <h2>Create your account</h2>
      <p className="muted">Free for teams up to 10. No credit card.</p>

      <label>
        Full name
        <input name="fullName" autoComplete="name" required />
      </label>
      <label>
        Work email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Company
        <input name="company" autoComplete="organization" required />
      </label>
      <label>
        Role
        <select name="role" required defaultValue="">
          <option value="" disabled>Choose one</option>
          <option>Engineering manager</option>
          <option>Tech lead</option>
          <option>Director / VP</option>
          <option>Engineer</option>
          <option>Other</option>
        </select>
      </label>
      <label>
        Team size
        <select name="teamSize" required defaultValue="">
          <option value="" disabled>Choose one</option>
          <option>1–5</option>
          <option>6–15</option>
          <option>16–50</option>
          <option>50+</option>
        </select>
      </label>
      <label>
        Password
        <input name="password" type="password" autoComplete="new-password" minLength={8} required />
      </label>

      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  )
}
