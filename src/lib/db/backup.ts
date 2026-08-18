/**
 * Barn-wide data spreadsheet export — the "Download Data" xlsx in Manage Barn → Data
 * Backup (#994). `getBarnBackupData` fetches and joins every covered table into eight
 * flat row shapes, `buildBarnDataWorkbook` renders them as sheets, and
 * `buildBarnDataBackupBuffer` composes the two. Hand-maps a fixed table set rather than
 * introspecting the schema — a migration touching a covered table must update the
 * matching sheet here (see CLAUDE.md's Barn Data Backup section).
 */
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'
import { instantToLocalWallClock } from '@/lib/barn-timezone'
import { formatFee } from '@/lib/format-currency'
import { resolveHorseNames } from './horses'
import { resolveMemberNames } from './member-names'
import { getAgreementsByBarn } from './agreements'
import { CHARGE_TRANSACTION_KINDS } from './agreement-finances'
import { getExpensesByBarn } from './expenses'
import { getTransactionRows } from './transactions'
import { getLessonFeeRows, getLessonJunctionRows } from './lesson-finance-queries'
import { getAllBarnDocuments } from './document-backup'
import type { Agreement, AgreementCharge, BarnMembership, Horse, Lesson, Profile, TransactionKind } from './types'

/**
 * Barn-wide data spreadsheet export (#994), companion to #995's documents zip.
 * Sheets are joined/human-readable (horse and member names, not raw ids) rather
 * than a literal one-sheet-per-table DB dump — disaster recovery is already
 * covered by Supabase's own backups, so this is a manager's own readable copy
 * of their business records, not a restore format. The "All Transactions" sheet
 * is the one deliberate exception: the barn's whole money ledger in one place,
 * unfiltered by kind or date, in addition to (not instead of) folding
 * collected/payment status into the Lessons and Agreement Charges sheets
 * themselves. It carried raw row ids for cross-referencing until #1218 dropped
 * them — see TransactionBackupRow.
 *
 * Every TIMESTAMPTZ column is rendered in the barn's own configured timezone
 * (instantToLocalWallClock). This used to be a deliberate exception to an
 * "instants render viewer-local" rule; #1222 deleted that rule, so the export is
 * now simply doing what every other surface does. It reaches for
 * instantToLocalWallClock rather than the Instant brand because the sheet needs
 * zone-less wall-clock digits baked into an Excel serial (see below), not a
 * formatted string.
 */

// Excel serial numbers are zone-less, and exceljs derives one from Date#getTime, so a Date
// whose *UTC* components are the barn's wall clock renders those exact digits on every
// recipient's machine regardless of where they open the file. Deliberately not
// barn-timezone.ts's wallClockToInstant — that resolves back to the real instant, which is
// precisely the viewer-zone dependence this export exists to avoid (#1218).
function barnLocalCell(instant: Date, timezone: string): Date {
  return new Date(instantToLocalWallClock(instant, timezone) + 'Z')
}

// Zero-padded, so every rendered date occupies exactly 10 characters. Paired with the
// left-justification below, that's what lets a reader scan a date column where date-only and
// date+time rows are interleaved (Horse Expenses) — under the unpadded m/d/yyyy the dates
// themselves shifted row to row, and under Excel's default right-alignment for dates the
// date-only rows lined their date up against the timed rows' *time*.
const DATETIME_FMT = 'mm/dd/yyyy hh:mm AM/PM'
const DATE_FMT = 'mm/dd/yyyy'
const MONEY_FMT = '"$"#,##0.00'
const MAX_COLUMN_WIDTH = 60
// 2× exceljs's 15-point default row height, so the bolded header has room to breathe.
const HEADER_ROW_HEIGHT = 30

const ALL_TRANSACTION_KINDS: TransactionKind[] = [
  'lesson_fee',
  'rider_cancellation_fee',
  'instructor_payout',
  'lease_charge',
  'board_charge',
  'expense',
]

const UNKNOWN_HORSE = 'Unknown Horse'
const UNKNOWN_MEMBER = 'Unknown Member'
const NO_INSTRUCTOR = 'No Instructor'

// Wide bounds so ledger reads return full history, not a reporting window.
const BACKUP_RANGE_START = new Date(0)
const BACKUP_RANGE_END = new Date('9999-12-31T00:00:00Z')

