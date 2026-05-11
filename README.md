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
