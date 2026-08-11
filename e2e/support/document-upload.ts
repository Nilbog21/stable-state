// The `/barn/[slug]/documents/new` upload page's shared vocabulary — the route serves horse
// documents, member documents, and photo mode, so these locators are entity-agnostic — extracted
// 2026-08-11 from the four specs that carried byte-identical copies of it, two of them with JSDoc
// citing another spec as the canonical original. `checklist-phase4-horses-documents.spec.ts` is
// the source of each canonical body.
import type { Page } from '@playwright/test'

/** The upload form, scoped to <main> so a dev overlay or a future layout can never join it. */
export const uploadForm = (page: Page) => page.locator('main form')

/**
 * The submit button, located structurally rather than by its accessible name: the label is
 * `{pending ? 'Uploading…' : 'Upload'}`, and a non-exact name match would treat "Upload" as a
 * prefix of "Uploading…" — the same substring-containment trap #1202 recorded for fee text, in a
 * second place.
 */
export const submitButton = (page: Page) => uploadForm(page).locator('button[type="submit"]')
