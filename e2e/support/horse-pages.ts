// The horse detail page's shared locator vocabulary — the #1390 identity-header media cluster,
// extracted 2026-08-11 from `checklist-phase4-horses-photos.spec.ts` and
// `checklist-phase56-horses-media.spec.ts`, which carried byte-identical copies of it. The photos
// spec is the source of each canonical body unless noted, and each docstring is an existing copy's
// rationale moved verbatim. The identity-header lines and Access-table cluster (`headerLines`,
// `ownerLink`, `accessSection`, `accessColumns`, `grantRow`, `grantedMembers`) followed on
// 2026-08-14, from `checklist-phase2-horses-access.spec.ts` and
// `checklist-phase2-horses-owner.spec.ts`, which carried byte-identical copies, plus
// `checklist-phase56-horses-media.spec.ts`'s `headerLines`; the access spec is the canonical body
// source for that cluster, and `checklist-phase56-horses-media.spec.ts` supplied `headerLines`'s
// docstring.
import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import type { Locator, Page } from '@playwright/test'
import { accordionSection } from './accordion'
import { assetPath } from './fixtures'

// Every asset the checklist lines name, verbatim. docs/scripts.md's asset table assigns
// harper-photo.png and emery-photo.jpg to *member* photo flows, but two lines name both files
// explicitly for Apple the horse — "As manager, set `scripts/data/harper-photo.png` on Apple" and
// "Replace Apple's photo with `scripts/data/emery-photo.jpg`". The line text wins, on the precedent
// #1201 set when its "tap **Set Photo** and upload `scripts/data/clover-photo.png`" line named
// clover-photo.png for a member. These files are read-only sources — reuse across entities costs
// nothing.
export const CLOVER_PHOTO = 'clover-photo.png'
export const BUTTER_PHOTO = 'butter-photo.jpg'
export const HARPER_PHOTO = 'harper-photo.png'
export const EMERY_PHOTO = 'emery-photo.jpg'

const digestOf = (bytes: Buffer | Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

/**
 * Every asset the horse specs can legitimately be displaying, keyed by the SHA-256 of its real bytes.
 *
 * The rendered <img src> is a signed URL over the stored object, so fetching it and hashing the
 * response identifies *which file* is on screen, exactly — and it carries its own negative half,
 * since matching one asset's digest excludes the other three by construction.
 */
const ASSET_BY_DIGEST = new Map(
  [CLOVER_PHOTO, BUTTER_PHOTO, HARPER_PHOTO, EMERY_PHOTO].map(
    (name) => [digestOf(readFileSync(assetPath(name))), name] as const
  )
)

/**
 * The identity header, which is where the photo and its controls live since #1390 — the
 * standalone **Photo** section that used to own them, and the h2 this locator used to filter on,
 * are both gone. Nothing else on the page renders an `<img>` or a Set/Replace/Remove control, so
 * `<header>` is as tight a scope as the old section was.
 */
export function photoSection(page: Page) {
  return page.locator('main header')
}

/** The horse's photo, addressed by its accessible name — the <img>'s alt is the horse's name. */
export function photoImage(page: Page, horseName: string) {
  return photoSection(page).getByRole('img', { name: horseName, exact: true })
}

/**
 * Every photo write control in the header, whichever variant rendered it.
 *
 * One locator covering all three controls the checklist names: Set Photo and Replace Photo are
 * `<Button href>` (a Next Link, so an `<a>`), Remove Photo is a submit `<button>` inside its own
 * form. The `<img>` is deliberately *not* matched — the absence claim is about controls, and the
 * photo's own presence is a different line's claim.
 *
 * Named by role rather than counted as a bare `a, button`, which is what this was until #1390:
 * the header now also carries the owner link, and a structural count could not tell the two
 * apart.
 */
export function photoControls(page: Page) {
  return photoSection(page)
    .getByRole('link', { name: /Photo$/ })
    .or(photoSection(page).getByRole('button', { name: 'Remove Photo', exact: true }))
}

/**
 * Which committed asset the page is currently displaying, by content rather than by name.
 *
 * Throws — rather than returning a falsy default — at every step that could otherwise make a
 * caller's assertion vacuous: no <img>, no src, a signed URL that doesn't serve, or bytes matching
 * none of the seeded assets. A mutation of the expected asset name can therefore only fail by
 * comparing two real values.
 */
export async function displayedPhotoAsset(page: Page, horseName: string): Promise<string> {
  const src = await photoImage(page, horseName).getAttribute('src')
  if (!src) throw new Error(`no src on the ${horseName} photo img`)

  const response = await page.request.get(src)
  if (!response.ok()) throw new Error(`the ${horseName} photo src returned ${response.status()}`)

  const name = ASSET_BY_DIGEST.get(digestOf(await response.body()))
  if (!name) throw new Error(`the displayed ${horseName} photo matches none of the committed assets`)
  return name
}

/**
 * The identity header's text lines, in DOM order.
 *
 * #1390 replaced the labelled `Status` / `Registered Name` `<dl>` this used to read with an
 * unlabelled header column: the horse's name as `<h1>` with a status `<Badge>` beside it, then a
 * `<p>` per optional line — registered name, unavailability reason — and finally the owner line,
 * which always renders. So the registered name's *position* is still assertable, and still
 * assertable as a whole list rather than an index into one; only the labels are gone.
 *
 * `<h1>` and the badge are excluded deliberately: the horse's own name and status are other
 * lines' claims, and including them would make every registered-name assertion over it fail on an
 * unrelated change to either.
 *
 * Asserted as the whole list rather than as an index into it: a line that vanished, moved, or
 * arrived unexpectedly fails, where a single-line read would not.
 */
export function headerLines(page: Page): Locator {
  return page.locator('main header p')
}

/** The owner line's link. Absent entirely when the horse has no owner, which is what makes this a
 *  real locator rather than a text match on a line that always exists. */
export function ownerLink(page: Page): Locator {
  return headerLines(page).getByRole('link')
}

/** The Access accordion's rendered section — the scope every Access-table read hangs off. */
export function accessSection(page: Page): Locator {
  return accordionSection(page, 'Access')
}

/** The header row. Each spec reads it back in the same test as its first indexed cell read, so
 *  its column-index consts are checked against the table rather than assumed about it. */
export function accessColumns(page: Page): Locator {
  return accessSection(page).locator('thead th')
}

/** A member's row in the Access table, addressed by the name in its Member cell. */
export function grantRow(page: Page, name: string): Locator {
  return accessSection(page)
    .locator('tbody tr')
    .filter({ has: page.getByRole('cell', { name, exact: true }) })
}

/** The member names the grants list currently holds. */
export function grantedMembers(page: Page): Locator {
  return accessSection(page).locator('tbody tr td:first-child')
}
