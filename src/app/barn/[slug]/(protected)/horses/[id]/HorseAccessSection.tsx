'use client'

import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Switch'
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
 *
 * #1548 joined their corners into a segmented group. Three loose buttons read as three actions;
 * one joined strip with a single filled segment reads as one setting with three values, which is
 * what it is. Radios would say the same thing natively but would need JS to submit on tap — the
 * defect above, reintroduced — so these stay three submits and only the corners changed.
 *
 * The strip carries a divider because two of the three states leave the two *unselected* segments
 * adjacent (`none` puts Read next to Write, `write` puts None next to Read), and both are then the
 * same `secondary` fill with the gap that used to separate them gone. Without a seam those two
 * read as one segment and the strip claims two values rather than three. The divider is a shade
 * darker than the fill in light mode and lighter in dark, the same inversion the switch's off
 * track needs, because zinc-300-on-zinc-200 is 1.3:1 and disappears.
 */
const DOCUMENT_STATES: { value: DocumentPrivilege; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'read', label: 'Read' },
  { value: 'write', label: 'Write' },
]

/**
 * The seam between two adjacent segments. Exported so `HorseAccessSection.test.tsx` can assert the
 * pair clears WCAG's 3:1 non-text floor against `secondary`'s fill in both schemes, the same way
 * `Button.test.tsx` asserts every variant — a bare class string here would drift from the palette.
 */
export const SEGMENT_DIVIDER = 'divide-x divide-zinc-500 dark:divide-zinc-400'

/** Squares off the edges a segment shares with its neighbour, leaving the strip's outer two round. */
function segmentCorners(index: number, total: number): string {
  if (index === 0) return 'rounded-r-none'
  if (index === total - 1) return 'rounded-l-none'
  return 'rounded-none'
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
                        {/* Not a Switch, though it looks boolean: ownership is single-select across
                            rows, and the label already carries the state rather than the fill.
                            #1549 replaces this column with a radio column. */}
                        <Button type="submit" size="sm" variant={isOwner ? 'primary' : 'secondary'}>
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
                          <div
                            className={`inline-flex items-center ${SEGMENT_DIVIDER}`}
                            role="group"
                            aria-label="Document access"
                          >
                            {DOCUMENT_STATES.map(({ value, label }, index) => {
                              const active = grant.documentPrivileges === value
                              return (
                                <form key={value} action={onUpdateDocument.bind(null, grant.id, value)}>
                                  {/* The fill is the only thing telling the three apart, so the same
                                      state goes out through aria-pressed rather than colour alone. */}
                                  <Button
                                    type="submit"
                                    size="sm"
                                    variant={active ? 'primary' : 'secondary'}
                                    aria-pressed={active}
                                    className={segmentCorners(index, DOCUMENT_STATES.length)}
                                  >
                                    {label}
                                  </Button>
                                </form>
                              )
                            })}
                          </div>
                        </Td>
                        <Td>
                          {/* A switch, not a Can View/Cannot View button (#1548): the label was
                              carrying the state, which left nothing saying what the control was. The
                              column header names the setting and the knob says which way it is
                              thrown. */}
                          <form action={onUpdateLesson.bind(null, grant.id, !grant.lessonReadPrivileges)}>
                            <Switch
                              checked={grant.lessonReadPrivileges}
                              label={`Lesson schedule access for ${grant.name}`}
                            />
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
