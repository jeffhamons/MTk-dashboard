# RFC-164: Team Briefs Rep Surface Redesign

## Status: Draft — awaiting Phase 0.5 baseline before Phase 2+ is authorized
## Author: Q (architecture review) from design conversation by Jeff Hamons / Crash
## Date: 2026-07-28
## Consumer: MTk Dashboard implementer (Crash)
## Priority: Phase 1
## Related RFC: RFC-163 Team Briefs; RFC-163 Amendment (Brief History and Search)
## Supersedes: `docs/superpowers/specs/2026-07-28-team-briefs-redesign-design.md` (design doc — retained as the rationale record)
## Source anchors: pinned to `7c89b68`

---

## 1. Problem

Team Briefs is the channel Jeff uses to push news and asks to NA reps. Reps
aren't seeing briefs and aren't acknowledging them.

The design doc identified seven defects. All seven were verified against
`7c89b68`. Five are structural invisibility, not aesthetics:

| # | Defect | Anchor | Verified |
|---|---|---|---|
| 1 | Reps have no nav path to the Team Briefs page | `src/manager.jsx:1` — `requires: "manager"` | ✅ |
| 2 | Home panel renders below the greeting *and* the motivational quote | `index.html:2255`, `:2268`, `:2279` | ✅ |
| 3 | Home panel silently truncates to 3 briefs | `src/team-briefs.jsx:431` — `active.slice(0, 3)` | ✅ |
| 4 | No escalation — an overdue ask looks like a read one | — | ✅ (definitional) |
| 5 | `morning_message` expires at local midnight and asks nothing | `src/team-briefs.jsx:487-493`; publish RPC `today_only` branch | ✅ (see §2.4) |
| 6 | Read briefs fade to 78% opacity, reading as "handled" | `src/team-briefs.jsx:53` | ✅ |
| 7 | No distinction between "seen" and "done" | — | ✅ (definitional) |

**The diagnosis is sound.** A brief with no navigation path, rendered below a
motivational quote, expiring before the next business day, is close to
undiscoverable. This is not a "make it prettier" redesign.

### 1.1 The measurement gap (blocking)

The design doc contains **no baseline, no target, and no success metric**. We
cannot distinguish three very different worlds:

1. **Most briefs are `morning_message` with `require_ack: false`.** Ack rate is
   then definitionally near zero and this redesign fixes nothing observable.
   This is the likeliest world given the composer default.
2. **Reps aren't logging in at all.** No rep-facing surface fixes that.
3. **Reps log in, see briefs, don't act.** The redesign is correctly aimed.

**Phase 0.5 (§6.2) runs the query that distinguishes them. Phases 2–7 are not
authorized until it returns.** Phases 0 and 1 are unconditional — they are
correct in all three worlds.

### 1.2 Delivery-channel constraint (unchanged, and correct)

No email, push, or Slack. Outbound to this audience is structurally broken:
corporate quarantine plus the Supabase hourly rate cap, and the remedy routes
through the IT org this dashboard exists to bypass. The dashboard surface is the
only channel. This constraint is upheld, not revisited.

---

## 2. Decisions

Decisions D1–D7 carry over from the design doc. D8–D14 are new or amend it.

| ID | Decision | Status |
|---|---|---|
| D1 | Never block. No interstitials, modals, or login gates. | Locked (Jeff) |
| D2 | No email, push, or Slack. | Locked (Jeff) |
| D3 | No manager-visible signal for reps who never log in. | Locked (Jeff) |
| D4 | Placement is a Home hero plus a persistent chrome strip; the strip catches on scroll. | Locked (Jeff) |
| D5 | At the top rung, the brief owns the first screen of Home. | Locked (Jeff) |
| D6 | Two-step acknowledgement: "read" and "done" are separate states. | Carried |
| D7 | Reading buys quiet, not amnesty — an unfinished ask re-escalates past its due date. | Amended by D8 |
| **D8** | **Re-escalation after reading caps at rung 2.** Rung 3 (screen takeover) is reserved for *never-read AND overdue*. | New — §2.1 |
| **D9** | **Rung 3 decays.** After `TEAM_BRIEF_STALE_DAYS` past due, a rung-3 brief drops to rung 2 and surfaces in a manager "stale asks" list. | New — §2.2 |
| **D10** | **The catch-up sweep is count-bounded, not age-bounded**, and writes a *distinguishable* receipt (`swept = true`). | New — §2.3 |
| **D11** | **`morning_message` keeps `require_ack: false`** and gains a multi-day display rule. Only the expiry half of defect #5 is a bug. | Amends design §5.5 — §2.4 |
| **D12** | **`until_acknowledged` is removed from the composer.** It silently deletes the two-step ack. | New — §2.5 |
| **D13** | **Team admins as brief recipients is descoped from this RFC.** It is a publish-RPC change, not a client change. | Amends design §6.3 — §2.6 |
| **D14** | **The provider ticks.** Rung state is time-derived; without a clock the ladder never climbs. | New — §2.7 |

