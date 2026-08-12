// The horse detail page's shared locator vocabulary — currently the #1390 identity-header media
// cluster — extracted 2026-08-11 from `checklist-phase4-horses-photos.spec.ts` and
// `checklist-phase56-horses-media.spec.ts`, which carried byte-identical copies of it. The photos
// spec is the source of each canonical body unless noted, and each docstring is an existing copy's
// rationale moved verbatim.
import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import type { Page } from '@playwright/test'
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
