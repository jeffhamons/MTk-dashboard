# Team Briefs — rep surface redesign

**Date:** 2026-07-28
**Status:** Design approved, awaiting spec review
**Supersedes the rep-facing half of:** RFC-163 (Team Briefs)
**Code anchors verified against:** `7c89b68` (`fix(elegance): consolidate duplicated formatting/parsing helpers (#30) (#34)`)

---

## 1. Problem

Jeff, verbatim: *"people are not seeing them, they're not acknowledging them, and it's not working."*

The current design assumes an attentive daily visitor who scrolls. **That assumption is the bug.** Seven concrete defects follow from it, all verified in the tree at `7c89b68`:

| # | Defect | Evidence |
|---|---|---|
| 1 | **Reps have no navigation path to briefs at all.** The Team Briefs page is manager-gated. | `src/manager.jsx:24` — `requires: "manager"`. Rep-visible tabs are Home, Team, Leaderboard, Standup, Weekly Wins. |
| 2 | **The brief sits below the motivational quote.** On a laptop the quote occupies the fold; the brief panel is below it. | `index.html:2269` (quote) renders before `index.html:2279` (`TeamBriefsTodayPanel`). |
| 3 | **Nothing blocks and nothing nags.** Acknowledgement is a button inside a card the rep must first scroll to and choose to engage with. | `src/team-briefs.jsx` — ack is a plain button on `TeamBriefCard`. |
| 4 | **`auto_escalate` is a dead flag.** The composer writes it, validation enforces it, the RPC stores it — and *nothing anywhere reads it back for display*. | Written: `src/team-briefs.jsx:638` (checkbox), `:513` (validation), `src/supabase-client.js:443` (`p_auto_escalate`). Read for display: nowhere. Exhaustive grep across `src/` and `index.html`. |
| 5 | **The default brief type asks for nothing and then self-destructs.** `morning_message` defaults to `require_ack: false` + `display_rule: "today_only"`, and the publish RPC converts `today_only` into a hard `expires_at`. A rep who doesn't log in that day never sees it — it goes straight to History, unread, forever. | Defaults: `src/team-briefs.jsx:488`. Expiry conversion: `db/migration-team-briefs.sql:420-451`. |
| 6 | **Engagement is punished and content is silently dropped.** Read cards fade to 78% opacity; the Home panel shows at most three briefs with no "+N more". | `src/team-briefs.jsx:53` — `.tb-card[data-read="1"]{opacity:.78}`. `src/team-briefs.jsx:431` — `active.slice(0, 3)`. |
| 7 | **There is no push channel of any kind.** The system is pure pull: a rep who does not visit Home on the right day is unreachable. | No notification path exists in the codebase. |

Defects 4 and 5 compound: the type a manager reaches for by default is the one that demands nothing and expires fastest.

### 1.1 The delivery-channel constraint

Outbound email is **not** available as a fix. Login emails to Mindtools corporate addresses quarantine; Supabase's low hourly cap makes retries actively worse; and releasing the quarantine requires Mindtools IT cooperation — which is the exact thing this dashboard exists to route around. Any design that reaches for email is a non-starter by construction.

**Consequence:** reach must be won *inside the app*. See decision D7.

---

## 2. Decisions

These were settled during design. They are inputs to implementation, not open questions.

| ID | Decision | Note |
|---|---|---|
| **D1** | **Never block — make it impossible to miss.** | No interstitials, no modals, no login gates. Jeff's choice over a proposed type-gated block. Do not re-propose blocking. |
| **D2** | **Placement is A + B:** a hero on Home *and* a persistent strip in the app chrome. | Not either/or. |
| **D3** | **The strip catches on scroll.** When the hero scrolls out of view, the strip takes over. Exactly one of the two is on screen at any time. | |
| **D4** | **Two escalation tiers + a catch-up sweep.** | Chosen over one-tier and over three-tier. |
| **D5** | **Rung 3 owns the first screen of Home.** At the top rung the hero claims a full screenful, pushing greeting and quote below the fold. It does not cover them; it outranks them. | The ceiling. Nothing escalates past this. |
| **D6** | **Two-step acknowledgement for asks, one step for news.** | News types: one button, then gone. Ask types: "Confirm I've read this" → a quiet Committed row with a *Mark done* button. |
| **D7** | **In-app only — no new signal.** | Jeff's choice, overriding a recommendation to surface non-logins ("read it and did nothing" vs. "hasn't opened the dashboard since Monday") to the manager. **The spec must not include a non-login signal.** |

