import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { CancelLessonFields } from '../CancelLessonFields'

afterEach(cleanup)

const pickerRiders = [
  { id: 'rider-1', name: 'Alice' },
  { id: 'rider-2', name: 'Bob' },
]

describe('CancelLessonFields', () => {
  it('should_show_type_fieldset_for_normal_lesson', () => {
    render(
      <CancelLessonFields
        lessonType="normal"
        cancelledByInstructorDefault={false}
        groupInstructorDescription=""
        pickerRiders={[]}
      />
    )
    expect(screen.getByLabelText(/cancelled by rider/i)).toBeDefined()
    expect(screen.getByLabelText(/cancelled by instructor/i)).toBeDefined()
  })

  it('should_default_to_instructor_radio_checked_when_cancelledByInstructorDefault_true', () => {
    render(
      <CancelLessonFields
        lessonType="normal"
        cancelledByInstructorDefault={true}
        groupInstructorDescription=""
        pickerRiders={[]}
      />
    )
    expect((screen.getByLabelText(/cancelled by instructor/i) as HTMLInputElement).checked).toBe(true)
  })

  it('should_default_to_rider_radio_checked_when_cancelledByInstructorDefault_false', () => {
    render(
      <CancelLessonFields
        lessonType="normal"
        cancelledByInstructorDefault={false}
        groupInstructorDescription=""
        pickerRiders={[]}
      />
    )
    expect((screen.getByLabelText(/cancelled by rider/i) as HTMLInputElement).checked).toBe(true)
  })

  it('should_not_show_rider_picker_for_normal_lesson_when_rider_selected', () => {
    render(
      <CancelLessonFields
        lessonType="normal"
        cancelledByInstructorDefault={false}
        groupInstructorDescription=""
        pickerRiders={pickerRiders}
      />
    )
    fireEvent.click(screen.getByLabelText(/cancelled by rider/i))
    expect(screen.queryByRole('radio', { name: 'Alice' })).toBeNull()
  })

  it('should_hide_rider_picker_for_group_lesson_when_instructor_selected', () => {
    render(
      <CancelLessonFields
        lessonType="group"
        cancelledByInstructorDefault={true}
        groupInstructorDescription="This will cancel the whole lesson."
        pickerRiders={pickerRiders}
      />
    )
    expect(screen.queryByRole('radio', { name: 'Alice' })).toBeNull()
  })

  it('should_show_rider_picker_for_group_lesson_when_rider_selected', () => {
    render(
      <CancelLessonFields
        lessonType="group"
        cancelledByInstructorDefault={false}
        groupInstructorDescription="This will cancel the whole lesson."
        pickerRiders={pickerRiders}
      />
    )
    expect(screen.getByRole('radio', { name: 'Alice' })).toBeDefined()
    expect(screen.getByRole('radio', { name: 'Bob' })).toBeDefined()
  })

  it('should_toggle_rider_picker_visibility_when_radio_selection_changes', () => {
    render(
      <CancelLessonFields
        lessonType="group"
        cancelledByInstructorDefault={true}
        groupInstructorDescription="This will cancel the whole lesson."
        pickerRiders={pickerRiders}
      />
    )
    expect(screen.queryByRole('radio', { name: 'Alice' })).toBeNull()
    fireEvent.click(screen.getByLabelText(/cancelled by rider/i))
    expect(screen.getByRole('radio', { name: 'Alice' })).toBeDefined()
    fireEvent.click(screen.getByLabelText(/cancelled by instructor/i))
    expect(screen.queryByRole('radio', { name: 'Alice' })).toBeNull()
  })

  it('should_mark_picker_radios_as_required', () => {
    render(
      <CancelLessonFields
        lessonType="group"
        cancelledByInstructorDefault={false}
        groupInstructorDescription="This will cancel the whole lesson."
        pickerRiders={pickerRiders}
      />
    )
    expect((screen.getByRole('radio', { name: 'Alice' }) as HTMLInputElement).required).toBe(true)
  })

  it('should_use_rider_id_as_the_picker_radio_name', () => {
    render(
      <CancelLessonFields
        lessonType="group"
        cancelledByInstructorDefault={false}
        groupInstructorDescription="This will cancel the whole lesson."
        pickerRiders={pickerRiders}
      />
    )
    expect((screen.getByRole('radio', { name: 'Alice' }) as HTMLInputElement).name).toBe('rider_id')
  })

  it('should_use_cancel_type_as_the_type_radio_name', () => {
    render(
      <CancelLessonFields
        lessonType="normal"
        cancelledByInstructorDefault={false}
        groupInstructorDescription=""
        pickerRiders={[]}
      />
    )
    expect((screen.getByLabelText(/cancelled by rider/i) as HTMLInputElement).name).toBe('cancel_type')
  })

  it('should_show_group_instructor_description_when_instructor_selected', () => {
    render(
      <CancelLessonFields
        lessonType="group"
        cancelledByInstructorDefault={true}
        groupInstructorDescription="This will cancel and zero out the fee for 2 enrolled riders: Alice, Bob."
        pickerRiders={pickerRiders}
      />
    )
    expect(screen.getByText(/2 enrolled riders/i)).toBeDefined()
  })

  it('should_show_rider_selection_prompt_when_rider_selected', () => {
    render(
      <CancelLessonFields
        lessonType="group"
        cancelledByInstructorDefault={false}
        groupInstructorDescription="This will cancel and zero out the fee for 2 enrolled riders: Alice, Bob."
        pickerRiders={pickerRiders}
      />
    )
    expect(screen.getByText(/select a rider/i)).toBeDefined()
    expect(screen.queryByText(/2 enrolled riders/i)).toBeNull()
  })

  it('should_not_show_any_description_paragraph_for_normal_lesson', () => {
    render(
      <CancelLessonFields
        lessonType="normal"
        cancelledByInstructorDefault={false}
        groupInstructorDescription="unused"
        pickerRiders={[]}
      />
    )
    expect(screen.queryByText('unused')).toBeNull()
    expect(screen.queryByText(/select a rider/i)).toBeNull()
  })
})
