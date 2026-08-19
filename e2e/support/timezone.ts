/**
 * The zone the Playwright *browser context* runs in, pinned by playwright.config.ts for the
 * same reason vitest.config.mts pins TZ (#1221) — see the comment there.
 *
 * It lives here rather than as a literal in the config because the Node runner process is
 * deliberately left on the developer's own zone. Any spec that computes an expected date
 * runner-side has to format it in *this* zone to match what the page rendered, and a second
 * copy of the literal in each such spec is precisely the drift the pin exists to catch.
 */
export const BROWSER_TIMEZONE = 'Asia/Kolkata'
