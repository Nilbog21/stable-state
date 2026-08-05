# `barn-events.ts`

#1014: `barn_events` CRUD — ad-hoc calendar entries that aren't a lesson or expense (e.g. a costume party), manager-owned but readable by any role listed in `visible_to_roles`.
`getEventsByBarn(barnId)` (all events, `event_at` ascending), `getEventById(eventId, barnId)`, `createEvent(barnId, input: BarnEventInput)`, `updateEvent(eventId, barnId, input: BarnEventInput)`, `deleteEvent(eventId, barnId)` — hard delete, no soft-deactivate concept (unlike `lesson-tiers.ts`) since there's no financial history tied to an event.
`BarnEventInput { title, eventAt, notes?, visibleToRoles: Role[] }` (`types.ts`) — `visibleToRoles` can be empty (a manager-only private note is a valid state, since the manager RLS policy grants SELECT unconditionally regardless of `visible_to_roles`).
`getEventsByIds(barnId, ids)` (#1015 — empty-array short-circuit, else scoped `.in('id', ids)` fetch, no hydration needed since `BarnEvent` has no derived display fields; hydrates `getScheduleForRange`'s bare event ids into display data for the dashboard's Day view, same idiom as `lessons.ts:getLessonsByIds`/`expenses.ts:getExpensesByIds`)
