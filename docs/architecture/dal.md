# Data access layer

`src/lib/db/` — one file per domain.
Never query Supabase directly from components or actions; always go through these modules.

**`Instant` return types (#1222).** This layer is the only one that knows both a `TIMESTAMPTZ` and the barn it belongs to, so it is the only place an `Instant` (`{ at, tz }`, `types.ts`) is minted — that is what lets `format-date.ts`'s `formatBarnDateTime`/`formatBarnDate`/`formatBarnTime` take no timezone argument and be impossible to call wrong.
Any reader returning an instant that gets rendered or compared therefore takes a `timezone` parameter and brands its output rather than returning a plain string:

| Module | Branded field(s) | Signature change |
|---|---|---|
| `lessons.ts` | `Lesson.lesson_at`, `LessonDetail.lesson_at` | `getLessonById`/`getLessonsByIds`/`getLessonsByBarn` take `timezone` |
| `barn-events.ts` | `BarnEvent.event_at` | `getEventsByBarn`/`getEventById`/`getEventsByIds` take `timezone`; `createEvent`/`updateEvent` return the raw row (unbranded — neither caller reads it) |
| `outstanding.ts` | `OutstandingItem.date` | `mergeOutstandingItems` takes `timezone` |
| `lesson-finances.ts` | `HorseIncomeDetailRow.lessonAt`, `RiderIncomeDetailRow.lessonAt`, `TrainerIncomeDetailRow.lessonAt` | the three `get*IncomeDetail` readers take `timezone` |
| `notifications.ts` | `Notification.created_at` | `getNotifications(userId, barnId, timezone, limit?)` |
| `horses.ts` | projected-exhaustion and upcoming-lesson `lessonAt` | `getHorseProjectedExhaustion`/`getUpcomingLessonsForHorse` take `timezone` |
| `lesson-participants.ts` | the hydrated participant's `lesson_at` | `hydrateParticipants` takes `timezone` |

Audit columns nothing displays stay plain strings — see `types.ts`'s `Instant` doc comment for the rule and its one exception.
`backup.ts` is deliberately outside this scheme (see its row below): it needs zone-less wall-clock digits for an Excel serial, not a formatted string.

**`CalendarDate` return types (#1223).** The other frame.
A `DATE` column names a day on a wall calendar, not a moment on the timeline, so it needs no `timezone` parameter — but while it was a bare `string` the compiler could not stop it reaching a zoned path, or an instant reaching a UTC-forced one.
Every reader returning a `DATE` column now returns `CalendarDate` (`types.ts`), which `format-date.ts`'s `formatShortDateOnly`/`formatChargePeriod` require:

| Module | Branded field(s) |
|---|---|
| `documents.ts` | `HorseDocument`/`TrainerDocument`/`RiderDocument.reminder_date`, `DueDocument.reminderDate`; `getDueDocuments(barnId, today)` takes one too — the comparison is `CalendarDate` on both sides |
| `agreements.ts` | `Agreement.start_date`, `AgreementCharge.period` |
| `agreement-finances.ts` | `ChargeSummaryRow.period`, `PaidCharge.period`, `OutstandingCharge.period` |
| `lesson-finances.ts` | `HorseChargeDetailRow.period`, `RiderChargeDetailRow.period` |
| `expenses.ts` | `Appointment.expense_date`, and every shape extending it |
| `expense-finances.ts` | `HorseExpenseDetailRow.expenseDate`, `RecipientExpenseDetailRow.expenseDate` |
| `outstanding.ts` | `OutstandingItem`'s `lease`/`board` `date` (its `lesson`/`cancellation_fee` arms stay `Instant` — that union is where the two frames meet) |

Unlike `Instant`, which is structurally constructed, a branded string needs an explicit mint wherever an unbranded value crosses into the frame.
There are three and no more: `local-day.ts`'s `calendarDate` (unchecked, for a value PostgREST hands back as `string` that the DB already types `DATE`) and `isValidDateString` (a type predicate — the validating mint for a `?date=` search param), plus `barn-timezone.ts`'s `barnDay`/`barnToday`, the crossing from the instant frame into this one.
A whole-row cast (`data as Agreement`) is not one of them and `grep` won't show it: it takes the DB's typing at its word for every field of the row at once, which is how `Instant` fields arrive too.

Write inputs stay bare `string` — `ExpenseInput.expenseDate` and the agreement/document date parameters take unvalidated form text, and branding there would only move the lie earlier.

**Ordering of lists that reach the UI (#1286).** A read whose rows are rendered as a *sequence* orders them here; Postgres and PostgREST both return rows in planner order otherwise, and a PostgREST to-many embed is never ordered unless asked.
Two rulings, and no third: **name lists sort alphabetically**, matching `getHorsesByBarn`'s `ORDER BY h.name` so the app is internally consistent, and **schedules sort chronologically**.
Where the ordering can be pushed into the query it is (`.order(...)`, or an `ORDER BY` inside the RPC — see `get_calendar_feed` and `get_horse_projected_exhaustion` in [`rpc/calendar.md`](rpc/calendar.md) and [`rpc/horses.md`](rpc/horses.md)).
Where it can't, it happens in TypeScript, and always for the same reason: the junction row carries a participant *id*, while the name the list is sorted by is resolved afterwards by `resolveHorseNames`/`resolveMemberNames`.
Every such sort carries whole participant objects rather than the name array alone, which is what keeps the parallel `*_ids`/`rider_cancelled_ats` arrays positionally aligned with the names derived from them.
Ties are broken on the row's id, following `schedule.ts`'s `a.start.localeCompare(b.start) || a.id.localeCompare(b.id)` (a #1015 review finding): two horses or two members can share a name, and the entries tied on it still differ in what the row links to and in the notes, exertion, or cancellation state it carries.
A read whose rows are only folded into a `Map`, `Set`, count, or sum — or whose consumer re-sorts them before rendering — is left unordered on purpose; `transactions.ts`'s `getTransactionRows` carries an inline note saying which of its callers is which, since it's the one that looks like an omission and isn't.

## Modules

One file per module under [`dal/`](dal/):

- [`auth.ts`](dal/auth.md)
- [`transactions.ts`](dal/transactions.md)
- [`agreements.ts`](dal/agreements.md)
- [`agreement-finances.ts`](dal/agreement-finances.md)
- [`expenses.ts`](dal/expenses.md)
- [`expense-finances.ts`](dal/expense-finances.md)
- [`barns.ts`](dal/barns.md)
- [`barn-memberships.ts`](dal/barn-memberships.md)
- [`member-names.ts`](dal/member-names.md)
- [`member-invites.ts`](dal/member-invites.md)
- [`horses.ts`](dal/horses.md)
- [`member-horse-privileges.ts`](dal/member-horse-privileges.md)
- [`lessons.ts`](dal/lessons.md)
- [`lesson-participants.ts`](dal/lesson-participants.md)
- [`lesson-series.ts`](dal/lesson-series.md)
- [`lesson-finance-queries.ts`](dal/lesson-finance-queries.md)
- [`lesson-finances.ts`](dal/lesson-finances.md)
- [`outstanding.ts`](dal/outstanding.md)
- [`schedule.ts`](dal/schedule.md)
- [`barn-events.ts`](dal/barn-events.md)
- [`calendar-feed.ts`](dal/calendar-feed.md)
- [`lesson-tiers.ts`](dal/lesson-tiers.md)
- [`profiles.ts`](dal/profiles.md)
- [`notifications.ts`](dal/notifications.md)
- [`document-storage.ts`](dal/document-storage.md)
- [`documents.ts`](dal/documents.md)
- [`document-backup.ts`](dal/document-backup.md)
- [`backup.ts`](dal/backup.md)
- [`types.ts`](dal/types.md)
- [`service-role.ts`](dal/service-role.md)
