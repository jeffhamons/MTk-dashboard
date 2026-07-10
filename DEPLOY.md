# Deploy — Mindtools Weekly Review

## What this is
A static single-page app (HTML + JSX compiled in-browser via Babel). No build step. All vendor JS is bundled in `vendor/`. Backend is Supabase (Postgres + Auth + Realtime).

---

## Files
```
weekly-review-dashboard/
  index.html              ← single entry point, all CSS + App shell
  src/
    supabase-client.js    ← Supabase config + all DB calls
    data-model.js         ← REPS, WEEKS, DELIVERABLES constants
    components.jsx        ← Avatar, BigCheck, AskForHelp, etc.
    manager.jsx           ← FlagQueue, ManagerNote, APP_PAGES registry
    standup.jsx           ← StandupView + @-mention autocomplete
    team-rollup.jsx       ← Team rollup grid
    rep-view.jsx          ← Per-rep week view
    tweaks-panel.jsx      ← In-app Tweaks panel (design tool)
    auth-gate.jsx         ← Supabase magic-link auth wrapper
  vendor/                 ← React 18, ReactDOM, Babel, Supabase UMD (all pinned)
  db/
    migration-resolved-flags.sql  ← Run once in Supabase SQL editor
```

---

## Deploy steps

### 1. Supabase — run the migration
In your Supabase project → SQL Editor, paste and run:
```
weekly-review-dashboard/db/migration-resolved-flags.sql
```
This adds `resolved_by_email / name / role` columns to the `asks` table + an index.

### 2. Supabase credentials
The URL and anon key are already set in `src/supabase-client.js` (lines 10–11). They're correct for the existing project — no change needed unless you're deploying to a new Supabase project.

### 3. Static host — any of these work
| Host | Steps |
|------|-------|
| **Netlify** | Drag-and-drop the `weekly-review-dashboard/` folder onto app.netlify.com → deploys instantly |
| **Vercel** | `vercel --cwd weekly-review-dashboard` |
| **S3 / CloudFront** | Upload folder contents to bucket root, set `index.html` as default document |
| **Any nginx/Apache** | Drop folder in webroot; no rewrites needed (no client-side routing) |

No build step, no npm install, no environment variables — the Supabase keys are hardcoded (the anon key is safe to expose).

---

## Auth
Uses Supabase magic-link email auth. The `AuthGate` wrapper in `auth-gate.jsx` handles sign-in/out. User provisioning is gated by an allowlist: when someone signs in for the first time, a trigger (`on_auth_user_created`) validates their email against `public.allowed_emails` and auto-creates their row in `public.users` with the role and rep_id from the allowlist.

To add a new user, insert ONE row into `allowed_emails`:
```sql
insert into allowed_emails (email, role, rep_id)
values ('newrep@company.com', 'rep', 'cammy');
-- role: 'manager' | 'rep' | 'team_admin'
-- rep_id: matches id field in data-model.js REPS array (null for managers/team admins)
```

The person then requests a magic link and signs in; the trigger populates `public.users` automatically. If the email is not on the allowlist, sign-in is rejected server-side.

### Seating a team admin (RFC-151)

A **team admin** is a team-scoped manager: full manager-parity actions over the
reps their `team_admins` scopes cover, and **zero visibility into any other
team** — enforced by RLS, not just hidden in the UI. Seating one takes TWO
inserts (both required — the RLS grant is deliberately inert unless
`role = 'team_admin'` AND a matching `team_admins` row exist, so neither field
alone grants anything):

```sql
-- 1. the allowlist row (role 'team_admin', no rep_id)
insert into allowed_emails (email, role, rep_id)
values ('lead@company.com', 'team_admin', null);

-- 2. one scope row PER (team, region) they cover — explicit rows, never a
--    wildcard: adding a region later must be a deliberate insert here.
insert into team_admins (auth_id, team_id, region)
select auth_id, 'cs', 'US' from users where email = 'lead@company.com';
```

If they have never signed in, run insert #2 after their first sign-in (the
trigger creates their `users` row) — or use their `auth.users.id` directly.

> **⚠️ Lara is `role='team_admin'` — NEVER `role='manager'`.** The UI may call
> her "CS Manager", but the stored role value must stay `team_admin`. A global
> `manager` role sees **every team's data including all NA BD deals, checks,
> asks and standups**, which silently defeats the entire CS isolation design
> (RFC-151's hard constraint). The same applies to every future division head:
> `manager` is Jeff's global-bypass role, nobody else's.

### Lara cutover ritual (one-time, after this client version is deployed)

Lara currently holds `role='manager'` (pre-RFC-151 seating — she sees all NA
BD data today). Her `(cs,'US')` scope row is already seeded and inert. **After
the Phase 3 client is live on Netlify** (an older client would treat a
`team_admin` as a bare rep and lock her out of her manager UI), flip her role:

```sql
update allowed_emails set role = 'team_admin', rep_id = null where email = 'lkidd@mindtools.com';
update users          set role = 'team_admin'               where email = 'lkidd@mindtools.com';
```

That single flip activates her CS-only scope — both `(cs,'US')` and
`(cs,'EMEA')` rows are already seeded — and simultaneously revokes her global
NA BD visibility. Verify from her session: CS reps visible, and a direct query
for an NA BD rep_id returns zero rows. Her EMEA reps (Laura Blackmore, Owen
Bolding, James Brooke, Rowan Donoghue, Alex Martin) are registered with
`active=false` / `emit:false` until Phase 4 ships the CS section UI; seat
their logins via `allowed_emails` when they go live.

---

## Workspace switcher (RFC-151 Phase 4)
The nav shows a team switcher (NA BD / CS) **only for users with access to more
than one team** — in practice, the global manager. A single-team admin (Lara)
or rep has exactly one workspace and lands in it directly, no switcher. Every
view (home, team rollup, standup, weekly wins, leaderboard, open flags, rep
tabs) is scoped to the active workspace; the choice persists in localStorage
(`mtk-workspace-v1`) and is always clamped to the teams the user can access.
Jeff's own standup row is shared with both workspaces. The CS leaderboard is
the CS renewal/quarterly-target view (renewal-to-target + expansion, from
`renewal_book` / `cs_quarterly_targets`).

## "View as" switcher
A dev/testing toggle in the nav lets you switch perspective without signing out. It shows for **managers** in production, and for **everyone** on localhost or the preview sandbox. Reps in production won't see it. It includes a **Lara Kidd (CS team admin)** entry so her scoped experience can be previewed before the cutover.

---

## What changed in this version (for context)
- **Flags: respond + resolve flow** — manager can now write a response inline before resolving; response persists in resolved history
- **Flags: rep page clears on resolve** — resolving a flag from Open Flags removes it from the rep's askbar and deliverable card immediately
- **Standup: alternating row shading** — subtle zebra striping on the standup grid
- **Standup: auto-grow textarea** — response fields expand as you type
- **View as switcher** — nav pill to switch perspective for testing