### 2.1 D8 — where re-escalation lands

Two states currently collapse into rung 3: *never read it* and *read it, didn't
click a second button*. Collapsing them destroys the meaning of the loudest
signal in the product. A rep who read the brief and did the work but skipped a
checkbox gets their Home page seized; within weeks the modal experience of Home
is "a full screen of things I already read," and rung 3 stops meaning anything.

That is the actual mechanism by which an escalation surface trains people to
ignore it — not re-escalation, but *indiscriminate* re-escalation.

Rung 2 is still loud: tab badge, strip open and pinned, ack affordance visible.
It just doesn't seize the viewport. Two supporting moves:

- **"Mark done" is available from the strip**, not only the hero, so clearing an
  ask is one click from anywhere in the app.
- The manager's read-but-not-done list (§4.4) carries the enforcement. Jeff
  seeing your name is a stronger lever than pixels and costs no escalation
  currency.

### 2.2 D9 — rung 3 must decay

Ask-bearing types are `manual_clear`, so they never expire. Re-escalation is
unconditional past the due date. With no decay rule, **one forgotten overdue ask
owns the first screen of Home for its whole audience, permanently.**

Compounded by the design doc's §6.4 (only the single highest-rung brief triggers
the takeover), that stale ask **suppresses the takeover for every brief published
after it.** The failure mode of the escalation system is that it silently stops
escalating, and the symptom is indistinguishable from working correctly.

`TEAM_BRIEF_STALE_DAYS = 14`. Past that, rung 3 → rung 2, and the brief appears
in a manager-side "Stale asks" list with an archive action.

### 2.3 D10 — the catch-up sweep

**Count-bounded, not age-bounded.** The design doc asserted a 14-day window
without deriving it. Nothing in the data model makes 14 special, and the failure
it protects against is absence — two weeks of PTO is common, three weeks isn't
rare, and a rep back from three weeks would get an empty sweep and a silent
History, which is defect #5 relocated rather than fixed.

Age is a proxy for the thing that actually matters: **volume**. The sweep exists
so nobody faces a wall of forty cards. Bounding by count
(`TEAM_BRIEF_CATCHUP_LIMIT = 10`, newest first, with "and N older — see History")
solves that directly and works at any absence length.

**The receipt must be distinguishable.** A bulk "Got it" writes read rows for
briefs the rep did not read. §4.4 makes read counts the manager-facing signal —
the number Jeff will use to judge whether this worked. Sweep receipts carry
`swept = true` and are excluded from the headline read count.

### 2.4 D11 — defect #5 is two defects; only one is a bug

The publish RPC computes `today_only` expiry as
`date_trunc('day', publish_at at time zone tz) + 1 day`, i.e. local midnight
tonight. A Friday-afternoon brief is gone before Monday. **That is the bug.**

The design doc's remedy also set `require_ack: true` on `morning_message`. That
is the wrong direction. Forcing a click on an informational message is precisely
how reps learn the ack button is noise — and the ack button's credibility is the
currency the entire escalation ladder spends. Escalation only works if the base
rate of asks that matter stays high.

`morning_message` becomes `{ display_rule: "for_days", display_days: 3,
require_ack: false, auto_escalate: false }`.

*Reproduction note for the implementer:* the initial composer form state
(`src/team-briefs.jsx:462-477`) already has `require_ack: true`. Only
`selectType("morning_message")` flips it to `false`. The defect fires only once a
manager touches the Type dropdown.

### 2.5 D12 — `until_acknowledged` defeats the two-step ack

The design doc asserts `display_rule` "continues to mean expiry only — unchanged
semantics." That is not true today. `src/data-model.js:1062`:

```js
if (brief.display_rule === "until_acknowledged" && acknowledged) return false;
```

`until_acknowledged` is an **ack-coupled visibility rule**, and it is a live
option in the composer at `src/team-briefs.jsx:611`. Sequence: manager publishes
an `action_required` brief with `until_acknowledged`; rep clicks "Confirm I've
read this"; `teamBriefIsVisible` returns false; **the brief disappears before
"Mark done" is ever rendered.** The committed state is unreachable,
re-escalation can never fire (an invisible brief has no rung), and the manager
dashboard shows read=1 / done=0 forever with no path for the rep to resolve it.

One dropdown value silently deletes the heart of the redesign. Remove the option
from the composer. Retain the DB enum value and the `data-model.js` branch so
existing rows keep rendering correctly.

### 2.6 D13 — team admins as recipients is not a client change

The design doc proposed rendering the rep surface for anyone holding a
`team_brief_audience_members` row, so a `team_admin` such as Lara Kidd could
receive a brief. **That is a no-op for the person it names.** The publish RPC
materializes the audience as:

```sql
from public.users u
join public.reps r on r.rep_id = u.rep_id
where u.role = 'rep' and u.auth_id is not null and r.active and (...)
```

with an in-file comment stating outright that managers and team_admins never
enter. Lara can never hold that row.