// Deliberately excludes horses.photo_path/photo_uploaded_by — a raw Storage path isn't
// spreadsheet-readable, and the photo itself isn't covered by this export.
export interface HorseBackupRow {
  dateTime: Date
  name: string
  registeredName: string | null
  active: boolean
  available: boolean
  unavailabilityReason: string | null
  feedNotes: string | null
  medicationNotes: string | null
  owningMember: string
}

export interface LessonBackupRow {
  dateTime: Date
  type: string
  tierName: string
  jumping: boolean
  fee: number
  instructor: string
  horses: string
  riders: string
  recurring: boolean
  collected: boolean | null
  instructorPayout: number | null
  cancelled: boolean
  cancellationNotes: string | null
}

export interface AgreementBackupRow {
  rider: string
  horse: string
  kind: string
  cadence: string
  fee: number
  startDate: string
  active: boolean
}

export interface AgreementChargeBackupRow {
  rider: string
  horse: string
  kind: string
  period: string
  fee: number
  collected: boolean | null
  paymentType: string | null
}

export interface ExpenseBackupRow {
  dateTime: Date
  // No column of its own — drives the per-cell date-only format for an appointment booked
  // without a time, so it reads "7/15/2026" rather than a fabricated "7/15/2026 12:00 AM".
  dateOnly: boolean
  recipient: string
  type: string
  amount: number | null
  horses: string
  paymentType: string | null
  notes: string | null
}

// Deliberately excludes profiles.photo_path — same reasoning as HorseBackupRow above.
export interface MemberBackupRow {
  dateTime: Date
  name: string
  role: string
  status: string
  canInstruct: boolean
  managed: boolean
  email: string | null
  phone: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
}

export interface DocumentBackupRow {
  dateTime: Date
  ownerType: 'Horse' | 'Member'
  owner: string
  recordType: string
  fileName: string
  notes: string | null
  reminderDate: string | null
}

// #1218 dropped this sheet's lesson/lesson-rider/agreement-charge/expense id columns: raw
// UUIDs appearing nowhere else in the workbook, so they cross-referenced nothing a reader
// could act on. Its purpose is now simply the full money ledger in one place.
export interface TransactionBackupRow {
  dateTime: Date
  kind: TransactionKind
  // Signed as the ledger stores it — outflows (instructor_payout, expense) stay negative
  // rather than going through transactions.ts:positiveAmount, so the column sums to the
  // barn's actual net and picks up any future negative-direction kind for free.
  amount: number
  collected: boolean
  paymentType: string | null
  member: string | null
  horse: string | null
}

export interface BarnBackupData {
  horses: HorseBackupRow[]
  lessons: LessonBackupRow[]
  agreements: AgreementBackupRow[]
  agreementCharges: AgreementChargeBackupRow[]
  expenses: ExpenseBackupRow[]
  members: MemberBackupRow[]
  documents: DocumentBackupRow[]
  transactions: TransactionBackupRow[]
}

async function getHorsesSheet(barnId: string, timezone: string, supabase: SupabaseClient): Promise<HorseBackupRow[]> {
  const { data, error } = await supabase.from('horses').select('*').eq('barn_id', barnId).order('name')
  if (error) throw error
  const horses = (data ?? []) as Horse[]
  if (!horses.length) return []

  // #1549: owning_member_id is NOT NULL, so every horse contributes an id and the sheet's
  // Owning Member cell is only ever a name or UNKNOWN_MEMBER (an unresolvable profile row).
  const memberIds = [...new Set(horses.map((h) => h.owning_member_id))]
  const memberNames = await resolveMemberNames(memberIds, barnId, supabase)

  return horses.map((h) => ({
    dateTime: barnLocalCell(new Date(h.created_at), timezone),
    name: h.name,
    registeredName: h.registered_name,
    active: h.is_active,
    available: h.is_available,
    unavailabilityReason: h.unavailability_reason,
    feedNotes: h.feed_notes,
    medicationNotes: h.medication_notes,
    owningMember: memberNames.get(h.owning_member_id) ?? UNKNOWN_MEMBER,
  }))
}

