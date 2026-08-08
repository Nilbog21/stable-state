// covers: src/app/login/**
// covers: src/app/terms/**
// covers: src/app/privacy/**
// covers: TERMS_OF_SERVICE.md
// covers: PRIVACY_POLICY.md
//
// Phase 1's six legal-document checks, as an unauthenticated visitor: the two footer links on
// `/login`, where each one lands, and that the landed-on page renders the drafted document
// (checklists/pre-release/phase-1-setup.md, the block from "Visit `/login` — a **Terms of
// Service** link is present" through "The `/privacy` page renders the drafted privacy policy
// content").
//
// The two markdown files are declared above alongside the three route globs, and that is not
// decoration: `src/app/terms/page.tsx` and `src/app/privacy/page.tsx` are each a
// `readFileSync(join(process.cwd(), '<FILE>.md'))` piped into `<ReactMarkdown>`, so the file IS
// the page's input rather than something merely related to it, and the expectations below are
// computed from it. A spec whose expectations are computed from a file must be selected when
// that file changes, or the selection is unsound.
//
// ---------------------------------------------------------------------------
// Three things about this file that are load-bearing rather than stylistic
// ---------------------------------------------------------------------------
//
// 1. THE CONTEXT IS MINTED BY `browser.newContext({ storageState: { cookies: [], origins: [] } })`
//    AND BY NO OTHER FORM. Every Playwright project in playwright.config.ts binds a storageState,
//    so none of them supplies an anonymous session; and the two obvious ways to get one are both
//    wrong in the same silent direction — the `request` fixture and a bare
//    `playwright.request.newContext()` each carry `sb-<ref>-auth-token`, because the runner
//    back-fills `use.storageState` into any context whose options don't already name one
//    (e2e/CLAUDE.md's fact 4, #1208). A route with no auth check answers an authenticated
//    request identically, so the wrong form passes for the wrong reason. `anonPage` below is the
//    right form, and its cookie-count guard is what keeps that impossible to regress silently.
//
//    That same back-fill is why relative `goto('/login')` works here: Playwright's own artifacts
//    fixture copies every configured context option that the caller did NOT name — `baseURL`
//    included — into the options bag before the context is built. `storageState` IS named, so
//    ours wins; `baseURL` is not, so the config's is inherited.
//
// 2. NO TEST HERE REQUESTS THE `page` FIXTURE, AND NONE MAY. `support/test.ts` overrides `page`
//    to throw unless the spec file called `withBarn()` at module scope. This spec seeds no barn
//    on purpose — `/login`, `/terms` and `/privacy` are all barn-independent — so adding `page`
//    to a signature below turns the whole file red on a seeded-barn error that has nothing to do
//    with what it asserts. Take `anonPage`, which is the authenticated fixture's opposite anyway.
//
//    The `@manager` project tag is therefore about collection, not identity: Phase 1 declares
//    `role-agnostic`, so scripts/check-e2e-tags.sh accepts any configured project, and the
//    project's `manager.json` storageState is never read because nothing here uses the context
//    it would be applied to.
//
// 3. THE EXPECTED HEADINGS ARE DERIVED FROM THE MARKDOWN, AND `markdownHeadings` THROWS RATHER
//    THAN RETURNING A DEGENERATE SET. Deriving is what the checklist item actually claims —
//    "renders the drafted content" means "renders that file", and a hardcoded snapshot would
//    assert something narrower while going stale on every legitimate policy edit. But a derived
//    expectation degrades with its source: truncate or empty one of the documents and the helper
//    would hand back `[]`, `toHaveText([])` would pass against a page rendering nothing, and the
//    assertion would be green in exactly the scenario it exists to catch. The throw closes that
//    hollow pass. Do not "simplify" it away.
import { readFileSync } from 'fs'
import { join } from 'path'
import { test as base, expect, type Page } from './support/test'

const TERMS_LINK = 'Terms of Service'
const PRIVACY_LINK = 'Privacy Policy'

const TERMS_FILE = 'TERMS_OF_SERVICE.md'
const PRIVACY_FILE = 'PRIVACY_POLICY.md'

/**
 * The floor `markdownHeadings` refuses to return below — see note 3. The two documents carry 8
 * and 7 `##` sections as they stand, so a floor of 4 leaves room for either to lose nearly half
 * its sections to an ordinary edit without tripping, while still catching the emptied and
 * truncated cases the throw exists for.
 */
const MIN_SECTIONS = 4

/**
 * Repo root, anchored on the module path rather than on `process.cwd()`: the runner's working
 * directory is whatever it was invoked from, and a cwd-relative read fails in a way that looks
 * like a missing document. `__dirname` rather than `import.meta.url`, which Playwright's CJS
 * transform rejects — same anchor `support/fixtures.ts`'s `assetPath` uses, for the same reason.
 */
function repoFile(name: string): string {
  return join(__dirname, '..', name)
}

