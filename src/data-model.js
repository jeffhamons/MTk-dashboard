// Team + week data model. Designed to be EXTENSIBLE:
// to add new deliverables later, append to DELIVERABLES.
// The state engine doesn't care how many there are.

const REPS = [
  { id: "cammy",   name: "Cammy Bean",              role: "Accounts Director",  initials: "CB", hue: 168, region: "US", team: "newbiz",
    email: "cammy.bean@kineo.com",
    skips: [],
    links: {
      wins: "https://mindtoolsltd-my.sharepoint.com/:x:/g/personal/jhamons_mindtools_com/IQBq1QCblu_vR7UurBDtei4uATcZNDT5XW_uoZOYYUzNJEw?e=Rxvq5P",
      commitments: "https://mindtoolsltd-my.sharepoint.com/:x:/g/personal/jhamons_mindtools_com/IQBuhNbqR8nYTKMa9sY_3p8xAdPrDpNdxx2XoWr0Mc-O7ys?e=DvUMnf",
    } },
  { id: "brenda",  name: "Brenda Bravener-Greville", role: "Senior AE",          initials: "BB", hue: 18, region: "US", team: "newbiz",
    skips: [],
    // Departed mid-cycle — visible through week 5 (her history), hidden from
    // week 6 (Jun 1) onward. See repVisibleInWeek().
    activeThrough: 5,
    links: {
      wins: "https://mindtoolsltd-my.sharepoint.com/:x:/g/personal/jhamons_mindtools_com/IQBq1QCblu_vR7UurBDtei4uATcZNDT5XW_uoZOYYUzNJEw?e=ZnLAD9&nav=MTVfezAwMDAwMDAwLTAwMDEtMDAwMC0wMjAwLTAwMDAwMDAwMDAwMH0",
      commitments: "https://mindtoolsltd-my.sharepoint.com/:x:/g/personal/jhamons_mindtools_com/IQDr0IFSv9s5R5_APq-I1sj9AXDUOQ2y_UlVlpZviyNTRlk?e=fx78m5",
    } },
  { id: "farah",   name: "Farah Issa",              role: "Content Account Executive", initials: "FI", hue: 210, region: "US", team: "newbiz",
    email: "fissa@mindtools.com",
    skips: [],
    links: {
      wins: "https://mindtoolsltd-my.sharepoint.com/:x:/g/personal/jhamons_mindtools_com/IQBq1QCblu_vR7UurBDtei4uATcZNDT5XW_uoZOYYUzNJEw?e=VeYQ0C&nav=MTVfezAwMDAwMDAwLTAwMDEtMDAwMC0wMTAwLTAwMDAwMDAwMDAwMH0",
      commitments: "https://mindtoolsltd-my.sharepoint.com/:x:/g/personal/jhamons_mindtools_com/IQBPIeHopSD9TKouVkmtbRtAAbws9qXWmZxz8IMtd1U8QrU?e=A1Ye1Y",
    } },
  { id: "don",     name: "Don Hazelwood",           role: "Senior Account Executive", initials: "DH", hue: 38, region: "US", team: "newbiz",
    email: "Donald.Hazelwood@mindtools-kineo.com",
    skips: [],
    links: {} },
  { id: "dwayne",  name: "Dwayne Haskell",          role: "Customer Success",   initials: "DH", hue: 280, region: "US", team: "cs",
    email: "dwayne.haskell@kineo.com",
    skips: ["outreach", "commitments"],
    links: { wins: "https://mindtoolsltd-my.sharepoint.com/:x:/g/personal/jhamons_mindtools_com/IQBq1QCblu_vR7UurBDtei4uATcZNDT5XW_uoZOYYUzNJEw?e=0OOyTb&nav=MTVfezg2NzczMkNCLTA2NTEtQjA0NC1BOUZFLTY4N0M0NkE0NEREQX0" } },
  { id: "meri",    name: "Meri Tosh",               role: "Customer Success",   initials: "MT", hue: 130, region: "US", team: "cs",
    email: "meri.tosh@kineo.com",
    skips: ["outreach", "commitments"],
    links: { wins: "https://mindtoolsltd-my.sharepoint.com/:x:/g/personal/jhamons_mindtools_com/IQBq1QCblu_vR7UurBDtei4uATcZNDT5XW_uoZOYYUzNJEw?e=bzuua5&nav=MTVfezg3OUJBRDY5LTZCNUQtNkQ0Ny05RDQwLTE0ODlCNzlDOTM5Rn0" } },
  // EMEA CS reps — Lara's team; roster confirmed by Jeff 2026-07-10; RFC-151 Open Question 1 resolved.
  // (Irvin Haskell in the org chart IS the existing `dwayne` entry; Dwayne +
  // Meri are the NA CS pair.) Live in Phase 4's CS workspace — they
  // render only inside the CS section, so BD views are unaffected.
  { id: "laura",    name: "Laura Blackmore",         role: "Customer Success Manager",        initials: "LB", hue: 330, region: "EMEA", team: "cs",
    email: "laura.blackmore@mindtools-kineo.com",
    skips: ["outreach", "commitments"], links: {} },
  { id: "owen",     name: "Owen Bolding",            role: "Senior Customer Success Manager", initials: "OB", hue: 55,  region: "EMEA", team: "cs",
    email: "owen.bolding@mindtools-kineo.com",
    skips: ["outreach", "commitments"], links: {} },
  { id: "james",    name: "James Brooke",            role: "Customer Success Manager",        initials: "JB", hue: 95,  region: "EMEA", team: "cs",
    email: "james.brooke@mindtools-kineo.com",
    skips: ["outreach", "commitments"], links: {} },
  { id: "rowan",    name: "Rowan Donoghue",          role: "Customer Success Manager",        initials: "RD", hue: 250, region: "EMEA", team: "cs",
    email: "rowan.donoghue@mindtools-kineo.com",
    skips: ["outreach", "commitments"], links: {} },
  { id: "alex",     name: "Alex Martin",             role: "Customer Success Manager",        initials: "AM", hue: 20,  region: "EMEA", team: "cs",
    email: "alex.martin@mindtools-kineo.com",
    skips: ["outreach", "commitments"], links: {} },
  // EMEA BD — activated 2026-07-10 (join weekly rhythm; targets later).
  { id: "rory",     name: "Rory Lawson",             role: "Account Director",   initials: "RL", hue: 200, region: "EMEA", team: "newbiz",
    email: "rory.lawson@kineo.com",
    skips: [], links: {} },
  { id: "stephen",  name: "Steve Mackenzie",         role: "Account Director",   initials: "SM", hue: 175, region: "EMEA", team: "newbiz",
    email: "steve.mackenzie@mindtools-kineo.com",
    skips: [], links: {} },
  { id: "simon",    name: "Simon Bailie",            role: "Senior Account Executive", initials: "SB", hue: 145, region: "EMEA", team: "newbiz",
    email: "sbailie@mindtools.com",
    skips: [], links: {} },
  { id: "matthew",  name: "Matthew Saward",          role: "Senior Account Executive", initials: "MS", hue: 310, region: "EMEA", team: "newbiz",
    email: "msaward@mindtools.com",
    skips: [], links: {} },
  // EMEA BD (South Africa folded into EMEA) — activated 2026-07-10.
  { id: "paul",     name: "Paul Welch",              role: "Account Executive",  initials: "PW", hue: 75,  region: "EMEA", team: "newbiz",
    email: "paul.welch@kineo.com",
    skips: [], links: {} },
  { id: "mike",     name: "Mike Cawood",             role: "Senior Account Executive", initials: "MC", hue: 265, region: "EMEA", team: "newbiz",
    email: "m.cawood@mindtools.com",
    skips: [], links: {} },
  // EMEA BD — activated 2026-07-12 for Stuart's 2026-07-13 start.
  // Registered in Supabase reps + allowed_emails (role 'rep', rep_id 'stuart').
  { id: "stuart",   name: "Stuart Chadwick",         role: "Business Development Leader - EMEA", initials: "SC", hue: 40,  region: "EMEA", team: "newbiz",
    email: "stuart.chadwick@mindtools-kineo.com",
    skips: [], links: {} },
  // APAC BD — activated 2026-07-10.
  { id: "dourlay",  name: "Paul Dourlay",            role: "Account Executive",  initials: "PD", hue: 160, region: "APAC", team: "newbiz",
    email: "paul.dourlay@kineo.com.au",
    skips: [], links: {} },
  { id: "andrew",   name: "Andrew Bennett",          role: "Account Executive",  initials: "AB", hue: 30,  region: "APAC", team: "newbiz",
    email: "andrew.bennett@kineo.com.au",
    skips: [], links: {} },
  { id: "annum",    name: "Annum Sikander",          role: "Account Executive",  initials: "AS", hue: 290, region: "APAC", team: "newbiz",
    email: "annum.sikander@kineo.com.au",
    skips: [], links: {} },
  // APAC CS — activated 2026-07-10 (same skips as EMEA CS five).
  { id: "angela",   name: "Angela Beck",             role: "Customer Success Manager", initials: "AB", hue: 185, region: "APAC", team: "cs",
    email: "angela.beck@mindtools-kineo.com",
    skips: ["outreach", "commitments"], links: {} },
  { id: "sarah",    name: "Sarah Flynn",             role: "Customer Success Manager", initials: "SF", hue: 50,  region: "APAC", team: "cs",
    email: "sarah.flynn@mindtools-kineo.com",
    skips: ["outreach", "commitments"], links: {} },
  { id: "aaron",    name: "Aaron Mathew",            role: "Customer Success Manager", initials: "AM", hue: 220, region: "APAC", team: "cs",
    email: "aaron.mathew@mindtools-kineo.com",
    skips: ["outreach", "commitments"], links: {} },
  { id: "suzanne",  name: "Suzanne Grennan",         role: "Customer Success Manager", initials: "SG", hue: 340, region: "APAC", team: "cs",
    email: "suzanne.grennan@mindtools-kineo.com",
    skips: ["outreach", "commitments"], links: {} },
  { id: "cindy",    name: "Cindy Nguyen",            role: "Customer Success Manager", initials: "CN", hue: 105, region: "APAC", team: "cs",
    email: "cindy.nguyen@mindtools-kineo.com",
    skips: ["outreach", "commitments"], links: {} },
];

