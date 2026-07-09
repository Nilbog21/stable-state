import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from '../Button'

describe('Button', () => {
  describe('variants', () => {
    it('should_render_children', () => {
      render(<Button>Save</Button>)
      expect(screen.getByRole('button').textContent).toBe('Save')
    })

    it('should_default_to_primary_variant', () => {
      render(<Button>Save</Button>)
      expect(screen.getByRole('button').className).toContain('bg-zinc-900')
    })

    it('should_apply_danger_variant_classes', () => {
      render(<Button variant="danger">Delete</Button>)
      expect(screen.getByRole('button').className).toContain('bg-red-600')
    })

    it('should_apply_ghost_variant_classes', () => {
      render(<Button variant="ghost">Cancel</Button>)
      expect(screen.getByRole('button').className).toContain('border')
    })

    it('should_include_dark_mode_classes_in_primary_variant', () => {
      render(<Button>Save</Button>)
      expect(screen.getByRole('button').className).toContain('dark:')
    })

    it('should_include_dark_mode_classes_in_danger_variant', () => {
      render(<Button variant="danger">Delete</Button>)
      expect(screen.getByRole('button').className).toContain('dark:')
    })

    it('should_include_dark_mode_classes_in_ghost_variant', () => {
      render(<Button variant="ghost">Cancel</Button>)
      expect(screen.getByRole('button').className).toContain('dark:')
    })
  })

  describe('loading state', () => {
    it('should_disable_button_when_loading', () => {
      render(<Button loading>Save</Button>)
      expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true)
    })

    it('should_set_aria_busy_when_loading', () => {
      render(<Button loading>Save</Button>)
      expect(screen.getByRole('button').getAttribute('aria-busy')).toBe('true')
    })

    it('should_show_loading_indicator_when_loading', () => {
      render(<Button loading>Save</Button>)
      expect(screen.getByRole('button').querySelector('.animate-spin')).not.toBeNull()
    })

    it('should_not_show_loading_indicator_by_default', () => {
      render(<Button>Save</Button>)
      expect(screen.getByRole('button').querySelector('.animate-spin')).toBeNull()
    })

    it('should_not_disable_button_by_default', () => {
      render(<Button>Save</Button>)
      expect(screen.getByRole('button').hasAttribute('disabled')).toBe(false)
    })

    it('should_disable_button_when_disabled_prop_set', () => {
      render(<Button disabled>Save</Button>)
      expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true)
    })
  })

  describe('size', () => {
    it('should_default_to_md_size', () => {
      render(<Button>Save</Button>)
      expect(screen.getByRole('button').className).toContain('px-4')
    })

    it('should_apply_sm_size_padding', () => {
      render(<Button size="sm">Save</Button>)
      expect(screen.getByRole('button').className).toContain('px-3')
    })

    it('should_apply_sm_size_text', () => {
      render(<Button size="sm">Save</Button>)
      expect(screen.getByRole('button').className).toContain('text-xs')
    })

    it('should_meet_minimum_touch_target_height_for_sm_size', () => {
      render(<Button size="sm">Save</Button>)
      expect(screen.getByRole('button').className).toContain('min-h-11')
    })
  })

  describe('href', () => {
    it('should_render_as_link_when_href_provided', () => {
      render(<Button href="/somewhere">Cancel</Button>)
      expect(screen.getByRole('link', { name: 'Cancel' })).toBeDefined()
    })

    it('should_set_href_attribute_on_link', () => {
      render(<Button href="/somewhere">Cancel</Button>)
      expect(screen.getByRole('link').getAttribute('href')).toBe('/somewhere')
    })

    it('should_apply_variant_classes_to_link', () => {
      render(
        <Button href="/somewhere" variant="danger">
          Cancel
        </Button>
      )
      expect(screen.getByRole('link').className).toContain('bg-red-600')
    })

    it('should_merge_caller_class_name_on_link', () => {
      render(
        <Button href="/somewhere" className="w-full">
          Cancel
        </Button>
      )
      expect(screen.getByRole('link').className).toContain('w-full')
    })
  })

  describe('native props', () => {
    it('should_forward_native_button_props', () => {
      render(<Button type="submit">Save</Button>)
      expect(screen.getByRole('button').getAttribute('type')).toBe('submit')
    })

    it('should_default_type_to_button', () => {
      render(<Button>Save</Button>)
      expect(screen.getByRole('button').getAttribute('type')).toBe('button')
    })

    it('should_merge_caller_class_name', () => {
      render(<Button className="w-full">Save</Button>)
      expect(screen.getByRole('button').className).toContain('w-full')
    })

    it('should_keep_variant_classes_when_class_name_passed', () => {
      render(<Button className="w-full">Save</Button>)
      expect(screen.getByRole('button').className).toContain('bg-zinc-900')
    })

    it('should_meet_minimum_touch_target_height', () => {
      render(<Button>Save</Button>)
      expect(screen.getByRole('button').className).toContain('min-h-11')
    })
  })
})
