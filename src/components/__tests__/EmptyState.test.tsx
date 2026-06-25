import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmptyState } from '../EmptyState'

describe('EmptyState', () => {
  it('should_render_heading', () => {
    render(<EmptyState heading="No items yet" subtext="Items will appear here." />)
    expect(screen.getByText('No items yet')).toBeDefined()
  })

  it('should_render_subtext', () => {
    render(<EmptyState heading="No items yet" subtext="Items will appear here." />)
    expect(screen.getByText('Items will appear here.')).toBeDefined()
  })

  it('should_render_cta_link_when_provided', () => {
    render(<EmptyState heading="No items" subtext="Try adding one." cta={{ label: 'Add Item', href: '/items/new' }} />)
    const link = screen.getByRole('link', { name: 'Add Item' })
    expect(link).toBeDefined()
  })

  it('should_render_cta_link_with_correct_href_when_provided', () => {
    render(<EmptyState heading="No items" subtext="Try adding one." cta={{ label: 'Add Item', href: '/items/new' }} />)
    const link = screen.getByRole('link', { name: 'Add Item' }) as HTMLAnchorElement
    expect(link.href).toContain('/items/new')
  })

  it('should_not_render_cta_when_not_provided', () => {
    render(<EmptyState heading="No items" subtext="Try adding one." />)
    expect(screen.queryByRole('link')).toBeNull()
  })
})