It is worse than inert. RLS gates `select` on `team_briefs` by
`current_user_is_team_brief_member(id) or current_user_can_manage_team_brief(id)`,
so she reads the brief only through the *manager* branch, which routes her to the
managerial view. And `team_brief_reads.rep_id` is `not null` with an FK into
`team_brief_audience_members`, so even given a row she could not acknowledge
without a `reps` row to hang it on.

Making a team_admin a recipient requires a publish-RPC change plus a decision
about the `reps` join — hand-applied, and non-trivial. **Descoped.** Sketched in
Appendix B if Jeff wants it; it should be its own RFC.

### 2.7 D14 — the ladder has no clock

`grep -rn setInterval src/ index.html` returns **zero matches.** Nothing in this
application ticks.

Rungs are a function of `now`. React re-renders on state change, not on time
passing, and `useTeamBriefs` re-renders only on a Supabase realtime event. A rep
who opens the dashboard at 09:00 and leaves the tab open sees **rung 1 all day**;
the brief that goes overdue at 17:00 never escalates. The ladder only moves
across page loads.

This is the mechanism by which the entire feature works, and it was absent. The
provider owns a 60-second tick (rungs are day-grained; 60s is generous).

*Corollary:* this voids the `document.title` "(N)" prefix, whose stated
justification was "a rep with the tab open in another window sees the count."
Without a tick the count changes only when *data* changes — so the one feature
justified by the parked-tab scenario fails in exactly that scenario. See §7.

---

## 3. Blocking findings resolved by this RFC

Three findings from the architecture review would have surfaced only after code
was written. They are recorded here because the implementation plan is shaped
around them.

### F1 — CRITICAL: the catch-up sweep cannot write

The design doc claimed the sweep "needs no schema change" and could "land any
time after step 1." **Both false.** The sweep is by definition about briefs whose
`expires_at` has passed, and:

```sql
-- acknowledge_team_brief
if v_uid is null or not public.team_brief_accepts_interaction(p_brief_id) then
  raise exception 'brief is not available for acknowledgement' using errcode = '42501';
```

`team_brief_accepts_interaction` requires `expires_at is null or expires_at > now()`.
Every swept brief fails it. There is no client-side escape: the migration does
`revoke all ... from public, anon, authenticated;` then `grant select` only, so
**all mutation is RPC-only** and the client physically cannot insert a read row.

The read side is fine — RLS's `current_user_is_team_brief_member` has no expiry
filter and `loadTeamBriefs` filters only on `status` — so the sweep can *display*
correctly while recording nothing. Resolved by Migration B (Appendix A).

### F2 — HIGH: §6.3 aimed at the wrong layer

See D13 / §2.6. Resolved by descoping.

### F3 — HIGH: no clock

See D14 / §2.7. Resolved by the provider tick.

### Remaining findings folded into the plan

| Sev | Finding | Resolved by |
|---|---|---|
| HIGH | `until_acknowledged` collides with the two-step ack | D12 |
| HIGH | Rung 3 has no terminal state and masks later briefs | D9 |
| HIGH | Sweep fabricates read receipts, corrupting the success metric | D10 |
| MED | IntersectionObserver **latch** (not flicker) — two variants | §4.2 |
| MED | Strip in normal flow causes layout oscillation | §4.2 |
| MED | `useTeamBriefs(false)` vs `(true)` divergence | §4.1 |
| MED | Always-on provider = per-row `SECURITY DEFINER` RLS for everyone, every page | §4.1 |
| MED | No mobile story, no accessibility story | §4.5 |
| LOW | Design doc anchor error: `teamBriefIsVisible` is at `:1053`, not `:1020` | Corrected here |

---

## 4. Architecture

### 4.1 `TeamBriefsProvider` — one load cycle, one channel, one clock

Today `useTeamBriefs` (`src/team-briefs.jsx:204-231`) performs a full
`loadTeamBriefs` plus a realtime subscribe **per hook call**. Three mounts means
three queries and three channels.

Lift it into a provider mounted once in `App`, wrapping both the tab bar and the
view switch. Three constraints the design doc did not state:

**(a) Load with `includeArchived: true`.** `src/team-briefs.jsx:403` calls
`useTeamBriefs(false)`; `:448` calls `useTeamBriefs(true)`. `loadTeamBriefs`
translates that into `.eq("status", "published")`. A single provider that keeps
the `false` behaviour silently strips archived briefs from the manager page.
Load the superset; let consumers filter.

**(b) Two-tier load, to contain cost.** Today the query runs only when the Home
panel or the Team Briefs page mounts. A provider in `App` runs it for every
signed-in user on every page load — and RLS calls
`current_user_is_team_brief_member(id)` and `current_user_can_manage_team_brief(id)`
*per row*, against a three-way nested select (`audience`, `reads`, `comments`).
Cost grows with total brief count and now lands on app boot.

Therefore: load non-archived at boot; lazily load the archived superset when the
manager page or the History tab mounts.

**(c) A 60-second tick** (D14), exposed as `now` in context so every rung
consumer re-renders on the same clock rather than reading `Date.now()`
independently.

