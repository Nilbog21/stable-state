# Public pages routes

## `/terms`

**Roles:** unauthenticated

Terms of Service; renders `TERMS_OF_SERVICE.md` (repo root) via `<MarkdownDocument>` (`react-markdown` plus #1556's generated table of contents and slugged `##`/`###` ids), no auth/barn scoping — same static-markdown-page pattern as `/barn/[slug]/guide` but public; generic "← Back" link to `/barns` above the content (#996 follow-up, same treatment as `/about`/`/changelog`); linked from `/login`

## `/privacy`

**Roles:** unauthenticated

Static privacy policy, rendered from `PRIVACY_POLICY.md` at repo root using `<MarkdownDocument>` (same rendering approach as `/barn/[slug]/guide`, no auth check); generic "← Back" link to `/barns` above the content (#996 follow-up, same treatment as `/about`/`/changelog`).
Linked from `/login`

## `/about`

**Roles:** unauthenticated

App overview (name, short description, links to `/terms`/`/privacy`/`/changelog`); the `/changelog` link's label includes the current version parsed from `CHANGELOG.md` via `parseLatestVersion` (`src/lib/changelog.ts`) — since #1589 that is the first `- **vN.0.x — {Month YYYY}.**` bullet inside the top `## vN.0.0` section's `### Later updates` block, falling back to the `## vN.0.0` heading itself for a major that has shipped no patches yet; the first `##` heading alone is *not* the answer. The suffix is omitted rather than erroring if the file can't be read.
A generic "← Back" link to `/barns` sits above the content (not barn-scoped like `/profile`'s nav bar, since this route carries no barn context).
Linked from the avatar dropdown (`UserMenu.tsx`), between User Guide and Sign out

## `/changelog`

**Roles:** unauthenticated

Renders `CHANGELOG.md` (repo root) via `<MarkdownDocument>`, no auth check; same generic "← Back" link to `/barns` as `/about`. #1589 closed the split #1556 left behind, so all four public markdown pages now render alike — but this is the one that passes `maxTocLevel={2}`, limiting the generated contents list to the document's `## vN.0.0` major-version headings. The `###` feature headings still get slug `id`s and stay deep-linkable; they are only excluded from the list, which unlimited would run to 33 entries with "Lessons"/"Notifications"/"Bug fixes" repeating once per major.
That depth limit is paired with a `CHANGELOG.md` convention (#1589): a patch release is *not* its own `## vN.0.x` section — it is a `- **vN.0.x — {Month YYYY}.** {prose}` bullet under a `### Later updates` heading at the top of its major's section, newest first. `/finishIssue` Step 3 writes them there, and `parseLatestVersion` reads them from there (see `/about` above).
Linked from `/about`'s Changelog bullet, and from the avatar dropdown via `/about`
