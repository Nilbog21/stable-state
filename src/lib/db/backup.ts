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
import { resolveHorseNames } from './horses'
import { resolveMemberNames } from './member-names'
import { getAgreementsByBarn } from './agreements'
import { CHARGE_TRANSACTION_KINDS } from './agreement-finances'
import { getExpensesByBarn } from './expenses'
import { getTransactionRows, positiveAmount } from './transactions'
import { getLessonFeeRows, getLessonJunctionRows } from './lesson-finance-queries'
import { getAllBarnDocuments } from './document-backup'
import type { Agreement, AgreementCharge, BarnMembership, Horse, Lesson, Profile, TransactionKind } from './types'

/**
 * Barn-wide data spreadsheet export (#994), companion to #995's documents zip.
 * Sheets are joined/human-readable (horse and member names, not raw ids) rather
 * than a literal one-sheet-per-table DB dump — disaster recovery is already
 * covered by Supabase's own backups, so this is a manager's own readable copy
 * of their business records, not a restore format. The "All Transactions" sheet
 * is the one deliberate exception: a full raw ledger dump for cross-referencing,
 * in addition to (not instead of) folding collected/payment status into the
 * Lessons and Agreement Charges sheets themselves.
 *
 * Every TIMESTAMPTZ column is rendered in the barn's own configured timezone
 * (instantToLocalWallClock), not viewer-local — a departure from this app's usual
 * "instants render viewer-local, never barn-local" rule (see barn-timezone.ts),
 * made only because a downloaded static file has no live browser session to read
 * a viewer's zone from; the barn's own timezone is the best available stand-in.
 */

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
  name: string
  registeredName: string | null
  active: boolean
  available: boolean
  unavailabilityReason: string | null
  feedNotes: string | null
  medicationNotes: string | null
  owningMember: string | null
  createdAt: string
}

export interface LessonBackupRow {
  lessonAt: string
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
  date: string
  time: string | null
  recipient: string
  type: string
  amount: number | null
  horses: string
  paymentType: string | null
  notes: string | null
}

// Deliberately excludes profiles.photo_path — same reasoning as HorseBackupRow above.
export interface MemberBackupRow {
  name: string
  role: string
  status: string
  canInstruct: boolean
  managed: boolean
  email: string | null
  phone: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  joinedAt: string
}

export interface DocumentBackupRow {
  ownerType: 'Horse' | 'Member'
  owner: string
  recordType: string
  fileName: string
  notes: string | null
  reminderDate: string | null
  uploadedAt: string
}

export interface TransactionBackupRow {
  kind: TransactionKind
  amount: number
  collected: boolean
  paymentType: string | null
  member: string | null
  horse: string | null
  lessonId: string | null
  lessonRiderId: string | null
  agreementChargeId: string | null
  expenseId: string | null
  occurredAt: string
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

  const memberIds = [...new Set(horses.map((h) => h.owning_member_id).filter((id): id is string => id !== null))]
  const memberNames = await resolveMemberNames(memberIds, barnId, supabase)

