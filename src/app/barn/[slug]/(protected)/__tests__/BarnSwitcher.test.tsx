import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

afterEach(cleanup)

vi.mock('../NavigationBlocker', () => ({
  BlockingLink: ({
    href,
    children,
    className,
    onClick,
  }: {
    href: string
    children: React.ReactNode
    className?: string
    onClick?: () => void
  }) => (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  ),
}))

import { BarnSwitcher } from '../BarnSwitcher'

const singleBarnProps = {
  barnName: 'Sunset Stables',
  barnSlug: 'sunset-stables',
  activeBarnMemberships: [{ slug: 'sunset-stables', name: 'Sunset Stables' }],
}

const multiBarnProps = {
  barnName: 'Sunset Stables',
  barnSlug: 'sunset-stables',
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

  it('should_close_dropdown_on_barn_name_link_click', () => {
    fireEvent.click(screen.getByRole('button', { name: /switch barn/i }))
    fireEvent.click(screen.getByRole('link', { name: 'Sunset Stables' }))
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

  it('should_render_current_barn_as_text_not_link_in_dropdown', () => {
    const checkmarkEl = screen.getByText('✓')
    expect(checkmarkEl.parentElement?.tagName).toBe('SPAN')
  })

  it('should_list_meadow_farm_as_link', () => {
    expect(screen.getByRole('link', { name: 'Meadow Farm' })).toBeDefined()
  })

  it('should_list_oak_ridge_as_link', () => {
    expect(screen.getByRole('link', { name: 'Oak Ridge' })).toBeDefined()
  })

  it('should_meadow_farm_link_point_to_barn_dashboard', () => {
    const meadow = screen.getByRole('link', { name: 'Meadow Farm' }) as HTMLAnchorElement
    expect(meadow.href).toContain('/barn/meadow-farm')
  })

  it('should_oak_ridge_link_point_to_barn_dashboard', () => {
    const oak = screen.getByRole('link', { name: 'Oak Ridge' }) as HTMLAnchorElement
    expect(oak.href).toContain('/barn/oak-ridge')
  })

  it('should_close_dropdown_on_other_barn_link_click', () => {
    fireEvent.click(screen.getByRole('link', { name: 'Meadow Farm' }))
    expect(screen.queryByText('Meadow Farm')).toBeNull()
  })
})