async function getLessonsSheet(barnId: string, timezone: string, supabase: SupabaseClient): Promise<LessonBackupRow[]> {
  const { data, error } = await supabase.from('lessons').select('*').eq('barn_id', barnId).order('lesson_at', { ascending: false })
  if (error) throw error
  const lessons = (data ?? []) as Lesson[]
  if (!lessons.length) return []

  const lessonIds = lessons.map((l) => l.id)
  const [horseJunctions, riderJunctions, feeRows] = await Promise.all([
    getLessonJunctionRows('lesson_horses', 'horse_id', barnId, lessonIds, supabase),
    getLessonJunctionRows('lesson_riders', 'rider_id', barnId, lessonIds, supabase),
    getLessonFeeRows(barnId, BACKUP_RANGE_START, BACKUP_RANGE_END, supabase),
  ])

  const horseIdsByLesson = new Map<string, string[]>()
  for (const j of horseJunctions) horseIdsByLesson.set(j.lesson_id, [...(horseIdsByLesson.get(j.lesson_id) ?? []), j.horse_id])
  const riderIdsByLesson = new Map<string, string[]>()
  for (const j of riderJunctions) riderIdsByLesson.set(j.lesson_id, [...(riderIdsByLesson.get(j.lesson_id) ?? []), j.rider_id])
  const feeByLesson = new Map(feeRows.filter((r) => r.lessonId !== null).map((r) => [r.lessonId as string, r]))

  const allHorseIds = [...new Set(horseJunctions.map((j) => j.horse_id))]
  const allMemberIds = [
    ...new Set([...riderJunctions.map((j) => j.rider_id), ...lessons.map((l) => l.instructor_id).filter((id): id is string => id !== null)]),
  ]
  const [horseNames, memberNames] = await Promise.all([
    resolveHorseNames(allHorseIds, barnId, supabase),
    resolveMemberNames(allMemberIds, barnId, supabase),
  ])

  return lessons.map((l) => {
    const fee = feeByLesson.get(l.id)
    return {
      dateTime: barnLocalCell(new Date(l.lesson_at), timezone),
      type: l.lesson_type,
      tierName: l.tier_name,
      jumping: l.jumping,
      fee: l.fee,
      instructor: l.instructor_id ? memberNames.get(l.instructor_id) ?? UNKNOWN_MEMBER : NO_INSTRUCTOR,
      horses: (horseIdsByLesson.get(l.id) ?? []).map((id) => horseNames.get(id) ?? UNKNOWN_HORSE).join(', '),
      riders: (riderIdsByLesson.get(l.id) ?? []).map((id) => memberNames.get(id) ?? UNKNOWN_MEMBER).join(', '),
      recurring: l.series_id !== null,
      collected: fee?.collected ?? null,
      instructorPayout: fee?.instructorCut ?? null,
      cancelled: l.cancelled_at !== null,
      cancellationNotes: l.cancellation_notes,
    }
  })
}

async function getAgreementsAndCharges(
  barnId: string,
  supabase: SupabaseClient
): Promise<{ agreements: AgreementBackupRow[]; charges: AgreementChargeBackupRow[] }> {
  const agreements = await getAgreementsByBarn(barnId, undefined, supabase)
  if (!agreements.length) return { agreements: [], charges: [] }

  const riderIds = [...new Set(agreements.map((a) => a.rider_id))]
  const horseIds = [...new Set(agreements.map((a) => a.horse_id))]
  const [riderNames, horseNames] = await Promise.all([
    resolveMemberNames(riderIds, barnId, supabase),
    resolveHorseNames(horseIds, barnId, supabase),
  ])

  const agreementRows = agreements.map((a) => ({
    rider: riderNames.get(a.rider_id) ?? UNKNOWN_MEMBER,
    horse: horseNames.get(a.horse_id) ?? UNKNOWN_HORSE,
    kind: a.kind,
    cadence: a.cadence,
    fee: a.fee,
    startDate: a.start_date,
    active: a.is_active,
  }))

  const { data, error } = await supabase.from('agreement_charges').select('*').eq('barn_id', barnId).order('period')
  if (error) throw error
  const charges = (data ?? []) as AgreementCharge[]
  if (!charges.length) return { agreements: agreementRows, charges: [] }

  const agreementsById = new Map<string, Agreement>(agreements.map((a) => [a.id, a]))
  const paymentRows = await getTransactionRows(barnId, CHARGE_TRANSACTION_KINDS, undefined, supabase)
  const paymentByChargeId = new Map(
    paymentRows.filter((r) => r.agreementChargeId !== null).map((r) => [r.agreementChargeId as string, r])
  )

  const chargeRows = charges.map((c) => {
    const agreement = agreementsById.get(c.agreement_id)!
    const payment = paymentByChargeId.get(c.id)
    return {
      rider: riderNames.get(agreement.rider_id) ?? UNKNOWN_MEMBER,
      horse: horseNames.get(agreement.horse_id) ?? UNKNOWN_HORSE,
      kind: agreement.kind,
      period: c.period,
      fee: c.fee,
      collected: payment?.collected ?? null,
      paymentType: payment?.paymentType ?? null,
    }
  })

  return { agreements: agreementRows, charges: chargeRows }
}

