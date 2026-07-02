import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Card } from '../Card'

describe('Card', () => {
  describe('default variant', () => {
    it('should_render_children_in_default_variant', () => {
      render(<Card>Card content</Card>)
      expect(screen.getByText('Card content')).toBeDefined()
    })

    it('should_render_div_not_link_in_default_variant', () => {
      render(<Card>Card content</Card>)
      expect(screen.queryByRole('link')).toBeNull()
    })

    it('should_not_apply_hover_classes_in_default_variant', () => {
      render(<Card>Card content</Card>)
      expect(screen.getByText('Card content').className).not.toContain('hover:')
    })
  })

  describe('link variant', () => {
    it('should_render_link_with_href_when_href_given', () => {
      render(<Card href="/barn/sunny-acres/horses/h1">Card content</Card>)
      expect(screen.getByRole('link').getAttribute('href')).toBe('/barn/sunny-acres/horses/h1')
    })

    it('should_render_children_inside_link_variant', () => {
      render(<Card href="/barn/sunny-acres/horses/h1">Card content</Card>)
      expect(screen.getByRole('link').textContent).toBe('Card content')
    })

    it('should_apply_hover_classes_in_link_variant', () => {
      render(<Card href="/barn/sunny-acres/horses/h1">Card content</Card>)
      expect(screen.getByRole('link').className).toContain('hover:')
    })
  })
})