  return horses.map((h) => ({
    name: h.name,
    registeredName: h.registered_name,
    active: h.is_active,
    available: h.is_available,
    unavailabilityReason: h.unavailability_reason,
    feedNotes: h.feed_notes,
    medicationNotes: h.medication_notes,
    owningMember: h.owning_member_id ? memberNames.get(h.owning_member_id) ?? UNKNOWN_MEMBER : null,
    createdAt: instantToLocalWallClock(new Date(h.created_at), timezone),
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
      lessonAt: instantToLocalWallClock(new Date(l.lesson_at), timezone),
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

async function getExpensesSheet(barnId: string): Promise<ExpenseBackupRow[]> {
  const expenses = await getExpensesByBarn(barnId)
  return expenses.map((e) => ({
    date: e.expense_date,
    time: e.expense_time,
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
      name: `${profile.first_name} ${profile.last_name}`,
      role: m.role,
      status: m.status,
      canInstruct: m.can_instruct,
      managed: profile.is_managed,
      email: profile.email,
      phone: profile.phone,
      emergencyContactName: profile.emergency_contact_name,
      emergencyContactPhone: profile.emergency_contact_phone,
      joinedAt: instantToLocalWallClock(new Date(m.created_at), timezone),
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
    ownerType,
    owner,
    recordType: d.record_type,
    fileName: d.file_name,
    notes: d.notes,
    reminderDate: d.reminder_date,
    uploadedAt: instantToLocalWallClock(new Date(d.created_at), timezone),
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
    kind: r.kind,
    amount: positiveAmount(r.kind, r.amount),
    collected: r.collected,
    paymentType: r.paymentType,
    member: r.membershipId ? memberNames.get(r.membershipId) ?? UNKNOWN_MEMBER : null,
    horse: r.horseId ? horseNames.get(r.horseId) ?? UNKNOWN_HORSE : null,
    lessonId: r.lessonId,
    lessonRiderId: r.lessonRiderId,
    agreementChargeId: r.agreementChargeId,
    expenseId: r.expenseId,
    occurredAt: instantToLocalWallClock(new Date(r.occurredAt), timezone),
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

function addSheet<T extends object>(
  workbook: ExcelJS.Workbook,
  name: string,
  columns: { header: string; key: Extract<keyof T, string> }[],
  rows: T[]
): void {
  const sheet = workbook.addWorksheet(name)
  sheet.columns = columns
  sheet.addRows(rows)
}

export function buildBarnDataWorkbook(data: BarnBackupData): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook()

  addSheet<HorseBackupRow>(
    workbook,
    'Horses',
    [
      { header: 'Name', key: 'name' },
      { header: 'Registered Name', key: 'registeredName' },
      { header: 'Active', key: 'active' },
      { header: 'Available', key: 'available' },
      { header: 'Unavailability Reason', key: 'unavailabilityReason' },
      { header: 'Feed Notes', key: 'feedNotes' },
      { header: 'Medication Notes', key: 'medicationNotes' },
      { header: 'Owning Member', key: 'owningMember' },
      { header: 'Created At', key: 'createdAt' },
    ],
    data.horses
  )

  addSheet<LessonBackupRow>(
    workbook,
    'Lessons',
    [
      { header: 'Date', key: 'lessonAt' },
      { header: 'Type', key: 'type' },
      { header: 'Tier', key: 'tierName' },
      { header: 'Jumping', key: 'jumping' },
      { header: 'Fee', key: 'fee' },
      { header: 'Instructor', key: 'instructor' },
      { header: 'Horses', key: 'horses' },
      { header: 'Riders', key: 'riders' },
      { header: 'Recurring', key: 'recurring' },
      { header: 'Collected', key: 'collected' },
      { header: 'Instructor Payout', key: 'instructorPayout' },
      { header: 'Cancelled', key: 'cancelled' },
      { header: 'Cancellation Notes', key: 'cancellationNotes' },
    ],
    data.lessons
  )

  addSheet<AgreementBackupRow>(
    workbook,
    'Agreements',
    [
      { header: 'Rider', key: 'rider' },
      { header: 'Horse', key: 'horse' },
      { header: 'Kind', key: 'kind' },
      { header: 'Cadence', key: 'cadence' },
      { header: 'Fee', key: 'fee' },
      { header: 'Start Date', key: 'startDate' },
      { header: 'Active', key: 'active' },
    ],
    data.agreements
  )

  addSheet<AgreementChargeBackupRow>(
    workbook,
    'Agreement Charges',
    [
      { header: 'Rider', key: 'rider' },
      { header: 'Horse', key: 'horse' },
      { header: 'Kind', key: 'kind' },
      { header: 'Period', key: 'period' },
      { header: 'Fee', key: 'fee' },
      { header: 'Collected', key: 'collected' },
      { header: 'Payment Type', key: 'paymentType' },
    ],
    data.agreementCharges
  )

  addSheet<ExpenseBackupRow>(
    workbook,
    'Horse Expenses',
    [
      { header: 'Date', key: 'date' },
      { header: 'Time', key: 'time' },
      { header: 'Recipient', key: 'recipient' },
      { header: 'Type', key: 'type' },
      { header: 'Amount', key: 'amount' },
      { header: 'Horses', key: 'horses' },
      { header: 'Payment Type', key: 'paymentType' },
      { header: 'Notes', key: 'notes' },
    ],
    data.expenses
  )

  addSheet<MemberBackupRow>(
    workbook,
    'Members',
    [
      { header: 'Name', key: 'name' },
      { header: 'Role', key: 'role' },
      { header: 'Status', key: 'status' },
      { header: 'Can Instruct', key: 'canInstruct' },
      { header: 'Managed', key: 'managed' },
      { header: 'Email', key: 'email' },
      { header: 'Phone', key: 'phone' },
      { header: 'Emergency Contact Name', key: 'emergencyContactName' },
      { header: 'Emergency Contact Phone', key: 'emergencyContactPhone' },
      { header: 'Joined At', key: 'joinedAt' },
    ],
    data.members
  )

  addSheet<DocumentBackupRow>(
    workbook,
    'Documents',
    [
      { header: 'Owner Type', key: 'ownerType' },
      { header: 'Owner', key: 'owner' },
      { header: 'Record Type', key: 'recordType' },
      { header: 'File Name', key: 'fileName' },
      { header: 'Notes', key: 'notes' },
      { header: 'Reminder Date', key: 'reminderDate' },
      { header: 'Uploaded At', key: 'uploadedAt' },
    ],
    data.documents
  )

  addSheet<TransactionBackupRow>(
    workbook,
    'All Transactions',
    [
      { header: 'Kind', key: 'kind' },
      { header: 'Amount', key: 'amount' },
      { header: 'Collected', key: 'collected' },
      { header: 'Payment Type', key: 'paymentType' },
      { header: 'Member', key: 'member' },
      { header: 'Horse', key: 'horse' },
      { header: 'Lesson ID', key: 'lessonId' },
      { header: 'Lesson Rider ID', key: 'lessonRiderId' },
      { header: 'Agreement Charge ID', key: 'agreementChargeId' },
      { header: 'Expense ID', key: 'expenseId' },
      { header: 'Occurred At', key: 'occurredAt' },
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
