'use client'
import { useEffect, useRef, useState } from 'react'

/**
 * Owns the open/closed state and container ref for a tap-to-toggle dropdown
 * or popover, dismissing it on any `mousedown`/`touchstart` outside the
 * ref'd element or on Escape — consolidated from four per-component copies
 * (`BarnSwitcher`, `UserMenu`, `NotificationBell`, `ExhaustionBar`), later
 * joined by `MonthCalendarPicker` and `InfoPopover` (#1551); pass
 * `enabled = false` to skip listener attachment entirely (BarnSwitcher's
 * single-barn render, where the dropdown never exists).
 *
 * The element type is a parameter because `InfoPopover`'s wrapper has to be
 * a `<span>` — it renders inside a `<p>`, where a `<div>` is invalid HTML.
 */
export function useOutsideDismiss<T extends HTMLElement = HTMLDivElement>(enabled = true) {
  const [open, setOpen] = useState(false)
  const ref = useRef<T>(null)

  useEffect(() => {
    if (!enabled) return
    function close(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function closeOnEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('touchstart', close)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [enabled])

  return { open, setOpen, ref }
}
