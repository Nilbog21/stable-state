'use client'
import { usePathname, useSearchParams } from 'next/navigation'
import { BlockingLink } from './NavigationBlocker'
import { isNavLinkActive } from './nav-active'

interface Props {
  navLinks: { href: string; label: string }[]
}

const activeClassName = 'text-sm font-semibold text-zinc-900 underline dark:text-zinc-50'
const inactiveClassName =
  'text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50'

export function DesktopNavLinks({ navLinks }: Props) {
  const pathname = usePathname()
  const search = useSearchParams().toString()
  const currentPath = search ? `${pathname}?${search}` : pathname

  return (
    <div className="hidden items-center gap-4 md:flex">
      {navLinks.map((link) => {
        const active = isNavLinkActive(currentPath, link.href)
        return (
          <BlockingLink
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={active ? activeClassName : inactiveClassName}
          >
            {link.label}
          </BlockingLink>
        )
      })}
    </div>
  )
}
