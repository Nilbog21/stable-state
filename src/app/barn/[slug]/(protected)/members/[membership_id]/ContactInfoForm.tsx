'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { SavedIndicator, useSaveFlash } from '@/components/ui/SavedIndicator'
import { useUnsavedChangesGuard } from '../../NavigationBlocker'
import type { Profile } from '@/lib/db/types'

interface Props {
  profile: Profile
  action: (formData: FormData) => Promise<{ error: string | null }>
}

export function ContactInfoForm({ profile, action }: Props) {
  const router = useRouter()
  const [phone, setPhone] = useState(profile.phone ?? '')
  const [ecName, setEcName] = useState(profile.emergency_contact_name ?? '')
  const [ecPhone, setEcPhone] = useState(profile.emergency_contact_phone ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  // `useSaveFlash`, not its `useSaveFlashOn` twin: this form awaits the action imperatively, so
  // it has the success continuation the twin exists to substitute for.
  const { show: saved, flash } = useSaveFlash()
  useUnsavedChangesGuard(dirty)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSaving(true)

    const form = new FormData()
    form.set('phone', phone)
    form.set('emergency_contact_name', ecName)
    form.set('emergency_contact_phone', ecPhone)

    const result = await action(form)
    setSaving(false)

    if (result.error) {
      setError(result.error)
      return
    }

    setDirty(false)
    flash()
    router.refresh()
  }

  return (
    <section className="mb-10">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Contact Info
      </h2>
      <form aria-label="Contact Info" onSubmit={handleSubmit} onChange={() => setDirty(true)} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="contact-phone" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Phone
          </label>
          <input
            id="contact-phone"
            name="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="contact-ec-name" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Emergency Contact Name
          </label>
          <input
            id="contact-ec-name"
            name="emergency_contact_name"
            type="text"
            value={ecName}
            onChange={(e) => setEcName(e.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="contact-ec-phone" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Emergency Contact Phone
          </label>
          <input
            id="contact-ec-phone"
            name="emergency_contact_phone"
            type="tel"
            value={ecPhone}
            onChange={(e) => setEcPhone(e.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex items-center gap-3">
          <Button type="submit" loading={saving} className="self-start">
            Save
          </Button>
          <SavedIndicator show={saved} />
        </div>
      </form>
    </section>
  )
}