```js
// src/team-briefs.jsx — new
const TeamBriefsContext = React.createContext(null);

function TeamBriefsProvider({ children }) {
  const [briefs, setBriefs] = React.useState([]);
  const [now, setNow] = React.useState(() => Date.now());
  const [heroOnScreen, setHeroOnScreen] = React.useState(false);
  // ... single load + single subscribeTeamBriefs
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  // ...
}
```

`useTeamBriefs` is retained as a thin `useContext` wrapper so existing call sites
keep working during the transition.

**Load order** is already correct and needs no `index.html` change:
`src/data-model.js` (`:1928`) → `src/team-briefs.jsx` (`:1937`) →
`src/manager.jsx` (`:1938`) → inline `App`. Pure helpers and the provider are
both defined before any consumer.

### 4.2 `BriefSurface` — the double mount

Two mounts (Home hero, chrome strip) both read `briefSurfaceShape` from the same
provider context, so they commit in the same React pass and cannot disagree on
`outstandingCount` or `view`. The pure function does prevent drift.

**But drift is not the failure mode.** Three real ones, all of which ship broken
if unstated:

**(a) Observer death.** If `briefSurfaceShape` returning `'strip'` causes the
hero to render `null`, the sentinel unmounts, the `IntersectionObserver`
disconnects, and `heroOnScreen` is **frozen at `false` forever**. Scrolling back
up never re-fires, because there is nothing left to observe. The strip latches on
permanently.

> **Mitigation (mandatory):** the sentinel lives in `HomeView`, *outside*
> `BriefSurface`, and is never conditionally rendered. `BriefSurface` reads
> `heroOnScreen`; it does not own the element that produces it.

**(b) The same latch on navigation.** Rep is on Home with the hero visible
(`heroOnScreen: true`), taps the Team tab. `HomeView` unmounts, the observer
dies, the provider still holds `true`, `briefSurfaceShape` returns `'hero'` — and
no hero is mounted. **Neither surface is on screen, on every page except Home.**
That is the invariant broken in the single most common navigation path.

> **Mitigation:** `view` short-circuits *before* `heroOnScreen` is consulted. See
> the function below. Fixable purely inside `data-model.js` because `view` is
> already an input.

**(c) Layout oscillation.** If the strip occupies normal flow, mounting it pushes
content down → the sentinel re-enters the viewport → the strip unmounts →
content shifts up → the sentinel leaves → repeat. A genuine loop, not a one-frame
flicker.

> **Mitigation:** the strip is `position: sticky` in the existing `.tabs` chrome
> (`index.html:3045`), never in flow, and the observer carries
> `rootMargin: "-<strip-height>px 0px 0px 0px"`.

The true one-frame flicker (both briefly visible while scrolling up) is real,
cosmetic, and handled by the same `rootMargin`. It is the least of the four.

**Do not oversell the test.** `briefSurfaceShape` makes the *decision* testable.
It does not make "exactly one on screen" testable — that also depends on CSS,
scroll position, and observer timing, none of which reach `node --test`. A green
suite here proves the function, not the invariant.

### 4.3 Pure logic in `src/data-model.js`

The test harness is `vm.createContext({ window: {}, URLSearchParams })` over
`data-model.js` alone (111 tests currently green). **Any helper added must touch
nothing but those two globals, and must take `now` as a parameter — never call
`Date.now()` internally.** This is the hard constraint that makes the design's
"put invariants in pure functions" strategy work.

```js
// src/data-model.js — new constants
const TEAM_BRIEF_RUNG_WARN_DAYS  = 2;   // rung 1 → 2 threshold, before due
const TEAM_BRIEF_STALE_DAYS      = 14;  // rung 3 → 2 decay (D9)
const TEAM_BRIEF_CATCHUP_LIMIT   = 10;  // sweep cap (D10)

// receipt: { read_at, done_at, swept } | null
function teamBriefRung(brief, receipt, now) { /* → 0 | 1 | 2 | 3 */ }

function briefSurfaceShape({ view, heroMounted, heroOnScreen, outstandingCount }) {
  if (outstandingCount <= 0) return null;
  if (view !== "home") return "strip";      // (b) — before heroOnScreen
  if (!heroMounted) return "strip";
  return heroOnScreen ? "hero" : "strip";
}

function teamBriefOutstanding(briefs, receipts, now) { /* → brief[] */ }
function teamBriefCatchup(briefs, receipts, now)     { /* → { items, olderCount } */ }
```

**Rung semantics** (D7 as amended by D8/D9):

| Rung | Condition | Surface |
|---|---|---|
| 0 | Not outstanding — done, or informational and read | absent |
| 1 | Outstanding, not near due | strip / hero card |
| 2 | Due within `RUNG_WARN_DAYS`, **or** overdue-and-read, **or** decayed from 3 | strip pinned open + tab badge |
| 3 | Overdue **and** never read, and within `STALE_DAYS` of due | owns first screen of Home |

