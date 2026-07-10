// Team + week data model. Designed to be EXTENSIBLE:
// to add new deliverables later, append to DELIVERABLES.
// The state engine doesn't care how many there are.

const REPS = [
  { id: "cammy",   name: "Cammy Bean",              role: "Account Director",   initials: "CB", hue: 168, region: "US", team: "newbiz",
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
  { id: "farah",   name: "Farah Issa",              role: "Account Executive",  initials: "FI", hue: 210, region: "US", team: "newbiz",
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
    skips: ["outreach", "commitments"],
    links: { wins: "https://mindtoolsltd-my.sharepoint.com/:x:/g/personal/jhamons_mindtools_com/IQBq1QCblu_vR7UurBDtei4uATcZNDT5XW_uoZOYYUzNJEw?e=0OOyTb&nav=MTVfezg2NzczMkNCLTA2NTEtQjA0NC1BOUZFLTY4N0M0NkE0NEREQX0" } },
  { id: "meri",    name: "Meri Tosh",               role: "Customer Success",   initials: "MT", hue: 130, region: "US", team: "cs",
    skips: ["outreach", "commitments"],
    links: { wins: "https://mindtoolsltd-my.sharepoint.com/:x:/g/personal/jhamons_mindtools_com/IQBq1QCblu_vR7UurBDtei4uATcZNDT5XW_uoZOYYUzNJEw?e=bzuua5&nav=MTVfezg3OUJBRDY5LTZCNUQtNkQ0Ny05RDQwLTE0ODlCNzlDOTM5Rn0" } },
  // EMEA CS reps — Lara's team, RFC-151 Open Question 1 answered 2026-07-02.
  // (Irvin Haskell in the org chart IS the existing `dwayne` entry; Dwayne +
  // Meri are the NA CS pair.) Activated with Phase 4's CS workspace — they
  // render only inside the CS section, so BD views are unaffected.
  { id: "laura",    name: "Laura Blackmore",         role: "Customer Success Manager",        initials: "LB", hue: 330, region: "EMEA", team: "cs",
    skips: ["outreach", "commitments"], links: {} },
  { id: "owen",     name: "Owen Bolding",            role: "Senior Customer Success Manager", initials: "OB", hue: 55,  region: "EMEA", team: "cs",
    skips: ["outreach", "commitments"], links: {} },
  { id: "james",    name: "James Brooke",            role: "Customer Success Manager",        initials: "JB", hue: 95,  region: "EMEA", team: "cs",
    skips: ["outreach", "commitments"], links: {} },
  { id: "rowan",    name: "Rowan Donoghue",          role: "Customer Success Manager",        initials: "RD", hue: 250, region: "EMEA", team: "cs",
    skips: ["outreach", "commitments"], links: {} },
  { id: "alex",     name: "Alex Martin",             role: "Customer Success Manager",        initials: "AM", hue: 20,  region: "EMEA", team: "cs",
    skips: ["outreach", "commitments"], links: {} },
  // EMEA stubs (emit: false — not yet active, always in data)
  { id: "rory",     name: "Rory Lawson",             role: "Account Director",   initials: "RL", hue: 200, region: "EMEA", team: "newbiz",
    emit: false, activeThrough: null, links: {} },
  { id: "stephen",  name: "Stephen Mackenzie",       role: "Account Director",   initials: "SM", hue: 200, region: "EMEA", team: "newbiz",
    emit: false, activeThrough: null, links: {} },
  { id: "simon",    name: "Simon Bailie",            role: "Account Director",   initials: "SB", hue: 200, region: "EMEA", team: "newbiz",
    emit: false, activeThrough: null, links: {} },
  { id: "matthew",  name: "Matthew Saward",          role: "Account Director",   initials: "MS", hue: 200, region: "EMEA", team: "newbiz",
    emit: false, activeThrough: null, links: {} },
  // ZA stubs
  { id: "paul",     name: "Paul Welch",              role: "Account Director",   initials: "PW", hue: 200, region: "ZA", team: "newbiz",
    emit: false, activeThrough: null, links: {} },
  { id: "mike",     name: "Mike Cawood",             role: "Account Director",   initials: "MC", hue: 200, region: "ZA", team: "newbiz",
    emit: false, activeThrough: null, links: {} },
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

// Weeks — Monday-anchored, 10 weeks from Apr 27, 2026 → Jun 29, 2026.
// Week label is the Monday date; "current" is the week containing today.
function buildWeeks() {
  const start = new Date(2026, 3, 27); // Apr 27, 2026 (month is 0-indexed)
  const out = [];
  for (let i = 0; i < 10; i++) {
    const monday = new Date(start);
    monday.setDate(start.getDate() + i * 7);
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    out.push({
      id: `w${i + 1}`,
      index: i + 1,
      monday,
      friday,
      sunday,
    });
  }
  return out;
}
const WEEKS = buildWeeks();

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
  const skips = rep.skips || [];
  const activeDels = DELIVERABLES.filter(d => !skips.includes(d.id));
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

// Build a full-quarter recap (used at end of cycle)
function buildQuarterEmail(rep, state) {
  const skips = rep.skips || [];
  const activeDels = DELIVERABLES.filter(d => !skips.includes(d.id));
  const lines = [];
  lines.push(`Hi,`);
  lines.push(``);
  lines.push(`Quarterly recap — ${rep.name}.`);
  lines.push(``);

  let cleanWeeks = 0;
  WEEKS.forEach(w => {
    const checks = activeDels.map(d => delComplete(rep.id, w, d.id, state));
    const done = checks.filter(Boolean).length;
    const total = activeDels.length;
    const clean = done === total;
    if (clean) cleanWeeks++;
  });
  lines.push(`SUMMARY — ${cleanWeeks} of ${WEEKS.length} weeks closed clean.`);
  lines.push(``);

  WEEKS.forEach(w => {
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

  const subject = `Weekly Review — ${rep.name} — Quarterly Recap`;
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
  { id: "ZA",   label: "South Africa",   badge: "R",  currency: "ZAR", timezone: "Africa/Johannesburg", color: "#0891b2" },
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

// Canonical region sort order for the target board: US → EMEA → ZA
const REGION_ORDER = ["US", "EMEA", "ZA"];

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

// Expose globally for other Babel scripts
Object.assign(window, {
  REPS, DELIVERABLES, WEEKS, TODAY,
  REGIONS, regionForRep, repsByRegion,
  regionCurrency, regionCurrencyLong, REGION_ORDER,
  TEAMS, repById, isManagerialRole, canManageRep, canManageAny,
  teamsForUser, defaultTeamForUser,
  FX_RATES, DISPLAY_CURRENCIES,
  convertAmount, formatCurrencyAmount,
  currentWeekIndex, repVisibleInWeek,
  fmtShort, fmtLong, fmtRange, DAYS,
  loadState, saveState, checkKey,
  weekForDate, standupFillsFromRows, standupStatus, delComplete,
  buildWeekEmail, buildQuarterEmail, openMailto,
});
