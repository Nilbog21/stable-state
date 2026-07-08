'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Profile } from '@/lib/db/types'
import { updateProfileAction } from './actions'
import { Button } from '@/components/ui/Button'

interface Props {
  profile: Profile
  heading: string
  redirectAfterSave: string | null
}

export function ProfileForm({ profile, heading, redirectAfterSave }: Props) {
  const router = useRouter()
  const [firstName, setFirstName] = useState(profile.first_name)
  const [lastName, setLastName] = useState(profile.last_name)
  const [phone, setPhone] = useState(profile.phone ?? '')
  const [ecName, setEcName] = useState(profile.emergency_contact_name ?? '')
  const [ecPhone, setEcPhone] = useState(profile.emergency_contact_phone ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSaved(false)

    if (!firstName.trim()) return
    if (!lastName.trim()) return

    const nameChanged = firstName !== profile.first_name || lastName !== profile.last_name
    if (nameChanged) {
      const ok = window.confirm(
        'You changed your name. Please notify your barn manager so they can update their records. Continue?'
      )
      if (!ok) return
    }

    const form = new FormData()
    form.set('first_name', firstName)
    form.set('last_name', lastName)
    form.set('phone', phone)
    form.set('emergency_contact_name', ecName)
    form.set('emergency_contact_phone', ecPhone)

    const result = await updateProfileAction(form)
    if (result.error) {
      setError(result.error)
      return
    }

    setSaved(true)
    if (redirectAfterSave) {
      router.push(redirectAfterSave)
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <h1 className="mb-6 text-xl font-semibold text-zinc-900 dark:text-zinc-50">{heading}</h1>
      <form aria-label={heading} onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="first_name" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            First Name
          </label>
          <input
            id="first_name"
            name="first_name"
            type="text"
            required
            value={firstName}
            onChange={(e) => { setFirstName(e.target.value); setSaved(false) }}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="last_name" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Last Name
          </label>
          <input
            id="last_name"
            name="last_name"
            type="text"
            required
            value={lastName}
            onChange={(e) => { setLastName(e.target.value); setSaved(false) }}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="phone" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Phone
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setSaved(false) }}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="emergency_contact_name" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Emergency Contact Name
          </label>
          <input
            id="emergency_contact_name"
            name="emergency_contact_name"
            type="text"
            value={ecName}
            onChange={(e) => { setEcName(e.target.value); setSaved(false) }}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="emergency_contact_phone" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Emergency Contact Phone
          </label>
          <input
            id="emergency_contact_phone"
            name="emergency_contact_phone"
            type="tel"
            value={ecPhone}
            onChange={(e) => { setEcPhone(e.target.value); setSaved(false) }}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {saved && <p className="text-sm text-green-700 dark:text-green-400">Profile saved.</p>}
        <Button type="submit">Save</Button>
      </form>
    </div>
  )
}