**Timezone:** rung day-math anchors on the brief's stored timezone, matching the
existing `teamBriefUrgency` convention (`src/data-model.js:1032-1051`). Without
this, a rep in APAC and one in the US see different rungs for the same brief.

**Sort:** `teamBriefRung` desc → `due_at` asc → `publish_at` desc. This
**replaces** `teamBriefSort` for rep-facing surfaces; do not let two orderings
coexist.

### 4.4 Manager side

- Replace the single "Acknowledged N/M" counter (`src/team-briefs.jsx:300`) with
  **read / done / outstanding**, where the read count **excludes `swept = true`
  receipts** (D10).
- Replace the `Unread: a, b, c` line (`:305`) with two named lists: *Haven't
  read* and *Read, not done*. The second is the enforcement lever behind D8.
- Add a **Stale asks** list (D9): rung-3 briefs past `STALE_DAYS`, with an
  archive action.

### 4.5 Mobile and accessibility

Neither appears in the design doc. Both are in scope because D4 and D5 are
viewport-consuming decisions.

- **Mobile.** The codebase already has a `@media (max-width: 720px)` block, so
  mobile is a considered case here. On a 375px viewport a persistent strip plus a
  rung-3 hero is most of the screen. Rung 3 renders as a full-width card that the
  page scrolls past — it does not lock scroll (D1 forbids blocking).
- **Accessibility.** The strip is `role="region" aria-label="Team briefs"`. The
  outstanding count is `aria-live="polite"`. The ack control is keyboard-
  reachable from the strip without entering the hero. Strip transitions respect
  `prefers-reduced-motion`. Rung 3 pushing the greeting below the fold is
  *beneficial* for screen-reader order and needs no special handling.

---

## 5. Schema and RPC changes

All three are **hand-applied by Jeff**; `db/*.sql` does not reach Supabase
automatically. Full SQL in Appendix A.

| ID | Change | Gates | Status |
|---|---|---|---|
| **A** | `team_brief_reads.done_at` + `complete_team_brief` RPC | Phase 5 | Required |
| **B** | `team_brief_reads.swept` + `team_brief_accepts_catchup` + `acknowledge_team_briefs_bulk` RPC | Phase 6 | Required |
| **C** | Team-admin audience seat | — | **Descoped (D13)** |

The design doc listed **one** "Requires Jeff" item and claimed "step 4 is the only
one gated on Jeff." There are **two**, and they gate two different phases.
Hand-applied schema is the long pole in this repo, so both ship to Jeff in
Phase 1 — first, not fourth.

---

## 6. Implementation plan

Dependency graph:

```
Phase 0 ──────────────────────────────────────────────► ship immediately
Phase 0.5 (baseline) ──┐
Phase 1 (migrations) ──┤
                       └──► Phase 2 ──► Phase 3 ──► Phase 4 ──┬──► Phase 5 (needs A)
                                                              ├──► Phase 6 (needs B)
                                                              └──► Phase 7
```

### Phase 0 — Ship today (≈1 hour, no schema, no new abstractions)

Unconditional. Correct in all three worlds of §1.1, and it **starts generating
the measurement we lack.**

| # | File | Change |
|---|---|---|
| 0.1 | `src/manager.jsx:1` | `requires: "manager"` → `requires: "any"` on the `team-briefs` page entry. Fixes defect #1. |
| 0.2 | `src/team-briefs.jsx:431` | Delete `.slice(0, 3)`. Fixes defect #3. |
| 0.3 | `src/team-briefs.jsx:53` | Delete `.tb-card[data-read="1"]{opacity:.78}`. Fixes defect #6. |
| 0.4 | `index.html:2268-2279` | Move the `TeamBriefsTodayPanel` block above the motivational-quote block. Fixes defect #2. |
| 0.5 | `src/team-briefs.jsx:487-493` | `morning_message` → `{ display_rule: "for_days", display_days: 3, require_ack: false, auto_escalate: false }` (D11). Fixes the live half of defect #5. |
| 0.6 | `src/team-briefs.jsx:611` | Remove the `until_acknowledged` `<option>` (D12). Leave the DB enum and `data-model.js:1062` branch intact. |

**Exit criteria:** a rep account can reach the Team Briefs page from the tab bar;
Home shows every current brief above the quote; a Friday `morning_message` is
still visible Monday. **Deploy to production before Phase 2 begins.**

**Tests:** none required (no pure-function surface changes). Run
`node --test tests/*.mjs` to confirm the 111-test baseline stays green.

### Phase 0.5 — Baseline (≈10 minutes, blocking for Phase 2+)

Run against Supabase and record the result in this RFC before proceeding:

