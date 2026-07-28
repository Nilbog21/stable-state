import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// #1135: scripts/data/ is a tracked directory of shared test assets — seed-barn.ts,
// seed-test-barn.ts, the e2e suite, and a manual checklist pass all draw from it. CI runs
// on a clean checkout, so an asset that isn't actually tracked (the pre-#1135 state, where
// /scripts/data was gitignored and the JPEGs were hand-placed per checkout) fails here
// rather than silently in someone else's clone.
//
// ponytail: magic bytes and byte sizes only. Image dimensions were verified non-square at
// generation time; asserting that here would need a JPEG SOF parser for a one-time property
// of a file that never changes. Same for "opens in a browser PDF viewer" — verified with
// ghostscript at generation and by a manual open during /testIssue.
const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), 'data')

// src/lib/db/document-storage.ts's MAX_FILE_SIZE.
const MAX_FILE_SIZE = 4_500_000

const MANIFEST = [
  'butter-photo.jpg',
  'emery-photo.jpg',
  'clover-photo.png',
  'harper-photo.png',
  'test_1_kb.pdf',
  'test_4_4_mb.pdf',
  'test_4_6_mb.pdf',
]

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff])
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

describe('scripts/data test assets', () => {
  describe.each(MANIFEST)('%s', (name) => {
    it('should_be_present_in_the_checkout', () => {
      expect(existsSync(join(DATA_DIR, name))).toBe(true)
    })
  })

  describe.each(['butter-photo.jpg', 'emery-photo.jpg'])('%s', (name) => {
    it('should_start_with_the_jpeg_magic_bytes', () => {
      expect(readFileSync(join(DATA_DIR, name)).subarray(0, 3)).toEqual(JPEG_MAGIC)
    })
  })

  describe.each(['clover-photo.png', 'harper-photo.png'])('%s', (name) => {
    it('should_start_with_the_png_magic_bytes', () => {
      expect(readFileSync(join(DATA_DIR, name)).subarray(0, 8)).toEqual(PNG_MAGIC)
    })
  })

  describe.each(['test_1_kb.pdf', 'test_4_4_mb.pdf', 'test_4_6_mb.pdf'])('%s', (name) => {
    it('should_start_with_the_pdf_header', () => {
      expect(readFileSync(join(DATA_DIR, name)).subarray(0, 5).toString('latin1')).toBe('%PDF-')
    })

    it('should_end_with_the_pdf_eof_marker', () => {
      expect(readFileSync(join(DATA_DIR, name)).subarray(-6).toString('latin1').trim()).toBe('%%EOF')
    })
  })

  it('should_keep_test_4_4_mb_under_the_upload_size_limit', () => {
    expect(statSync(join(DATA_DIR, 'test_4_4_mb.pdf')).size).toBeLessThan(MAX_FILE_SIZE)
  })

  it('should_keep_test_4_6_mb_over_the_upload_size_limit', () => {
    expect(statSync(join(DATA_DIR, 'test_4_6_mb.pdf')).size).toBeGreaterThan(MAX_FILE_SIZE)
  })
})
