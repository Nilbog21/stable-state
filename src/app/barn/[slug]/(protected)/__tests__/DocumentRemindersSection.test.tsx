import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { DocumentRemindersSection } from '../DocumentRemindersSection'
import type { DueDocument } from '@/lib/db/types'

afterEach(cleanup)

const pastDueHorseDoc: DueDocument = {
  id: 'doc-1',
  entity: 'horse',
  recordType: 'coggins',
  fileName: 'coggins.pdf',
  reminderDate: '2020-01-01',
  ownerName: 'Thunderbolt',
  ownerId: 'horse-1',
}

describe('DocumentRemindersSection', () => {
  it('should_render_nothing_when_due_documents_is_empty', () => {
    const { container } = render(<DocumentRemindersSection slug="green-acres" dueDocuments={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('should_render_owner_record_type_and_date_as_a_single_line', () => {
    render(<DocumentRemindersSection slug="green-acres" dueDocuments={[pastDueHorseDoc]} />)
    expect(screen.getByText('Thunderbolt — Coggins — Jan 1, 2020')).toBeDefined()
  })

  it('should_link_horse_entity_document_to_horse_detail_page', () => {
    render(<DocumentRemindersSection slug="green-acres" dueDocuments={[pastDueHorseDoc]} />)
    const link = screen.getByRole('link', { name: /thunderbolt/i }) as HTMLAnchorElement
    expect(link.href).toContain('/barn/green-acres/horses/horse-1')
  })

  it('should_link_member_entity_document_to_member_detail_page', () => {
    const memberDoc: DueDocument = {
      ...pastDueHorseDoc,
      id: 'doc-2',
      entity: 'trainer',
      ownerId: 'mem-9',
      ownerName: 'Jane Trainer',
    }
    render(<DocumentRemindersSection slug="green-acres" dueDocuments={[memberDoc]} />)
    const link = screen.getByRole('link', { name: /jane trainer/i }) as HTMLAnchorElement
    expect(link.href).toContain('/barn/green-acres/members/mem-9')
  })

  it('should_fall_back_to_raw_record_type_when_unrecognized', () => {
    render(
      <DocumentRemindersSection
        slug="green-acres"
        dueDocuments={[{ ...pastDueHorseDoc, recordType: 'some_future_type' }]}
      />
    )
    expect(screen.getByText(/some_future_type/)).toBeDefined()
  })
})
