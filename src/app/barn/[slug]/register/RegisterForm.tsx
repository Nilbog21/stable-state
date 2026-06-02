'use client'

import { useActionState } from 'react'
import type { RegisterState } from './actions'

export function RegisterForm({
  defaultFirstName,
  defaultLastName,
  action,
}: {
  defaultFirstName: string
  defaultLastName: string
  action: (state: RegisterState, formData: FormData) => Promise<RegisterState>
}) {
  const [state, formAction, pending] = useActionState(action, null)

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      {state?.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor="firstName" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          First name
        </label>
        <input
          id="firstName"
          name="firstName"
          type="text"
          required
          defaultValue={defaultFirstName}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="lastName" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Last name
        </label>
        <input
          id="lastName"
          name="lastName"
          type="text"
          required
          defaultValue={defaultLastName}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Role</legend>
        <label className="flex items-center gap-2 text-sm text-zinc-900 dark:text-zinc-50">
          <input type="radio" name="role" value="trainer" required />
          Trainer
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-900 dark:text-zinc-50">
          <input type="radio" name="role" value="rider" required />
          Rider
        </label>
      </fieldset>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {pending ? 'Requesting…' : 'Request access'}
      </button>
    </form>
  )
}
