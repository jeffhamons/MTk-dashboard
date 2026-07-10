# Weekly Review · NA BD

Internal dashboard for the North America BD team's weekly review.
Deployed at https://na-rep-dashboard.netlify.app.

Originally built in Claude Design and shipped as a single self-contained HTML
file (React + Babel-standalone + Supabase, all inlined). This repo splits the
deployed bundle back into editable source files plus a `bundle.py` that
re-packs them into the same self-contained format for deployment.

## Layout

```
index.html              Entry template — script tags reference src/ and vendor/
src/
  app.jsx               App root + render (used to be the inline <script type="text/babel">)
  auth-gate.jsx         Magic-link auth wall (the active <AuthGate>)
  auth.jsx              [unused — duplicate of auth-gate.jsx, remove]
  supabase-client.js    Supabase client + getSession/getMyUser/sendMagicLink/etc.
  data-model.js         REPS, DELIVERABLES, WEEKS
  ui-primitives.jsx     Shared atoms (Icon, Avatar, week navigators…)
  team-rollup.jsx       Team-rollup view (the 5-second scan)
  rep-view.jsx          Per-rep weekly view
  manager.jsx           Manager-only features
  tweaks-panel.jsx      Edit-mode tweaks panel (used inside Claude Design)
vendor/
  react.development.js          React 18 (dev build)
  react-dom.development.js      ReactDOM 18 (dev build)
  babel-standalone.min.js       In-browser JSX transformer
  supabase-js.min.js            Supabase JS v2 UMD
assets/
  mindtools-logo.png            Brand mark
  fonts/inter-*.woff2           Inter font subsets
build/
  bundle.py             Re-packs everything into dist/index.html
```

## Develop

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Edit any source file and refresh. JSX is transformed in-browser by Babel-standalone.

## Deploy

```sh
python3 build/bundle.py
# writes dist/index.html — drop onto Netlify (drag-drop, gh:netlify deploy, or git push)
```

`dist/index.html` is one self-contained file (≈ 2 MB) with all source, vendor,
fonts, and the logo inlined as base64+gzip. No server, no external requests at
runtime except to Supabase.

## Supabase

Project: `tvdizqryowracmtjdskv.supabase.co`
URL + anon key are hard-coded in [src/supabase-client.js](src/supabase-client.js).
The anon key is safe to embed; RLS does the gating.

Tables: `checks`, `asks`, `manager_notes`, `users` (with `rep_id` + role).
Auth: magic-link only, allowlist-gated via a Supabase trigger.

## Architecture notes

  - All JSX files are loaded as separate `<script type="text/babel">` tags and
    parsed at runtime by Babel-standalone. There's no module system — components
    reach each other via `window` (e.g. `window.AuthGate`, `window.getSession`).
  - Order of `<script>` tags in `index.html` matters: `data-model.js` must load
    before anything that references `REPS`; `supabase-client.js` must load before
    `auth-gate.jsx`; `app.jsx` last because it calls `ReactDOM.createRoot`.

## Quarters & weeks

The quarter model lives in `src/data-model.js:123` as a `QUARTERS` array defining:
- Q2 2026 (10 weeks, w1–w10, Apr 27–Jun 29), and
- Q3 2026 (13 weeks, w11–w23, Jul 6–Sep 28)

`buildWeeks()` generates one continuous `WEEKS` array (src/data-model.js:131) from `QUARTERS`, giving each week:
- `quarter` ("Q2" / "Q3") and `qIndex` (1-based week index within the quarter).

Helpers:
- `weeksForQuarter()` returns weeks in a quarter (src/data-model.js:159)
- `quarterForWeek()` looks up a week’s quarter (src/data-model.js:164)
- `currentQuarterId()` returns the quarter containing today (src/data-model.js:187)

### How to add Q4 2026

Append one entry to `QUARTERS` (src/data-model.js:124-126 format):
```js
{ id: "Q4", label: "Q4 2026", startMonday: new Date(2026, 8, 1), weekCount: 13 }
```
(1) set `startMonday` to the Monday after Q3’s last Sunday; (2) set `weekCount` to 13 weeks ending Sep 28, 2026; (3) insert `w24–w36` sequentially. Everything else — `weeks`, week pickers, and past-quarter collapse behavior — follows automatically.

### Week-id stability invariant

Existing week ids (w1..w23) must NEVER be renumbered or re-dated. `localStorage` check keys, Supabase standup rows, and the wins table’s `week_index` all key on these ids; renumbering corrupts history.

### Target Board

The Target Board reads from the latest Salesforce snapshot, so it shows the current quarter (via `ATT_QUARTER`) and per-rep CS quarterly ramps; there is no historical board view client-side.
