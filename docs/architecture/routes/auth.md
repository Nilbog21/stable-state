# Auth & profile routes

## `/profile`

**Roles:** Authenticated

(#507) Redirects to `/` before rendering when the signed-in user is the shared demo user (`user.email === process.env.DEMO_USER_EMAIL`), since that account's profile is shared across every concurrent `/demo` visitor.
Otherwise, edit form for first name, last name, phone, emergency contact name, emergency contact phone; name changes prompt user to notify their barn manager; linked from avatar dropdown.
Accepts optional `?barn=<slug>` — when present and the user has an active membership in that barn, the full barn nav bar is rendered instead of the back-button fallback; the post-save redirect returns to `/barn/<slug>` on mere presence of the param, rather than the default membership-based redirect — unlike the nav bar, membership is not re-checked for the redirect target (the two conditions live in different files: the nav-bar gate in `profile/layout.tsx`, the redirect target in `page.tsx`).
When `?barn=<slug>` resolves to an active membership, also renders a **Calendar Feed** section (`CalendarFeedSection`, #1018) — a "Get my calendar link" button that generates that membership's `calendar_feed_token` on click, plus Copy/Regenerate controls once a token exists, with a static explainer that refresh cadence is controlled by the external calendar app, not the server.
The `/calendar.ics?token=...`
URL is never rendered (#1116) — it is built entirely inside the Copy click handler, so the component never touches `window` during a server render, mirroring `ManageMemberSection.tsx`'s invite-link pattern.
Since there is no on-screen copy to fall back on, a failed `navigator.clipboard.writeText` (which requires a secure context) renders a copy-failure message rather than failing silently;
Regenerate clears both that message and the transient "Copied!" label, and — since neither button is disabled while `writeText` is awaiting (`pending` only goes true once Regenerate is clicked) — bumps its own `copyGenerationRef` counter (a per-component `useRef`, not shared state), so a copy still in flight when Regenerate supersedes its token is a no-op on resume instead of re-setting either for a token that no longer exists — the counter is handed back if `regenerateAction` itself rejects, since nothing was superseded in that case and the in-flight copy must still be allowed to report its own outcome. `ManageMemberSection.tsx`'s Revoke solved the same race the same way until #1396 unwrapped its Server Function; it now tags each copy outcome with the token it was for and derives currency at render instead, which needs no counter and no rollback and closes the window bump-and-check leaves open when a copy settles in the same tick as a failed action. This surface still latches, so the two have diverged again after #1116 converged them

## `/profile/complete`

**Roles:** Authenticated

Same form with "Complete your profile" heading; post-login destination when any contact field (phone, emergency_contact_name, emergency_contact_phone) is null — the shared `isProfileIncomplete` predicate (`src/lib/contact-info.ts`), evaluated by the auth callback, which also drives the `incomplete_profile`/`member_incomplete_profile` notifications; redirects to `/` after save

## `/login`

**Roles:** All

Sign-in page; displays Supabase connection status dot (green = `NEXT_PUBLIC_SUPABASE_URL` set, yellow = not set); shows no-barn guidance when `?no_barns=true` and user is authenticated; shows a "demo is unavailable" message when `?error=demo_unavailable` (set by `demo/actions.ts`'s `createOrResumeDemoBarn` on its failure paths — missing env vars, sign-in failure, missing profile); "Keep me logged in" checkbox (checked by default, pre-filled from `remember_me_pref` cookie) — on submit the sign-in actions set `remember_me` (5-min TTL, read by the auth callback) and `remember_me_pref` (1-year TTL) cookies to `1`/`0` before the OAuth redirect; `/barn/[slug]/login` has the same checkbox.
The auth callback consumes `remember_me` (cleared on every exit path): `1` → `barn_session_*` and Supabase `sb-*` cookies get `maxAge` 30 days; `0` → session-only (`maxAge` stripped; note `@supabase/ssr` defaults `sb-*` to 400 days).
Because `sb-*` cookies are rewritten on token refresh (by `src/lib/supabase/server.ts` and `src/proxy.ts` cookie adapters), both adapters re-apply the lifetime via `applyRememberMe` (`src/lib/supabase/cookie-options.ts`), reading `remember_me` falling back to the durable `remember_me_pref`

## `/barn/[slug]/login`

**Roles:** All

Barn-scoped sign-in page: barn name heading + Google sign-in button; `notFound()` when the slug doesn't resolve.
Binds `signInWithGoogleForBarn(slug, token)` so an invite `?token=` (forwarded here by `/barn/[slug]/register` when the visitor isn't signed in yet) survives the OAuth round-trip as `/auth/callback`'s `?token=` param; same "Keep me logged in" checkbox as `/login`, pre-filled from the `remember_me_pref` cookie.
Also where `requireMembership` (`src/lib/auth/guard.ts`) sends any request with no authenticated user at all

## `/auth/callback`

**Roles:** OAuth redirect target (no session yet)

Route Handler (`src/app/auth/callback/route.ts`), not a page — the OAuth return leg for both sign-in pages: exchanges `?code=` for a session; claims a managed-member invite when `?token=` **and** `?barn=` are both present — the slug is required rather than preferred, since `actions/auth.ts`'s `signInWithGoogleForBarn` is the sole emitter of `&token=` and only ever appends it to a `?barn=` URL, so requiring both folds away a slugless branch that would have had no error screen to land on (#1440); failure → `/barn/[slug]/register?error=invite_claim_failed`, which renders that page's existing "Invite invalid" screen ahead of its auth check, replacing a redirect to a login page that reads no error param and so showed a bare sign-in form after a full OAuth round trip; then routes by `?barn=` — unknown barn → `/login?error=auth_callback_failed`, no membership → `/barn/[slug]/register`, incomplete profile → `/profile/complete?barn=<slug>`, else the barn dashboard — or, with no `?barn=`, by the user's active-membership count after the same incomplete-profile check (incomplete → `/profile/complete`, with `?barn=<slug>` only when there is exactly one active membership; otherwise one → that barn, several → `/barns`, none → `/login?no_barns=true`).
Sets a `barn_session_{slug}` cookie for each resolved barn (honouring the single-use `remember_me` cookie for cookie lifetime, and clearing it on every exit path) and best-effort fires the login notifications (own incomplete-profile nudge; for a manager, the members-incomplete-profile roster check); a missing or failed code exchange falls back to `/login?error=auth_callback_failed`

## `/barn/[slug]/register`

**Roles:** unauthenticated or already-authenticated

Invite-token landing page (#777 — generic self-registration closed; every member now joins via the managed-member + per-person invite-token flow) and, since #942, the entry point every generated invite link actually points at (`buildInvitePath` in `scripts/seed-account.ts`, `ManageMemberSection.tsx`'s Copy Invite) rather than `/login`, so an already-authenticated visitor gets the Accept-Invite short-circuit below instead of always being forced through Google.
Requires a `?token=` query param, checked for **presence only** — the page's render never looks the token up (its only DB reads are the barn, the authenticated user, and that user's membership), so an invalid-but-present token proceeds through the normal flow below and fails only at claim time: the `claim_managed_member` RPC is the sole validity check, reached from exactly two call sites — `acceptInvite` below, whose failure round-trips back here as `?error=1`, and `/auth/callback`'s claim step, whose failure also lands back here, as `?error=invite_claim_failed` with no token alongside it (#1440 — it previously went to the originating login page, which reads no error param). A missing token, or an `?error` param (set as `?error=1` by a failed claim), renders an "Invite invalid" message with no form.
Any present token with no `?error` alongside it, when the visitor isn't yet signed in, redirects to `/barn/[slug]/login?token=...` to reuse the existing OAuth+claim flow (see `claim_managed_member` in [`rpc/members.md`](../rpc/members.md));
when already signed in (and not already an active member), the page renders a "Join {barn}" confirmation with an **Accept Invite** button bound to `register/actions.ts`'s `acceptInvite` Server Action — claiming is deliberately not performed as a side effect of the page's own render (a bare GET), since that would let a `<Link>` prefetch or a chat-app link-preview bot burn the single-use invite token before the intended recipient acts;
`acceptInvite` calls `claimManagedMember` (passing `null` for a missing OAuth email, matching `/auth/callback`'s handling), sets the `barn_session_{slug}` cookie (#1076 — this path previously left it unset, which silently passed the bare `/barn/[slug]` dashboard render but bounced the user to `/barn/[slug]/login` via `proxy.ts`'s session check on the first nested route visited, despite a valid Supabase session) and redirects to the barn home on success, or back to this page with `?error=1` on failure
