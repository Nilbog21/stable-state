'use client'

import { Button } from '@/components/ui/Button'
import { Th, Td, TableActions } from '@/components/ui/Table'
import { EmptyState } from '@/components/EmptyState'

type DocumentPrivilege = 'none' | 'read' | 'write'

type Grant = {
  id: string
  memberId: string
  name: string
  documentPrivileges: DocumentPrivilege
  lessonReadPrivileges: boolean
}

/**
 * One button per state rather than a `<select>` (#1390's testing round). A select's value isn't
 * known at render time, so it had to travel as `FormData` and submit from an `onChange` — the one
 * control on this page still needing JS to be usable, and the one that didn't persist. It also
 * put a lone Save button in a row where every other column submits on tap.
 *
 * Three states rules out the neighbours' label-names-the-current-state toggle, and a cycling
 * button can't be jumped to a state or say whether its label is the state or the next action. So:
 * all three shown, the current one filled, each binding its own value into the action.
 */
const DOCUMENT_STATES: { value: DocumentPrivilege; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'read', label: 'Read' },
  { value: 'write', label: 'Write' },
]

/**
 * The Access table's contents (#1390 moved its "Access" heading up to the enclosing
 * `AccordionSection`).
 *
 * Every control is a `<form>` whose action is the Server Function itself. Before #1390 they
 * were `<Button type="button" onClick>` with no form action, which meant each one was a silent
 * no-op inside the hydration window — the same defect #1385 fixed for member documents, on a
 * page a manager lands on and immediately clicks.
 *
 * Only `onGrant` still takes its value from a form field, its `<select>` of barn members being
 * open-ended. Every other action binds its value here: `.bind()` on a Server Action is still a
 * Server Action, whereas the inline closure it replaces would not be progressively enhanced.
 *
 * Still a client component for one reason: Revoke's `window.confirm`. Nothing here needs state,
 * so there is no `useState`/`useRouter` — each action `revalidatePath`s, which is what refreshes
 * the table.
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
  onUpdateDocument: (privilegeId: string, value: DocumentPrivilege) => Promise<void>
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
                    {/* #1547: ownership confers document write and lesson read on its own, through
                        `auth_is_horse_owner`, whatever this row stores — so on the owner's row these
                        two controls governed nothing and displayed a state the DB would ignore.
                        Effective values as plain cells instead. Blocking the write server-side was
                        the other option and is worse: the control would keep looking live. */}
                    {isOwner ? (
                      <>
                        <Td>Write</Td>
                        <Td>Can View</Td>
                      </>
                    ) : (
                      <>
                        <Td>
                          <div className="flex flex-wrap items-center gap-1">
                            {DOCUMENT_STATES.map(({ value, label }) => {
                              const active = grant.documentPrivileges === value
                              return (
                                <form key={value} action={onUpdateDocument.bind(null, grant.id, value)}>
                                  {/* The fill is the only thing telling the three apart, so the same
                                      state goes out through aria-pressed rather than colour alone. */}
                                  <Button
                                    type="submit"
                                    size="sm"
                                    variant={active ? 'primary' : 'ghost'}
                                    aria-pressed={active}
                                  >
                                    {label}
                                  </Button>
                                </form>
                              )
                            })}
                          </div>
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
                      </>
                    )}
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

          {/* Only when there is an owner row to explain — otherwise it describes nothing on screen.
              Inside the scroll container beneath the table, so it travels with what it annotates. */}
          {grants.some((grant) => grant.memberId === ownerMemberId) && (
            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
              The owner&apos;s document and lesson access comes from owning the horse, so it can&apos;t be
              narrowed here. Unset the owner to edit their access as an ordinary grant.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