// One sheet, not two, across #1148's appointments/appointment_costs split: getExpensesByBarn
// flattens each appointment's cost row back onto it, so Amount and Payment Type still land in
// this sheet's own columns and a second Appointment Costs sheet would only duplicate them at
// the cost of making the export a join the reader has to perform. Keeps its "Horse Expenses"
// sheet name for the same reason the manager's route did — this export is manager-only, and a
// manager is genuinely looking at money here.
async function getExpensesSheet(barnId: string): Promise<ExpenseBackupRow[]> {
  const expenses = await getExpensesByBarn(barnId)
  return expenses.map((e) => ({
    // expense_date/expense_time are already barn-local digits, not an instant — no conversion,
    // just the same UTC anchoring barnLocalCell applies to real TIMESTAMPTZ columns.
    dateTime: new Date(`${e.expense_date}T${e.expense_time ?? '00:00:00'}Z`),
    dateOnly: e.expense_time === null,
    recipient: e.recipient,
    type: e.expense_type,
    amount: e.amount,
    horses: e.applies_to_all_horses ? 'All Horses' : e.horse_names.join(', '),
    paymentType: e.payment_type,
    notes: e.notes,
  }))
}

async function getMembersSheet(barnId: string, timezone: string, supabase: SupabaseClient): Promise<MemberBackupRow[]> {
  const { data, error } = await supabase.from('barn_memberships').select('*').eq('barn_id', barnId).order('created_at')
  if (error) throw error
  const memberships = (data ?? []) as BarnMembership[]
  if (!memberships.length) return []

  const profileIds = [...new Set(memberships.map((m) => m.profile_id))]
  const { data: profileData, error: profileError } = await supabase.from('profiles').select('*').in('id', profileIds)
  if (profileError) throw profileError
  const profileById = new Map<string, Profile>(((profileData ?? []) as Profile[]).map((p) => [p.id, p]))

  return memberships.map((m) => {
    const profile = profileById.get(m.profile_id)!
    return {
      dateTime: barnLocalCell(new Date(m.created_at), timezone),
      name: `${profile.first_name} ${profile.last_name}`,
      role: m.role,
      status: m.status,
      canInstruct: m.can_instruct,
      managed: profile.is_managed,
      email: profile.email,
      phone: profile.phone,
      emergencyContactName: profile.emergency_contact_name,
      emergencyContactPhone: profile.emergency_contact_phone,
    }
  })
}

async function getDocumentsSheet(barnId: string, timezone: string, supabase: SupabaseClient): Promise<DocumentBackupRow[]> {
  const docs = await getAllBarnDocuments(barnId, supabase)
  if (!docs.horse.length && !docs.trainer.length && !docs.rider.length) return []

  const horseIds = [...new Set(docs.horse.map((d) => d.horse_id))]
  const memberIds = [...new Set([...docs.trainer.map((d) => d.trainer_id), ...docs.rider.map((d) => d.rider_id)])]
  const [horseNames, memberNames] = await Promise.all([
    resolveHorseNames(horseIds, barnId, supabase),
    resolveMemberNames(memberIds, barnId, supabase),
  ])

  const toRow = (
    ownerType: 'Horse' | 'Member',
    owner: string,
    d: { record_type: string; file_name: string; notes: string | null; reminder_date: string | null; created_at: string }
  ): DocumentBackupRow => ({
    dateTime: barnLocalCell(new Date(d.created_at), timezone),
    ownerType,
    owner,
    recordType: d.record_type,
    fileName: d.file_name,
    notes: d.notes,
    reminderDate: d.reminder_date,
  })

  return [
    ...docs.horse.map((d) => toRow('Horse', horseNames.get(d.horse_id) ?? UNKNOWN_HORSE, d)),
    ...docs.trainer.map((d) => toRow('Member', memberNames.get(d.trainer_id) ?? UNKNOWN_MEMBER, d)),
    ...docs.rider.map((d) => toRow('Member', memberNames.get(d.rider_id) ?? UNKNOWN_MEMBER, d)),
  ]
}

