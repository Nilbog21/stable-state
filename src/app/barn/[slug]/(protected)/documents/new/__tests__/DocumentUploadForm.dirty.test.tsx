import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { DocumentUploadForm } from '../DocumentUploadForm'
import { withBlocker } from '@/test/navigation-blocker-harness'

afterEach(cleanup)

const noop = async () => ({ error: null })

describe('DocumentUploadForm — navigation dirty state', () => {
  it('should_start_clean', () => {
    render(withBlocker(<DocumentUploadForm entity="horse" action={noop} cancelHref="/back" />))
    expect(screen.getByTestId('dirty').textContent).toBe('clean')
  })

  it('should_set_dirty_when_notes_changed', () => {
    const { container } = render(withBlocker(<DocumentUploadForm entity="horse" action={noop} cancelHref="/back" />))
    fireEvent.change(container.querySelector('input[name="notes"]')!, { target: { value: 'coggins 2026' } })
    expect(screen.getByTestId('dirty').textContent).toBe('dirty')
  })

  it('should_set_dirty_when_file_chosen', () => {
    const { container } = render(withBlocker(<DocumentUploadForm entity="horse" action={noop} cancelHref="/back" />))
    const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' })
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } })
    expect(screen.getByTestId('dirty').textContent).toBe('dirty')
  })
})
