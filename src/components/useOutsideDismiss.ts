'use client'
import { useEffect, useRef, useState } from 'react'

/**
 * Owns the open/closed state and container ref for a tap-to-toggle dropdown
 * or popover, dismissing it on any `mousedown`/`touchstart` outside the
 * ref'd element — consolidated from four per-component copies
 * (`BarnSwitcher`, `UserMenu`, `NotificationBell`, `ExhaustionBar`); pass
 * `enabled = false` to skip listener attachment entirely (BarnSwitcher's
 * single-barn render, where the dropdown never exists).
 */
export function useOutsideDismiss(enabled = true) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!enabled) return
    function close(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('touchstart', close)
    }
  }, [enabled])

  return { open, setOpen, ref }
}
