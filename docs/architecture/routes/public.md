# Public pages routes

## `/terms`

**Roles:** unauthenticated

Terms of Service; renders `TERMS_OF_SERVICE.md` (repo root) via `react-markdown`, no auth/barn scoping — same static-markdown-page pattern as `/barn/[slug]/guide` but public; generic "← Back" link to `/barns` above the content (#996 follow-up, same treatment as `/about`/`/changelog`); linked from `/login`

## `/privacy`

**Roles:** unauthenticated

Static privacy policy, rendered from `PRIVACY_POLICY.md` at repo root using `react-markdown` (same rendering approach as `/barn/[slug]/guide`, no auth check); generic "← Back" link to `/barns` above the content (#996 follow-up, same treatment as `/about`/`/changelog`).
Linked from `/login`

## `/about`

**Roles:** unauthenticated

App overview (name, short description, links to `/terms`/`/privacy`/`/changelog`); the `/changelog` link's label includes the current version parsed from `CHANGELOG.md`'s top `## vX.Y.Z` heading (via `parseLatestVersion`, `src/lib/changelog.ts`) — the suffix is omitted rather than erroring if the file can't be read.
A generic "← Back" link to `/barns` sits above the content (not barn-scoped like `/profile`'s nav bar, since this route carries no barn context).
Linked from the avatar dropdown (`UserMenu.tsx`), between User Guide and Sign out

## `/changelog`

**Roles:** unauthenticated

Renders `CHANGELOG.md` (repo root) via `react-markdown`, same static-markdown-page pattern as `/terms`/`/privacy`, no auth check; same generic "← Back" link to `/barns` as `/about`.
Linked from `/about`'s Changelog bullet, and from the avatar dropdown via `/about`
