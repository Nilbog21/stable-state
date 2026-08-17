import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button, buttonBase, buttonVariants } from '../Button'
import { colorPairs, contrast } from '@/test/tailwind-contrast'

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

    it('should_apply_secondary_variant_classes', () => {
      render(<Button variant="secondary">Cancel</Button>)
      expect(screen.getByRole('button').className).toContain('bg-zinc-200')
    })

    it('should_include_dark_mode_classes_in_primary_variant', () => {
      render(<Button>Save</Button>)
      expect(screen.getByRole('button').className).toContain('dark:')
    })

    it('should_include_dark_mode_classes_in_danger_variant', () => {
      render(<Button variant="danger">Delete</Button>)
      expect(screen.getByRole('button').className).toContain('dark:')
    })

    it('should_include_dark_mode_classes_in_secondary_variant', () => {
      render(<Button variant="secondary">Cancel</Button>)
      expect(screen.getByRole('button').className).toContain('dark:')
    })

    it('should_not_offer_an_unfilled_variant', () => {
      expect(Object.keys(buttonVariants)).toEqual(['primary', 'secondary', 'danger', 'warning'])
    })
  })

  /**
   * #1548. `ghost` was `border-zinc-300 text-zinc-700` and the only disabled cue anywhere in the
   * component was `disabled:opacity-50` on those same classes, so enabled and disabled landed at
   * nearly the same weight -- a ghost button read as disabled at a glance. The fix is structural:
   * every variant owns its disabled colours, so the difference is a declared pair rather than an
   * alpha multiplier over whatever the enabled pair happened to be.
   */
  describe('disabled weight', () => {
    it('should_not_dim_by_opacity_alone', () => {
      expect(buttonBase).not.toContain('opacity')
    })

    describe.each(Object.keys(buttonVariants) as (keyof typeof buttonVariants)[])('%s', (variant) => {
      const classes = buttonVariants[variant]

      it('should_declare_an_explicit_disabled_background', () => {
        expect(classes).toContain('disabled:bg-')
      })

      it('should_declare_an_explicit_disabled_label_colour', () => {
        expect(classes).toContain('disabled:text-')
      })

      it('should_declare_disabled_colours_for_the_dark_scheme_too', () => {
        expect(classes).toContain('dark:disabled:bg-')
      })
    })
  })

  /**
   * The `Badge` treatment (#1219) applied to `Button`: colours read from the installed Tailwind
   * palette, so a variant added below the floor fails here rather than in a checklist run.
   *
   * `warning` is excluded because its dark background is `amber-900/30` -- a translucent tint whose
   * true contrast depends on the page beneath it, which this reader does not composite. It is a
   * shipped pair #1548 does not touch; a future variant wanting alpha extends the reader first.
   */
  describe('resting contrast', () => {
    const opaque = (Object.keys(buttonVariants) as (keyof typeof buttonVariants)[]).filter(
      (v) => v !== 'warning'
    )

    describe.each(opaque)('%s', (variant) => {
      // `fallbackDark`, because `danger` deliberately keeps one `text-white` across both schemes.
      const { light, dark } = colorPairs(buttonVariants[variant], { fallbackDark: true })

      it('should_clear_wcag_aa_in_light_scheme', () => {
        expect(contrast(light[0], light[1])).toBeGreaterThanOrEqual(4.5)
      })

      it('should_clear_wcag_aa_in_dark_scheme', () => {
        expect(contrast(dark[0], dark[1])).toBeGreaterThanOrEqual(4.5)
      })
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

  describe('vertical centering', () => {
    it('should_center_content_on_button_variant', () => {
      render(<Button>Save</Button>)
      expect(screen.getByRole('button').className).toContain('items-center')
    })

    it('should_center_content_on_link_variant', () => {
      render(<Button href="/somewhere">Cancel</Button>)
      expect(screen.getByRole('link').className).toContain('items-center')
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

    it('should_apply_secondary_variant_classes_to_link', () => {
      render(
        <Button href="/somewhere" variant="secondary">
          Edit
        </Button>
      )
      expect(screen.getByRole('link').className).toContain('bg-zinc-200')
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