// Deliverables — the three weekly artifacts. Order matters; this is the
// canonical sequence shown in every rep's week.
const DELIVERABLES = [
  {
    id: "wins",
    title: "Weekly Wins",
    short: "What closed, what advanced, what you learned.",
    why: "Wins compound. Naming them out loud — even small ones — keeps the team's belief loop tight and shows me where momentum is building.",
    docLabel: "Open the Wins spreadsheet",
    docHref: "#wins-doc",
    icon: "wins",
  },
  {
    id: "outreach",
    title: "Tier A Outreach",
    short: "Tiered, multi-channel touches against your 10-account focus list — all scheduled tasks completed.",
    why: "Tiered outreach beats volume. Logging it makes the pattern visible — to you first, to me second — so we can coach the motion, not just the number.",
    note: "Tracked in Apollo — no separate doc.",
    docLabel: null,
    docHref: null,
    icon: "outreach",
    // Retired as a weekly requirement from w12 (2026-07-13) onward. Weeks 1–11
    // keep it — history and past attainment are unchanged; see deliverablesForWeek().
    activeThrough: 11,
  },
  {
    id: "sf-hygiene",
    title: "Salesforce Hygiene",
    short: "All SF activities — emails, calls, meetings — documented in Salesforce.",
    why: "If it isn't in SF, it didn't happen. Clean activity data is how we forecast honestly, hand off cleanly, and prove the motion is working when it's working.",
    docLabel: "Open Salesforce",
    docHref: "#sf-doc",
    icon: "commitments",
  },
  {
    id: "commitments",
    title: "Weekly Tracker",
    short: "What you committed last week, what you delivered, what's still open.",
    why: "Follow-up is what turns a commitment into a result. Closing the loop is how trust gets built — in both directions, every week.",
    docLabel: "Open the tracker",
    docHref: "#commitments-doc",
    icon: "tracker",
    // Retired as a weekly requirement from w12 (2026-07-13) onward. Weeks 1–11
    // keep it — history and past attainment are unchanged; see deliverablesForWeek().
    activeThrough: 11,
  },
  {
    id: "standup",
    title: "Daily Standup",
    short: "Post your standup every weekday — what moved, what's next, what's slowing you, what you need.",
    why: "Daily reps compound. A quick written check-in keeps blockers visible the day they surface — not a week later. Tuesdays and Thursdays we also talk it through live.",
    note: "Tue & Thu live · Mon/Wed/Fri async — completion is tracked automatically from your posts.",
    docLabel: null,
    docHref: null,
    auto: true,
    icon: "standup",
  },
];

