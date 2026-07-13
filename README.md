# MTk-dashboard

The standalone weekly-review-dashboard React app — the internal NA and
EMEA/APAC BD and CS weekly review board. This repo is the new home for the
dashboard that previously lived under `weekly-review-dashboard/` in the
jeff-os monorepo; the history was carried over with `git filter-repo`.

Production URL: https://na-rep-dashboard.netlify.app.

This README is the single source of truth for the app. Keep it current so a
new collaborator can orient in minutes. Deploy steps and team_admin seating
live in `DEPLOY.md`.

## Roles

- Manager: Jeff, the only global role. Manager sees every team and region.
- Team admin: scoped by team and region through `team_admins`; example in the
  runbook is Lara Kidd for CS.
- Rep: sees their own week and read-only team summary.

## How to run locally

- There is no npm install, package manager, or dev bundler. The app is a flat
  list of browser scripts loaded by `index.html`.
- Serve the raw app for development:
  - `python3 -m http.server 8000` from the repo root, then open
    http://localhost:8000.
  - Edit `index.html` or `src/` files and refresh; Babel runs in the browser
    via `vendor/babel-standalone.min.js`.
- Build the single-file deploy bundle:
  - `python3 build/bundle.py` writes `dist/index.html`.
  - `python3 build/bundle.py --check` prints a build summary.
- Run the test suites:
  - `node --test tests/*.mjs` — the Node built-in test runner over the
    `.mjs` suite. Use the glob form; the bare directory form
    (`node --test tests/`) is known to flake and is not supported here.
  - `python3 -m pytest tests/test_rfc151_reps_parity.py tests/test_issue_3781_currency_toggle.py -q`
    — the two relocated parity tests (see "Roster changes" and CI).

## Deploys

- Deploys happen via Netlify from `main`. `netlify.toml` runs
  `python3 build/bundle.py` and publishes `dist/`, and redirects all routes
  to `index.html`.
- Manual deploys publish `dist/`, not the raw app directory.
- Operational deploy details live in `DEPLOY.md`.

## Schema and Supabase authority