```sql
-- volume and mix
select brief_type, display_rule, require_ack, count(*)
from public.team_briefs
where publish_at > now() - interval '90 days'
group by 1, 2, 3 order by 4 desc;

-- read and ack rates per type
select b.brief_type,
       count(distinct am.brief_id || am.rep_id)                    as delivered,
       count(distinct r.brief_id || r.rep_id)                      as read,
       round(100.0 * count(distinct r.brief_id || r.rep_id)
             / nullif(count(distinct am.brief_id || am.rep_id), 0), 1) as read_pct
from public.team_briefs b
join public.team_brief_audience_members am on am.brief_id = b.id
left join public.team_brief_reads r on r.brief_id = am.brief_id and r.rep_id = am.rep_id
where b.publish_at > now() - interval '90 days'
group by 1;

-- is anyone logging in at all?
select count(*) filter (where last_sign_in_at > now() - interval '30 days') as active_30d,
       count(*) as total
from auth.users u join public.users pu on pu.auth_id = u.id
where pu.role = 'rep';
```

**Decision gate:**
- World 1 (mostly `morning_message`, `require_ack: false`) → Phase 0 already
  fixed the real defect. Re-measure after two weeks before building the ladder.
- World 2 (reps not logging in) → **stop.** No rep-facing surface addresses it;
  reopen D3 with Jeff.
- World 3 (logging in, not acting) → proceed to Phase 1+.

*Caveat:* a `last_sign_in_at` value can be a mail-scanner following a magic link
rather than a human. Corroborate with an application-level signal before
concluding World 2.

### Phase 1 — Migrations to Jeff (parallel with 0.5; long pole)

Deliver **Migration A and Migration B together** (Appendix A) as one file,
`db/migration-team-briefs-redesign.sql`, for Jeff to apply by hand. Do not split
them across phases — the round-trip latency, not the SQL, is the cost.

**Exit criteria:** Jeff confirms both applied; verify with
`select column_name from information_schema.columns where table_name = 'team_brief_reads';`
returning `done_at` and `swept`.

### Phase 2 — Pure functions and tests (no UI change)

**Files:** `src/data-model.js`, `tests/team-briefs-helpers.test.mjs`

Add the three constants and four functions from §4.3, plus exports at the
existing export block (`src/data-model.js:1147-1152`).

**Tests (all in the existing `vm` harness):**
- `teamBriefRung`: each of rungs 0–3; the D8 boundary (overdue + read → 2, not 3);
  the D9 decay boundary at exactly `STALE_DAYS`; timezone parity for a US and an
  APAC rep on the same brief.
- `briefSurfaceShape`: all four branches, explicitly including
  `{ view: "team", heroOnScreen: true }` → `"strip"` (the F7(b) regression).
- `teamBriefCatchup`: cap at `CATCHUP_LIMIT`, correct `olderCount`, newest-first.
- `teamBriefOutstanding`: excludes done; excludes read informational; includes
  read-not-done asks.

**Exit criteria:** `node --test tests/*.mjs` green, count > 111.

### Phase 3 — `TeamBriefsProvider`

**Files:** `src/team-briefs.jsx`, `index.html` (mount only)

Implement §4.1 including all three constraints: `includeArchived` superset,
two-tier lazy load, and the 60s tick. Keep `useTeamBriefs` as a context wrapper
so `:403` and `:448` keep working unchanged in this phase.

**Exit criteria:** exactly one `loadTeamBriefs` call and one
`subscribeTeamBriefs` channel per session (verify in the network panel); the
manager page still shows archived briefs; existing behaviour otherwise
unchanged.

### Phase 4 — `BriefSurface` (hero + strip)

**Files:** `src/team-briefs.jsx`, `index.html` (`HomeView` ≈`:2279`, `.tabs` ≈`:3045`)

- Sentinel in `HomeView`, outside `BriefSurface`, never conditionally rendered
  (§4.2a).
- Strip mounts in the existing `.tabs` chrome as `position: sticky`; badge
  follows the `tabs__badge` precedent at `index.html:3072` (§4.2c).
- Observer carries `rootMargin` for strip height.
- Rung 3 renders the hero as the first element of Home; the greeting and quote
  move below it. Scroll is never locked (D1).

**Exit criteria:** manual verification of the four scenarios in §8.

### Phase 5 — Two-step acknowledgement *(requires Migration A)*

**Files:** `src/supabase-client.js`, `src/team-briefs.jsx`

- `completeTeamBrief(briefId)` wrapping `rpc("complete_team_brief")`.
- "Confirm I've read this" → existing `acknowledge_team_brief`.
- "Mark done" → new RPC, **rendered in both the hero and the strip** (D8).

**Exit criteria:** a rep can read then later mark done from the strip alone; the
brief drops to rung 0 only after done.

### Phase 6 — Catch-up sweep *(requires Migration B)*

**Files:** `src/supabase-client.js`, `src/team-briefs.jsx`

- `acknowledgeTeamBriefsBulk(briefIds)` wrapping `rpc("acknowledge_team_briefs_bulk")`.
- Sweep card renders `teamBriefCatchup` output with an "and N older — see
  History" link to the RFC-163-amendment History tab.
- Copy states the bound explicitly: "Missed while you were away — 10 most
  recent."

**Note:** this phase moves **last**, not "any time after step 1" as the design
doc had it. It is gated on the harder migration and on the D10 receipt
semantics.

