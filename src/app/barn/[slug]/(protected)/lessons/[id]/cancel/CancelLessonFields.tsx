'use client'

import { useState } from 'react'

interface Rider {
  id: string
  name: string
}

export function CancelLessonFields({
  lessonType,
  cancelledByInstructorDefault,
  groupInstructorDescription,
  pickerRiders,
  isLateCancellationWindow = false,
}: {
  lessonType: 'normal' | 'group'
  cancelledByInstructorDefault: boolean
  groupInstructorDescription: string
  pickerRiders: Rider[]
  isLateCancellationWindow?: boolean
}) {
  const [cancelType, setCancelType] = useState<'instructor' | 'rider'>(
    cancelledByInstructorDefault ? 'instructor' : 'rider'
  )
  const showRiderPicker = lessonType === 'group' && cancelType === 'rider'

  return (
    <>
      {lessonType === 'group' && (
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          {cancelType === 'instructor'
            ? groupInstructorDescription
            : 'Select a rider below to cancel only their participation.'}
        </p>
      )}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Type</legend>
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="radio"
            name="cancel_type"
            value="instructor"
            checked={cancelType === 'instructor'}
            onChange={() => setCancelType('instructor')}
          />
          Cancelled by Instructor
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="radio"
            name="cancel_type"
            value="rider"
            checked={cancelType === 'rider'}
            onChange={() => setCancelType('rider')}
          />
          Cancelled by Rider
        </label>
      </fieldset>
      {cancelType === 'rider' && isLateCancellationWindow && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          {lessonType === 'normal'
            ? 'The rider will be due a late cancellation fee.'
            : 'Warning: No late cancellation fees are currently leveraged for group lessons.'}
        </p>
      )}
      {showRiderPicker && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Rider</legend>
          {pickerRiders.map((rider) => (
            <label key={rider.id} className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input type="radio" name="rider_id" value={rider.id} required />
              {rider.name}
            </label>
          ))}
        </fieldset>
      )}
    </>
  )
}
