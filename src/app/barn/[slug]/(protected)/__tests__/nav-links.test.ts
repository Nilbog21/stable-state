import { describe, it, expect } from 'vitest'
import { buildNavLinks } from '../nav-links'

describe('buildNavLinks', () => {
  it('should_build_nine_links_for_manager', () => {
    const links = buildNavLinks('green-acres', 'manager')
    expect(links).toEqual([
      { href: '/barn/green-acres/lessons', label: 'Lessons' },
      { href: '/barn/green-acres/expenses', label: 'Expenses' },
      { href: '/barn/green-acres/horses', label: 'Horses' },
      { href: '/barn/green-acres/agreements?kind=lease', label: 'Leases' },
      { href: '/barn/green-acres/agreements?kind=board', label: 'Boarding' },
      { href: '/barn/green-acres/members', label: 'Members' },
      { href: '/barn/green-acres/finances', label: 'Finances' },
      { href: '/barn/green-acres/settings', label: 'Manage Barn' },
      { href: '/barn/green-acres/guide', label: 'Guide' },
    ])
  })

  it('should_build_four_links_for_trainer', () => {
    const links = buildNavLinks('green-acres', 'trainer')
    expect(links).toEqual([
      { href: '/barn/green-acres/lessons', label: 'Lessons' },
      { href: '/barn/green-acres/horses', label: 'Horses' },
      { href: '/barn/green-acres/members', label: 'Members' },
      { href: '/barn/green-acres/guide', label: 'Guide' },
    ])
  })

  it('should_build_four_links_for_rider', () => {
    const links = buildNavLinks('green-acres', 'rider')
    expect(links).toEqual([
      { href: '/barn/green-acres/lessons', label: 'Lessons' },
      { href: '/barn/green-acres/horses', label: 'Horses' },
      { href: '/barn/green-acres/members', label: 'Members' },
      { href: '/barn/green-acres/guide', label: 'Guide' },
    ])
  })
})