**Exit criteria:** a rep with 15 missed briefs sees 10 plus "and 5 older"; one
click writes 10 rows with `swept = true`; the manager headline read count does
**not** move.

### Phase 7 — Manager legibility

**Files:** `src/team-briefs.jsx` (`:300`, `:305`)

Implement §4.4: read/done/outstanding counters excluding swept receipts, the two
named lists, and the Stale asks list.

**Exit criteria:** the "Read, not done" list is populated and actionable.

---

## 7. Cut on YAGNI grounds

| Cut | Why |
|---|---|
| `document.title "(N)"` prefix | Reps don't park this tab in a background window — that's a developer's model of a user. Costs a global side effect needing unmount cleanup and a coordination contract nothing else in the app currently needs (`grep document.title` → 0 matches). Untestable in this harness. And per D14 it **fails in the one scenario that justifies it**. |
| Three-colour rung badge | Keep the badge, drop the colour encoding. No rep decodes grey-vs-purple-vs-orange; the count already carries the signal. Three CSS states for zero information gain. |
| Expandable one-line rows past the first in the hero | Real interaction state in JSX with zero test reach, defending against a volume problem a publisher shipping 1–2 briefs/week does not have. Render compact cards. Add the expand when volume appears. |
| `until_acknowledged` composer option | D12 — a third visibility mechanism alongside `manual_clear` and the ack state, which actively breaks the redesign. |

**Kept:** the `TeamBriefsPage` unlock (Phase 0.1) — cheapest, highest-value change
in the whole effort.

---

## 8. Test plan

**Automated** (`node --test tests/*.mjs`, `vm` harness, `data-model.js` only):
per Phase 2. Baseline is 111 green.

**Manual** — four scenarios that no automated test in this repo can reach:

1. **Handoff.** Load Home with one outstanding brief. Scroll down past the hero →
   strip appears. Scroll back up → strip disappears, hero returns. No
   oscillation at the boundary (§4.2c).
2. **Navigation latch.** From Home with the hero visible, tap the Team tab. The
   strip **must** appear (§4.2b). This is the regression most likely to ship
   broken.
3. **Clock.** With a brief due in ~2 minutes, leave the tab open and untouched.
   The rung **must** advance without a reload (D14).
4. **Mobile.** 375px viewport, rung-3 brief. The page must still scroll; the
   strip must not consume more than one tab-bar height.

---

## 9. Requires Jeff

1. **Phase 0.5 baseline** — run the three queries in §6.2 and record the result
   here. **Blocks Phases 2–7.**
2. **Apply `db/migration-team-briefs-redesign.sql`** (Migrations A + B,
   Appendix A). Blocks Phases 5 and 6.
3. **Confirm `TEAM_BRIEF_STALE_DAYS = 14`** (D9) — the one remaining asserted
   number in this RFC. It is now the decay threshold rather than a sweep window,
   and it is a policy call about how long a forgotten ask should shout.
4. **Confirm D13 descope** — team admins do not receive briefs in this RFC.

---

## 10. Out of scope

- Team admins as brief recipients (D13 — separate RFC; Appendix B sketch).
- Any change to the publish/compose flow beyond the Phase 0.5/0.6 defaults.
- The History tab (shipped under the RFC-163 amendment; this RFC links to it).
- Manager-visible non-login signal (D3, declined).
- Email, push, Slack (D2, structurally unavailable).

---

## Appendix A — `db/migration-team-briefs-redesign.sql`

```sql
-- ============================================================
-- RFC-164 · Team Briefs rep surface redesign
-- Migrations A + B. Apply by hand in the Supabase SQL editor.
-- Idempotent: safe to re-run.
-- ============================================================

-- ---- Migration A: done state -------------------------------

alter table public.team_brief_reads
  add column if not exists done_at timestamptz;

-- ---- Migration B: swept receipts + catch-up predicate -------

alter table public.team_brief_reads
  add column if not exists swept boolean not null default false;

-- Expiry-agnostic sibling of team_brief_accepts_interaction.
-- The catch-up sweep and late "mark done" both act on briefs whose
-- expires_at has already passed; the existing predicate refuses them.
create or replace function public.team_brief_accepts_catchup(p_brief_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_briefs b
    where b.id = p_brief_id
      and b.status = 'published'
      and b.publish_at <= now()
      and b.archived_at is null
  );
$$;

-- ---- Migration A: complete_team_brief ----------------------

create or replace function public.complete_team_brief(p_brief_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not public.team_brief_accepts_catchup(p_brief_id) then
    raise exception 'brief is not available' using errcode = '42501';
  end if;

  -- Membership is derived server-side; the caller cannot name a rep.
  insert into public.team_brief_reads (brief_id, auth_id, rep_id, read_at, done_at)
  select am.brief_id, am.auth_id, am.rep_id, now(), now()
  from public.team_brief_audience_members am
  where am.brief_id = p_brief_id
    and am.auth_id = v_uid
  on conflict (brief_id, rep_id)
    do update set done_at = coalesce(public.team_brief_reads.done_at, now());
end;
$$;

-- ---- Migration B: bulk catch-up acknowledgement -------------

create or replace function public.acknowledge_team_briefs_bulk(p_brief_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer := 0;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  insert into public.team_brief_reads (brief_id, auth_id, rep_id, read_at, swept)
  select am.brief_id, am.auth_id, am.rep_id, now(), true
  from public.team_brief_audience_members am
  where am.auth_id = v_uid
    and am.brief_id = any(p_brief_ids)
    and public.team_brief_accepts_catchup(am.brief_id)
  on conflict (brief_id, rep_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---- Grants ------------------------------------------------
-- Mutation stays RPC-only; the tables remain select-only to authenticated.

grant execute on function public.team_brief_accepts_catchup(uuid)      to authenticated;
grant execute on function public.complete_team_brief(uuid)             to authenticated;
grant execute on function public.acknowledge_team_briefs_bulk(uuid[])  to authenticated;
```

