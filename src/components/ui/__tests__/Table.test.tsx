import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Th, Td, TableActions } from '../Table'

function renderTh(th: React.ReactNode) {
  render(
    <table>
      <thead>
        <tr>{th}</tr>
      </thead>
    </table>
  )
}

function renderTd(td: React.ReactNode) {
  render(
    <table>
      <tbody>
        <tr>{td}</tr>
      </tbody>
    </table>
  )
}

describe('Th', () => {
  it('should_render_children', () => {
    renderTh(<Th>Horse</Th>)
    expect(screen.getByRole('columnheader').textContent).toBe('Horse')
  })

  it('should_apply_header_typography_classes', () => {
    renderTh(<Th>Horse</Th>)
    expect(screen.getByRole('columnheader').className).toContain(
      'text-xs font-medium uppercase tracking-wide text-zinc-500'
    )
  })

  it('should_apply_bottom_border', () => {
    renderTh(<Th>Horse</Th>)
    expect(screen.getByRole('columnheader').className).toContain('border-b')
  })

  it('should_include_dark_mode_classes', () => {
    renderTh(<Th>Horse</Th>)
    expect(screen.getByRole('columnheader').className).toContain('dark:')
  })

  it('should_align_text_left', () => {
    renderTh(<Th>Horse</Th>)
    expect(screen.getByRole('columnheader').className).toContain('text-left')
  })

  it('should_merge_caller_class_name', () => {
    renderTh(<Th className="w-1/2">Horse</Th>)
    expect(screen.getByRole('columnheader').className).toContain('w-1/2')
  })

  it('should_keep_base_classes_when_class_name_passed', () => {
    renderTh(<Th className="w-1/2">Horse</Th>)
    expect(screen.getByRole('columnheader').className).toContain('uppercase')
  })

  it('should_forward_native_props', () => {
    renderTh(<Th colSpan={2}>Horse</Th>)
    expect(screen.getByRole('columnheader').getAttribute('colspan')).toBe('2')
  })
})

describe('Td', () => {
  it('should_render_children', () => {
    renderTd(<Td>Willow</Td>)
    expect(screen.getByRole('cell').textContent).toBe('Willow')
  })

  it('should_apply_row_cell_classes', () => {
    renderTd(<Td>Willow</Td>)
    expect(screen.getByRole('cell').className).toContain('py-3 pr-6 text-sm text-zinc-900')
  })

  it('should_apply_row_divider_border', () => {
    renderTd(<Td>Willow</Td>)
    expect(screen.getByRole('cell').className).toContain('border-b border-zinc-100')
  })

  it('should_include_dark_mode_classes', () => {
    renderTd(<Td>Willow</Td>)
    expect(screen.getByRole('cell').className).toContain('dark:')
  })

  it('should_merge_caller_class_name', () => {
    renderTd(<Td className="font-semibold">Willow</Td>)
    expect(screen.getByRole('cell').className).toContain('font-semibold')
  })

  it('should_keep_base_classes_when_class_name_passed', () => {
    renderTd(<Td className="font-semibold">Willow</Td>)
    expect(screen.getByRole('cell').className).toContain('py-3')
  })

  it('should_forward_native_props', () => {
    renderTd(<Td colSpan={3}>Willow</Td>)
    expect(screen.getByRole('cell').getAttribute('colspan')).toBe('3')
  })

  it('should_apply_secondary_tone_text_color', () => {
    renderTd(<Td tone="secondary">Willow</Td>)
    expect(screen.getByRole('cell').className).toContain('text-zinc-500')
  })

  it('should_apply_secondary_tone_dark_text_color', () => {
    renderTd(<Td tone="secondary">Willow</Td>)
    expect(screen.getByRole('cell').className).toContain('dark:text-zinc-400')
  })

  it('should_not_apply_primary_text_color_when_secondary_tone', () => {
    renderTd(<Td tone="secondary">Willow</Td>)
    expect(screen.getByRole('cell').className).not.toContain('text-zinc-900')
  })
})

describe('TableActions', () => {
  it('should_render_children_in_a_cell', () => {
    renderTd(<TableActions>Edit</TableActions>)
    expect(screen.getByRole('cell').textContent).toBe('Edit')
  })

  it('should_align_content_right', () => {
    renderTd(<TableActions>Edit</TableActions>)
    expect(screen.getByRole('cell').className).toContain('text-right')
  })

  it('should_keep_row_cell_classes', () => {
    renderTd(<TableActions>Edit</TableActions>)
    expect(screen.getByRole('cell').className).toContain('py-3')
  })

  it('should_merge_caller_class_name', () => {
    renderTd(<TableActions className="whitespace-nowrap">Edit</TableActions>)
    expect(screen.getByRole('cell').className).toContain('whitespace-nowrap')
  })

  it('should_forward_tone_to_td', () => {
    renderTd(<TableActions tone="secondary">Edit</TableActions>)
    expect(screen.getByRole('cell').className).toContain('text-zinc-500')
  })
})