async function getTransactionsSheet(barnId: string, timezone: string, supabase: SupabaseClient): Promise<TransactionBackupRow[]> {
  const rows = await getTransactionRows(barnId, ALL_TRANSACTION_KINDS, undefined, supabase)
  if (!rows.length) return []

  const memberIds = [...new Set(rows.map((r) => r.membershipId).filter((id): id is string => id !== null))]
  const horseIds = [...new Set(rows.map((r) => r.horseId).filter((id): id is string => id !== null))]
  const [memberNames, horseNames] = await Promise.all([
    resolveMemberNames(memberIds, barnId, supabase),
    resolveHorseNames(horseIds, barnId, supabase),
  ])

  return rows.map((r) => ({
    dateTime: barnLocalCell(new Date(r.occurredAt), timezone),
    kind: r.kind,
    amount: r.amount,
    collected: r.collected,
    paymentType: r.paymentType,
    member: r.membershipId ? memberNames.get(r.membershipId) ?? UNKNOWN_MEMBER : null,
    horse: r.horseId ? horseNames.get(r.horseId) ?? UNKNOWN_HORSE : null,
  }))
}

export async function getBarnBackupData(barnId: string, timezone: string, client?: SupabaseClient): Promise<BarnBackupData> {
  const supabase = client ?? (await createClient())

  const [horses, agreementsAndCharges, expenses, members, documents, lessons, transactions] = await Promise.all([
    getHorsesSheet(barnId, timezone, supabase),
    getAgreementsAndCharges(barnId, supabase),
    getExpensesSheet(barnId),
    getMembersSheet(barnId, timezone, supabase),
    getDocumentsSheet(barnId, timezone, supabase),
    getLessonsSheet(barnId, timezone, supabase),
    getTransactionsSheet(barnId, timezone, supabase),
  ])

  return {
    horses,
    lessons,
    agreements: agreementsAndCharges.agreements,
    agreementCharges: agreementsAndCharges.charges,
    expenses,
    members,
    documents,
    transactions,
  }
}

// A raw value's String() form is not what Excel puts on screen once a numFmt applies, and
// sizing a column to the wrong one of the two is visible: too narrow and a numeric cell
// renders as "####", too wide and the sheet wastes screen. So both formatted kinds are
// measured at their rendered text instead.
//   - Date: measured at DATETIME_FMT, the wider of the two date formats a Date cell can
//     carry (Horse Expenses overrides a timeless cell to the narrower DATE_FMT below), so
//     a column is never under-sized. String(date) would be far longer than either.
//   - Money: measured at the currency text, which adds "$", grouping commas and two forced
//     decimals that a whole-dollar number's own String() form doesn't carry.
function cellWidth(value: unknown, numFmt?: string): number {
  if (value instanceof Date) return DATETIME_FMT.length
  if (numFmt === MONEY_FMT && typeof value === 'number') {
    return formatFee(value).length
  }
  return String(value ?? '').length
}

// Newest first, keyed off whichever column the sheet leads with — every sheet leads with its
// own date column (#1218), so this is "most recent at the top" without each call site having
// to name its own sort key, and a sheet added later inherits the ordering by construction.
// Comparing with </> rather than by type keeps one code path for both the Date-valued columns
// and the ISO `YYYY-MM-DD` string ones (Agreements' Start Date, Agreement Charges' Period),
// where lexical order is already chronological order. Arithmetic on the two booleans instead
// of branching on them: sort() only needs the sign, and this way there's no unreachable
// third case to cover.
function sortByFirstColumn<T extends object>(rows: T[], key: Extract<keyof T, string>): T[] {
  return [...rows].sort((a, b) => Number(a[key] < b[key]) - Number(a[key] > b[key]))
}

