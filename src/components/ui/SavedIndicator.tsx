'use client'

import { useEffect, useRef, useState } from 'react'

const FLASH_DURATION_MS = 2000

export function useSaveFlash() {
  const [show, setShow] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function flash() {
    setShow(true)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setShow(false), FLASH_DURATION_MS)
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  return { show, flash }
}

/**
 * Result-driven twin of `useSaveFlash`, for forms that save through `useActionState`. Those have
 * no continuation to call `flash()` from: the action must reach the hook unwrapped or the form
 * stops being progressively enhanced (#1396). Pass the successful result object — identity is the
 * trigger, since every server response deserializes fresh — or null when the last result was an
 * error or nothing has been submitted yet.
 */
export function useSaveFlashOn(result: object | null) {
  const [dismissed, setDismissed] = useState<object | null>(null)
  const show = result !== null && result !== dismissed

  useEffect(() => {
    if (!show) return
    const timer = setTimeout(() => setDismissed(result), FLASH_DURATION_MS)
    return () => clearTimeout(timer)
  }, [show, result])

  return show
}

export function SavedIndicator({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <span aria-live="polite" className="text-xs font-medium text-green-600 dark:text-green-400">
      ✓ Saved
    </span>
  )
}
