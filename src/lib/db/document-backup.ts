/**
 * Documents half of Manage Barn → Data Backup (#995): `getAllBarnDocuments` reads all
 * three document tables (`horse_documents`/`staff_documents`/`rider_documents`), the
 * pure `buildBackupZipEntries` maps them to per-horse/per-member zip folders
 * (path-segment sanitization plus `-1`/`-2` suffixes on name collisions), and
 * `buildDocumentsBackupZip` composes the fetch, name resolution
 * (`horses.ts:resolveHorseNames`/`member-names.ts:resolveMemberNames`),
 * `document-storage.ts:downloadFile`, and JSZip into a Buffer — `null` when the barn
 * has no documents at all.
 */
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import JSZip from 'jszip'
import { resolveHorseNames } from './horses'
import { resolveMemberNames } from './member-names'
import { downloadFile } from './document-storage'
import type { HorseDocument, TrainerDocument, RiderDocument } from './types'

export type BarnDocuments = {
  horse: HorseDocument[]
  trainer: TrainerDocument[]
  rider: RiderDocument[]
}

export async function getAllBarnDocuments(barnId: string, client?: SupabaseClient): Promise<BarnDocuments> {
  const supabase = client ?? (await createClient())

  const { data: horse, error: horseError } = await supabase.from('horse_documents').select('*').eq('barn_id', barnId)
  if (horseError) throw horseError

  const { data: trainer, error: trainerError } = await supabase.from('staff_documents').select('*').eq('barn_id', barnId)
  if (trainerError) throw trainerError

  const { data: rider, error: riderError } = await supabase.from('rider_documents').select('*').eq('barn_id', barnId)
  if (riderError) throw riderError

  return { horse: horse ?? [], trainer: trainer ?? [], rider: rider ?? [] }
}

export type ZipEntry = { zipPath: string; storagePath: string }

function sanitizePathSegment(name: string): string {
  return name.replace(/[/\\]/g, '-')
}

function splitFileName(fileName: string): { base: string; ext: string } {
  const idx = fileName.lastIndexOf('.')
  const base = idx <= 0 ? fileName : fileName.slice(0, idx)
  const ext = idx <= 0 ? '' : fileName.slice(idx + 1)
  return { base: sanitizePathSegment(base), ext: sanitizePathSegment(ext) }
}

function uniqueNameInFolder(usedNames: Map<string, Set<string>>, folder: string, base: string, ext: string): string {
  const suffix = ext ? `.${ext}` : ''
  const used = usedNames.get(folder) ?? new Set<string>()
  let candidate = `${base}${suffix}`
  let n = 1
  while (used.has(candidate)) {
    candidate = `${base}-${n}${suffix}`
    n++
  }
  used.add(candidate)
  usedNames.set(folder, used)
  return candidate
}

export function buildBackupZipEntries(
  docs: BarnDocuments,
  horseNames: Map<string, string>,
  memberNames: Map<string, string>
): ZipEntry[] {
  const entries: ZipEntry[] = []
  const usedNames = new Map<string, Set<string>>()

  function addEntry(
    folder: string,
    doc: { file_name: string; record_type: string; created_at: string; storage_path: string }
  ) {
    const { base, ext } = splitFileName(doc.file_name)
    const date = doc.created_at.slice(0, 10)
    const fileName = uniqueNameInFolder(usedNames, folder, `${base}-${doc.record_type}-${date}`, ext)
    entries.push({ zipPath: `${folder}/${fileName}`, storagePath: doc.storage_path })
  }

  for (const doc of docs.horse) {
    addEntry(`horse/${sanitizePathSegment(horseNames.get(doc.horse_id) ?? doc.horse_id)}`, doc)
  }
  for (const doc of docs.trainer) {
    addEntry(`member/${sanitizePathSegment(memberNames.get(doc.trainer_id) ?? 'Unknown Member')}`, doc)
  }
  for (const doc of docs.rider) {
    addEntry(`member/${sanitizePathSegment(memberNames.get(doc.rider_id) ?? 'Unknown Member')}`, doc)
  }

  return entries
}

export async function buildDocumentsBackupZip(barnId: string, client?: SupabaseClient): Promise<Buffer | null> {
  const supabase = client ?? (await createClient())
  const docs = await getAllBarnDocuments(barnId, supabase)

  if (docs.horse.length + docs.trainer.length + docs.rider.length === 0) return null

  const horseIds = [...new Set(docs.horse.map((d) => d.horse_id))]
  const membershipIds = [...new Set([...docs.trainer.map((d) => d.trainer_id), ...docs.rider.map((d) => d.rider_id)])]

  const [horseNames, memberNames] = await Promise.all([
    resolveHorseNames(horseIds, barnId, supabase),
    resolveMemberNames(membershipIds, barnId, supabase),
  ])

  const entries = buildBackupZipEntries(docs, horseNames, memberNames)

  const zip = new JSZip()
  for (const entry of entries) {
    const blob = await downloadFile(entry.storagePath, supabase)
    zip.file(entry.zipPath, Buffer.from(await blob.arrayBuffer()))
  }

  return zip.generateAsync({ type: 'nodebuffer' })
}