// Deliverables in force for a given week (by 1-based week index). A deliverable
// with `activeThrough: N` is required through week N and gone from N+1 onward —
// the same temporal model reps use via `activeThrough`. Retirement is global
// (rep-independent); per-rep `skips` are layered on top by activeDeliverablesFor.
// This is what keeps history intact: past weeks (index <= activeThrough) still
// carry the deliverable, so their completion + attainment denominators are unchanged.
function deliverablesForWeek(weekIndex) {
  return DELIVERABLES.filter(d => d.activeThrough == null || weekIndex <= d.activeThrough);
}

// Deliverables a specific rep must complete in a given week: the week's in-force
// set minus that rep's skips. Callers that render a shared grid should use
// deliverablesForWeek() for the COLUMN set and null out skipped cells, so columns
// stay aligned across reps; use this when they only need one rep's own count.
function activeDeliverablesFor(rep, weekIndex) {
  const skips = (rep && rep.skips) || [];
  return deliverablesForWeek(weekIndex).filter(d => !skips.includes(d.id));
}

// Quarters — each starts on a Monday. Q2 dates (w1..w10) are frozen: storage
// keys and Supabase rows key on those week ids; never renumber or re-date them.
// Q3 continues the Monday cadence with no gap after Q2's last week.
const QUARTERS = [
  { id: "Q2", label: "Q2 2026", startMonday: new Date(2026, 3, 27), weekCount: 10 }, // Apr 27
  { id: "Q3", label: "Q3 2026", startMonday: new Date(2026, 6, 6),  weekCount: 13 }, // Jul 6
];

// Weeks — Monday-anchored, one continuous array across all quarters.
// Week label is the Monday date; "current" is the week containing today.
// Each week carries `quarter` (id) and `qIndex` (1-based within that quarter).
function buildWeeks() {
  const out = [];
  let globalIndex = 0;
  for (const q of QUARTERS) {
    for (let i = 0; i < q.weekCount; i++) {
      globalIndex++;
      const monday = new Date(q.startMonday);
      monday.setDate(q.startMonday.getDate() + i * 7);
      const friday = new Date(monday);
      friday.setDate(monday.getDate() + 4);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      out.push({
        id: `w${globalIndex}`,
        index: globalIndex,
        monday,
        friday,
        sunday,
        quarter: q.id,
        qIndex: i + 1,
      });
    }
  }
  return out;
}
const WEEKS = buildWeeks();

// Weeks belonging to one quarter, in order (subset of WEEKS).
function weeksForQuarter(quarterId) {
  return WEEKS.filter(w => w.quarter === quarterId);
}

// QUARTERS entry for a week object (null-safe).
function quarterForWeek(week) {
  if (!week || !week.quarter) return null;
  return QUARTERS.find(q => q.id === week.quarter) || null;
}

// "Today" anchor — real clock time, snapped to local midnight so the week
// containment check (today >= weeks[i].monday && today <= weeks[i].sunday)
// is stable across the day. Resolved once at script load; if the tab is
// left open across midnight the value won't roll forward, but a reload
// fixes it. Was hardcoded to a fixed dev date — that wedged the home
// page and nav header on the build-time week forever.
const TODAY = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();

function currentWeekIndex(weeks = WEEKS, today = TODAY) {
  for (let i = 0; i < weeks.length; i++) {
    if (today >= weeks[i].monday && today <= weeks[i].sunday) return i;
  }
  if (today < weeks[0].monday) return 0;
  return weeks.length - 1;
}

// Id of the quarter containing `today`. Clamp: before Q2 → "Q2"; after Q3's
// last Sunday → "Q3". On 2026-07-10 this returns "Q3".
function currentQuarterId(today = TODAY) {
  for (const q of QUARTERS) {
    const qw = weeksForQuarter(q.id);
    if (!qw.length) continue;
    const first = qw[0].monday;
    const last = qw[qw.length - 1].sunday;
    if (today >= first && today <= last) return q.id;
  }
  if (WEEKS.length && today < WEEKS[0].monday) return QUARTERS[0].id;
  return QUARTERS[QUARTERS.length - 1].id;
}

// Whether a rep should appear in a given week. A rep with `activeThrough: N`
// (e.g. departed mid-cycle) shows in weeks 1..N — their history — and is hidden
// from week N+1 onward. Reps without the marker are always visible.
// A rep with `emit: false` is never rendered unless showHidden is true.
// weekIndex is the 1-based WEEKS[i].index, NOT the 0-based array position.
function repVisibleInWeek(rep, weekIndex, showHidden) {
  if (!rep) return false;
  if (!showHidden && rep.emit === false) return false;
  if (rep.activeThrough != null && weekIndex > rep.activeThrough) return false;
  return true;
}

