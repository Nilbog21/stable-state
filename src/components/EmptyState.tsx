import Link from 'next/link'

export function EmptyState({
  heading,
  subtext,
  cta,
}: {
  heading: string
  subtext: string
  cta?: { label: string; href: string }
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-10 w-10 text-zinc-300 dark:text-zinc-600"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
        />
      </svg>
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{heading}</p>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{subtext}</p>
      {cta && (
        <Link
          href={cta.href}
          className="mt-1 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {cta.label}
        </Link>
      )}
    </div>
  )
}
