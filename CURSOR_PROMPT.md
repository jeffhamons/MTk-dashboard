# Mindtools Weekly Review — Cursor / Crash Prompt

You are working on the **Mindtools Kineo Weekly Review** dashboard — an internal sales management tool used by a sales manager (Jeff) and his team of reps.

---

## What this app does

The app has three roles:

**Manager (Jeff):**
- Reviews each rep's weekly deliverables (checks them off, adds private notes)
- Sees an Open Flags queue — reps raise flags when they're blocked; Jeff responds and resolves them
- Views the full team rollup at a glance
- Runs Tue/Thu standups in a shared grid
- Browses any rep's Weekly Wins form (read-only)

**Rep (e.g. Cammy, Brenda, Farah, Dwayne, Meri):**
- Checks off their weekly deliverables
- Raises a flag ("what I need") on any deliverable they're stuck on
- Fills in their standup cells (4 prompts, @-mention teammates)
- Fills in their **Weekly Wins form** directly in the dashboard (replaces Excel spreadsheet)
- Sees only their own week + a read-only team summary

**Auth:** Supabase magic-link email, allowlist-gated via trigger. Role + rep_id stored in `users` table (keyed on `auth_id` FK to `auth.users.id`). The `AuthGate` component wraps the app and passes `authedUser` down. New users are provisioned via `public.allowed_emails`; a trigger auto-creates their `users` row on first sign-in.

---

## File structure

```
index.html                  ← App shell + all CSS + App() React component
src/
  data-model.js             ← REPS[], WEEKS[], DELIVERABLES[] — all static config
  supabase-client.js        ← All DB read/write functions + Realtime subscriptions
  components.jsx            ← Shared UI: Avatar, BigCheck, AskForHelp, EmailButton, Icon
  manager.jsx               ← APP_PAGES registry, FlagQueue, ManagerNote, ResolvedSection
  standup.jsx               ← StandupView, StandupCell (@-mention), MentionedYouBanner
  team-rollup.jsx           ← Team rollup grid (all reps, current week status)
  rep-view.jsx              ← Per-rep week view (deliverables, checks, flag button)
  wins-form.jsx             ← Weekly Wins intake form (replaces Excel spreadsheet)
  tweaks-panel.jsx          ← In-app design tweaks panel (accent color, density, layout)
  auth-gate.jsx             ← Supabase magic-link auth wrapper
vendor/                     ← React 18, ReactDOM, Babel standalone, Supabase UMD (all pinned, offline-safe)
db/
  migration-resolved-flags.sql  ← Run once: adds resolved_by cols to asks
  migration-wins.sql            ← Run once: creates wins table (JSONB columns per section)
```

---

## Architecture

- **No build step.** JSX is compiled in-browser by Babel standalone. All `src/*.jsx` files are loaded via `<script type="text/babel" src="...">` in index.html.
- **State shape:** A single `state` object with `{ checks, asks, managerNotes }`. Synced to Supabase when configured; falls back to localStorage otherwise.
- **Key state keys:**
  - `checks["repId|weekId|delId"]` → `{ at, markedBy }` or null
  - `asks["repId|weekId|delId"]` → `{ text, at, response? }` — the rep's flag
  - `managerNotes["repId|weekId|delId"]` → `{ note, updated_by, updated_at }`
- **Routing:** A single `view` string state in App. Values: `"home"`, `"rollup"`, `"standup"`, `"wins"`, `"manager:flags"`, or a repId like `"cammy"`.
- **Realtime:** Supabase Realtime subscription updates state when other users make changes (~1s latency).
- **wins table** has its own load/save/subscribe cycle in `wins-form.jsx` — it does NOT go through the shared `state` object.

---

## Key components

### `App` (index.html)
- Manages all state + handlers (`onCheck`, `onAsk`, `onSaveNote`)
- Has a `devViewAs` state — a "View as" pill in the nav lets managers switch perspective for testing. Only shows for managers in production; always shows on localhost/preview.
- Passes `effectiveUser` (devViewAs || authedUser) down instead of raw authedUser
- `isPreview` is declared at module level (checks hostname for claudeusercontent.com / localhost)

### `APP_PAGES` (manager.jsx)
Single source of truth for nav tabs. Filtered at render by role:
```js
const APP_PAGES = [
  { id: "home",          label: "Home",        icon: "home",    requires: "any"     },
  { id: "rollup",        label: "Team",        icon: "team",    requires: "any"     },
  { id: "standup",       label: "Standup",     icon: "standup", requires: "any"     },
  { id: "wins",          label: "Weekly Wins", icon: "wins",    requires: "any"     },
  { id: "manager:flags", label: "Open flags",  icon: "flag",    requires: "manager" },
];
```

### `WinsFormView` (wins-form.jsx)
- **Self-contained week navigation** — uses its own `WF_WEEKS` array (16 weeks: Mar 16 → Jun 29 2026) independent of the main WEEKS array. Has a "Current week" jump button.
- `week_index` is an integer relative to Apr 27 2026 = 1. Historical weeks have negative indices (Mar 16 = -5).
- Reps edit their own form; managers see a rep-picker and view any rep's submission read-only.
- Auto-saves 450ms after last keystroke via debounce. Shows save status dot (saving/saved/error).
- Realtime: subscribes to `wins` table changes for the current week_index, updates live if manager has it open while rep types.
- localStorage fallback when Supabase not configured (key: `mtk-wins-v2`).
- **Does NOT use parent weekIdx/setWeekIdx props** — fully self-contained.