**Security notes for review before applying:**
- Both write RPCs derive `rep_id`/`auth_id` from `auth.uid()` joined to
  `team_brief_audience_members`. A caller cannot write a receipt for another rep,
  and cannot write one for a brief they were never an audience member of.
- `on conflict do nothing` / `coalesce(done_at, now())` make both idempotent —
  a double-click cannot corrupt a timestamp.
- `set search_path = ''` matches the existing convention in
  `db/migration-team-briefs.sql`.
- Neither function relaxes `expires_at` for the *original* single-brief
  `acknowledge_team_brief`, which keeps its stricter gate unchanged.

## Appendix B — Descoped: team-admin audience seat (D13)

Not part of this RFC. Recorded so the work isn't re-derived.

Making a `team_admin` a brief recipient requires all of:

1. Amending `publish_team_brief` to seat non-rep roles — the
   `where u.role = 'rep'` filter and the `join public.reps r on r.rep_id = u.rep_id`
   both exclude them, and a team_admin's `users.rep_id` is typically null.
2. Deciding what `team_brief_audience_members.rep_id` (`not null`) holds for a
   non-rep, given `team_brief_reads` carries an FK into it.
3. Deciding whether such a person sees the rep surface, the manager surface, or
   both — `current_user_can_manage_team_brief` already grants them read access
   through the manager branch, so the two paths would overlap.

(3) is a product question, not a schema one, and is the reason this belongs in
its own RFC.

## Appendix C — Corrected anchor index (`7c89b68`)

| Symbol | Location | Note |
|---|---|---|
| `team-briefs` page entry | `src/manager.jsx:1` | `requires: "manager"` |
| `APP_PAGE_SOURCES` | `src/manager.jsx:54` | issue #22 diagnostic |
| read-fade CSS | `src/team-briefs.jsx:53` | |
| `useTeamBriefs` | `src/team-briefs.jsx:204-231` | load + subscribe per call |
| manager ack counter | `src/team-briefs.jsx:300` | |
| unread name list | `src/team-briefs.jsx:305` | |
| `useTeamBriefs(false)` | `src/team-briefs.jsx:403` | `TeamBriefsTodayPanel` |
| `.slice(0, 3)` | `src/team-briefs.jsx:431` | |
| `useTeamBriefs(true)` | `src/team-briefs.jsx:448` | `TeamBriefsManager` |
| initial form state | `src/team-briefs.jsx:462-477` | `require_ack: true` |
| `selectType` defaults | `src/team-briefs.jsx:487-493` | design doc said `:488-493` |
| auto-escalate due guard | `src/team-briefs.jsx:513` | |
| `until_acknowledged` option | `src/team-briefs.jsx:611` | D12 removes |
| `window` exports | `src/team-briefs.jsx:699-702` | |
| `_teamBriefLocalDayNumber` | `src/data-model.js:1021` | |
| `teamBriefUrgency` | `src/data-model.js:1032-1051` | timezone convention |
| **`teamBriefIsVisible`** | **`src/data-model.js:1053`** | **design doc said ≈`:1020` — wrong** |
| `until_acknowledged` branch | `src/data-model.js:1062` | D12 retains |
| `teamBriefRepSection` | `src/data-model.js:1069` | |
| export block | `src/data-model.js:1147-1152` | |
| `HomeView` | `index.html:2173` | |
| greeting / quote | `index.html:2255-2266` / `:2268-2276` | |
| `TeamBriefsTodayPanel` mount | `index.html:2279` | Phase 0.4 moves above `:2268` |
| `.tabs` chrome | `index.html:3045` | strip mount |
| `tabs__badge` precedent | `index.html:3072` | |
| script load order | `index.html:1928` → `:1937` → `:1938` | already correct |
| `loadTeamBriefs` | `src/supabase-client.js:388` | `status` filter only |
| `acknowledge_team_brief` | `src/supabase-client.js:451-453` | |
| `subscribeTeamBriefs` | `src/supabase-client.js:500-510` | 4 tables |
