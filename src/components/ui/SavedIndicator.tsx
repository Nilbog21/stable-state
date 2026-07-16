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

export function SavedIndicator({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <span aria-live="polite" className="text-xs font-medium text-green-600 dark:text-green-400">
      ✓ Saved
    </span>
  )
}
