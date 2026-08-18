'use client'

import { Button } from '@/components/ui/Button'
import { Radio } from '@/components/ui/Radio'
import { Switch } from '@/components/ui/Switch'
import { Th, Td, TableActions } from '@/components/ui/Table'

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
 * #1548 joined their corners into a segmented strip, and #1549 replaced the strip with radios —
 * `Radio`, not `<input type="radio">`, so the three are still three forms and three submits and
 * the pre-hydration guarantee is untouched. What the strip couldn't say and the radios can is
 * *single-select*: a filled segment among two unfilled ones is the platform's idiom for a pressed
 * button, and the strip needed a hand-tuned divider to stop its two unselected segments reading as
 * one. A radio group needs none of that, because the dot is the whole answer.
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
 *
 * `owner` arrives separately from `grants` and is always present (#1549 made
 * `horses.owning_member_id` NOT NULL). The owner is only *in* `grants` if a manager granted them
 * access as well, which `createHorse` never does — so the row is synthesised here when it has to
 * be. Without it the Owner column would be a single-select with nothing selected on the majority
 * of horses, and there would be no way to hand ownership to somebody else from a screen that
 * doesn't show who has it.
 */
export function HorseAccessSection({
  grants,
  availableMembers,
  owner,
  onGrant,
  onUpdateDocument,
  onUpdateLesson,
  onRevoke,
  onSetOwner,
}: {
  grants: Grant[]
  availableMembers: { membershipId: string; name: string }[]
  owner: { memberId: string; name: string }
  onGrant: (formData: FormData) => Promise<void>
  onUpdateDocument: (privilegeId: string, value: DocumentPrivilege) => Promise<void>
  onUpdateLesson: (privilegeId: string, value: boolean) => Promise<void>
  onRevoke: (privilegeId: string) => Promise<void>
  onSetOwner: (memberId: string) => Promise<void>
}) {
  // The owner leads, then everyone else in the order the grants arrived. Deduped rather than
  // concatenated: an owner who also holds a privileges row is one member and gets one row, and
  // that row is the owner's — a null `grant` is what marks it, and is also what the cells below
  // branch on, so "no editable grant here" and "this is the owner" can't drift apart.
  const rows: { memberId: string; name: string; grant: Grant | null }[] = [
    { memberId: owner.memberId, name: owner.name, grant: null },
    ...grants
      .filter((grant) => grant.memberId !== owner.memberId)
      .map((grant) => ({ memberId: grant.memberId, name: grant.name, grant })),
  ]

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
            {rows.map((row) => {
              const grant = row.grant
              const isOwner = grant === null
              return (
                <tr key={row.memberId}>
                  <Td>{row.name}</Td>
                  <Td>
                    {/* No enclosing `role="radiogroup"`: this single-select runs down a table
                        column, and a group can't span rows without `aria-owns`. The `Owner`
                        column header names the setting instead. Re-picking the current owner
                        binds them to themselves — what a native radio does on a re-tap — rather
                        than the null that used to leave the horse unowned. */}
                    <form action={onSetOwner.bind(null, row.memberId)}>
                      <Radio checked={isOwner} label={isOwner ? 'Owner' : 'Set as Owner'} />
                    </form>
                  </Td>
                  {/* #1547: ownership confers document write and lesson read on its own, through
                      `auth_is_horse_owner`, whatever this row stores — so on the owner's row these
                      two controls governed nothing and displayed a state the DB would ignore.
                      Effective values as plain cells instead. Blocking the write server-side was
                      the other option and is worse: the control would keep looking live. */}
                  {grant === null ? (
                    <>
                      <Td>Write</Td>
                      <Td>Can View</Td>
                    </>
                  ) : (
                    <>
                      <Td>
                        <div className="inline-flex flex-col" role="radiogroup" aria-label={`Document access for ${row.name}`}>
                          {DOCUMENT_STATES.map(({ value, label }) => (
                            <form key={value} action={onUpdateDocument.bind(null, grant.id, value)}>
                              <Radio checked={grant.documentPrivileges === value} label={label} />
                            </form>
                          ))}
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
                            label={`Lesson schedule access for ${row.name}`}
                          />
                        </form>
                      </Td>
                    </>
                  )}
                  <TableActions>
                    {/* #1549: no Revoke on the owner's row. `revoke_horse_privilege` used to clear
                        `owning_member_id` alongside the grant, which is how a manager unset an
                        owner; the column is NOT NULL now, so revoking would delete a grant nothing
                        displays and leave the row on screen unchanged — a button that visibly does
                        nothing. Ownership moves by picking a different row. */}
                    {grant !== null && (
                      <form action={onRevoke.bind(null, grant.id)}>
                        <Button
                          type="submit"
                          variant="danger"
                          size="sm"
                          onClick={(e) => {
                            if (!window.confirm(`Revoke ${row.name}'s access to this horse?`)) {
                              e.preventDefault()
                            }
                          }}
                        >
                          Revoke
                        </Button>
                      </form>
                    )}
                  </TableActions>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Always, now — there is always an owner row for it to explain. Inside the scroll
            container beneath the table, so it travels with what it annotates. */}
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
          The owner&apos;s document and lesson access comes from owning the horse, so it can&apos;t be
          narrowed here. Every horse has an owner — hand it to somebody else to change who that is.
        </p>
      </div>
    </div>
  )
}