---

## 3. Architecture

### 3.1 The problem to fix first

`useTeamBriefs` (`src/team-briefs.jsx`) opens **its own load and its own realtime subscription on every call**:

```js
React.useEffect(() => {
  let alive = true;
  const guardedRefresh = async () => { if (alive) await refresh(); };
  guardedRefresh();
  const unsubscribe = window.subscribeTeamBriefs
    ? window.subscribeTeamBriefs(guardedRefresh)
    : () => {};
  return () => { alive = false; unsubscribe(); };
}, [refresh]);
```

Today there is one consumer, so this is invisible. The new design has **three** — the hero, the strip, and the tab badge. Left as-is that is three subscriptions and three independently-drifting copies of the same data, which will show a badge count that disagrees with the strip that disagrees with the hero.

### 3.2 `TeamBriefsProvider`

Lift the cycle into a single provider, mounted **once** in `App`, wrapping both the tab bar and the view switch. It owns:

- the single load + realtime subscription (`window.loadTeamBriefs`, `window.subscribeTeamBriefs`);
- derived state: rung per brief, outstanding count (§4.1), sweep contents.

It renders no markup — pure data.

**This preserves the RFC-163 invariant:** Team Briefs keeps its own data cycle and is **never** folded into `loadStateFromSupabase` or the shared `subscribeRealtime`. The provider centralises the Team Briefs cycle; it does not merge it into the app's.

### 3.3 Components under the provider

| Component | Location | Role |
|---|---|---|
| **`BriefSurface`** | new, `src/team-briefs.jsx` | The morphing surface. Takes `shape` = `hero \| strip`. **Mounted twice**: once in `App` immediately after `<div className="tabs">` (`index.html:3045`), once in `HomeView` above the greeting. Which one renders is decided by `briefSurfaceShape()` (§7.1), not by each mount independently. |
| **`TeamBriefCard`** | existing, `src/team-briefs.jsx:233` | Gains the two-step ack (D6). |
| **`teamBriefRung(brief, ack, now)`** | new, `src/data-model.js` | Returns `0–3`. **This is where `auto_escalate` is finally read.** |
| **`TeamBriefsPage`** | existing `TeamBriefsManager` | Unlocked for reps (§4.6). |

### 3.4 Where the pure logic lives, and why

All rung/surface/sweep logic goes in **`src/data-model.js`**, alongside the existing `teamBriefIsVisible` (≈`:1020`) and `teamBriefUrgency` (`:1032-1051`).

Two reasons, and the second is the binding one:

1. It is where the existing Team Briefs pure helpers already live.
2. **There is no DOM test harness in this repo.** Node tests (`tests/*.mjs`) can reach `data-model.js`. They cannot reach JSX. Logic that lives in a component is logic that cannot be tested. See §7.

### 3.5 Load-order constraint

This repo has no module system: a flat list of `<script>` tags in `index.html`, coupling through `window`. **Script order in `index.html` is the dependency graph.** Current order:

```
1926: src/supabase-client.js
1928: src/data-model.js
1936: src/components.jsx
1937: src/team-briefs.jsx
1938: src/manager.jsx
```

`data-model.js` loads before `team-briefs.jsx`, so the new pure functions are reachable. But `index.html`'s inline `App` references `team-briefs.jsx` globals, so `BriefSurface` must be referenced **guarded**, matching the existing precedent at `index.html:2279`:

```jsx
{typeof TeamBriefsTodayPanel !== "undefined" && ...}
```

