'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
  onGrant: (memberId: string) => Promise<void>
  onUpdateDocument: (privilegeId: string, value: 'none' | 'read' | 'write') => Promise<void>
  onUpdateLesson: (privilegeId: string, value: boolean) => Promise<void>
  onRevoke: (privilegeId: string) => Promise<void>
  onSetOwner: (memberId: string | null) => Promise<void>
}) {
  const router = useRouter()
  const [selectedMemberId, setSelectedMemberId] = useState('')

  async function handleGrant() {
    await onGrant(selectedMemberId)
    setSelectedMemberId('')
    router.refresh()
  }

  async function handleDocumentChange(privilegeId: string, value: string) {
    await onUpdateDocument(privilegeId, value as 'none' | 'read' | 'write')
    router.refresh()
  }

  async function handleLessonToggle(privilegeId: string, current: boolean) {
    await onUpdateLesson(privilegeId, !current)
    router.refresh()
  }

  async function handleRevoke(privilegeId: string, name: string) {
    if (!window.confirm(`Revoke ${name}'s access to this horse?`)) return
    await onRevoke(privilegeId)
    router.refresh()
  }

  async function handleOwnerToggle(memberId: string, isCurrentOwner: boolean) {
    await onSetOwner(isCurrentOwner ? null : memberId)
    router.refresh()
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Access
        </h2>

        {availableMembers.length > 0 && (
          <div className="flex items-center gap-2">
            <select
              aria-label="Select member"
              value={selectedMemberId}
              onChange={(e) => setSelectedMemberId(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
            >
              <option value="">Select member…</option>
              {availableMembers.map((member) => (
                <option key={member.membershipId} value={member.membershipId}>
                  {member.name}
                </option>
              ))}
            </select>
            <Button type="button" size="sm" onClick={handleGrant} disabled={!selectedMemberId}>
              Grant Access
            </Button>
          </div>
        )}
      </div>

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
              {grants.map((grant) => (
                <tr key={grant.id}>
                  <Td>{grant.name}</Td>
                  <Td>
                    <Button
                      type="button"
                      size="sm"
                      variant={grant.memberId === ownerMemberId ? 'primary' : 'ghost'}
                      onClick={() => handleOwnerToggle(grant.memberId, grant.memberId === ownerMemberId)}
                    >
                      {grant.memberId === ownerMemberId ? 'Owner' : 'Set as Owner'}
                    </Button>
                  </Td>
                  <Td>
                    <select
                      aria-label={`${grant.name} document access`}
                      value={grant.documentPrivileges}
                      onChange={(e) => handleDocumentChange(grant.id, e.target.value)}
                      className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
                    >
                      <option value="none">None</option>
                      <option value="read">Read</option>
                      <option value="write">Write</option>
                    </select>
                  </Td>
                  <Td>
                    <Button
                      type="button"
                      size="sm"
                      variant={grant.lessonReadPrivileges ? 'primary' : 'ghost'}
                      onClick={() => handleLessonToggle(grant.id, grant.lessonReadPrivileges)}
                    >
                      {grant.lessonReadPrivileges ? 'Can View' : 'Cannot View'}
                    </Button>
                  </Td>
                  <TableActions>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      onClick={() => handleRevoke(grant.id, grant.name)}
                    >
                      Revoke
                    </Button>
                  </TableActions>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
