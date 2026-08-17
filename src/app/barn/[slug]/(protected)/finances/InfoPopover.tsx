'use client'
import { useOutsideDismiss } from '@/components/useOutsideDismiss'

export function InfoPopover({ text, align = 'right' }: { text: string; align?: 'left' | 'right' }) {
  // <span>, not the hook's default <div>: this renders inside a <p> on the
  // finances page, where a <div> is invalid HTML.
  const { open, setOpen, ref } = useOutsideDismiss<HTMLSpanElement>()
  return (
    <span ref={ref} className="relative inline-block">
      {/* Raw Tailwind, not <Button>: icon-only unpadded info trigger — same
          reasoning as NotificationBell's bell trigger. Against the two page
          backgrounds in globals.css (#ffffff / #0a0a0a), zinc-500 on white is
          4.83:1 and zinc-400 on the dark ground is 7.53:1, both clearing WCAG
          AA's 4.5:1 for normal text. The reverse pairing is what #1551 removed:
          zinc-400 on white is only 2.63:1 and zinc-500 on the dark ground
          4.10:1, so the shade has to swap with the mode, not stay put.
          text-base keeps the glyph from shrinking to the text-xs of the <Th>
          it sits in. */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="ml-1 flex min-h-[44px] min-w-[44px] items-center justify-center text-base text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        aria-label="Info"
        aria-expanded={open}
      >
        ⓘ
      </button>
      {open && (
        <span
          className={`absolute top-6 z-10 w-48 rounded-md border border-zinc-200 bg-white p-2 text-xs text-zinc-700 shadow-md dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 ${align === 'left' ? 'left-0' : 'right-0'}`}
        >
          {text}
        </span>
      )}
    </span>
  )
}