// Date formatting helpers
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
function fmtShort(d) { return `${MONTHS[d.getMonth()]} ${d.getDate()}`; }
function fmtLong(d)  { return `${MONTHS_LONG[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; }
function fmtRange(a, b) {
  if (a.getMonth() === b.getMonth()) return `${MONTHS[a.getMonth()]} ${a.getDate()}–${b.getDate()}`;
  return `${fmtShort(a)} – ${fmtShort(b)}`;
}

// State key helpers
const STORAGE_KEY = "mtk-weekly-review-v1";
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return seedState();
}
function saveState(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch(e) {}
}
function checkKey(repId, weekId, delId) { return `${repId}|${weekId}|${delId}`; }

// ── Standup-as-deliverable ───────────────────────────────────────────────────
// The "Daily Standup" deliverable isn't a manual checkbox — it's derived from
// how many of the week's required standups the rep actually filled in.
// `state.standupFills` maps `repId|weekId` → array of YYYY-MM-DD dates the rep
// posted something on. The cadence / required-day logic lives in standup.jsx
// (window.standupRequiredDates), keeping a single source of truth.

// Which WEEK (object) a YYYY-MM-DD date falls in, or null if outside the program.
function weekForDate(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  for (const w of WEEKS) { if (dt >= w.monday && dt <= w.sunday) return w; }
  return null;
}

// A standup row "counts" only when one of the four prompt fields has real content.
function rowHasStandupContent(r) {
  return ["what_moved", "pushing_next", "whats_slowing", "what_i_need"]
    .some(k => ((r && r[k]) || "").trim().length > 0);
}

// Build the standupFills map ({ 'repId|weekId': ['YYYY-MM-DD', …] }) from raw
// standup_entries rows (Supabase or the local stub).
function standupFillsFromRows(rows) {
  const out = {};
  for (const r of (rows || [])) {
    if (!r || !r.date || !r.rep_id || !rowHasStandupContent(r)) continue;
    const w = weekForDate(r.date);
    if (!w) continue;
    const key = `${r.rep_id}|${w.id}`;
    if (!out[key]) out[key] = [];
    if (!out[key].includes(r.date)) out[key].push(r.date);
  }
  return out;
}

// Standup completion for one rep + week. `active` is false when no standups are
// required yet (weeks before the daily cutover, or the current week before its
// first daily standup) — then `done` is true so it never blocks a clean week.
function standupStatus(repId, week, state, today = TODAY) {
  const req = (typeof window !== "undefined" && window.standupRequiredDates)
    ? window.standupRequiredDates(week, today) : [];
  const fills = (state && state.standupFills && state.standupFills[`${repId}|${week.id}`]) || [];
  const fillSet = new Set(fills);
  const required = req.length;
  const filled = req.filter(dt => fillSet.has(dt)).length;
  const active = required > 0;
  return { required, filled, done: !active || filled >= required, active };
}

// Unified completion test: manual deliverables read state.checks; the auto
// "standup" deliverable derives from standup fills.
function delComplete(repId, week, delId, state) {
  if (delId === "standup") return standupStatus(repId, week, state).done;
  return !!(state.checks && state.checks[checkKey(repId, week.id, delId)]);
}

// Seed historical data — week 1 (Apr 27) was last week. The user wants reps
// to be able to check off historical items today during rollout, so we leave
// week 1 UNCHECKED but valid. We DO pre-seed a realistic-looking past pattern
// for prior weeks if we had any (we don't — the program starts week 1).
// We seed a couple of partial completions in week 1 to show what mid-rollout
// looks like, but everything else is unchecked and ready.
function seedState() {
  const checks = {};
  // Seed: a few reps already did some items in week 1 (Apr 27)
  // This makes the rollout feel like it's in motion, not cold.
  const seedPattern = [
    ["cammy",  "w1", "wins"],
    ["cammy",  "w1", "outreach"],
    ["brenda", "w1", "wins"],
    ["meri",   "w1", "sf-hygiene"],
    ["dwayne", "w1", "wins"],
  ];
  seedPattern.forEach(([r, w, d]) => { checks[checkKey(r, w, d)] = TODAY.toISOString(); });
  return { checks, notes: {}, asks: {}, managerNotes: {} };
}

// =====================================================================
// EMAIL EXPORT — builds a human-readable Friday recap and opens the
// rep's default mail client with the recap pre-filled. No backend, no
// attachments — just a mailto: link with subject + body.
//
// We build the body for *just the selected week* by default. The recap
// is structured so a manager scanning it can see status in 5 seconds:
//
//   Subject: Weekly Review — Cammy Bean — Week of May 4, 2026
//
//   Status: Closed clean ✅  (or  2 of 3 complete)
//
//   ✅ Weekly Wins      — done
//   ⬜ Outreach Tracker — open
//   ✅ Commitments      — done
//
//   Asks open this week:
//     • Weekly Wins → Need an intro to AZ procurement by Friday
//
//   ---
//   Sent from Mindtools Kineo · Weekly Review (V1)
// =====================================================================
function buildWeekEmail(rep, week, state) {
  const activeDels = activeDeliverablesFor(rep, week.index);
  const lines = [];

  // Greeting line — addressed to the lead
  lines.push(`Hi,`);
  lines.push(``);
  lines.push(`Here's my weekly review for ${fmtRange(week.monday, week.sunday)}.`);
  lines.push(``);

  // Status header
  const checks = activeDels.map(d => delComplete(rep.id, week, d.id, state));
  const done = checks.filter(Boolean).length;
  const total = activeDels.length;
  const clean = done === total;
  lines.push(clean ? `STATUS — Closed clean ✅` : `STATUS — ${done} of ${total} complete`);
  lines.push(``);

  // Per-deliverable list
  lines.push(`DELIVERABLES`);
  activeDels.forEach(d => {
    const isDone = delComplete(rep.id, week, d.id, state);
    const mark = isDone ? "✅" : "⬜";
    const label = d.title.padEnd(20, " ");
    lines.push(`  ${mark}  ${label}  ${isDone ? "done" : "open"}`);
  });
  lines.push(``);

  // Open asks
  const openAsks = activeDels
    .map(d => ({ d, ask: state.asks && state.asks[`${rep.id}|${week.id}|${d.id}`] }))
    .filter(x => x.ask);
  if (openAsks.length > 0) {
    lines.push(`ASKS — what I need to move things forward`);
    openAsks.forEach(({ d, ask }) => {
      lines.push(`  • ${d.title}: ${ask.text}`);
    });
    lines.push(``);
  }

  // Closing
  lines.push(`— ${rep.name}`);
  lines.push(``);
  lines.push(`---`);
  lines.push(`Sent from Mindtools Kineo · Weekly Review (V1 · personal copy)`);

  const subject = `Weekly Review — ${rep.name} — ${fmtRange(week.monday, week.sunday)}`;
  return { subject, body: lines.join("\n") };
}

// Build a full-quarter recap (used at end of cycle). Defaults to the quarter
// containing today; pass quarterId ("Q2" / "Q3") to pin a specific one.
function buildQuarterEmail(rep, state, quarterId = currentQuarterId()) {
  // activeDels is recomputed per week below — the in-force deliverable set
  // changes across the quarter (e.g. outreach/tracker retired from w12), so a
  // single top-level list would blend the wrong denominators.
  const qWeeks = weeksForQuarter(quarterId);
  const q = QUARTERS.find(x => x.id === quarterId);
  const qLabel = (q && q.label) || quarterId;
  const lines = [];
  lines.push(`Hi,`);
  lines.push(``);
  lines.push(`Quarterly recap — ${qLabel} — ${rep.name}.`);
  lines.push(``);

  let cleanWeeks = 0;
  qWeeks.forEach(w => {
    const activeDels = activeDeliverablesFor(rep, w.index);
    const checks = activeDels.map(d => delComplete(rep.id, w, d.id, state));
    const done = checks.filter(Boolean).length;
    const total = activeDels.length;
    const clean = done === total;
    if (clean) cleanWeeks++;
  });
  lines.push(`SUMMARY — ${cleanWeeks} of ${qWeeks.length} weeks closed clean.`);
  lines.push(``);

  qWeeks.forEach(w => {
    const activeDels = activeDeliverablesFor(rep, w.index);
    const checks = activeDels.map(d => delComplete(rep.id, w, d.id, state));
    const done = checks.filter(Boolean).length;
    const total = activeDels.length;
    const clean = done === total;
    const tag = clean ? "✅ closed clean" : `${done}/${total}`;
    lines.push(`Week ${w.index} — ${fmtRange(w.monday, w.sunday)}  (${tag})`);

    activeDels.forEach(d => {
      const isDone = delComplete(rep.id, w, d.id, state);
      lines.push(`    ${isDone ? "✅" : "⬜"}  ${d.title}`);
    });
    const openAsks = activeDels
      .map(d => ({ d, ask: state.asks && state.asks[`${rep.id}|${w.id}|${d.id}`] }))
      .filter(x => x.ask);
    if (openAsks.length > 0) {
      openAsks.forEach(({ d, ask }) => {
        lines.push(`    🚩  ${d.title} → ${ask.text}`);
      });
    }
    lines.push(``);
  });

  lines.push(`— ${rep.name}`);
  lines.push(``);
  lines.push(`---`);
  lines.push(`Sent from Mindtools Kineo · Weekly Review (V1 · personal copy)`);

  const subject = `Weekly Review — ${rep.name} — Quarterly recap — ${qLabel}`;
  return { subject, body: lines.join("\n") };
}