- `db/*.sql` holds the Supabase schema, RLS, seed, and verification SQL.
- Schema changes in db/*.sql do not reach Supabase until Jeff applies them.
- A SQL change merged here is a request to apply; landing the PR does not run
  it against the live database.

## RLS boundary (what a team_admin can write)

RLS is the real data boundary; the client only mirrors it. Roles:

- Manager is global bypass and sees every team and region.
- Team admin is RLS-scoped through `team_admins` rows joined to the rep's team
  and region. A `team_admin` (e.g. Lara for CS) can write the shared dashboard
  state — `checks`, `asks`, `manager_notes`, standup, and wins — for the reps
  inside her team×region scope. She cannot widen her own scope, cross teams, or
  touch reps outside her region rows.
- Rep is owner scope plus same-team read where policy allows.
- Client gating uses `canManageRep`, `canManageAny`, `isManagerialRole`, and
  `adminScopes`; RLS remains the only real backstop for data access.

## Files & layout

- `index.html` - app shell, inline CSS, ordered script list, `isPreview`,
  `App`, `HomeView`, nav, View-as, workspace and region switchers, `view`
  router, and `ReactDOM.createRoot`.
- `README.md` - this canonical onboarding document.
- `DEPLOY.md` - deploy and team_admin seating runbook.
- `CURSOR_PROMPT.md` - legacy pointer to this README.
- `netlify.toml` - Netlify build, publish, and redirect config.
- `.gitignore` - ignored generated and local files.
- `assets/` - `mindtools-logo.png` and Inter font subsets.
- `vendor/` - pinned browser dependencies; there is no npm install flow.
- `db/` - Supabase schema, RLS, seed, and verification SQL.
- `build/` - bundler tooling, especially `bundle.py`.
- `tests/` - Node built-in `.mjs` tests for the browser app source plus the
  two relocated Python parity tests.
- `dist/` - generated deploy output; never hand-edit.

- `src/data-model.js` - static data and helpers: `REPS`, `DELIVERABLES`,
  `WEEKS`, `QUARTERS`, `TEAMS`, `REGIONS`, `FX_RATES`, visibility, RBAC scope,
  currency, URL state, and standup helpers.
- `src/supabase-client.js` - Supabase client, auth helpers, DB read/write
  functions, and realtime subscriptions.
- `src/components.jsx` - shared UI primitives.
- `src/manager.jsx` - `APP_PAGES` nav registry plus `FlagQueue`,
  `ResolvedSection`, `ManagerNote`, `MarkedByStamp`.
- `src/rep-view.jsx` - `RepView`, one rep's selected-week view.
- `src/team-rollup.jsx` - `TeamRollup`, the reps by deliverables scan grid,
  sectioned by region.
- `src/standup.jsx` - `StandupView`, `StandupCell`, `MentionAutocomplete`,
  `MentionedYouBanner`, daily async grid, Tue/Thu sync, mentions, and own
  realtime cycle.
- `src/wins-form.jsx` - `WinsFormView`, the four-section Weekly Wins form with
  `WF_WEEKS` and its own load/save/subscribe cycle.
- `src/my-number.jsx` - `MyNumber`, a rep's private NB deal stack or CS book
  deep dive.
- `src/target-board.jsx` - `LeaderboardView`, ranked attainment board with
  region buckets, display currency, MTD/QTD/YTD, and historical quarter-final
  switching.
- `src/attainment-data.jsx` - attainment V2 data layer: `ATT_QUARTER`,
  `loadAttainmentV2`, `attBuildLive`, quarter-final helpers, and formatters.
- `src/tweaks-panel.jsx` - `useTweaks` and `TweaksPanel`, a Claude Design
  sandbox panel, not app navigation.
- `src/auth-gate.jsx` - `AuthGate`, the magic-link login wall.
- `src/don-onboarding.jsx` - `DonOnboarding`, induction checklist view for Don
  Hazelwood.
- `src/stuart-onboarding.jsx` - `StuartOnboarding`, induction checklist view
  for Stuart Chadwick.
- `src/don-induction-content.js` - `DON_INDUCTION_MD` content.
- `src/stuart-induction-content.js` - `STUART_INDUCTION_MD` content.
- `src/onboarding-links.js` - `ONBOARDING_LINKS` deep-link map.
- `src/attainment.css` - Target Board styles, inlined by `bundle.py`.
- `src/don-onboarding.css` - induction styles, inlined by `bundle.py`.

## Architecture

- There is no module system.
- `index.html` loads the app as a flat list of browser scripts.
- Shared code intentionally couples through `window`.
- Script order in `index.html` is the dependency graph.
- Dev runs Babel in the browser through `vendor/babel-standalone.min.js`.
- Production uses `bundle.py` to generate `dist/index.html`; the bundle
  unpacks with `LOADER_SCRIPT`, `DecompressionStream`, blob URLs, and Babel
  transform.

- React, ReactDOM, Babel Standalone, Supabase JS.
- `src/supabase-client.js` before callers.
- `src/data-model.js` before every consumer of `REPS`, `WEEKS`, and helper
  functions.
- `src/components.jsx` before views.
- View scripts before callers that render them.
- `src/auth-gate.jsx` after `src/supabase-client.js`.
- `src/attainment-data.jsx` before `src/my-number.jsx` and
  `src/target-board.jsx`.
- Content JS before onboarding JSX.
- The trailing inline bootstrap runs last.

- `App` owns a single string router state named `view`.
- `setView` is the only router mutator.
- `parseUrlState` reads deep-link state once at mount.
- `serializeUrlState` writes URL state back after changes.
- `view` is either an `APP_PAGES` id or a `REPS` id.
- Current page ids are home, rollup, leaderboard, standup, wins,
  manager:flags, don:onboarding, and stuart:onboarding.
- The render chain checks page ids first.
- Any unmatched non-page string routes to `RepView`.
- A page id collision with a rep id hides that rep route.

- `state` comes from `loadState`, backed by Supabase or localStorage.
- Completion state is keyed by rep id, week id, and deliverable id.
- `state.checks` stores `markedBy` and `at`.
- `state.asks` stores `text`, `at`, and optional `response`.
- `state.resolvedAsks` stores the soft-resolved ask mirror.
- `state.managerNotes` stores `note`, `updated_by`, and `updated_at`.
- `standupFills` lives outside `state`.
- `stateForViews` merges `state` and `standupFills` so standup realtime cannot
  clobber shared state.
- `WinsFormView` and `StandupView` each run their own load/save/subscribe
  cycle.

- `devViewAs` lets managers and preview mode impersonate another user for
  testing.
- `effectiveUser` is `devViewAs` when set, otherwise `authedUser`.
- `isManager`, `myRepId`, `myTeams`, and `viewerScope` derive from
  `effectiveUser`.
- `isPreview` is hostname-derived and exposed as `IS_PREVIEW`.
- Preview with no user gets manager-parity client scope.
- A signed-in user with empty scope stays empty; the client fails closed.
- RLS remains the real data boundary.

- `teamsForUser` derives allowed teams for `effectiveUser`.
- `activeTeam` is clamped to `myTeams`; stale localStorage cannot widen
  access.
- The workspace switcher appears only when `myTeams` has more than one entry.
- `viewerScopeForUser` derives team and region scope.
- `regionPill` is clamped to scope.
- `activeTeam`, `viewerScope`, and `regionPill` are threaded into each major
  view.

## Data model

Core data lives in `src/data-model.js` and is exported with `Object.assign`.

- `REPS` entries carry id, name, role, initials, hue, region, team, skipped
  deliverables, links, email, active-through visibility, and emit flag.
- `DELIVERABLES` entries carry id, title, short label, why text, icon,
  document link fields, note, automatic status flag, and active-through
  retirement.
- `QUARTERS` entries carry id, label, `startMonday`, and week count.
- `WEEKS` entries are produced by `buildWeeks` and carry id, index, Monday,
  Friday, Sunday, quarter, and `qIndex`.
- `REGIONS`, `REGION_ORDER`, `TEAMS`, `FX_RATES`, and `DISPLAY_CURRENCIES`
  support filtering and display.

- `buildWeeks` walks `QUARTERS` in order.
- It emits gapless Monday through Sunday weeks.
- It assigns global sequential week ids and indexes.
- It assigns quarter id and `qIndex` for quarter UI and emails.

- Existing week ids w1 through w23 must never be renumbered or re-dated.
- localStorage keys, URL params, Supabase rows, and manager notes depend on
  stable week ids.
- Add future quarters by appending to `QUARTERS`; do not edit existing Q2 or
  Q3 entries.

- Week/date: `weeksForQuarter`, `quarterForWeek`, `currentQuarterId`,
  `currentWeekIndex`, `weekForDate`.
- Visibility/completion: `repVisibleInWeek`, `deliverablesForWeek`,
  `activeDeliverablesFor`, `delComplete`.
- State/URL: `loadState`, `saveState`, `checkKey`, `parseUrlState`,
  `serializeUrlState`.
- Standup/email: `standupFillsFromRows`, `standupStatus`, `buildWeekEmail`,
  `buildQuarterEmail`, `openMailto`.
- Region/currency: `regionForRep`, `repsByRegion`, `regionCurrency`,
  `convertAmount`, `formatCurrencyAmount`.
- RBAC: `repById`, `isManagerialRole`, `canManageRep`, `canManageAny`,
  `teamsForUser`, `defaultTeamForUser`, `viewerScopeForUser`,
  `regionsUnderScope`, `repsUnderScope`.

### Supabase

Project: tvdizqryowracmtjdskv.supabase.co.

- `src/supabase-client.js` contains the Supabase URL and anon key.
- The anon key is public by design; RLS gates data access.
- Auth uses magic links only.
- Sign-in is allowlist-gated.
- A Supabase trigger creates the user row from the allowlist on first
  sign-in.
- `getMyUser` loads the user row by auth id; for team admins, it also loads
  scopes into `adminScopes`.

- Auth/client: `getSupabaseClient`, `getSession`, `getMyUser`, `sendMagicLink`,
  `verifyEmailOtp`, `signOut`, `onAuthChange`.
- Shared dashboard state: `loadStateFromSupabase`, `toggleCheckSupabase`,
  `setManagerNoteSupabase`, `setAskSupabase`, `reopenAskSupabase`,
  `setAskResponseSupabase`, `subscribeRealtime`, `migrateLocalToSupabase`.
- Standup/wins: `loadStandupForDate`, `saveStandupField`,
  `subscribeStandupChanges`, `loadStandupFills`, `loadWins`,
  `loadAllWinsForWeek`, `saveWins`, `subscribeWinsChanges`.
- Attainment/induction: `loadAttainment`, `loadAttainmentQuarterFinals`,
  `loadAttainmentForQuarter`, `loadClosedWonDeals`, `loadRenewalBook`,
  `loadCsQuarterlyTargets`, `deriveAttainmentPcts`, `loadInductionState`,
  `loadInductionStateFor`, `setInductionItem`.

Supabase tables:

| table | key columns | notes |
|---|---|---|
| allowed_emails | email, role, rep_id | Allowlist gate; trigger populates users. |
| users | auth_id, email, role, rep_id | Role is manager, team_admin, or rep. |
| checks | rep_id, week_index, deliverable_id | Uses integer week_index; client converts with `weekIdToIdx`. |
| asks | rep_id, week_index, deliverable_id, response, resolved fields | Uses integer week_index; resolve is soft-resolve. |
| manager_notes | rep_id, week_id, del_id | Exception: uses string week_id. |
| standup_entries | date, rep_id, standup fields | Date-based; no week index. |
| wins | rep_id, week_index, worked_on, invisible, big_win, hype | Uses integer `weekIndex` directly. |
| teams | id, label | Team registry. |
| reps | rep_id, team_id, region, active | Server roster used by RLS. |
| team_admins | auth_id, team_id, region | Per-region scopes; inert unless user role is team_admin. |

- `db/migration-team-rbac-schema.sql` adds teams, reps, team admins, and
  widened role checks.
- `db/migration-team-rbac-rls.sql` defines RLS policies and carries the reps
  backfill rows the parity test guards.
- `db/migration-wins.sql` and `db/migration-wins-rls-harden.sql` define and
  harden wins storage.
- `db/migration-membership-gate-checks-asks-wins.sql` gates shared tables by
  membership.
- `db/0002_ask_responses.sql` adds ask responses.
- `db/migration-resolved-flags.sql` adds resolved flag storage.
- `db/migration-attainment.sql`, `db/migration-attainment-v2.sql`,
  `db/migration-attainment-detail-rls.sql`, and
  `db/migration-attainment-quarter-final.sql` support attainment.
- `db/verify-rls-cutover.sql` and `db/test-team-rbac-rls.sql` verify RLS
  behavior.

- `checks` and `asks` use integer `week_index`.
- `manager_notes` uses string `week_id`.
- `wins` receives integer `weekIndex` directly.
- Do not pass a string week id to a function that expects an integer week
  index.

- `loadAttainmentV2` calls loaders for snapshots, closed-won deals, renewal
  book, and CS quarterly targets.
- `attBuildLive` assembles NB and CS live shapes.
- Historical quarter finals come from `loadQuarterFinals` and the
  attainment_quarter_final table.
- `LeaderboardView` renders historical quarter-final choices with
  `attQuarterFinalOptions`.

## Build, deploy, and test

- `vendor/` pins: `react.development.js`, `react-dom.development.js`,
  `babel-standalone.min.js`, `supabase-js.min.js`. Upgrading means replacing
  the pinned file; there is no lockfile.

- `python3 build/bundle.py` writes `dist/index.html`.
- `python3 build/bundle.py --check` prints a build summary.
- The bundle inlines source, vendor files, fonts, and logo assets.
- The generated output is one self-contained HTML file.

- `netlify.toml` runs `python3 build/bundle.py`, publishes `dist`, and
  redirects all routes to `index.html`.

- Node suite: `node --test tests/*.mjs` (glob form; the bare directory form
  flakes and is not supported here).
  - `tests/quarters.test.mjs` checks `WEEKS` length, Q2/Q3 dates, `qIndex`,
    `weeksForQuarter`, and quarter-scoped emails.
  - `tests/rbac-helpers.test.mjs` checks `canManageRep`, `canManageAny`,
    `isManagerialRole`, `teamsForUser`, and inert scope guard behavior.
  - `tests/rbac-matrix-lockstep.test.mjs` encodes the SQL truth table and
    asserts `canManageRep` by persona.
  - `tests/url-state.test.mjs` checks `parseUrlState` and `serializeUrlState`.
  - `tests/viewerscope.test.mjs` checks `viewerScopeForUser`,
    `regionsUnderScope`, and `repsUnderScope`.
  - `tests/deliverables-retirement.test.mjs` checks `deliverablesForWeek`
    retirement behavior.
  - `tests/quarter-finals.test.mjs` checks `attBuildQuarterFinal` NB and CS
    shapes.
- Python parity suite:
  - `tests/test_rfc151_reps_parity.py` guards parity between `REPS[]` in
    `src/data-model.js` and the server `reps` backfill rows in
    `db/migration-team-rbac-rls.sql`. CI fails when the two drift.
  - `tests/test_issue_3781_currency_toggle.py` guards the currency-toggle
    infrastructure in `src/data-model.js`.

## Roster changes

Adding a rep is one PR in THIS repo that changes both halves of the roster
pair together:

- Append the rep to `REPS` in `src/data-model.js` — a unique id, hue,
  initials, region, team, and (for EMEA/APAC CS reps) skipped deliverables set
  to outreach and commitments.
- Add the matching backfill row in `db/migration-team-rbac-rls.sql` (the
  reps backfill rows the relocated parity test reads): the same rep id, name,
  team id, region, and active flag.
- The relocated `tests/test_rfc151_reps_parity.py` guards the pair — it
  reddens CI if `REPS[]` and the backfill rows drift. Run it locally before
  pushing:
  `python3 -m pytest tests/test_rfc151_reps_parity.py -q`.

Then Jeff applies the backfill to live Supabase and handles the
monorepo-side target/registry leg (the targets and the registry entries that
live outside this repo). Do not assume landing the PR updates the live
`reps` table — see "Schema and Supabase authority".

## Common tasks (How to)

- Seat a team admin: insert an allowlist row with role `team_admin` and null
  rep id, plus one `team_admins` row per covered region (auth id, team id,
  region). Never use role `manager` for a division lead. Follow `DEPLOY.md`
  for the operational runbook.
- Add a deliverable: append it to `DELIVERABLES` in `src/data-model.js`, add
  its id to relevant reps' skip lists, and (for a form-opener) follow the
  `onOpenWins` or `onOpenStandup` pattern in `src/rep-view.jsx`.
- Add a view: create a new JSX file under `src/` that assigns its view to
  `window`, add its script tag in `index.html` at the correct dependency
  position, append a page entry to `APP_PAGES` in `src/manager.jsx` (the icon
  must be a case handled by `Icon`), add a routing case in `App`, and thread
  `authedUser`, `activeTeam`, `viewerScope`, and `regionPill` into the new
  view as needed.
- Add a quarter: append one entry to `QUARTERS` in `src/data-model.js`. Do
  not modify existing Q2 or Q3 entries. The new `startMonday` must be the
  Monday immediately after the previous quarter's last week. Q3 ends at w23:
  Monday Sep 28 2026 through Sunday Oct 4 2026. Q4 2026 therefore starts
  Monday Oct 5 2026: `new Date(2026, 9, 5)`. Do not use `new Date(2026, 8, 1)`.

## Gotchas

- No module system exists; `window` coupling is intentional and script order
  is the dependency graph.
- The `view` namespace is shared by page ids and rep ids.
- A page id collision with a rep id hides that rep route.
- `standupFills` lives outside `state`.
- `WinsFormView` and `StandupView` each run their own load/save/subscribe
  cycle.
- `isPreview` is hostname-derived; a production host matching the preview
  pattern would get manager-parity client scope.
- RLS is the only real backstop for data access.
- Week id is a string like w5.
- Week index is a number like 5.
- Storage and URL state use the string week id unless a Supabase function
  explicitly expects integer week index.
- CS monthly has no target; renewal MTD is null and should render as an em
  dash, never 0 percent.
- `FX_RATES` are display-only approximations.
- `dist/index.html` is generated output and must not be hand-edited.