### `FlagQueue` (manager.jsx)
- Shows all open asks sorted oldest-first
- Each row expands inline to show a response textarea + "Mark resolved" button
- Resolving calls `onAsk(repId, weekId, delId, "")` — soft-resolves in DB (sets `resolved_at`)
- `ResolvedSection` below shows resolved history (last 200, newest first) with rep/time filters and reopen action
- `state.resolvedAsks` is DB-persisted (loaded via `loadStateFromSupabase`)

### `AskForHelp` (components.jsx)
- The flag button on each deliverable card in rep-view
- Shows "Need help on this" CTA → expands to textarea → saves as `asks[key]`
- Shows the saved flag with Edit/Resolved buttons when a flag exists
- Disappears (flag cleared) when manager resolves it from FlagQueue

### `StandupView` (standup.jsx)
- 5-column CSS grid (rep + 4 prompts). Rows use `display: contents`.
- Each cell is a `StandupCell` — auto-saving textarea with @-mention autocomplete
- Textareas auto-grow to content height (useEffect on `[local]` + handleInput resize)
- `MentionedYouBanner` shows at top if anyone tagged you today
- Alternating row shading via CSS `:nth-child` on `.standup__row`

### `RepView` (rep-view.jsx)
- 10-week timeline strip at top; navigable
- Deliverable cards per week
- `BigCheck` to mark done, `AskForHelp` to raise a flag, `ManagerNote` (manager-only)
- `onOpenWins` prop: when provided, the Wins deliverable card shows an in-app button instead of an external link. Pass `onOpenWins={() => setView("wins")}` from App.

---

## Data model (data-model.js)

```js
REPS = [{ id, name, role, initials, hue, skips, links }]
WEEKS = [{ id, index, monday, friday, sunday }]   // 10 weeks, Apr 27–Jun 29 2026
DELIVERABLES = [{ id, title, short, why, icon, docLabel, docHref }]
```

Rep `skips` = array of deliverable ids that rep doesn't do.
Rep `links` = map of `delId → url` for their specific doc links.

---

## Supabase tables

| Table | Key columns | Notes |
|-------|-------------|-------|
| `allowed_emails` | email (PK, text), role, rep_id, added_at | Allowlist gate — sign-in rejected if email not found. Trigger uses this to populate `users` |
| `checks` | rep_id, week_index (int), deliverable_id, checked_at, marked_by_email/name/role | week_index = numeric (1=w1) |
| `asks` | rep_id, week_index (int), deliverable_id, body, created_at, resolved_at, resolved_by_*, response, response_by_*, response_at | Soft-delete on resolve |
| `manager_notes` | rep_id, week_id (string), del_id, note, updated_by, updated_at | Exception: still uses string week_id |
| `standup_entries` | date (YYYY-MM-DD), rep_id, what_moved, pushing_next, whats_slowing, what_i_need, mentions[], updated_at, updated_by | |
| `users` | auth_id (FK → auth.users.id), email, role ('manager'\|'rep'), rep_id | Auto-created by trigger from `allowed_emails` on first sign-in |
| `wins` | rep_id, week_index (int), worked_on (jsonb), invisible (jsonb), big_win (jsonb), hype (jsonb), updated_at, updated_by | One row per (rep, week); week_index same scale as checks/asks |

`checks` and `asks` use `week_index` (integer, 1–10 for Q2). `supabase-client.js` converts via `weekIdToIdx()`.
`wins` also uses integer `week_index` (passed directly as int — NOT via weekIdToIdx).

RLS policies: anyone can read; reps write own rows; manager writes all.

### wins JSONB schemas
```js
worked_on: [{ task: string, why: string }]
invisible:  [{ task: string, context: string }]
big_win:    { win: string, why: string }
hype:       [{ source: string, quote: string }]
```

---

## Supabase functions (supabase-client.js)

Wins-specific:
- `loadWins(weekIndex: int, repId: string)` → form object | null
- `loadAllWinsForWeek(weekIndex: int)` → { repId: formObject }
- `saveWins(weekIndex: int, repId: string, formData, updatedByEmail)` → void
- `subscribeWinsChanges(weekIndex: int, onRow)` → unsubscribe fn

All wins functions take `weekIndex` as a plain integer — no "w1" string conversion needed.

---

## Common tasks

**Add a new rep:**
1. Add to `REPS[]` in `data-model.js` with a unique `id`, `hue` (0–360), `initials`
2. Insert into `allowed_emails` in Supabase: `(email, role, rep_id)` with `role = 'rep'` and `rep_id` matching the REPS entry. The trigger will auto-create their `users` row on first sign-in.

**Add a new deliverable:**
1. Add to `DELIVERABLES[]` in `data-model.js`
2. If some reps shouldn't have it, add the id to their `skips` array
3. If it should open a form instead of a link, handle it in `rep-view.jsx` via the `onOpenWins` pattern

**Add a new nav tab:**
1. Add to `APP_PAGES` in `manager.jsx`
2. Create the component in a new `src/my-view.jsx`
3. Add `<script type="text/babel" src="src/my-view.jsx"></script>` to index.html
4. Add the view routing case in the main ternary chain in index.html

**Change the standup prompts:**
Edit `STANDUP_PROMPTS` array in `standup.jsx`

**Change accent color / density / layout:**
Edit `TWEAK_DEFAULTS` object in index.html (between `/*EDITMODE-BEGIN*/` and `/*EDITMODE-END*/`)

**Run the wins historical import:**
Open `wins-import.html` in the browser. It parses the Q2 Excel file and upserts all reps' historical data into Supabase. Requires `db/migration-wins.sql` to have been run first.
