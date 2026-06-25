import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

afterEach(cleanup)

vi.mock('../NavigationBlocker', () => ({
  BlockingLink: ({
    href,
    children,
    className,
  }: {
    href: string
    children: React.ReactNode
    className?: string
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))

import { BarnSwitcher } from '../BarnSwitcher'

const singleBarnProps = {
  barnName: 'Sunset Stables',
  barnSlug: 'sunset-stables',
  showSwitchBarn: false,
  activeBarnMemberships: [{ slug: 'sunset-stables', name: 'Sunset Stables' }],
}

const multiBarnProps = {
  barnName: 'Sunset Stables',
  barnSlug: 'sunset-stables',
  showSwitchBarn: true,
  activeBarnMemberships: [
    { slug: 'sunset-stables', name: 'Sunset Stables' },
    { slug: 'meadow-farm', name: 'Meadow Farm' },
    { slug: 'oak-ridge', name: 'Oak Ridge' },
  ],
}

describe('BarnSwitcher - barn name link', () => {
  it('should_render_barn_name_as_link_for_single_barn', () => {
    render(<BarnSwitcher {...singleBarnProps} />)
    expect(screen.getByRole('link', { name: 'Sunset Stables' })).toBeDefined()
  })

  it('should_render_barn_name_as_link_for_multi_barn', () => {
    render(<BarnSwitcher {...multiBarnProps} />)
    expect(screen.getByRole('link', { name: 'Sunset Stables' })).toBeDefined()
  })

  it('should_barn_name_link_point_to_barn_dashboard', () => {
    render(<BarnSwitcher {...singleBarnProps} />)
    const link = screen.getByRole('link', { name: 'Sunset Stables' }) as HTMLAnchorElement
    expect(link.href).toContain('/barn/sunset-stables')
  })
})

describe('BarnSwitcher - caret button visibility', () => {
  it('should_not_render_caret_for_single_barn_member', () => {
    render(<BarnSwitcher {...singleBarnProps} />)
    expect(screen.queryByRole('button', { name: /switch barn/i })).toBeNull()
  })

  it('should_render_caret_button_for_multi_barn_member', () => {
    render(<BarnSwitcher {...multiBarnProps} />)
    expect(screen.getByRole('button', { name: /switch barn/i })).toBeDefined()
  })
})

describe('BarnSwitcher - dropdown open state', () => {
  beforeEach(() => {
    render(<BarnSwitcher {...multiBarnProps} />)
  })

  it('should_not_show_dropdown_initially', () => {
    expect(screen.queryByText('Meadow Farm')).toBeNull()
  })

  it('should_open_dropdown_on_caret_click', () => {
    fireEvent.click(screen.getByRole('button', { name: /switch barn/i }))
    expect(screen.getByText('Meadow Farm')).toBeDefined()
  })

  it('should_toggle_dropdown_on_second_caret_click', () => {
    fireEvent.click(screen.getByRole('button', { name: /switch barn/i }))
    fireEvent.click(screen.getByRole('button', { name: /switch barn/i }))
    expect(screen.queryByText('Meadow Farm')).toBeNull()
  })
})

describe('BarnSwitcher - outside dismiss', () => {
  it('should_close_dropdown_on_outside_click', () => {
    render(
      <div>
        <BarnSwitcher {...multiBarnProps} />
        <button data-testid="outside">outside</button>
      </div>
    )
    fireEvent.click(screen.getByRole('button', { name: /switch barn/i }))
    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.queryByText('Meadow Farm')).toBeNull()
  })

  it('should_close_dropdown_on_outside_touch', () => {
    render(
      <div>
        <BarnSwitcher {...multiBarnProps} />
        <button data-testid="outside">outside</button>
      </div>
    )
    fireEvent.click(screen.getByRole('button', { name: /switch barn/i }))
    fireEvent.touchStart(screen.getByTestId('outside'))
    expect(screen.queryByText('Meadow Farm')).toBeNull()
  })
})

describe('BarnSwitcher - dropdown content', () => {
  beforeEach(() => {
    render(<BarnSwitcher {...multiBarnProps} />)
    fireEvent.click(screen.getByRole('button', { name: /switch barn/i }))
  })

  it('should_mark_current_barn_with_checkmark', () => {
    expect(screen.getByText(/✓/)).toBeDefined()
  })

  it('should_not_render_current_barn_as_a_link', () => {
    const links = screen.getAllByRole('link')
    const hrefs = links.map((l) => (l as HTMLAnchorElement).href)
    expect(hrefs.every((h) => !h.includes('/barn/sunset-stables'))).toBe(true)
  })

  it('should_list_other_barns_as_links', () => {
    expect(screen.getByRole('link', { name: 'Meadow Farm' })).toBeDefined()
    expect(screen.getByRole('link', { name: 'Oak Ridge' })).toBeDefined()
  })

  it('should_other_barn_links_point_to_barn_dashboards', () => {
    const meadow = screen.getByRole('link', { name: 'Meadow Farm' }) as HTMLAnchorElement
    const oak = screen.getByRole('link', { name: 'Oak Ridge' }) as HTMLAnchorElement
    expect(meadow.href).toContain('/barn/meadow-farm')
    expect(oak.href).toContain('/barn/oak-ridge')
  })
})
