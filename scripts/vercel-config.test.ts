import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// #1438: Vercel's Hobby plan allows a cron at most one run per day, and it validates that at
// deploy time — after CI is green — so a too-frequent schedule breaks every deployment on the
// branch, previews included, with nothing in scripts/ci.sh to catch it first. vercel.json is
// JSON and can't hold a comment, so this test is the only CI-visible statement of the limit.
//
// A schedule runs at most daily iff both its minute and hour fields are plain literals; `*`,
// `*/6`, `1,13` and `0-6` all fan out to more than one run. The remaining three fields only
// ever remove days, never add runs within one, so they're unconstrained here.
const VERCEL_JSON = join(dirname(dirname(fileURLToPath(import.meta.url))), 'vercel.json')

const LITERAL = /^\d{1,2}$/

const crons: { path: string; schedule: string }[] =
  JSON.parse(readFileSync(VERCEL_JSON, 'utf8')).crons ?? []

describe('vercel.json crons', () => {
  describe.each(crons)('$path', ({ schedule }) => {
    it('should_run_at_most_once_a_day_on_the_hobby_plan', () => {
      const [minute, hour] = schedule.split(' ')
      expect([minute, hour].every((field) => LITERAL.test(field))).toBe(true)
    })
  })
})