/**
 * The document's `#` title followed by its `##` section titles, in source order — which is the
 * order `<ReactMarkdown>` emits them in, so this array is directly comparable to the page's
 * `h1, h2` set.
 *
 * Throws on a degenerate result rather than returning one (note 3). Both halves are checked: a
 * document that lost its title and one that lost its sections are different accidents, and
 * neither may reach an assertion as a shortened expectation that still passes.
 */
function markdownHeadings(name: string): string[] {
  const source = readFileSync(repoFile(name), 'utf-8').split('\n')
  const title = source.find((l) => l.startsWith('# '))?.slice(2).trim()
  const sections = source.filter((l) => l.startsWith('## ')).map((l) => l.slice(3).trim())

  if (!title || sections.length < MIN_SECTIONS) {
    throw new Error(
      `${name} yielded a degenerate heading set (title: ${title ?? 'none'}, ` +
        `sections: ${sections.length}, floor: ${MIN_SECTIONS}) — an expectation built from it ` +
        'would pass against a page rendering nothing; fix the document, not this helper'
    )
  }
  return [title, ...sections]
}

/**
 * A page on a genuinely session-less context — the one form that gives one (note 1), with the
 * teardown the fixture shape exists to own.
 *
 * The cookie read is a precondition on every test's validity rather than one of this file's
 * assertions: if this context ever started carrying a session, the three pages below would still
 * render and every check would still pass, having measured the authenticated case instead. It
 * throws for that reason, and closes the context first so a tripped guard leaks nothing.
 */
const test = base.extend<{ anonPage: Page }>({
  // `runTest` is Playwright's `use` callback, renamed only so the React hooks lint rule doesn't
  // read this fixture as a misplaced hook call — same rename support/test.ts makes.
  anonPage: async ({ browser }, runTest) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const cookies = (await context.storageState()).cookies
    if (cookies.length > 0) {
      await context.close()
      throw new Error(
        `the unauthenticated context must carry no session; it has ${cookies.length} cookie(s): ` +
          cookies.map((c) => c.name).join(', ')
      )
    }
    const page = await context.newPage()
    try {
      await runTest(page)
    } finally {
      await context.close()
    }
  },
})

function footerLink(page: Page, name: string) {
  return page.getByRole('link', { name, exact: true })
}

/**
 * `waitForURL` after a click rather than `toHaveURL`, per support/test.ts's suite-wide rule: the
 * expect budget is 5s and the dev server can exceed it cold-compiling `/terms` or `/privacy`
 * under full-suite load. It is a real sync point here and not fact 3's no-op, because the click
 * starts on `/login` — a URL the pattern cannot already match.
 */
async function pathnameAfterClickingTo(page: Page, linkName: string, pathname: string): Promise<string> {
  await page.goto('/login')
  await footerLink(page, linkName).click()
  await page.waitForURL(`**${pathname}`, { waitUntil: 'commit' })
  return new URL(page.url()).pathname
}

// ---------------------------------------------------------------------------
// Terms of Service
// ---------------------------------------------------------------------------

test('the_login_page_shows_a_terms_of_service_link @manager', async ({ anonPage }) => {
  await anonPage.goto('/login')

  await expect(footerLink(anonPage, TERMS_LINK)).toBeVisible()
})

test('clicking_the_terms_of_service_link_opens_the_terms_page @manager', async ({ anonPage }) => {
  expect(await pathnameAfterClickingTo(anonPage, TERMS_LINK, '/terms')).toBe('/terms')
})

test('the_terms_page_renders_the_drafted_terms_content @manager', async ({ anonPage }) => {
  await anonPage.goto('/terms')

  // Full-set ordered equality over every rendered heading, not containment: a dropped section is
  // as much a regression as a missing title, and containment would accept either. `toHaveText`
  // on an array auto-retries, so it is its own settle guard as well as the assertion — which is
  // why no `toBeVisible()` precedes it.
  await expect(anonPage.locator('h1, h2')).toHaveText(markdownHeadings(TERMS_FILE))
})

// ---------------------------------------------------------------------------
// Privacy Policy
// ---------------------------------------------------------------------------

test('the_login_page_shows_a_privacy_policy_link @manager', async ({ anonPage }) => {
  await anonPage.goto('/login')

  await expect(footerLink(anonPage, PRIVACY_LINK)).toBeVisible()
})

test('clicking_the_privacy_policy_link_opens_the_privacy_page @manager', async ({ anonPage }) => {
  expect(await pathnameAfterClickingTo(anonPage, PRIVACY_LINK, '/privacy')).toBe('/privacy')
})

test('the_privacy_page_renders_the_drafted_privacy_policy_content @manager', async ({ anonPage }) => {
  await anonPage.goto('/privacy')

  await expect(anonPage.locator('h1, h2')).toHaveText(markdownHeadings(PRIVACY_FILE))
})
