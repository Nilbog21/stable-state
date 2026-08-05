# `member-invites.ts`

Managed-member/invite workflow, split out of `barn-memberships.ts` (#869).
`createManagedMember(barnId, firstName, lastName, role, client?)` — calls `create_managed_member` RPC to insert a stub profile (`is_managed=true`, null email) + active membership of the given role with a random `invite_token`, returns `{ membershipId }`; `claimManagedMember(token, userId, email, client?)` — calls `claim_managed_member` RPC to atomically link a real auth user to a stub; `revokeInviteToken(membershipId, barnId, client?)` — regenerates the `invite_token` and returns the new UUID.