// Returns the sorted rows alongside the sheet, not just the sheet: Horse Expenses applies a
// per-cell format override by row index below, which would land on the wrong rows if it
// walked the caller's original unsorted array.
function addSheet<T extends object>(
  workbook: ExcelJS.Workbook,
  name: string,
  columns: { header: string; key: Extract<keyof T, string>; numFmt?: string }[],
  unsortedRows: T[]
): { sheet: ExcelJS.Worksheet; rows: T[] } {
  const rows = sortByFirstColumn(unsortedRows, columns[0].key)
  const sheet = workbook.addWorksheet(name)
  sheet.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    // Date columns are left-justified against Excel's right-aligned default for dates — see
    // DATETIME_FMT. Keyed off the format rather than a separate per-column flag, since
    // carrying DATETIME_FMT is exactly what makes a column a date column.
    style: c.numFmt
      ? { numFmt: c.numFmt, ...(c.numFmt === DATETIME_FMT && { alignment: { horizontal: 'left' as const } }) }
      : undefined,
    // Auto-size: widest of the header and every value in the column, capped so one long
    // Notes cell can't push the rest of the sheet off screen. Folded rather than spread
    // into Math.max — a sheet with more rows than the engine's argument limit (the
    // unfiltered All Transactions ledger is the one that grows without bound) would
    // otherwise blow the stack and fail the whole export.
    width: Math.min(
      MAX_COLUMN_WIDTH,
      rows.reduce((widest, r) => Math.max(widest, cellWidth(r[c.key], c.numFmt)), c.header.length) + 2
    ),
  }))
  const header = sheet.getRow(1)
  // Bold only, at the default size: column widths are measured in units of the default font's
  // character width, so a larger header font renders wider than cellWidth's budget allows and
  // clips the longest headers.
  header.font = { bold: true }
  header.height = HEADER_ROW_HEIGHT
  header.alignment = { vertical: 'middle' }
  sheet.addRows(rows)
  return { sheet, rows }
}

