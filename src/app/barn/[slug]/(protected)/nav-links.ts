import type { Role } from '@/lib/db/types'

export function buildNavLinks(slug: string, role: Role): { href: string; label: string }[] {
  if (role === 'manager') {
    return [
      { href: `/barn/${slug}/lessons`, label: 'Lessons' },
      { href: `/barn/${slug}/expenses`, label: 'Expenses' },
      { href: `/barn/${slug}/horses`, label: 'Horses' },
      { href: `/barn/${slug}/agreements?kind=lease`, label: 'Leases' },
      { href: `/barn/${slug}/agreements?kind=board`, label: 'Boarding' },
      { href: `/barn/${slug}/members`, label: 'Members' },
      { href: `/barn/${slug}/finances`, label: 'Finances' },
      { href: `/barn/${slug}/settings`, label: 'Manage Barn' },
      { href: `/barn/${slug}/guide`, label: 'Guide' },
    ]
  }

  return [
    { href: `/barn/${slug}/lessons`, label: 'Lessons' },
    { href: `/barn/${slug}/horses`, label: 'Horses' },
    { href: `/barn/${slug}/members`, label: 'Members' },
    { href: `/barn/${slug}/guide`, label: 'Guide' },
  ]
}