// Open the user's default mail client with a pre-filled message.
//
// Two problems we work around here:
//  1. Setting window.location.href = "mailto:..." navigates the current tab.
//     If the OS hand-off to the mail app is slow (or fails), the user is
//     left staring at a broken page. We use a hidden iframe instead — the
//     browser dispatches the mailto: handler without touching our tab.
//  2. Outlook web (Microsoft 365) chokes on long URLs:
//        AADSTS90015: Requested query string is too long.
//     mailto: bodies over ~2KB blow past the limit when the OS forwards
//     them to outlook.office.com. So if the body is long, we copy it to
//     the clipboard and open a short mailto: with just subject + a hint
//     telling the user to paste.
//
// Threshold of ~1500 chars chosen below the AAD limit with headroom.
const MAILTO_MAX = 1500;

async function openMailto({ subject, body, to = "" }) {
  const fullUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  // Long body → copy to clipboard, open a short mailto.
  if (fullUrl.length > MAILTO_MAX) {
    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(body);
        copied = true;
      }
    } catch (e) { copied = false; }

    const shortBody = copied
      ? "(The full recap was copied to your clipboard — paste it here with Ctrl+V / Cmd+V.)"
      : body.slice(0, 1000) + "\n\n…(truncated — full recap was too long for your mail client. Open the dashboard to see everything.)";
    const shortUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(shortBody)}`;
    fireMailto(shortUrl);
    return;
  }

  fireMailto(fullUrl);
}

// Use a temporary <a> element clicked programmatically. This is the
// most reliable way to invoke a mailto: handler — works in sandboxed
// iframes (e.g. Netlify previews), doesn't navigate the current page,
// and the OS routes to the user's default mail app.
function fireMailto(url) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener noreferrer";
  // No `target` — mailto: doesn't open a tab, the OS handles it.
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 0);
}

// ── Currency conversion ──────────────────────────────────────────────
// FX rates anchored to GBP (canonical base). Each entry is "how many units
// of this currency you get for 1 GBP". Rates are approximate and should be
// updated quarterly — they drive display-only conversions, not accounting.
const FX_RATES = {
  GBP: 1.00,
  USD: 1.27,
  AUD: 1.92,
  ZAR: 23.50,
};

// Display currencies for the toggle — these are the options the viewer can
// switch between on the target board. Order matters for the toggle UI.
const DISPLAY_CURRENCIES = ["GBP", "USD", "AUD"];

// Convert a monetary amount from one currency to another via GBP as the
// canonical anchor. "Native-per-region computation under the hood" — each
// region's native amounts convert individually, then sum.
function convertAmount(amount, fromCurrency, toCurrency) {
  if (amount == null || isNaN(amount)) return 0;
  if (!fromCurrency || !toCurrency || fromCurrency === toCurrency) return Math.round(amount);
  const fromRate = FX_RATES[fromCurrency];
  const toRate   = FX_RATES[toCurrency];
  if (!fromRate || !toRate) return Math.round(amount); // unknown currency → pass through
  return Math.round(amount * toRate / fromRate);
}

// Format a monetary amount for display with the correct currency symbol.
// GBP → £, USD → $, AUD → A$, everything else → bare number.
function formatCurrencyAmount(amount, currency) {
  const n = Math.round(amount || 0);
  const fmt = n.toLocaleString();
  switch (currency) {
    case "GBP": return `£${fmt}`;
    case "USD": return `$${fmt}`;
    case "AUD": return `A$${fmt}`;
    default:    return fmt;
  }
}

// ── Region grouping ──────────────────────────────────────────────────
// Regions for the team rollup. Each rep has a `region` tag.
const REGIONS = [
  { id: "US",   label: "North America",  badge: "$",  currency: "USD", timezone: "America/Chicago",  color: "#2563eb" },
  { id: "EMEA", label: "EMEA",           badge: "£",  currency: "GBP", timezone: "Europe/London",    color: "#7c3aed" },
  { id: "APAC", label: "APAC",           badge: "A$", currency: "AUD", timezone: "Australia/Sydney", color: "#0d9488" },
];

// Region object for a given rep — looks up by the rep's `region` tag vs REGIONS
function regionForRep(rep) {
  if (!rep || !rep.region) return null;
  return REGIONS.find(r => r.id === rep.region) || null;
}

// Build { regionId: [rep, …] } from REPS, filtering by week visibility.
// Optional teamId (RFC-151 Phase 4) scopes the grouping to one workspace;
// omitted = all teams (back-compatible).
function repsByRegion(weekIndex, teamId) {
  const map = {};
  for (const r of REPS) {
    if (!repVisibleInWeek(r, weekIndex)) continue;
    if (teamId && r.team !== teamId) continue;
    const rid = r.region;
    if (!rid) continue;
    if (!map[rid]) map[rid] = [];
    map[rid].push(r);
  }
  return map;
}

// Currency symbol helpers (used by target-board.jsx and attainment-data.jsx)
// currencySymbol(regionId) → "$" / "£" / "R"  (display badge)
function regionCurrency(regionId) {
  const r = REGIONS.find(x => x.id === regionId);
  return r ? r.badge : "$";
}
// Full ISO code: "USD" / "GBP" / "ZAR"
function regionCurrencyLong(regionId) {
  const r = REGIONS.find(x => x.id === regionId);
  return r ? r.currency : "USD";
}

// Canonical region sort order for the target board: US → EMEA → APAC
const REGION_ORDER = ["US", "EMEA", "APAC"];

// ── RFC-151: teams + team-scoped RBAC helpers ───────────────────────────────
// Client mirror of the Phase 2 RLS predicates (db/migration-team-rbac-rls.sql).
// Both sides MUST agree; RLS is the enforcement backstop if they ever drift.
// The server-side registry (public.teams / public.reps) is kept in lockstep
// with TEAMS / REPS[].team by tests/test_rfc151_reps_parity.py.
const TEAMS = [
  { id: "newbiz", label: "New Business (BD)", short: "NA BD",
    eyebrow: "North America BD · Weekly Operating Rhythm" },
  { id: "cs",     label: "Customer Success",  short: "CS",
    eyebrow: "Customer Success · Weekly Operating Rhythm" },
];

function repById(repId) {
  return REPS.find(r => r.id === repId) || null;
}

// Attribution stamps (markedBy/resolvedBy role strings): which stored role
// values carry manager-parity authority.
function isManagerialRole(role) {
  return role === "manager" || role === "team_admin";
}

// Can `user` perform manager-parity actions on `repId`'s rows?
// true for: the global manager; the rep themself (self-edit already applies);
// a team_admin whose adminScopes cover the rep's team AND region. Mirrors
// ratification R1: adminScopes grant nothing unless role is 'team_admin'.
function canManageRep(user, repId) {
  if (!user) return false;
  if (user.role === "manager") return true;
  if (user.rep_id && user.rep_id === repId) return true;
  if (user.role !== "team_admin") return false;
  const rep = repById(repId);
  if (!rep || !Array.isArray(user.adminScopes)) return false;
  return user.adminScopes.some(s => s.team_id === rep.team && s.region === rep.region);
}

// Does `user` have manager-parity capability over ANYONE (gates manager-only
// UI like the flag queue, rep pickers, standup edit-any)?
function canManageAny(user) {
  if (!user) return false;
  if (user.role === "manager") return true;
  return user.role === "team_admin"
    && Array.isArray(user.adminScopes) && user.adminScopes.length > 0;
}

// ── RFC-151 Phase 4: workspace model ────────────────────────────────────────
// Which team workspaces can `user` open? Global manager: every team (in
// TEAMS order); team_admin: the distinct teams their scopes cover; rep:
// their own team. The workspace switcher renders only when this has >1
// entry — Jeff switches, everyone else lands directly in their team.
function teamsForUser(user) {
  if (!user) return [];
  if (user.role === "manager") return TEAMS.map(t => t.id);
  if (user.role === "team_admin") {
    const scoped = new Set((user.adminScopes || []).map(s => s.team_id));
    return TEAMS.map(t => t.id).filter(id => scoped.has(id));
  }
  const rep = repById(user.rep_id);
  return rep ? [rep.team] : [];
}

// Landing workspace: the first team the user can access ('newbiz' keeps
// today's behavior for Jeff and as the safe fallback).
function defaultTeamForUser(user) {
  return teamsForUser(user)[0] || "newbiz";
}

// ── RFC-152: viewerScope ────────────────────────────────────────────────────
// Region-axis scope for the multi-region dashboard. Computed once at App
// level (like teamsForUser for the team axis) and threaded as viewerScope.
// locked=true → no region pill; the single region is applied unconditionally.
// locked=false → pill All/NA/EMEA/APAC, clamped to scope.regions.
function viewerScopeForUser(user) {
  if (!user) return { regions: [], locked: true };
  if (user.role === "manager") {
    return { regions: REGION_ORDER.slice(), locked: false };
  }
  if (user.role === "team_admin") {
    const allowed = new Set(REGION_ORDER);
    const seen = new Set();
    for (const s of user.adminScopes || []) {
      if (s && allowed.has(s.region)) seen.add(s.region);
    }
    const regions = REGION_ORDER.filter(id => seen.has(id));
    return { regions, locked: regions.length <= 1 };
  }
  // rep (and any other non-managerial role): own region only
  const rep = repById(user.rep_id);
  return { regions: rep && rep.region ? [rep.region] : [], locked: true };
}

// Resolve the active region set under a scope + optional pill selection.
// Falsy scope → unrestricted (defensive fallback = full REGION_ORDER).
// Valid pill contained in scope.regions narrows to [pill]; invalid pill ignored.
function regionsUnderScope(scope, pill) {
  if (!scope) return REGION_ORDER.slice();
  if (pill && scope.regions && scope.regions.includes(pill)) return [pill];
  return scope.regions;
}

// REPS visible for a week under team + viewerScope ∩ pill filters.
// teamId optional (null/undefined = all teams). Composes with repVisibleInWeek.
function repsUnderScope(weekIndex, teamId, scope, pill) {
  const regions = new Set(regionsUnderScope(scope, pill));
  return REPS.filter(rep => {
    if (!repVisibleInWeek(rep, weekIndex)) return false;
    if (teamId && rep.team !== teamId) return false;
    return regions.has(rep.region);
  });
}

// Compact region label for pills/badges: US → "NA", else the region id.
function regionShortLabel(regionId) {
  return regionId === "US" ? "NA" : regionId;
}

// Short timezone name for a region's IANA zone at `date` (default now).
// e.g. "CDT", "BST", "AEST". Unknown region → "CT" fallback.
function zoneAbbrev(regionId, date) {
  const region = REGIONS.find(r => r.id === regionId);
  if (!region) return "CT";
  const d = date || new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: region.timezone,
    timeZoneName: "short",
  }).formatToParts(d);
  const tz = parts.find(p => p.type === "timeZoneName");
  return tz ? tz.value : "CT";
}

// UTC instant of `hour`:00 on week.friday IN the region's IANA timezone.
// e.g. US (America/Chicago, CDT=UTC-5) Friday 5 PM → 22:00 UTC same day.
// No timezone libraries available (Babel-standalone browser) — probe the
// zone's UTC offset via Intl.DateTimeFormat, then one re-check for DST edges.
// Unknown region → browser-local Friday at hour:00 (prior behavior).
function dueInstantForRegion(week, regionId, hour = 17) {
  if (!week || !week.friday) return null;
  const y = week.friday.getFullYear();
  const m = week.friday.getMonth();
  const d = week.friday.getDate();

  const region = REGIONS.find(r => r.id === regionId);
  if (!region || !region.timezone) {
    const local = new Date(week.friday);
    local.setHours(hour, 0, 0, 0);
    return local;
  }

  // offsetMs = (wall-clock components interpreted as UTC) − true UTC ms.
  // Positive when the zone is ahead of UTC (e.g. +1h for BST).
  function offsetMsAt(utcMs, timeZone) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(new Date(utcMs));
    const get = type => {
      const p = parts.find(x => x.type === type);
      return p ? Number(p.value) : 0;
    };
    let h = get("hour");
    if (h === 24) h = 0; // ICU midnight quirk under some engines
    const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), h, get("minute"), get("second"));
    return asUTC - utcMs;
  }

  // Desired wall clock in-zone as if it were UTC numbers, then subtract offset.
  const wallAsUTC = Date.UTC(y, m, d, hour, 0, 0);
  let offset = offsetMsAt(wallAsUTC, region.timezone);
  let utcMs = wallAsUTC - offset;
  // Re-check offset at the computed instant (DST transition edges).
  offset = offsetMsAt(utcMs, region.timezone);
  utcMs = wallAsUTC - offset;
  return new Date(utcMs);
}

// Cadence due-label localized to the region's timezone abbreviation.
function dueLabelForRegion(regionId) {
  return `Due Friday 5 PM ${zoneAbbrev(regionId)}`;
}

// ── RFC-163: Team Briefs client policy mirror + time helpers ───────────────
// These helpers drive UI affordances and focused tests. Supabase RLS and the
// publish RPC remain the enforcement boundary.
const TEAM_BRIEF_TYPES = [
  "morning_message",
  "fyi",
  "reminder",
  "action_required",
];
const TEAM_BRIEF_AUDIENCE_MODES = ["sales_all", "region", "team", "team_region"];
const TEAM_BRIEF_DISPLAY_RULES = [
  "today_only",
  "for_days",
  "until_acknowledged",
  "until_date",
  "manual_clear",
];
const TEAM_BRIEF_COMMENT_MAX_LENGTH = 2000;
const TEAM_BRIEF_SOON_DAYS = 3;

function teamBriefAudiencePairs(audienceOrMode, teamId, regionId) {
  const spec = typeof audienceOrMode === "object" && audienceOrMode
    ? audienceOrMode
    : {
        audience_mode: audienceOrMode,
        audience_team_id: teamId || null,
        audience_region: regionId || null,
      };
  const mode = spec.audience_mode;
  const team = spec.audience_team_id || null;
  const region = spec.audience_region || null;

  if (mode === "sales_all") {
    return TEAMS.flatMap(t => REGION_ORDER.map(r => ({ team_id: t.id, region: r })));
  }
  if (mode === "region" && REGION_ORDER.includes(region)) {
    return TEAMS.map(t => ({ team_id: t.id, region }));
  }
  if (mode === "team" && TEAMS.some(t => t.id === team)) {
    return REGION_ORDER.map(r => ({ team_id: team, region: r }));
  }
  if (
    mode === "team_region"
    && TEAMS.some(t => t.id === team)
    && REGION_ORDER.includes(region)
  ) {
    return [{ team_id: team, region }];
  }
  return [];
}

function canPublishTeamBrief(user, audience) {
  if (!user) return false;
  const pairs = teamBriefAudiencePairs(audience);
  if (!pairs.length) return false;
  if (user.role === "manager") return true;
  if (user.role !== "team_admin" || !Array.isArray(user.adminScopes)) return false;
  return pairs.every(pair =>
    user.adminScopes.some(scope =>
      scope.team_id === pair.team_id && scope.region === pair.region
    )
  );
}

function teamBriefAudienceMatches(rep, audience) {
  if (!rep || !audience) return false;
  const repTeam = rep.team_id || rep.team;
  if (!TEAMS.some(team => team.id === repTeam) || !REGION_ORDER.includes(rep.region)) return false;
  const mode = audience.audience_mode;
  if (mode === "sales_all") return true;
  if (mode === "region") return rep.region === audience.audience_region;
  if (mode === "team") return repTeam === audience.audience_team_id;
  if (mode === "team_region") {
    return repTeam === audience.audience_team_id && rep.region === audience.audience_region;
  }
  return false;
}

// Pure mirror of the publish RPC's materialization query. Only active roster
// reps with a real rep-role users row count in read-receipt denominators.
function expandTeamBriefAudience(users, reps, audience) {
  const repMap = new Map((reps || []).map(rep => [rep.rep_id || rep.id, rep]));
  const seenAuth = new Set();
  const seenRep = new Set();
  const out = [];
  for (const user of (users || [])) {
    if (!user || user.role !== "rep" || !user.auth_id || !user.rep_id) continue;
    const rep = repMap.get(user.rep_id);
    if (!rep || rep.active === false || !teamBriefAudienceMatches(rep, audience)) continue;
    if (seenAuth.has(user.auth_id) || seenRep.has(user.rep_id)) {
      throw new Error("Duplicate Team Brief audience seating");
    }
    seenAuth.add(user.auth_id);
    seenRep.add(user.rep_id);
    out.push({
      auth_id: user.auth_id,
      rep_id: user.rep_id,
      team_id: rep.team_id || rep.team,
      region: rep.region,
    });
  }
  return out;
}

function teamBriefAudienceLabel(brief) {
  if (!brief) return "Unknown audience";
  const teamLabel = brief.audience_team_id === "newbiz" ? "BD" : "CS";
  const regionLabel = brief.audience_region === "US" ? "North America" : brief.audience_region;
  if (brief.audience_mode === "sales_all") return "All Sales";
  if (brief.audience_mode === "region") return regionLabel || "Region";
  if (brief.audience_mode === "team") return teamLabel;
  if (brief.audience_mode === "team_region") return `${teamLabel} ${regionLabel || ""}`.trim();
  return "Unknown audience";
}

function teamBriefTimezoneForAudience(audience, fallbackRegion) {
  const regionId =
    audience && (audience.audience_mode === "region" || audience.audience_mode === "team_region")
      ? audience.audience_region
      : fallbackRegion;
  const region = REGIONS.find(r => r.id === regionId) || REGIONS[0];
  return region.timezone;
}

function _zoneOffsetMsAt(utcMs, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = type => {
    const part = parts.find(p => p.type === type);
    return part ? Number(part.value) : 0;
  };
  let hour = get("hour");
  if (hour === 24) hour = 0;
  return Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second")
  ) - utcMs;
}

// Convert an HTML datetime-local value into a concrete instant in `timeZone`.
// Returns null for malformed values or unsupported zones.
function zonedLocalDateTimeToIso(localValue, timeZone) {
  const match = String(localValue || "").match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
  );
  if (!match || !timeZone) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] || 0);
  const wallAsUTC = Date.UTC(year, month - 1, day, hour, minute, second);
  try {
    let offset = _zoneOffsetMsAt(wallAsUTC, timeZone);
    let instant = wallAsUTC - offset;
    offset = _zoneOffsetMsAt(instant, timeZone);
    instant = wallAsUTC - offset;
    return new Date(instant).toISOString();
  } catch {
    return null;
  }
}

function _teamBriefLocalDayNumber(value, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const get = type => Number(parts.find(p => p.type === type).value);
  return Date.UTC(get("year"), get("month") - 1, get("day")) / 86400000;
}

function teamBriefUrgency(brief, now) {
  if (!brief || !brief.due_at) return "normal";
  const current = now ? new Date(now) : new Date();
  const due = new Date(brief.due_at);
  if (!Number.isFinite(due.getTime())) return "normal";
  if (due.getTime() <= current.getTime()) return "overdue";
  const timeZone = brief.timezone || REGIONS[0].timezone;
  try {
    const days = _teamBriefLocalDayNumber(due, timeZone)
      - _teamBriefLocalDayNumber(current, timeZone);
    if (days <= 0) return "today";
    if (days === 1) return "tomorrow";
    if (days <= TEAM_BRIEF_SOON_DAYS) return "soon";
  } catch {
    const days = Math.ceil((due.getTime() - current.getTime()) / 86400000);
    if (days <= 1) return "tomorrow";
    if (days <= TEAM_BRIEF_SOON_DAYS) return "soon";
  }
  return "normal";
}

function teamBriefIsVisible(brief, acknowledged, now) {
  if (!brief || brief.status !== "published" || brief.archived_at) return false;
  const currentMs = now ? new Date(now).getTime() : Date.now();
  const publishMs = new Date(brief.publish_at).getTime();
  if (Number.isFinite(publishMs) && publishMs > currentMs) return false;
  if (brief.expires_at) {
    const expiresMs = new Date(brief.expires_at).getTime();
    if (Number.isFinite(expiresMs) && expiresMs <= currentMs) return false;
  }
  if (brief.display_rule === "until_acknowledged" && acknowledged) return false;
  return true;
}

function normalizeTeamBriefComment(body) {
  const value = String(body == null ? "" : body).trim();
  if (!value) return { ok: false, value: "", error: "Comment cannot be empty." };
  if (value.length > TEAM_BRIEF_COMMENT_MAX_LENGTH) {
    return {
      ok: false,
      value,
      error: `Comment must be ${TEAM_BRIEF_COMMENT_MAX_LENGTH} characters or fewer.`,
    };
  }
  return { ok: true, value, error: null };
}

// ── RFC-152 follow-up: URL state ────────────────────────────────────────────
// Pure helpers for App deep-links. Invalid values → null (never throw).
// serialize preserves unknown params (demo=, standup date=) untouched.

const _URL_STATE_KEYS = ["view", "week", "region", "rep"];
const _VIEW_RE = /^[a-z][a-z0-9-]*$/;
const _WEEK_RE = /^w\d+$/;

// Parse a query string (with or without leading '?') into managed URL state.
// Unknown params ignored. Each field is string-or-null after validation.
function parseUrlState(search) {
  const params = new URLSearchParams(search || "");
  const rawView = params.get("view");
  const rawWeek = params.get("week");
  const rawRegion = params.get("region");
  const rawRep = params.get("rep");

  const view = rawView && _VIEW_RE.test(rawView) ? rawView : null;
  const week =
    rawWeek && _WEEK_RE.test(rawWeek) && WEEKS.some(w => w.id === rawWeek)
      ? rawWeek
      : null;
  const region =
    rawRegion && REGION_ORDER.includes(rawRegion) ? rawRegion : null;
  const rep = rawRep && repById(rawRep) ? rawRep : null;

  return { view, week, region, rep };
}

// Build a new query string from managed state + the current search.
// null/undefined members remove that param; other existing params (demo=,
// date=, …) stay in original order, then managed keys view/week/region/rep.
function serializeUrlState(state, currentSearch) {
  const existing = new URLSearchParams(currentSearch || "");
  const managed = new Set(_URL_STATE_KEYS);
  const out = new URLSearchParams();

  for (const [key, value] of existing.entries()) {
    if (!managed.has(key)) out.append(key, value);
  }

  const s = state || {};
  for (const key of _URL_STATE_KEYS) {
    const val = s[key];
    if (val != null) out.set(key, String(val));
  }

  const qs = out.toString();
  return qs ? `?${qs}` : "";
}

// Expose globally for other Babel scripts
Object.assign(window, {
  REPS, DELIVERABLES, WEEKS, TODAY, QUARTERS,
  REGIONS, regionForRep, repsByRegion,
  regionCurrency, regionCurrencyLong, REGION_ORDER,
  TEAMS, repById, isManagerialRole, canManageRep, canManageAny,
  teamsForUser, defaultTeamForUser,
  viewerScopeForUser, regionsUnderScope, repsUnderScope,
  regionShortLabel, zoneAbbrev, dueInstantForRegion, dueLabelForRegion,
  TEAM_BRIEF_TYPES, TEAM_BRIEF_AUDIENCE_MODES, TEAM_BRIEF_DISPLAY_RULES,
  TEAM_BRIEF_COMMENT_MAX_LENGTH, TEAM_BRIEF_SOON_DAYS,
  teamBriefAudiencePairs, canPublishTeamBrief, teamBriefAudienceMatches,
  expandTeamBriefAudience, teamBriefAudienceLabel,
  teamBriefTimezoneForAudience, zonedLocalDateTimeToIso,
  teamBriefUrgency, teamBriefIsVisible, normalizeTeamBriefComment,
  parseUrlState, serializeUrlState,
  FX_RATES, DISPLAY_CURRENCIES,
  convertAmount, formatCurrencyAmount,
  currentWeekIndex, repVisibleInWeek,
  deliverablesForWeek, activeDeliverablesFor,
  weeksForQuarter, quarterForWeek, currentQuarterId,
  fmtShort, fmtLong, fmtRange, DAYS,
  loadState, saveState, checkKey,
  weekForDate, standupFillsFromRows, standupStatus, delComplete,
  buildWeekEmail, buildQuarterEmail, openMailto,
});
