# Routes

Protected barn routes (dashboard, lessons, horses, riders, finances, settings) live in a `(protected)` route group under `src/app/barn/[slug]/(protected)/`.
The group layout (`layout.tsx`) centralises auth: absent or non-active membership redirects to `/barn/[slug]/login`.
Public routes (login, register) stay outside the group and are unaffected.

The app enforces a ≥44px minimum tap target on every primary interactive control, with no size exception — `Button`'s `md` and `sm` sizes (`min-h-11` on both), `Pill`, `UserMenu`'s avatar, `NotificationBell`'s bell trigger, `BarnSwitcher`'s caret, and `NavDrawer`'s hamburger all carry this floor.

The `(protected)` layout renders a persistent role-aware nav bar above `{children}` on every barn page, responsive at the `md` breakpoint (768px, Tailwind default).
The barn name is rendered via a `BarnSwitcher` Client Component (`font-semibold`).
For single-barn members it renders as a plain `BlockingLink` home link.
For multi-barn members it renders the barn name link plus a caret button (≥ 44 px tap target) that opens a dropdown listing all active barn memberships; the current barn is marked with a checkmark, others link to their `/barn/[slug]` dashboards; the dropdown dismisses on outside click/touch (via the shared `useOutsideDismiss` hook, `src/components/useOutsideDismiss.ts`, which owns the open-state/ref/listener trio for all three nav dropdowns and `ExhaustionBar`'s tap-to-expand popover) or on any link click.
(#507) When the current barn is a demo barn (`barns.is_demo`), the barn name link renders as `"{barn.name} (DEMO)"` in amber instead of the default zinc styling, in both the single-barn plain-link and multi-barn switcher-link cases.
The barn name element appears before the section links:
- manager: {Barn Name} (home), Lessons, Expenses, Horses, Leases, Boarding, Members, Finances, Manage Barn, Guide — 9 section links
- trainer: {Barn Name} (home), Lessons, Horses, Members, Guide — 4 section links
- rider: {Barn Name} (home), Lessons, Horses, Members, Guide — 4 section links

At `md` and up, section links render inline in the bar via a `DesktopNavLinks` Client Component.
Below `md`, they're hidden from the bar and collapse behind a `NavDrawer` Client Component: a hamburger (☰, ≥ 44 px tap target) that opens a left slide-out drawer (`role="dialog"`, `aria-modal`) listing the same server-built `navLinks` array vertically — no client-side role logic, the layout remains the sole source of truth for role→links.
The drawer closes on link tap, scrim tap, Escape, or a `usePathname()` change (since the `(protected)` layout persists across client-side route changes, this closes the drawer if it was left open after a browser back/forward navigation), and moves focus into itself on open.
Drawer links use `BlockingLink` so the unsaved-changes guard still fires.

Both `DesktopNavLinks` and `NavDrawer` highlight the link matching the current page via the shared `isNavLinkActive(currentPath, href)` helper (`nav-active.ts`): a link is active when `usePathname()` equals its `href`'s pathname or is nested under it (so `/lessons/[id]` highlights "Lessons"), and — only for links whose `href` carries a query string, i.e. Leases (`?kind=lease`) vs. Boarding (`?kind=board`), which otherwise share the `/agreements` pathname — the current `useSearchParams()` value must match too.
The active link gets `aria-current="page"` plus bolder/darker styling; inactive links are de-emphasized in grey.

A `UserMenu` Client Component and a `NotificationBell` Client Component sit on the right side of the nav bar in a flex container — avatar then bell at `md` and up (unchanged), reordered to bell then avatar below `md` via CSS `order` utilities to match the mobile bar's `☰ · barn name · spacer · bell · avatar` layout.
`UserMenu` shows the user's initials (first letter of `first_name` + first letter of `last_name` from `profiles`; falls back to first character of email, then `?`).
Clicking it opens a dropdown with: full name + email (non-clickable header), a "Profile" link to `/profile?barn=<slug>` — hidden (#507) when the signed-in user is the shared demo user (`user.email === process.env.DEMO_USER_EMAIL`), since that account's profile is shared across every concurrent `/demo` visitor — a "Switch Barn" link to `/barns` (only when the user has >1 active barn membership), a "User Guide" link to `/barn/[slug]/guide`, and a Sign Out button.
The dropdown closes on outside click or touch (same shared `useOutsideDismiss` hook).
`NotificationBell` shows a bell icon with an unread-count badge (hidden when zero); clicking opens a dropdown listing recent notifications (title, body, timestamp) with links via the `link` field and a "Mark all read" button that calls `markAllNotificationsReadAction` and refreshes.
Notification data is fetched server-side in the layout via `getNotifications`; interactivity is client-side.

"Horses" → `/barn/[slug]/horses` (all roles)
"Leases" → `/barn/[slug]/agreements?kind=lease` (manager only)
"Boarding" → `/barn/[slug]/agreements?kind=board` (manager only)
"Manage Barn" → `/barn/[slug]/settings` (manager only)

## Route groups

One file per group under [`routes/`](routes/):

- [core](routes/core.md) — `/`, `/barns`, `/barn/[slug]`, `/barn/[slug]/guide`
- [lessons](routes/lessons.md) — `/barn/[slug]/lessons`, `/barn/[slug]/lessons/new`, `/barn/[slug]/lessons/[id]`, `/barn/[slug]/lessons/[id]/delete`, `/barn/[slug]/lessons/[id]/edit`, `/barn/[slug]/lessons/[id]/cancel`, `/barn/[slug]/lessons/[id]/cancel-rider/[riderId]`
- [expenses](routes/expenses.md) — `/barn/[slug]/expenses`, `/barn/[slug]/expenses/new`, `/barn/[slug]/expenses/[id]`, `/barn/[slug]/expenses/[id]/delete`
- [horses](routes/horses.md) — `/barn/[slug]/horses`, `/barn/[slug]/horses/[id]`
- [agreements](routes/agreements.md) — `/barn/[slug]/agreements`, `/barn/[slug]/agreements/new`, `/barn/[slug]/agreements/[id]`, `/barn/[slug]/agreements/[id]/edit`
- [members](routes/members.md) — `/barn/[slug]/members`, `/barn/[slug]/members/[membership_id]`, `/barn/[slug]/documents/new`
- [finances](routes/finances.md) — `/barn/[slug]/finances`, `/barn/[slug]/finances/outstanding`, `/barn/[slug]/finances/horses/[id]`, `/barn/[slug]/finances/riders/[id]`, `/barn/[slug]/finances/trainers/[id]`, `/barn/[slug]/finances/expenses/[recipient]`
- [settings](routes/settings.md) — `/barn/[slug]/settings`, `/barn/[slug]/settings/tiers/new`, `/barn/[slug]/settings/tiers/[id]`, `/barn/[slug]/settings/events/new`, `/barn/[slug]/settings/events/[id]`, `/barn/[slug]/settings/events/[id]/delete`
- [auth](routes/auth.md) — `/profile`, `/profile/complete`, `/login`, `/barn/[slug]/login`, `/auth/callback`, `/barn/[slug]/register`
- [public](routes/public.md) — `/terms`, `/privacy`, `/about`, `/changelog`
- [misc](routes/misc.md) — `/calendar.ics`, `/demo`, `/api/cron/reset-demo`
