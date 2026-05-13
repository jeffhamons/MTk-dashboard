# Mindtools Weekly Review — Cursor Prompt

You are working on the **Mindtools Kineo Weekly Review** dashboard — an internal sales management tool used by a sales manager (Jeff) and his team of reps.

---

## What this app does

The app has three roles:

**Manager (Jeff):**
- Reviews each rep's weekly deliverables (checks them off, adds private notes)
- Sees an Open Flags queue — reps raise flags when they're blocked; Jeff responds and resolves them
- Views the full team rollup at a glance
- Runs Tue/Thu standups in a shared grid

**Rep (e.g. Cammy, Brenda, Farah, Dwayne, Meri):**
- Checks off their 3 weekly deliverables
- Raises a flag ("what I need") on any deliverable they're stuck on
- Fills in their standup cells (4 prompts, @-mention teammates)
- Sees only their own week + a read-only team summary

**Auth:** Supabase magic-link email. Role + rep_id stored in `user_roles` table. The `AuthGate` component wraps the app and passes `authedUser` down.

---

## File structure

```
index.html                  ← App shell + all CSS. Contains the App() React component.
src/
  data-model.js             ← REPS[], WEEKS[], DELIVERABLES[] — all static config
  supabase-client.js        ← All DB read/write functions + Realtime subscriptions
  components.jsx            ← Shared UI: Avatar, BigCheck, AskForHelp, EmailButton
  manager.jsx               ← FlagQueue (open flags), ManagerNote, APP_PAGES registry
  standup.jsx               ← StandupView, StandupCell (@-mention), MentionedYouBanner
  team-rollup.jsx           ← Team rollup grid (all reps, current week status)
  rep-view.jsx              ← Per-rep week view (deliverables, checks, flag button)
  tweaks-panel.jsx          ← In-app design tweaks panel (accent color, density, layout)
  auth-gate.jsx             ← Supabase magic-link auth wrapper
vendor/                     ← React 18, ReactDOM, Babel standalone, Supabase UMD (all pinned, offline-safe)
db/
  migration-resolved-flags.sql  ← Run once in Supabase SQL editor
```

---

## Architecture

- **No build step.** JSX is compiled in-browser by Babel standalone. All `src/*.jsx` files are loaded via `<script type="text/babel" src="...">` in index.html.
- **State shape:** A single `state` object with `{ checks, asks, managerNotes }`. Synced to Supabase when configured; falls back to localStorage otherwise.
- **Key state keys:**
  - `checks["repId|weekId|delId"]` → `{ at, markedBy }` or null
  - `asks["repId|weekId|delId"]` → `{ text, at }` — the rep's flag. Cleared (deleted) when resolved.
  - `managerNotes["repId|weekId|delId"]` → `{ note, updated_by, updated_at }`
- **Routing:** A single `view` string state in App. Values: `"home"`, `"rollup"`, `"standup"`, `"manager:flags"`, or a repId like `"cammy"`.
- **Realtime:** Supabase Realtime subscription updates state when other users make changes (~1s latency).

---

## Key components

### `App` (index.html)
- Manages all state + handlers (`onCheck`, `onAsk`, `onSaveNote`)
- Has a `devViewAs` state — a "View as" pill in the nav lets managers switch perspective for testing. Only shows for managers in production; always shows on localhost/preview.
- Passes `effectiveUser` (devViewAs || authedUser) down instead of raw authedUser

### `FlagQueue` (manager.jsx)
- Shows all open asks sorted oldest-first
- Each row expands inline to show a response textarea + "Mark resolved" button
- Resolving calls `onAsk(repId, weekId, delId, "")` — this clears the ask from state, which removes it from the rep's page automatically
- Resolved flags tracked in local React state this session (not persisted to DB)

### `AskForHelp` (components.jsx)
- The flag button on each deliverable card in rep-view
- Shows "Need help on this" CTA → expands to textarea → saves as `asks[key]`
- Shows the saved flag with Edit/Resolved buttons when a flag exists
- Disappears (flag cleared) when manager resolves it from FlagQueue

### `StandupView` (standup.jsx)
- 5-column CSS grid (rep + 4 prompts). Rows use `display: contents`.
- Each cell is a `StandupCell` — auto-saving textarea with @-mention autocomplete
- `MentionedYouBanner` shows at top if anyone tagged you today
- Alternating row shading via CSS `:nth-child` on `.standup__row`

### `RepView` (rep-view.jsx)
- 10-week timeline strip at top; navigable
- 3 deliverable cards per week
- `BigCheck` to mark done, `AskForHelp` to raise a flag, `ManagerNote` (manager-only)

---

## Data model (data-model.js)

```js
REPS = [{ id, name, role, initials, hue, skips, links }]
WEEKS = [{ id, index, monday, friday, sunday }]   // 10 weeks
DELIVERABLES = [{ id, title, short, why, icon, docLabel, docHref }]
```

Rep `skips` = array of deliverable ids that rep doesn't do.
Rep `links` = map of `delId → url` for their specific doc links.

---

## Supabase tables

| Table | Key columns |
|-------|-------------|
| `checks` | rep_id, week_id, del_id, checked_at, marked_by_email, marked_by_name, marked_by_role |
| `asks` | rep_id, week_id, del_id, text, created_at, resolved_at, resolved_by_email, resolved_by_name, resolved_by_role |
| `manager_notes` | rep_id, week_id, del_id, note, updated_by, updated_at |
| `standup_entries` | ymd (YYYY-MM-DD), rep_id, what_moved, pushing_next, whats_slowing, what_i_need, mentions[], updated_at, updated_by |
| `user_roles` | email, role ('manager'|'rep'), rep_id |

RLS policies ensure reps can only write their own rows. Managers can read/write all.

---

## Common tasks

**Add a new rep:**
1. Add to `REPS[]` in `data-model.js` with a unique `id`, `hue` (0–360), `initials`
2. Insert into `user_roles` in Supabase: `(email, 'rep', repId)`

**Add a new deliverable:**
1. Add to `DELIVERABLES[]` in `data-model.js`
2. If some reps shouldn't have it, add the id to their `skips` array

**Change the standup prompts:**
Edit `STANDUP_PROMPTS` array in `standup.jsx`

**Change accent color / density / layout:**
Edit `TWEAK_DEFAULTS` object in index.html (between `/*EDITMODE-BEGIN*/` and `/*EDITMODE-END*/`)
