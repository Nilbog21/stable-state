# Privacy Policy

**Last updated: July 23, 2026**

Stable State ("we", "the app") is barn management software. This policy explains what data we collect, why, and who else sees it.

## What we collect

- **Account data** — your name and email, provided by Google when you sign in with Google OAuth
- **Contact info** — phone number and emergency contact details, if you or your barn manager add them
- **Barn membership** — which barn(s) you belong to and your role (manager, trainer, or rider)
- **Barn records** — horse, lesson, agreement, appointment (vet/farrier visits), expense, event, and transaction records your barn's staff enter to run their operations
- **Uploaded documents** — files (e.g. coggins papers, contracts) uploaded to a horse, staff member, or rider's record
- **Profile photo** — a picture you or your barn manager add to your member profile, visible to other members of your barn(s)
- **Calendar feed link** — if you opt in from your Profile page, we generate an unguessable link containing a token that lets your phone's calendar app (Google, Apple, Outlook) read your barn schedule without signing in. Anyone who has the link can view the schedule it grants access to, so treat it like a password; regenerating it (or simply not using the feature) revokes the old link immediately

We do not collect anything beyond what's needed to run the features your barn actually uses.

## Why we collect it

Solely to operate the scheduling, billing/reconciliation, and record-keeping features your barn has signed up for. We don't use your data for advertising or profiling.

## Third parties

We use a small number of infrastructure providers to run the app. None of them use your data for their own purposes — they only process it on our behalf:

- **Google** — authentication (OAuth sign-in) only
- **Supabase** — database and file storage
- **Vercel** — application hosting
- **GitHub** — runs a nightly automated database backup for disaster recovery (see Data Retention below)

## We do not sell data

We never sell, rent, or share your data with third parties for marketing or any other commercial purpose.

## Data retention & deletion

Your barn's data is retained for as long as the barn account is active. A nightly automated backup of the production database is kept for 30 days (as a GitHub Actions artifact) for disaster recovery, then automatically expires. A barn manager can also generate an on-demand zip archive of all the barn's uploaded documents, or an on-demand spreadsheet of the barn's lesson, financial, horse, and rider records, for their own records, from Manage Barn → Data Backup; each barn retains only its most recently generated archive/spreadsheet of each kind, which is overwritten every time it's regenerated. To request deletion of your data, contact us at the address below.

## Contact

Questions about this policy or requests regarding your data: **aseefried@gmail.com**

## Changes to this policy

If this policy changes, we'll update the date above.
