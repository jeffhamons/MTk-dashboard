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
Uses Supabase magic-link email auth. The `AuthGate` wrapper in `auth-gate.jsx` handles sign-in/out. Users are matched to reps via the `users` table in Supabase, keyed on `auth_id` (FK → `auth.users.id`).

To add a new user, first invite them via Supabase Auth so they get an `auth.users.id`, then:
```sql
insert into users (auth_id, email, role, rep_id)
values ('<auth_id>', 'newrep@company.com', 'rep', 'cammy');
-- role: 'manager' | 'rep'
-- rep_id: matches id field in data-model.js REPS array (null for managers)
```

---

## "View as" switcher
A dev/testing toggle in the nav lets you switch perspective without signing out. It shows for **managers** in production, and for **everyone** on localhost or the preview sandbox. Reps in production won't see it.

---

## What changed in this version (for context)
- **Flags: respond + resolve flow** — manager can now write a response inline before resolving; response persists in resolved history
- **Flags: rep page clears on resolve** — resolving a flag from Open Flags removes it from the rep's askbar and deliverable card immediately
- **Standup: alternating row shading** — subtle zebra striping on the standup grid
- **Standup: auto-grow textarea** — response fields expand as you type
- **View as switcher** — nav pill to switch perspective for testing
