'use client'

import { Button } from '@/components/ui/Button'
import { Th, Td, TableActions } from '@/components/ui/Table'
import { EmptyState } from '@/components/EmptyState'

type Grant = {
  id: string
  memberId: string
  name: string
  documentPrivileges: 'none' | 'read' | 'write'
  lessonReadPrivileges: boolean
}

/**
 * The Access table's contents (#1390 moved its "Access" heading up to the enclosing
 * `AccordionSection`).
 *
 * Every control is a `<form>` whose action is the Server Function itself. Before #1390 they
 * were `<Button type="button" onClick>` with no form action, which meant each one was a silent
 * no-op inside the hydration window — the same defect #1385 fixed for member documents, on a
 * page a manager lands on and immediately clicks.
 *
 * Two of the five actions arrive already bound to `(barnSlug, horseId)` and take their
 * remaining value from the form's own fields (`onGrant`, `onUpdateDocument`), because a
 * `<select>`'s value isn't known at render time. The other three bind their next value here:
 * `.bind()` on a Server Action is still a Server Action, whereas the inline closure it replaces
 * would not be progressively enhanced.
 *
 * Still a client component, for two reasons only: Revoke's `window.confirm` and the document
 * select's change-to-submit. Neither needs state, so there is no `useState`/`useRouter` here —
 * each action `revalidatePath`s, which is what refreshes the table.
 */
export function HorseAccessSection({
  grants,
  availableMembers,
  ownerMemberId,
  onGrant,
  onUpdateDocument,
  onUpdateLesson,
  onRevoke,
  onSetOwner,
}: {
  grants: Grant[]
  availableMembers: { membershipId: string; name: string }[]
  ownerMemberId: string | null
  onGrant: (formData: FormData) => Promise<void>
  onUpdateDocument: (privilegeId: string, formData: FormData) => Promise<void>
  onUpdateLesson: (privilegeId: string, value: boolean) => Promise<void>
  onRevoke: (privilegeId: string) => Promise<void>
  onSetOwner: (memberId: string | null) => Promise<void>
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* Top of the section body rather than the accordion's headerExtra slot: a select is not
          a workable control inside a summary, which is itself a tap target that toggles. */}
      {availableMembers.length > 0 && (
        <form action={onGrant} className="flex flex-wrap items-center justify-end gap-2">
          <select
            name="member_id"
            aria-label="Select member"
            defaultValue=""
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
          >
            <option value="">Select member…</option>
            {availableMembers.map((member) => (
              <option key={member.membershipId} value={member.membershipId}>
                {member.name}
              </option>
            ))}
          </select>
          {/* Deliberately not disabled until a member is picked: a disabled button is dead
              before hydration too. An empty member_id reaches the action, which no-ops. */}
          <Button type="submit" size="sm">
            Grant Access
          </Button>
        </form>
      )}

      {grants.length === 0 ? (
        <EmptyState
          heading="No additional members have been granted access"
          subtext="Managers already have full access to this horse, and trainers can already read and upload its documents and view its lesson schedule. Use this section to grant that same access to a specific rider or boarder who wouldn't otherwise have it — including this horse's owner, if any."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <Th>Member</Th>
                <Th>Owner</Th>
                <Th>Documents</Th>
                <Th>Lesson Schedule</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {grants.map((grant) => {
                const isOwner = grant.memberId === ownerMemberId
                return (
                  <tr key={grant.id}>
                    <Td>{grant.name}</Td>
                    <Td>
                      <form action={onSetOwner.bind(null, isOwner ? null : grant.memberId)}>
                        <Button type="submit" size="sm" variant={isOwner ? 'primary' : 'ghost'}>
                          {isOwner ? 'Owner' : 'Set as Owner'}
                        </Button>
                      </form>
                    </Td>
                    <Td>
                      <form
                        action={onUpdateDocument.bind(null, grant.id)}
                        className="flex items-center gap-2"
                      >
                        <select
                          name="value"
                          aria-label={`${grant.name} document access`}
                          defaultValue={grant.documentPrivileges}
                          onChange={(e) => e.currentTarget.form?.requestSubmit()}
                          className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
                        >
                          <option value="none">None</option>
                          <option value="read">Read</option>
                          <option value="write">Write</option>
                        </select>
                        {/* The onChange above is the post-hydration interaction; this button is
                            what makes the same change reachable before it. */}
                        <Button type="submit" size="sm" variant="ghost">
                          Save
                        </Button>
                      </form>
                    </Td>
                    <Td>
                      <form action={onUpdateLesson.bind(null, grant.id, !grant.lessonReadPrivileges)}>
                        <Button
                          type="submit"
                          size="sm"
                          variant={grant.lessonReadPrivileges ? 'primary' : 'ghost'}
                        >
                          {grant.lessonReadPrivileges ? 'Can View' : 'Cannot View'}
                        </Button>
                      </form>
                    </Td>
                    <TableActions>
                      <form action={onRevoke.bind(null, grant.id)}>
                        <Button
                          type="submit"
                          variant="danger"
                          size="sm"
                          onClick={(e) => {
                            if (!window.confirm(`Revoke ${grant.name}'s access to this horse?`)) {
                              e.preventDefault()
                            }
                          }}
                        >
                          Revoke
                        </Button>
                      </form>
                    </TableActions>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