export function buildBarnDataWorkbook(data: BarnBackupData): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook()

  addSheet<HorseBackupRow>(
    workbook,
    'Horses',
    [
      // "Added", not the bare "Date/Time" — this is a created_at, and a horse's row carries
      // several dates a reader could otherwise mistake it for. Members and Documents say the
      // same for the same reason; the three sheets whose date is the thing that happened
      // (Lessons, Horse Expenses, All Transactions) stay on plain "Date/Time".
      { header: 'Date/Time Added', key: 'dateTime', numFmt: DATETIME_FMT },
      { header: 'Name', key: 'name' },
      { header: 'Registered Name', key: 'registeredName' },
      { header: 'Active', key: 'active' },
      { header: 'Available', key: 'available' },
      { header: 'Unavailability Reason', key: 'unavailabilityReason' },
      { header: 'Feed Notes', key: 'feedNotes' },
      { header: 'Medication Notes', key: 'medicationNotes' },
      { header: 'Owning Member', key: 'owningMember' },
    ],
    data.horses
  )

  addSheet<LessonBackupRow>(
    workbook,
    'Lessons',
    [
      { header: 'Date/Time', key: 'dateTime', numFmt: DATETIME_FMT },
      { header: 'Type', key: 'type' },
      { header: 'Tier', key: 'tierName' },
      { header: 'Jumping', key: 'jumping' },
      { header: 'Fee', key: 'fee', numFmt: MONEY_FMT },
      { header: 'Instructor', key: 'instructor' },
      { header: 'Horses', key: 'horses' },
      { header: 'Riders', key: 'riders' },
      { header: 'Recurring', key: 'recurring' },
      { header: 'Collected', key: 'collected' },
      { header: 'Instructor Payout', key: 'instructorPayout', numFmt: MONEY_FMT },
      { header: 'Cancelled', key: 'cancelled' },
      { header: 'Cancellation Notes', key: 'cancellationNotes' },
    ],
    data.lessons
  )

  addSheet<AgreementBackupRow>(
    workbook,
    'Agreements',
    [
      { header: 'Start Date', key: 'startDate' },
      { header: 'Rider', key: 'rider' },
      { header: 'Horse', key: 'horse' },
      { header: 'Kind', key: 'kind' },
      { header: 'Cadence', key: 'cadence' },
      { header: 'Fee', key: 'fee', numFmt: MONEY_FMT },
      { header: 'Active', key: 'active' },
    ],
    data.agreements
  )

  addSheet<AgreementChargeBackupRow>(
    workbook,
    'Agreement Charges',
    [
      { header: 'Period', key: 'period' },
      { header: 'Rider', key: 'rider' },
      { header: 'Horse', key: 'horse' },
      { header: 'Kind', key: 'kind' },
      { header: 'Fee', key: 'fee', numFmt: MONEY_FMT },
      { header: 'Collected', key: 'collected' },
      { header: 'Payment Type', key: 'paymentType' },
    ],
    data.agreementCharges
  )

  const { sheet: expenseSheet, rows: expenseRows } = addSheet<ExpenseBackupRow>(
    workbook,
    'Horse Expenses',
    [
      { header: 'Date/Time', key: 'dateTime', numFmt: DATETIME_FMT },
      { header: 'Recipient', key: 'recipient' },
      { header: 'Type', key: 'type' },
      { header: 'Amount', key: 'amount', numFmt: MONEY_FMT },
      { header: 'Horses', key: 'horses' },
      { header: 'Payment Type', key: 'paymentType' },
      { header: 'Notes', key: 'notes' },
    ],
    data.expenses
  )
  // The only sheet whose timestamp is optional — a per-cell override beats the alternatives
  // of showing every spontaneous appointment a fabricated 12:00 AM or splitting the column
  // back in two. Row 1 is the header, so row i + 2 is data row i — indexed against addSheet's
  // returned rows, which are the sorted ones actually written to the sheet.
  expenseRows.forEach((e, i) => {
    if (e.dateOnly) expenseSheet.getRow(i + 2).getCell('dateTime').numFmt = DATE_FMT
  })

  addSheet<MemberBackupRow>(
    workbook,
    'Members',
    [
      { header: 'Date/Time Added', key: 'dateTime', numFmt: DATETIME_FMT },
      { header: 'Name', key: 'name' },
      { header: 'Role', key: 'role' },
      { header: 'Status', key: 'status' },
      { header: 'Can Instruct', key: 'canInstruct' },
      { header: 'Managed', key: 'managed' },
      { header: 'Email', key: 'email' },
      { header: 'Phone', key: 'phone' },
      { header: 'Emergency Contact Name', key: 'emergencyContactName' },
      { header: 'Emergency Contact Phone', key: 'emergencyContactPhone' },
    ],
    data.members
  )

  addSheet<DocumentBackupRow>(
    workbook,
    'Documents',
    [
      { header: 'Date/Time Added', key: 'dateTime', numFmt: DATETIME_FMT },
      { header: 'Owner Type', key: 'ownerType' },
      { header: 'Owner', key: 'owner' },
      { header: 'Record Type', key: 'recordType' },
      { header: 'File Name', key: 'fileName' },
      { header: 'Notes', key: 'notes' },
      { header: 'Reminder Date', key: 'reminderDate' },
    ],
    data.documents
  )

  addSheet<TransactionBackupRow>(
    workbook,
    'All Transactions',
    [
      { header: 'Date/Time', key: 'dateTime', numFmt: DATETIME_FMT },
      { header: 'Kind', key: 'kind' },
      { header: 'Amount', key: 'amount', numFmt: MONEY_FMT },
      { header: 'Collected', key: 'collected' },
      { header: 'Payment Type', key: 'paymentType' },
      { header: 'Member', key: 'member' },
      { header: 'Horse', key: 'horse' },
    ],
    data.transactions
  )

  return workbook
}

export async function buildBarnDataBackupBuffer(barnId: string, timezone: string, client?: SupabaseClient): Promise<Buffer> {
  const data = await getBarnBackupData(barnId, timezone, client)
  const workbook = buildBarnDataWorkbook(data)
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
