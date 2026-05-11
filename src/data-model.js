// Team + week data model. Designed to be EXTENSIBLE:
// to add new deliverables later, append to DELIVERABLES.
// The state engine doesn't care how many there are.

const REPS = [
  { id: "cammy",   name: "Cammy Bean",              role: "Account Director",   initials: "CB", hue: 168,
    skips: [],
    links: {
      wins: "https://mindtoolsltd-my.sharepoint.com/:x:/g/personal/jhamons_mindtools_com/IQBq1QCblu_vR7UurBDtei4uATcZNDT5XW_uoZOYYUzNJEw?e=Rxvq5P",
      commitments: "https://mindtoolsltd-my.sharepoint.com/:x:/g/personal/jhamons_mindtools_com/IQBuhNbqR8nYTKMa9sY_3p8xAdPrDpNdxx2XoWr0Mc-O7ys?e=DvUMnf",
    } },
  { id: "brenda",  name: "Brenda Bravener-Greville", role: "Senior AE",          initials: "BB", hue: 18,
    skips: [],
    links: {
      wins: "https://mindtoolsltd-my.sharepoint.com/:x:/g/personal/jhamons_mindtools_com/IQBq1QCblu_vR7UurBDtei4uATcZNDT5XW_uoZOYYUzNJEw?e=ZnLAD9&nav=MTVfezAwMDAwMDAwLTAwMDEtMDAwMC0wMjAwLTAwMDAwMDAwMDAwMH0",
      commitments: "https://mindtoolsltd-my.sharepoint.com/:x:/g/personal/jhamons_mindtools_com/IQDr0IFSv9s5R5_APq-I1sj9AXDUOQ2y_UlVlpZviyNTRlk?e=fx78m5",
    } },
  { id: "farah",   name: "Farah Issa",              role: "Account Executive",  initials: "FI", hue: 210,
    skips: [],
    links: {
      wins: "https://mindtoolsltd-my.sharepoint.com/:x:/g/personal/jhamons_mindtools_com/IQBq1QCblu_vR7UurBDtei4uATcZNDT5XW_uoZOYYUzNJEw?e=VeYQ0C&nav=MTVfezAwMDAwMDAwLTAwMDEtMDAwMC0wMTAwLTAwMDAwMDAwMDAwMH0",
      commitments: "https://mindtoolsltd-my.sharepoint.com/:x:/g/personal/jhamons_mindtools_com/IQBPIeHopSD9TKouVkmtbRtAAbws9qXWmZxz8IMtd1U8QrU?e=A1Ye1Y",
    } },
  { id: "don",     name: "TBD",                     role: "Senior Account Executive", initials: "—", hue: 38,
    skips: [],
    links: {} },
  { id: "dwayne",  name: "Dwayne Haskell",          role: "Customer Success",   initials: "DH", hue: 280,
    skips: ["outreach", "commitments"],
    links: { wins: "https://mindtoolsltd-my.sharepoint.com/:x:/g/personal/jhamons_mindtools_com/IQBq1QCblu_vR7UurBDtei4uATcZNDT5XW_uoZOYYUzNJEw?e=0OOyTb&nav=MTVfezg2NzczMkNCLTA2NTEtQjA0NC1BOUZFLTY4N0M0NkE0NEREQX0" } },
  { id: "meri",    name: "Meri Tosh",               role: "Customer Success",   initials: "MT", hue: 130,
    skips: ["outreach", "commitments"],
    links: { wins: "https://mindtoolsltd-my.sharepoint.com/:x:/g/personal/jhamons_mindtools_com/IQBq1QCblu_vR7UurBDtei4uATcZNDT5XW_uoZOYYUzNJEw?e=bzuua5&nav=MTVfezg3OUJBRDY5LTZCNUQtNkQ0Ny05RDQwLTE0ODlCNzlDOTM5Rn0" } },
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
    why: "Follow-up is the F in CHEF. This is the loop that closes — it's how trust gets built between us, in both directions.",
    docLabel: "Open the tracker",
    docHref: "#commitments-doc",
    icon: "tracker",
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

// "Today" anchor — May 4, 2026 per system info. Used to determine current
// week and to seed which weeks have historical data populated.
const TODAY = new Date(2026, 4, 4); // May 4, 2026 (Monday of week 2)

function currentWeekIndex(weeks = WEEKS, today = TODAY) {
  for (let i = 0; i < weeks.length; i++) {
    if (today >= weeks[i].monday && today <= weeks[i].sunday) return i;
  }
  if (today < weeks[0].monday) return 0;
  return weeks.length - 1;
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
  const checks = activeDels.map(d => !!state.checks[checkKey(rep.id, week.id, d.id)]);
  const done = checks.filter(Boolean).length;
  const total = activeDels.length;
  const clean = done === total;
  lines.push(clean ? `STATUS — Closed clean ✅` : `STATUS — ${done} of ${total} complete`);
  lines.push(``);

  // Per-deliverable list
  lines.push(`DELIVERABLES`);
  activeDels.forEach(d => {
    const isDone = !!state.checks[checkKey(rep.id, week.id, d.id)];
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
    const checks = activeDels.map(d => !!state.checks[checkKey(rep.id, w.id, d.id)]);
    const done = checks.filter(Boolean).length;
    const total = activeDels.length;
    const clean = done === total;
    if (clean) cleanWeeks++;
  });
  lines.push(`SUMMARY — ${cleanWeeks} of ${WEEKS.length} weeks closed clean.`);
  lines.push(``);

  WEEKS.forEach(w => {
    const checks = activeDels.map(d => !!state.checks[checkKey(rep.id, w.id, d.id)]);
    const done = checks.filter(Boolean).length;
    const total = activeDels.length;
    const clean = done === total;
    const tag = clean ? "✅ closed clean" : `${done}/${total}`;
    lines.push(`Week ${w.index} — ${fmtRange(w.monday, w.sunday)}  (${tag})`);

    activeDels.forEach(d => {
      const isDone = !!state.checks[checkKey(rep.id, w.id, d.id)];
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

// Expose globally for other Babel scripts
Object.assign(window, {
  REPS, DELIVERABLES, WEEKS, TODAY,
  currentWeekIndex,
  fmtShort, fmtLong, fmtRange, DAYS,
  loadState, saveState, checkKey,
  buildWeekEmail, buildQuarterEmail, openMailto,
});