Note the newly-landed lazy-resolution mechanism (`manager.jsx:12-17`, `resolveAppPageComponent`, added for issue #22): page components resolve from `window[componentGlobal]` at *render* time rather than module-eval time. `BriefSurface` is not a page and does not go through `APP_PAGES`, but the same hazard applies — a missing global must name itself, not render a blank space.

---

## 4. Rep surface

### 4.1 The governing rule

> **The hero renders when the rep is on Home and has not scrolled past it. The strip renders whenever anything is outstanding and the hero is not showing.**

Exactly one is on screen, always. Never both, never neither-while-outstanding.

**"Outstanding"** is defined once, here, and every consumer uses this definition: a brief is outstanding when `teamBriefSurface()` returns `loud` **or** `committed` (§5.4). It is *not* outstanding when it returns `history`. A read-but-not-done ask is therefore still outstanding — which is the whole point of D6, and the reason the term is not "unacked".

Handoff uses an **`IntersectionObserver` on a sentinel element at the hero's bottom edge** — not a scroll listener. (A scroll listener on this page would fire continuously and fight the existing layout.)

### 4.2 The hero (Home)

- **Ordering:** highest rung → `due_at` ascending → newest first.
- **Shows every outstanding brief.** The `.slice(0, 3)` truncation is deleted outright.
- Past the first, briefs collapse to **one-line rows that expand on click**. Volume degrades gracefully instead of turning Home into a wall.
- **At rung 3** the hero claims `min-height` of the first screenful, pushing greeting and quote below the fold (D5).
- **Empty state:** a single teal "you're current" line linking to the Briefs page. Not a blank space, not a large empty card.

### 4.3 The strip (everywhere else)

- Carries the **single highest-rung brief** plus a **"+N more"** affordance.
- **Rung 0:** one line; collapses.
- **Rung 1+:** stays open, with the ack button **permanently visible** — no hover, no expand-first.
- Clicking expands **in place**. "+N more" navigates to the Briefs page.

### 4.4 Acknowledgement (D6)

**News types** (`morning_message`, `fyi`) — one button, then the brief leaves the surface.

**Ask types** (`reminder`, `action_required`) — two steps:

1. **"Confirm I've read this"** → the brief drops to a quiet **Committed** row carrying a *Mark done* button.
2. **If the due date passes while still not done, it re-escalates back up the ladder.**

The design principle, stated so implementation does not soften it:

> **Reading buys you quiet, not amnesty.**

This is what makes a read receipt into an actual commitment, and it is the single most important behavioural change in this spec.

### 4.5 The escalation ladder

`teamBriefRung(brief, ack, now) → 0 | 1 | 2 | 3`

| Rung | Meaning | Surface treatment |
|---|---|---|
| 0 | Committed — read, ask-type, awaiting *Mark done* | Strip collapses to one line |
| 1 | Unacked, not escalating | Strip open, ack visible |
| 2 | Escalating — approaching due | `document.title` gains an `(N)` prefix |
| 3 | Overdue / top rung | Hero owns Home's first screen (D5) |

Rung inputs:

- `auto_escalate === false` → **pins at rung 1 forever**, regardless of age. This is the flag finally doing something.
- `auto_escalate === true` → climbs with `due_at` urgency (the existing `overdue → today → tomorrow → soon → normal` ladder).
- No due date → climbs by days unacked.
- Read-but-not-done + due date passes → **rung goes back up** (§4.4).

**`document.title`** gains a `(N)` prefix when max rung reaches 2, and drops it when clear. This is the closest thing to a push channel available given §1.1 — a rep with the tab open in another window sees the count.

### 4.6 Three deletions and one unlock

| Change | Location |
|---|---|
| Delete `.tb-card[data-read="1"]{opacity:.78}` — stop fading what people engaged with | `src/team-briefs.jsx:53` |
| Delete `active.slice(0, 3)` — stop silently dropping briefs | `src/team-briefs.jsx:431` |
| `requires: "manager"` → `requires: "any"` — give reps a nav path | `src/manager.jsx:24` |
| Add a **tab badge** coloured by max rung: grey (0) / purple (1) / orange (2–3) | Precedent exists: `tabs__badge`, already used by `manager:flags` |

---

## 5. Data and lifecycle

### 5.1 One column, additive

```sql
alter table public.team_brief_reads
  add column if not exists done_at timestamptz null;
```

Plus a sibling RPC to the existing read RPC, to write it.

**Why this is safe:** purely additive, backfills `null`, no constraint changes. A `null` on an existing row reads correctly as *"read, not marked done"* — which is exactly what those rows mean today.

> ⚠️ **Putting this in `db/` does not put it in Supabase.** A SQL change merged here is a *request for Jeff to apply*. The client must tolerate the column being absent until he does — treat a missing `done_at` as `null`, never as an error.

### 5.2 `auto_escalate` needs no schema change

The column already exists (`db/migration-team-briefs.sql:41`) with the constraint:

```sql
constraint ... check (not auto_escalate or due_at is not null)
```

That constraint already guarantees the precondition `teamBriefRung` depends on: **if the flag is on, there is a due date.** Nothing to add. The flag was never missing infrastructure — it was missing a reader.

### 5.3 The catch-up sweep needs no schema change either

"Missed this" is fully derivable from existing rows:

> in the frozen audience **AND** `expires_at` has passed **AND** no `team_brief_reads` row.

- **Window: 14 days.** Older than that stays in History and is not swept.
- The sweep card takes a **single "Got it"**, which writes read rows for everything inside it. One click clears the backlog, and it cannot return.

This is the direct fix for defect #5: a rep who was out for a week now gets what they missed instead of a silently-expired brief.

### 5.4 `display_rule` keeps its meaning; a new derived function carries surface state

`display_rule` continues to mean **expiry only** — unchanged semantics, no migration of existing rows.

New pure function:

```js
teamBriefSurface(brief, read, now) → 'loud' | 'committed' | 'history'
```

- `loud` — on the hero/strip, demanding action
- `committed` — read, ask-type, awaiting *Mark done*
- `history` — done, or expired and swept

### 5.5 Composer default changes

| Type | Current | New | Rationale |
|---|---|---|---|
| `morning_message` | `today_only`, `require_ack: false` | `today_only`, **`require_ack: true`** | Defect #5. The default type must ask for something. |
| `reminder` | `for_days` | **`manual_clear`** | A reminder that expires on a timer is not a reminder. |
| `action_required` | `manual_clear` | unchanged | Already correct. |
| `fyi` | unchanged | unchanged | |

Current values are at `src/team-briefs.jsx:488-493`.

---

## 6. Manager side

### 6.1 `auto_escalate` becomes legible

- Gains a **one-line description of what it now does** (it previously described nothing, because it did nothing).
- **Stays disabled until a due date is set** — surfacing the DB constraint in the UI instead of failing validation at `:513` after the fact.

**No preview mode or simulator.** YAGNI — it is a second surface to build and maintain, for a manager who can publish a test brief to themselves.

### 6.2 Tracking shows commitment, not just receipt

The tracking cell `{acknowledged.length}/{audience.length}` becomes **read *and* done**:

```
18/20 read · 11/20 done
```

The existing "Unread: `<names>`" line gains a sibling: **read-but-not-done**, with names. That list is the actual management signal — the people who saw it and have not acted.

### 6.3 Audience membership replaces the role check

Today's gate at `index.html:2279` is `!isManager && myRepId`. That means **a `team_admin` such as Lara Kidd can never *receive* a brief** — the surface simply does not render for her role.

Fix: **render the surface for anyone with a row in `team_brief_audience_members` for that brief, whatever their role.** Membership, not role, is the correct predicate — it is also the one the RLS policies already key on.

Jeff still will not see his own briefs, because he is not in the audience he published to. That falls out of the model rather than needing a special case.

### 6.4 Behavioural guard

> **Only the single highest-rung brief can trigger the Home takeover.**

Two overdue asks must not stack two screenfuls. The strip likewise shows one brief plus "+N more". Without this guard, D5 becomes a way to make Home unusable.

---

## 7. Testing

### 7.1 The key design move

**The placement invariant must be a pure function, not JSX.** There is no DOM harness in this repo (§3.4), so an invariant expressed in components is an invariant that cannot be tested.

```js
briefSurfaceShape({ view, heroOnScreen, outstandingCount }) → 'hero' | 'strip' | null
```

Exhaustively table-tested. The JSX at both mount points **calls this function and does nothing else** to decide visibility. This is what makes "exactly one on screen, always" (§4.1) a checkable claim rather than an aspiration.

### 7.2 Table-driven tests against `data-model.js`

**`teamBriefRung`** — across the matrix:

- flag off → **pins at rung 1 forever**, regardless of age
- flag on → climbs by `due_at` urgency
- no due date → climbs by days unacked
- read-but-not-done, due date passes → **rung goes back up** (the §4.4 rule)

**`teamBriefSurface`** — transitions:

- `loud → committed → history`
- news-type ack **skips `committed`** entirely

**Sweep selector** — boundaries:

- day 14 sweeps; **day 15 does not**
- acked-and-expired **never** sweeps
- outside-audience **never** sweeps

### 7.3 Two targeted guards

**A reachability test for `auto_escalate`.** Same brief, flag flipped, assert the rung output *differs*. This is the test that would have caught defect #4 — the flag was written, validated, and stored, and no test noticed nothing read it.

**A composer-defaults test** asserting the type→defaults map against values **written out literally in the test file, not re-derived from the source map.**

> A test that imports the map and compares it to itself passes no matter how wrong the map is.

Defect #5 lived in that map for the life of the feature. The literal-values form is what makes §5.5 stick.

### 7.4 Test command

```bash
node --test tests/*.mjs
```

The glob form is mandatory — the bare directory form flakes in this repo. `tests/team-briefs-helpers.test.mjs` and `tests/team-briefs-integration.test.mjs` are **extended, not replaced**.

---

## 8. Out of scope

Named explicitly so implementation does not drift into them:

- **Email, push, Slack, or any out-of-app notification** — see §1.1. Structurally unavailable.
- **A manager-visible non-login signal** — D7. Jeff declined it.
- **Blocking UI of any kind** — D1.
- **A composer preview/simulator** — §6.1.
- **Changing `display_rule` semantics or migrating existing rows** — §5.4.
- **Folding Team Briefs into `loadStateFromSupabase` / `subscribeRealtime`** — §3.2, RFC-163 invariant.

## 9. Suggested build order

This is one feature and one plan, but it has a natural spine. Each step lands green on its own:

1. **Pure functions + tests first** (§7) — `teamBriefRung`, `teamBriefSurface`, `briefSurfaceShape`, sweep selector, in `data-model.js`. No UI change; the ladder becomes checkable before anything renders it. The `auto_escalate` reachability guard (§7.3) turns defect #4 red here.
2. **`TeamBriefsProvider`** (§3.2) — lift the existing cycle, no behaviour change. `TeamBriefsTodayPanel` keeps working through it.
3. **`BriefSurface`** (§4.2–4.3) — hero + strip, both mounts, driven by `briefSurfaceShape`. The three deletions (§4.6) land here.
4. **Two-step ack** (§4.4) — needs `done_at` (§5.1); until Jeff applies it, `committed` degrades to today's one-step behaviour rather than erroring.
5. **Nav unlock, badge, `document.title`** (§4.5–4.6).
6. **Catch-up sweep** (§5.3) — no schema dependency; can land any time after step 1.
7. **Manager side** (§6) — tracking split, `auto_escalate` copy, audience-membership gate.

Step 4 is the only one gated on Jeff; everything else is independent of Supabase state.

## 10. Requires Jeff

1. **Apply the `done_at` migration to Supabase** (§5.1). Until then the client must tolerate its absence.
2. **Review this spec** before an implementation plan is written.

---

## 11. Anchor index

Verified at `7c89b68`. Line numbers drift; the symbols do not.

| Anchor | Location |
|---|---|
| `APP_PAGES` team-briefs gate | `src/manager.jsx:24` |
| Lazy component resolution | `src/manager.jsx:12-17`, `resolveAppPageComponent` |
| Tab strip mount point | `index.html:3045` |
| `HomeView` | `index.html:2173` |
| Home quote (renders before panel) | `index.html:2269` |
| Rep gate on Today panel | `index.html:2279` |
| Read-fade CSS | `src/team-briefs.jsx:53` |
| `TeamBriefCard` | `src/team-briefs.jsx:233` |
| `TeamBriefsTodayPanel` | `src/team-briefs.jsx:402` |
| Truncation | `src/team-briefs.jsx:431` |
| `TeamBriefsManager` | `src/team-briefs.jsx:446` |
| Type defaults map | `src/team-briefs.jsx:488-493` |
| `auto_escalate` validation | `src/team-briefs.jsx:513` |
| `auto_escalate` checkbox | `src/team-briefs.jsx:638` |
| `p_auto_escalate` RPC arg | `src/supabase-client.js:443` |
| `teamBriefIsVisible` | `src/data-model.js` ≈`:1020` |
| `teamBriefUrgency` | `src/data-model.js:1032-1051` |
| `auto_escalate` column + constraint | `db/migration-team-briefs.sql:41`, `:113` |
| `team_brief_reads` table | `db/migration-team-briefs.sql:155-169` |
| Publish RPC expiry conversion | `db/migration-team-briefs.sql:420-451` |
