// RFC-163 — Team Briefs manager + rep surfaces.
// Owns a separate Supabase load/realtime cycle; never joins App shared state.

const TEAM_BRIEF_TYPE_LABELS = {
  morning_message: "Morning message",
  fyi: "FYI",
  reminder: "Reminder",
  action_required: "Action required",
};

const TEAM_BRIEF_AUDIENCES = [
  { audience_mode: "sales_all", audience_team_id: null, audience_region: null },
  { audience_mode: "team", audience_team_id: "newbiz", audience_region: null },
  { audience_mode: "team", audience_team_id: "cs", audience_region: null },
  ...REGION_ORDER.map(region => ({
    audience_mode: "region", audience_team_id: null, audience_region: region,
  })),
  ...TEAMS.flatMap(team => REGION_ORDER.map(region => ({
    audience_mode: "team_region",
    audience_team_id: team.id,
    audience_region: region,
  }))),
];

const TEAM_BRIEF_STYLES = `
.team-briefs{display:grid;gap:20px}
.tb-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px}
.tb-head h1{margin:0;font-size:30px;letter-spacing:-.04em}
.tb-head p{margin:5px 0 0;color:var(--muted);font-size:13px}
.tb-tabs{display:flex;gap:6px}
.tb-tab,.tb-btn{border:1px solid var(--line);background:var(--paper);border-radius:9px;padding:8px 12px;font:inherit;font-size:12px;font-weight:700;cursor:pointer}
.tb-tab[data-active="1"],.tb-btn--primary{background:var(--ink);border-color:var(--ink);color:white}
.tb-btn:disabled{opacity:.45;cursor:not-allowed}
.tb-error{padding:10px 12px;border:1px solid #fecaca;background:#fff1f2;color:#9f1239;border-radius:9px;font-size:12px}
.tb-compose{border:1px solid var(--line);background:var(--paper);border-radius:14px;padding:18px;display:grid;gap:14px}
.tb-compose h2{margin:0;font-size:17px}
.tb-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.tb-field{display:grid;gap:5px}
.tb-field--full{grid-column:1/-1}
.tb-field label{font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);font-weight:750}
.tb-field input,.tb-field textarea,.tb-field select,.tb-comment-box textarea{width:100%;border:1px solid var(--line);border-radius:8px;background:white;padding:9px 10px;font:inherit;font-size:13px}
.tb-field textarea{min-height:92px;resize:vertical}
.tb-checks{display:flex;flex-wrap:wrap;gap:14px;align-items:center}
.tb-checks label{display:flex;gap:7px;align-items:center;font-size:12px}
.tb-list{display:grid;gap:12px}
.tb-history-group{display:grid;gap:10px}
.tb-history-group__heading{margin:5px 0 0;font-size:13px;letter-spacing:.02em;color:var(--muted)}
.tb-empty{border:1px dashed var(--line);border-radius:12px;padding:22px;text-align:center;color:var(--muted);font-size:13px}
.tb-card{border:1px solid var(--line);border-left:4px solid #c7c6d8;background:var(--paper);border-radius:12px;padding:15px;display:grid;gap:11px}
.tb-card[data-urgency="soon"]{border-left-color:#f59e0b}
.tb-card[data-urgency="tomorrow"],.tb-card[data-urgency="today"]{border-left-color:#ea580c}
.tb-card[data-urgency="overdue"]{border-left-color:#dc2626;background:#fffafa}
.tb-card__top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.tb-card__meta{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:5px}
.tb-pill{display:inline-flex;border-radius:999px;background:#f1f0f7;padding:3px 7px;font-size:9px;text-transform:uppercase;letter-spacing:.06em;font-weight:800}
.tb-pill--urgent{background:#fee2e2;color:#991b1b}
.tb-card h3{margin:0;font-size:16px;letter-spacing:-.015em}
.tb-card__body{white-space:pre-wrap;font-size:13px;line-height:1.5;color:var(--ink)}
.tb-card__sub{font-size:11px;color:var(--muted)}
.tb-card__actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
.tb-ack-callout{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 13px;border:1px solid var(--brand-light);background:var(--brand-tint);border-radius:10px}
/* The done tint keys off data-done, NOT data-read: after Phase 5 a read brief
   is still an open ask, and painting it "finished" green was the exact
   misreading the two-step exists to end. */
.tb-ack-callout[data-done="1"]{border-color:var(--done-light);background:var(--done-tint)}
.tb-ack-callout__copy{display:grid;gap:3px}
.tb-ack-callout__label{font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--brand-deep)}
.tb-ack-callout[data-done="1"] .tb-ack-callout__label{color:var(--done-deep)}
.tb-ack-callout__help{font-size:11px;line-height:1.4;color:var(--ink-70)}
.tb-ack-callout__actions{display:flex;align-items:center;gap:8px;flex:none}
.tb-ack{min-height:44px;display:flex;align-items:center;justify-content:center;gap:8px;flex:none;border:1px solid var(--brand-deep);background:var(--brand-deep);color:white;border-radius:9px;padding:10px 17px;font:inherit;font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 2px 7px rgba(25,20,55,.14);transition:transform 140ms,box-shadow 140ms,background 140ms}
.tb-ack:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 4px 10px rgba(25,20,55,.2)}
.tb-ack:focus-visible{outline:3px solid var(--brand-light);outline-offset:2px}
.tb-ack:disabled:not([data-read="1"]):not([data-done="1"]){opacity:.6;cursor:wait}
.tb-ack[data-read="1"],.tb-ack[data-done="1"]{color:var(--done-deep);background:white;border-color:var(--done-light);box-shadow:none;cursor:default}
.tb-ack--done{border-color:var(--done-deep);background:var(--done-deep)}
.tb-ack--done:focus-visible{outline-color:var(--done-light)}
.tb-track{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.tb-track__cell{border-radius:8px;background:#f6f5f9;padding:9px}
.tb-track__cell strong{display:block;font-size:16px}
.tb-track__cell span{font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
/* §4.4 — both lists name people, because that is the whole lever (D8). The
   "read, not done" half gets the ink: those reps have already seen the ask,
   so it is the list a manager can act on today. */
.tb-names{font-size:11px;color:var(--muted);line-height:1.5}
.tb-names__label{display:inline-block;margin-right:6px;font-weight:700;color:var(--ink-70);text-transform:uppercase;font-size:9px;letter-spacing:.06em}
.tb-names--lever{color:var(--ink-70)}
.tb-names--lever .tb-names__label{color:var(--brand,#4c1d95)}
.tb-names--clear{color:var(--done-deep)}
/* §4.4 D9 — stale asks. A manager-level list, not a per-card badge: these are
   the briefs that stopped escalating, so nothing on the card itself will ever
   draw the eye to them again. */
.tb-stale{border:1px solid #fcd34d;border-radius:12px;background:#fffbeb;padding:13px 15px;display:grid;gap:9px;margin-bottom:14px}
.tb-stale__head h3{margin:0;font-size:13px}
.tb-stale__head span{font-size:11px;color:var(--muted)}
.tb-stale__list{margin:0;padding:0;list-style:none;display:grid;gap:7px}
.tb-stale__item{display:flex;gap:10px;align-items:baseline;justify-content:space-between;flex-wrap:wrap;font-size:12px}
.tb-stale__title{font-weight:600;color:var(--ink-70)}
.tb-stale__meta{font-size:11px;color:var(--muted)}
.tb-stale__error{font-size:11px;color:#b91c1c}
.tb-comments{border-top:1px solid var(--line);padding-top:10px;display:grid;gap:8px}
.tb-comment{background:#f7f7fa;border-radius:8px;padding:8px 10px;font-size:12px}
.tb-comment__head{display:flex;justify-content:space-between;gap:8px;color:var(--muted);font-size:10px;margin-bottom:3px}
.tb-comment--deleted{font-style:italic;color:var(--muted)}
.tb-comment-box{display:grid;gap:6px}
.tb-comment-box__visibility{padding:8px 10px;border-radius:8px;background:#f6f5f9;color:var(--ink-70);font-size:11px;line-height:1.4}
.tb-comment-box__actions{display:flex;justify-content:flex-end;gap:7px}
.tb-today{margin:18px 0;border:1px solid var(--line);background:linear-gradient(135deg,#fff,#f8f7ff);border-radius:14px;padding:16px;display:grid;gap:12px}
.tb-today__head{display:flex;justify-content:space-between;gap:12px;align-items:center}
.tb-today__head h2{margin:0;font-size:17px}
.tb-today__head span{font-size:11px;color:var(--muted)}
.tb-today--quiet{padding:12px 15px}
.tb-today--lead{margin-top:0;border-color:#fca5a5;background:linear-gradient(135deg,#fff,#fff5f5)}
/* RFC-164 D10 — the catch-up sweep. Deliberately quieter than a brief card:
   this is a pile to clear, not an ask to answer, and it must never out-shout
   the live briefs sitting above it. */
.tb-sweep{border:1px solid var(--line);border-radius:12px;background:#fbfbfe;padding:13px 15px;display:grid;gap:9px}
.tb-sweep__head h3{margin:0;font-size:13px}
.tb-sweep__head span{font-size:11px;color:var(--muted)}
.tb-sweep__list{margin:0;padding:0;list-style:none;display:grid;gap:4px}
.tb-sweep__item{display:flex;gap:8px;align-items:baseline;font-size:12px;color:var(--ink-70)}
.tb-sweep__date{flex:none;font-size:10px;color:var(--muted);min-width:96px}
.tb-sweep__title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tb-sweep__actions{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}
.tb-sweep__older{border:0;background:none;padding:0;font:inherit;font-size:11px;font-weight:600;color:var(--ink-70);text-decoration:underline;cursor:pointer}
.tb-sweep__error{font-size:11px;color:#b91c1c}
.tb-loading{color:var(--muted);font-size:12px}
/* RFC-164 §4.2c — sticky, never in normal flow once pinned, and exactly
   TEAM_BRIEF_STRIP_HEIGHT tall so the sentinel's rootMargin can cancel the
   layout shift that mounting it causes. Keep the two in sync. */
.tb-strip{position:sticky;top:0;z-index:40;box-sizing:border-box;height:44px;display:flex;align-items:center;gap:12px;padding:0 36px;background:var(--ink);color:#fff;border-bottom:1px solid rgba(255,255,255,.12)}
.tb-strip__badge{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;background:var(--orange-bright,#d04a1a);color:#fff;border-radius:999px;font-size:11px;font-weight:600;flex:none}
.tb-strip__label{font-size:13px;font-weight:600;flex:none}
.tb-strip__title{font-size:12px;color:rgba(255,255,255,.72);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}
.tb-strip__open{flex:none;border:1px solid rgba(255,255,255,.35);background:transparent;color:#fff;border-radius:8px;padding:5px 11px;font:inherit;font-size:12px;font-weight:700;cursor:pointer}
.tb-strip__open:hover{background:rgba(255,255,255,.12)}
.tb-strip__open:focus-visible{outline:3px solid rgba(255,255,255,.6);outline-offset:2px}
/* The strip is height-locked at TEAM_BRIEF_STRIP_HEIGHT because the hero/strip
   handoff measures against it — nothing added here may grow the row. That is
   why a failed completion reuses the label slot instead of adding a line. */
.tb-strip__done{flex:none;display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.14);color:#fff;border-radius:8px;padding:5px 11px;font:inherit;font-size:12px;font-weight:700;cursor:pointer}
.tb-strip__done:hover:not(:disabled){background:rgba(255,255,255,.24)}
.tb-strip__done:disabled{opacity:.6;cursor:wait}
.tb-strip__done:focus-visible{outline:3px solid rgba(255,255,255,.6);outline-offset:2px}
.tb-strip__label[data-error="1"]{color:#fecaca}
.tb-strip[data-rung="3"]{background:#7f1d1d}
@media(prefers-reduced-motion:no-preference){.tb-strip{animation:tb-strip-in 140ms ease-out}}
@keyframes tb-strip-in{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
@media(max-width:720px){.tb-grid{grid-template-columns:1fr}.tb-field--full{grid-column:auto}.tb-head{align-items:flex-start;flex-direction:column}.tb-track{grid-template-columns:repeat(2,1fr)}.tb-ack-callout{align-items:stretch;flex-direction:column}.tb-ack-callout__actions{align-items:stretch;flex-direction:column}.tb-ack{width:100%}.tb-strip{padding:0 16px;gap:8px}.tb-strip__title{display:none}}
`;

// RFC-164 §4.2c — the strip's height in CSS and the observer's rootMargin are
// one number. Mounting the strip shifts content down by exactly this much; the
// negative rootMargin requires the sentinel to be this much further down before
// it counts as visible, so the shift cannot re-trigger the observer. Split them
// and you get the oscillation loop the RFC describes.
const TEAM_BRIEF_STRIP_HEIGHT = 44;

function teamBriefReadBy(brief, authedUser) {
  const repId = authedUser && typeof authedUser === "object" ? authedUser.rep_id : null;
  const authId = authedUser && typeof authedUser === "object" ? authedUser.auth_id : authedUser;
  return (brief.reads || []).some(read =>
    (repId && read.rep_id === repId)
    || (authId && read.auth_id === authId)
  );
}

// RFC-164 §4.3 — the pure rung helpers in data-model.js take a receipt map
// keyed by brief id, because they run under a `vm` context that has no notion
// of who is logged in. This is the only place that knows. A viewer with no row
// gets `null`, which the helpers read as "never opened".
function teamBriefReceiptFor(brief, authedUser) {
  const repId = authedUser && typeof authedUser === "object" ? authedUser.rep_id : null;
  const authId = authedUser && typeof authedUser === "object" ? authedUser.auth_id : authedUser;
  const row = (brief.reads || []).find(read =>
    (repId && read.rep_id === repId)
    || (authId && read.auth_id === authId)
  );
  if (!row) return null;
  return { read_at: row.read_at || null, done_at: row.done_at || null, swept: row.swept === true };
}

function teamBriefReceiptsFor(briefs, authedUser) {
  const map = {};
  (briefs || []).forEach(brief => { map[brief.id] = teamBriefReceiptFor(brief, authedUser); });
  return map;
}

function teamBriefAudienceByRep(brief) {
  const seats = new Map();
  (brief.audience || []).forEach(member => {
    const key = member.rep_id ? `rep:${member.rep_id}` : `auth:${member.auth_id}`;
    const existing = seats.get(key);
    if (existing) {
      if (member.auth_id && !existing.auth_ids.includes(member.auth_id)) {
        existing.auth_ids.push(member.auth_id);
      }
      return;
    }
    seats.set(key, {
      ...member,
      auth_ids: member.auth_id ? [member.auth_id] : [],
    });
  });
  return Array.from(seats.values());
}

// RFC-164 §4.4 — the manager's view of one audience member. The predecessor
// answered "is there a row", which was the same question as "did they read it"
// only until Phase 5 and 6 started writing rows for other reasons: a `done`
// receipt is a row, and so is a catch-up sweep. Counting rows would let ten
// briefs a rep cleared without reading register as ten reads, which is the one
// number D10 says has to stay honest.
function teamBriefAudienceMemberReceipt(brief, member) {
  const row = (brief.reads || []).find(read =>
    (member.rep_id && read.rep_id === member.rep_id)
    || (read.auth_id && member.auth_ids.includes(read.auth_id))
  );
  if (!row) return null;
  return { read_at: row.read_at || null, done_at: row.done_at || null, swept: row.swept === true };
}

// The three buckets behind §4.4's counters and lists. Deliberately not a
// partition: `read` contains `done` (complete_team_brief stamps read_at
// alongside done_at), and `outstanding` is everyone not done — so
// outstanding = haventRead + readNotDone, which is exactly the two lists.
//
// A swept receipt is read_at-bearing and lands in `haventRead` anyway. That is
// the deliberate divergence from teamBriefRung, which retires a swept brief for
// the rep: the sweep is the rep saying "I saw the pile", not "I read this one",
// so the rep's queue clears and the manager's number does not move.
function teamBriefAudienceState(brief) {
  const audience = teamBriefAudienceByRep(brief);
  const withReceipt = audience.map(member => ({
    member,
    receipt: teamBriefAudienceMemberReceipt(brief, member),
  }));
  const isRead = entry => !!(entry.receipt && entry.receipt.read_at && !entry.receipt.swept);
  const isDone = entry => !!(entry.receipt && entry.receipt.done_at);
  return {
    audience,
    read: withReceipt.filter(isRead).map(e => e.member),
    done: withReceipt.filter(isDone).map(e => e.member),
    outstanding: withReceipt.filter(e => !isDone(e)).map(e => e.member),
    haventRead: withReceipt.filter(e => !isRead(e)).map(e => ({
      ...e.member,
      swept: !!(e.receipt && e.receipt.swept),
    })),
    readNotDone: withReceipt.filter(e => isRead(e) && !isDone(e)).map(e => e.member),
  };
}

function teamBriefRepName(repId) {
  const rep = repById(repId);
  return rep ? rep.name : (repId || "Manager");
}

function teamBriefFormatDate(value, timezone) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: timezone || undefined,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleString();
  }
}

function teamBriefSort(a, b, authedUser) {
  const ranks = { overdue: 0, today: 1, tomorrow: 2, soon: 3, normal: 4 };
  const ar = ranks[teamBriefUrgency(a)] ?? 4;
  const br = ranks[teamBriefUrgency(b)] ?? 4;
  if (ar !== br) return ar - br;
  const aRead = teamBriefReadBy(a, authedUser);
  const bRead = teamBriefReadBy(b, authedUser);
  if (aRead !== bRead) return aRead ? 1 : -1;
  return String(b.publish_at || "").localeCompare(String(a.publish_at || ""));
}

function teamBriefHistoryDateKey(brief) {
  const published = new Date(brief.publish_at);
  const timestamp = Number.isFinite(published.getTime()) ? published.getTime() : 0;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: brief.timezone || undefined,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(published);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return {
      key: `${values.year}-${values.month}-${values.day}`,
      label: new Intl.DateTimeFormat(undefined, {
        timeZone: brief.timezone || undefined,
        month: "long",
        day: "numeric",
        year: "numeric",
      }).format(published),
      timestamp,
    };
  } catch {
    return {
      key: `${published.getFullYear()}-${String(published.getMonth() + 1).padStart(2, "0")}-${String(published.getDate()).padStart(2, "0")}`,
      label: published.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }),
      timestamp,
    };
  }
}

function teamBriefHistoryGroups(briefs) {
  const groups = new Map();
  [...briefs]
    .sort((a, b) => String(b.publish_at || "").localeCompare(String(a.publish_at || "")))
    .forEach(brief => {
      const date = teamBriefHistoryDateKey(brief);
      const group = groups.get(date.key) || { ...date, briefs: [] };
      group.briefs.push(brief);
      group.timestamp = Math.max(group.timestamp, date.timestamp);
      groups.set(date.key, group);
    });
  return Array.from(groups.values()).sort((a, b) => a.key.localeCompare(b.key) * -1);
}

// RFC-164 §6 Phase 6 — the sweep card's "see History" link has to open the full
// page ON the History tab, and there is no prop path for that. `onOpen` is
// `() => setView("team-briefs")` at index.html:2300 and :3161 and takes no
// argument, and `TeamBriefsManager` is mounted through the manager registry by
// global name (manager.jsx:26), not as a JSX child — so threading an
// `initialTab` prop would mean editing the registry for one link.
//
// A module-scoped handoff instead: the link sets it, the page reads it once at
// mount and clears it. Read-and-clear is what makes it safe — a stale value can
// never hijack a later visit. This is idiomatic here; the codebase has no module
// system and already couples across script tags through globals.
let teamBriefRequestedTab = null;
function requestTeamBriefTab(tab) { teamBriefRequestedTab = tab; }
function consumeTeamBriefTab() {
  const requested = teamBriefRequestedTab;
  teamBriefRequestedTab = null;
  return requested;
}

// RFC-164 §4.1 — one load cycle, one channel, one clock.
//
// `useTeamBriefs` used to do a full `loadTeamBriefs` plus a realtime subscribe
// per hook call, so three mounts meant three queries and three channels. The
// work now happens once, in a provider mounted in `App` above both the tab bar
// and the view switch.
const TeamBriefsContext = React.createContext(null);

// D14 — every rung consumer reads this one clock, so a brief crossing its due
// date advances on every surface in the same commit instead of each mount
// drifting on its own `Date.now()`.
const TEAM_BRIEF_TICK_MS = 60000;

function TeamBriefsProvider({ children }) {
  const [briefs, setBriefs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  // §4.1b two-tier load. RLS evaluates `current_user_is_team_brief_member` and
  // `current_user_can_manage_team_brief` per row against a three-way nested
  // select, so the archived superset is not something to pay for on app boot.
  // Boot loads published only; the manager page and the rep History tab upgrade
  // to the superset when they mount, and it never downgrades.
  const [archivedLoaded, setArchivedLoaded] = React.useState(false);
  // React flushes child effects before the parent's, so on the manager route
  // `requestArchived` fires before this provider's boot load ever runs. Reading
  // the tier off a ref rather than off state is what lets the boot load pick the
  // superset immediately instead of firing a published-only query and then a
  // superset query five milliseconds later — two nested per-row RLS evaluations
  // for one page.
  const archivedWantedRef = React.useRef(false);
  const fetchedTierRef = React.useRef(null);
  // Guards against a slow tier-1 response landing after tier-2 and clobbering
  // the superset with the published-only subset.
  const requestSeqRef = React.useRef(0);
  const [now, setNow] = React.useState(() => Date.now());
  // §4.2a — owned here, produced by a sentinel that lives in `HomeView` and is
  // never conditionally rendered. `BriefSurface` reads this; it must not own the
  // observed element, or hiding the hero kills the observer that would bring it
  // back.
  //
  // Starts true, not false. An IntersectionObserver does not report until after
  // the first paint, so a false start renders the strip for one frame on every
  // single Home load — a black bar that flashes and vanishes. True is also the
  // right answer in the overwhelmingly common case (Home opens scrolled to the
  // top). If the browser restores a deep scroll position instead, the observer's
  // initial callback corrects it within that same frame, and on every non-Home
  // route `view` short-circuits before this value is ever read.
  const [heroOnScreen, setHeroOnScreen] = React.useState(true);

  // Stable identity on purpose: nothing downstream re-subscribes, re-fires an
  // effect, or re-memoises because the tier changed.
  const refresh = React.useCallback(async () => {
    // §4.1a — load the superset once any consumer needs it and let consumers
    // filter. A provider that kept the old `false` would silently strip
    // archived briefs from the manager page.
    const includeArchived = archivedWantedRef.current;
    const seq = ++requestSeqRef.current;
    fetchedTierRef.current = includeArchived;
    try {
      const rows = await window.loadTeamBriefs({ includeArchived });
      if (seq !== requestSeqRef.current) return;
      setBriefs(Array.isArray(rows) ? rows : []);
      setError("");
    } catch (err) {
      if (seq !== requestSeqRef.current) return;
      setError(err.message || "Team Briefs could not load.");
    } finally {
      if (seq === requestSeqRef.current) setLoading(false);
    }
  }, []);

  // One load per tier, not one per render. `archivedLoaded` is in the dep list
  // so a mid-session upgrade (rep opens History) re-queries; the ref comparison
  // is what stops the same tier from querying twice.
  React.useEffect(() => {
    if (fetchedTierRef.current === archivedWantedRef.current) return;
    refresh();
  }, [archivedLoaded, refresh]);

  // One channel for the session. `refresh` never changes identity, so a tier
  // upgrade cannot re-run this effect and hand the session a second channel —
  // which is the thing this provider exists to prevent.
  React.useEffect(() => {
    if (!window.subscribeTeamBriefs) return undefined;
    return window.subscribeTeamBriefs(() => refresh());
  }, [refresh]);

  React.useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), TEAM_BRIEF_TICK_MS);
    return () => clearInterval(tick);
  }, []);

  const requestArchived = React.useCallback(() => {
    archivedWantedRef.current = true;
    setArchivedLoaded(true);
  }, []);

  const value = React.useMemo(() => ({
    briefs, loading, error, refresh, now,
    heroOnScreen, setHeroOnScreen,
    archivedLoaded, requestArchived,
  }), [briefs, loading, error, refresh, now, heroOnScreen, archivedLoaded, requestArchived]);

  return <TeamBriefsContext.Provider value={value}>{children}</TeamBriefsContext.Provider>;
}

// Retained as a thin context reader so existing call sites keep working. The
// argument no longer selects a query — it declares that this consumer needs
// archived rows, which upgrades the provider's single load to the superset.
function useTeamBriefs(includeArchived) {
  const context = React.useContext(TeamBriefsContext);
  const requestArchived = context ? context.requestArchived : null;
  React.useEffect(() => {
    if (includeArchived && requestArchived) requestArchived();
  }, [includeArchived, requestArchived]);
  if (context) return context;
  // No provider means a broken mount, not an empty inbox. Say so rather than
  // rendering "You're caught up" over briefs nobody looked for.
  return {
    briefs: [],
    loading: false,
    error: "Team Briefs did not load — TeamBriefsProvider is not mounted.",
    refresh: async () => {},
    now: Date.now(),
    heroOnScreen: true,
    setHeroOnScreen: () => {},
    archivedLoaded: false,
    requestArchived: () => {},
  };
}

// RFC-164 §4.2/§4.3 — the one place that turns provider state into the surface
// decision. Both mounts call this, so they cannot disagree: same briefs, same
// receipts, same clock, same React commit.
function useBriefSurface({ view, heroMounted, authedUser }) {
  const { briefs, loading, error, refresh, now, heroOnScreen } = useTeamBriefs(false);
  const receipts = React.useMemo(
    () => teamBriefReceiptsFor(briefs, authedUser),
    [briefs, authedUser],
  );
  const all = React.useMemo(
    () => window.teamBriefOutstanding(briefs, receipts, now),
    [briefs, receipts, now],
  );

  // D10 — split the outstanding set into the queue and the pile.
  //
  // `teamBriefCatchup` returns the same membership as `teamBriefOutstanding`
  // (both are just rung > 0); only the ordering and the cap differ. Handing it
  // the whole set would render every live brief twice — once as a card, once as
  // a sweep line — so the caller owns the partition, exactly as both functions'
  // comments say ("caller filters").
  //
  // Missed means: no receipt of any kind, and the display window has closed.
  // Both halves are load-bearing. Requiring *no receipt* matches what the RPC
  // can actually do — `on conflict (brief_id, rep_id) do nothing` skips any
  // brief the rep already has a row for, so including one would promise a sweep
  // the database silently refuses. Requiring *window closed* keeps everything
  // the rep can still act on in the queue: a brief that is read-but-not-done, or
  // one whose `for_days` window lapsed while a due date is still ahead, belongs
  // above as a card, not in a pile labelled "missed while you were away".
  const missedIds = React.useMemo(() => {
    const ids = new Set();
    all.forEach(brief => {
      if (receipts[brief.id]) return;
      if (window.teamBriefRepSection(brief, false, now) === "history") ids.add(brief.id);
    });
    return ids;
  }, [all, receipts, now]);
  const outstanding = React.useMemo(
    () => (missedIds.size ? all.filter(brief => !missedIds.has(brief.id)) : all),
    [all, missedIds],
  );
  const catchup = React.useMemo(
    () => window.teamBriefCatchup(all.filter(brief => missedIds.has(brief.id)), receipts, now),
    [all, missedIds, receipts, now],
  );

  // teamBriefOutstanding sorts rung desc, so the head of the list is the rung
  // that decides whether Home gets taken over.
  const topRung = outstanding.length
    ? window.teamBriefRung(outstanding[0], receipts[outstanding[0].id], now)
    : 0;
  // Missed briefs deliberately do not count here. The strip is the persistent
  // nag for work the rep still owes; pinning a black bar to every page over a
  // pile of expired messages is the wall of cards D10 exists to prevent.
  const shape = window.briefSurfaceShape({
    view,
    heroMounted,
    heroOnScreen,
    outstandingCount: outstanding.length,
  });
  return { briefs, loading, error, refresh, now, receipts, outstanding, catchup, topRung, shape };
}

// §4.2a — the sentinel. Always mounted, zero height, sitting at the hero's flow
// position, with the hero rendered inside it. That is the whole trick: when the
// hero is hidden the wrapper collapses but stays observed exactly where the
// hero's top edge was, so scrolling back up brings it into view and the hero
// returns. An observer that lived on the hero itself would disconnect the
// moment the hero hid and `heroOnScreen` would latch false forever.
function TeamBriefHeroSlot({ children }) {
  const { setHeroOnScreen } = useTeamBriefs(false);
  const ref = React.useRef(null);
  const reservedRef = React.useRef(0);

  // The slot holds the height the hero vacated, less the strip that replaced
  // it. Both halves were measured in headless Chrome and both are load-bearing.
  //
  // Reserving nothing (the obvious version) deletes the hero's ~485px from the
  // document ABOVE the viewport at the crossing; scroll anchoring does not
  // absorb it, and everything below jumps 470px under the reader.
  //
  // Reserving the full height instead makes the strip's own 44px of flow —
  // it sits above this slot — push the slot down by exactly the `rootMargin`
  // that was supposed to account for the strip. The two double-count, and the
  // re-entry threshold lands ABOVE the exit threshold: a 44px band where both
  // transitions want to fire, stable only because Chrome's scroll anchoring
  // happens to nudge out of it.
  //
  // Subtracting the strip makes the document exactly as long in both states
  // and pins the slot's bottom edge to the same document coordinate either
  // way. The observed edge cannot move when the shape changes, so exit and
  // re-entry are one threshold and the handoff cannot feed back into itself.
  React.useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    // Measure the child, not the slot: once the slot is reserving a height,
    // reading the slot would just read back its own reservation.
    const content = node.firstElementChild;
    if (content) {
      const h = content.getBoundingClientRect().height;
      if (h > 0) reservedRef.current = h;
      node.style.minHeight = "";
    } else if (reservedRef.current > 0) {
      node.style.minHeight = `${Math.max(0, reservedRef.current - TEAM_BRIEF_STRIP_HEIGHT)}px`;
    }
  });

  React.useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      // No observer (old browser, jsdom) means no handoff signal. Report the
      // hero as on screen so the rep sees the full card rather than nothing.
      setHeroOnScreen(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      entries => { entries.forEach(entry => setHeroOnScreen(entry.isIntersecting)); },
      { rootMargin: `-${TEAM_BRIEF_STRIP_HEIGHT}px 0px 0px 0px`, threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [setHeroOnScreen]);

  return <div ref={ref} className="tb-hero-slot">{children}</div>;
}

// §4.2c — the chrome strip. Mounted once, in `App`, immediately below the tab
// bar; `briefSurfaceShape` decides whether it renders anything.
function TeamBriefsStrip({ view, heroMounted, authedUser, onOpen }) {
  const { outstanding, topRung, shape, receipts, refresh } =
    useBriefSurface({ view, heroMounted, authedUser });
  // Both hooks stay above the early return — the strip mounts and unmounts on
  // every scroll handoff, and a conditional hook would break on the first one.
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState("");

  if (shape !== "strip") return null;
  const count = outstanding.length;
  const top = outstanding[0];
  const receipt = receipts[top.id];

  // §6 Phase 5 exit criterion — "mark done from the strip alone". Gated on
  // read_at, and only here: the strip shows a title, not the ask, so offering
  // "done" on a brief the rep never opened would let the loudest signal in the
  // product be cleared by someone who never saw what it was about. The card
  // (where the body is visible) has no such gate.
  const canComplete = !!(top.require_ack && receipt && receipt.read_at && !receipt.done_at);

  async function complete() {
    setBusy(true);
    setFailure("");
    try {
      await window.completeTeamBrief(top.id);
      await refresh();
    } catch (err) {
      setFailure(err.message || "Couldn't mark that done.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <style>{TEAM_BRIEF_STYLES}</style>
      <div className="tb-strip" data-rung={String(topRung)} role="region" aria-label="Team briefs">
        <span className="tb-strip__badge" aria-hidden="true">{count}</span>
        {/* One row, height-locked: a failure replaces the count rather than
            adding a line, because growing the strip would move the handoff
            threshold the hero slot is measured against. */}
        <span className="tb-strip__label" aria-live="polite" data-error={failure ? "1" : "0"}>
          {failure || `${count} brief${count === 1 ? "" : "s"} waiting`}
        </span>
        <span className="tb-strip__title">{top.title}</span>
        {canComplete && (
          <button
            type="button"
            className="tb-strip__done"
            disabled={busy}
            aria-label={`Mark "${top.title}" done`}
            onClick={complete}
          >
            <Icon name="check" size={13} /> Mark done
          </button>
        )}
        <button type="button" className="tb-strip__open" onClick={onOpen}>Open</button>
      </div>
    </>
  );
}

function TeamBriefCard({ brief, authedUser, managerial, onChanged, compact, readOnly = false }) {
  // Read the same receipt the rung ladder reads (§4.3). The older
  // `teamBriefReadBy` answered "is there a row", which agreed with `read_at`
  // only by luck; now that `complete_team_brief` writes rows too, the card and
  // the rung have to be looking at the same two timestamps or the card will
  // claim "acknowledged" about a brief the ladder still counts as unread.
  const receipt = teamBriefReceiptFor(brief, authedUser);
  const read = !!(receipt && receipt.read_at);
  const done = !!(receipt && receipt.done_at);
  const urgency = teamBriefUrgency(brief);
  const historical = readOnly;
  const [commentOpen, setCommentOpen] = React.useState(() =>
    !managerial
    && !readOnly
    && brief.status === "published"
    && !brief.archived_at
    && brief.allow_comments
  );
  const [comment, setComment] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const active = brief.status === "published" && !brief.archived_at;
  const visibleComments = (brief.comments || []).filter(c => !c.deleted_at || (managerial && !historical));
  const audienceState = teamBriefAudienceState(brief);

  async function act(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await onChanged();
    } catch (err) {
      setError(err.message || "That action failed.");
    } finally {
      setBusy(false);
    }
  }

  function submitComment() {
    const normalized = normalizeTeamBriefComment(comment);
    if (!normalized.ok) { setError(normalized.error); return; }
    act(async () => {
      await window.addTeamBriefComment(brief.id, normalized.value);
      setComment("");
      setCommentOpen(false);
    });
  }

  const urgencyLabel = urgency === "soon" ? "Due soon" : urgency;
  return (
    <article className="tb-card" data-urgency={urgency} data-read={read ? "1" : "0"}>
      <div className="tb-card__top">
        <div>
          <div className="tb-card__meta">
            <span className="tb-pill">{TEAM_BRIEF_TYPE_LABELS[brief.brief_type] || brief.brief_type}</span>
            <span className="tb-pill">{teamBriefAudienceLabel(brief)}</span>
            {urgency !== "normal" && <span className="tb-pill tb-pill--urgent">{urgencyLabel}</span>}
          </div>
          <h3>{brief.title}</h3>
        </div>
        {brief.due_at && (
          <div className="tb-card__sub">Due {teamBriefFormatDate(brief.due_at, brief.timezone)}</div>
        )}
      </div>
      <div className="tb-card__body">{brief.body}</div>
      <div className="tb-card__sub">
        {brief.author_email || "Manager"} · Published {teamBriefFormatDate(brief.publish_at, brief.timezone)}
      </div>

      {managerial && (
        <>
          {/* §4.4 — "Acknowledged 7/9" was one number doing two jobs, and it
              answered neither: it counted a read as a finish, so a manager
              could not tell a team that had done the work from a team that had
              opened the email. Read and done are now separate columns, and
              outstanding is the only one that should ever drive a nudge. */}
          <div className="tb-track">
            <div className="tb-track__cell"><strong>{audienceState.read.length}/{audienceState.audience.length}</strong><span>Read</span></div>
            <div className="tb-track__cell"><strong>{audienceState.done.length}/{audienceState.audience.length}</strong><span>Done</span></div>
            <div className="tb-track__cell"><strong>{audienceState.outstanding.length}</strong><span>Outstanding</span></div>
            <div className="tb-track__cell"><strong>{visibleComments.filter(c => !c.deleted_at).length}</strong><span>Comments</span></div>
          </div>
          {/* The two lists partition Outstanding exactly, which is why they
              name people instead of counting them (D8): the manager's next
              move is different for each half — one group needs the brief put
              back in front of them, the other has already seen it and needs
              asking. */}
          {audienceState.haventRead.length > 0 && (
            <div className="tb-names">
              <span className="tb-names__label">Haven't read</span>
              {audienceState.haventRead
                .map(member => teamBriefRepName(member.rep_id) + (member.swept ? " (cleared in catch-up)" : ""))
                .join(", ")}
            </div>
          )}
          {audienceState.readNotDone.length > 0 && (
            <div className="tb-names tb-names--lever">
              <span className="tb-names__label">Read, not done</span>
              {audienceState.readNotDone.map(member => teamBriefRepName(member.rep_id)).join(", ")}
            </div>
          )}
          {active && brief.require_ack && audienceState.outstanding.length === 0 && audienceState.audience.length > 0 && (
            <div className="tb-names tb-names--clear">Everyone's done.</div>
          )}
        </>
      )}

      {error && <div className="tb-error">{error}</div>}
      {!managerial && historical && (
        <div className="tb-card__sub">
          {brief.require_ack
            ? (read ? "Acknowledged" : "Not acknowledged")
            : "Acknowledgement not required"}
        </div>
      )}
      {/* D6 — read and done are separate states, so they get separate buttons.
          The old single button called itself "Acknowledged" and left the brief
          outstanding forever, which is the confusion this phase removes: only
          `done_at` retires a brief (rung 0), and the copy now says so. */}
      {!managerial && !historical && active && brief.require_ack && (
        <div className="tb-ack-callout" data-read={read ? "1" : "0"} data-done={done ? "1" : "0"}>
          <div className="tb-ack-callout__copy">
            <div className="tb-ack-callout__label">
              {done ? "Done" : read ? "Read — not done yet" : "Acknowledgement required"}
            </div>
            <div className="tb-ack-callout__help">
              {done
                ? "You marked this done. It won't come back."
                : read
                  ? "You confirmed you read this. Mark it done once the ask is finished — until then it keeps its place in the queue."
                  : brief.brief_type === "action_required"
                    ? "Read the brief, then confirm. Confirming is not the same as finishing — there's a separate “Mark done”."
                    : "Read the brief, then confirm that you've seen it. Mark it done when you've handled it."}
            </div>
          </div>
          <div className="tb-ack-callout__actions">
            <button
              className="tb-ack"
              data-read={read ? "1" : "0"}
              aria-label={read ? "Brief already confirmed as read" : "Confirm you read this brief"}
              disabled={read || busy}
              onClick={() => act(() => window.acknowledgeTeamBrief(brief.id))}
            >
              <Icon name="check" size={16} /> {read ? "Read" : "Confirm I've read this"}
            </button>
            {/* Enabled before "read" on purpose: the body is right there on the
                card, and the RPC stamps `read_at` alongside `done_at`, so a rep
                who finished the ask can say so in one click without the state
                going incoherent. The strip is where "done" needs a read gate —
                it shows a title, not the ask. */}
            <button
              className="tb-ack tb-ack--done"
              data-done={done ? "1" : "0"}
              aria-label={done ? "Brief already marked done" : "Mark this brief done"}
              disabled={done || busy}
              onClick={() => act(() => window.completeTeamBrief(brief.id))}
            >
              <Icon name="check" size={16} /> {done ? "Done" : "Mark done"}
            </button>
          </div>
        </div>
      )}
      <div className="tb-card__actions">
        {!historical && active && brief.allow_comments && (managerial || !commentOpen) && (
          <button className="tb-btn" disabled={busy} onClick={() => setCommentOpen(open => !open)}>
            Comment{visibleComments.length ? ` (${visibleComments.filter(c => !c.deleted_at).length})` : ""}
          </button>
        )}
        {managerial && !historical && active && (
          <button className="tb-btn" disabled={busy} onClick={() => act(() => window.archiveTeamBrief(brief.id))}>
            Archive
          </button>
        )}
      </div>

      {!compact && visibleComments.length > 0 && (
        <div className="tb-comments">
          {visibleComments.map(entry => (
            <div key={entry.id} className={"tb-comment" + (entry.deleted_at ? " tb-comment--deleted" : "")}>
              <div className="tb-comment__head">
                <span>{teamBriefRepName(entry.rep_id)}</span>
                <span>
                  {teamBriefFormatDate(entry.created_at, brief.timezone)}
                  {managerial && !historical && !entry.deleted_at && (
                    <button
                      className="tb-btn"
                      style={{ marginLeft: 7, padding: "2px 6px" }}
                      disabled={busy}
                      onClick={() => act(() => window.softDeleteTeamBriefComment(entry.id))}
                    >Remove</button>
                  )}
                </span>
              </div>
              {entry.deleted_at ? "Comment removed." : entry.body}
            </div>
          ))}
        </div>
      )}

      {commentOpen && !historical && active && (
        <div className="tb-comment-box">
          <div className="tb-comment-box__visibility">
            Visible to everyone who received this brief — this is not a private message.
          </div>
          <textarea
            value={comment}
            maxLength={TEAM_BRIEF_COMMENT_MAX_LENGTH}
            onChange={event => setComment(event.target.value)}
            placeholder="Write a comment for everyone on this brief…"
            rows={3}
          />
          <div className="tb-comment-box__actions">
            <button className="tb-btn" onClick={() => setCommentOpen(false)}>Cancel</button>
            <button className="tb-btn tb-btn--primary" disabled={busy} onClick={submitComment}>Add comment</button>
          </div>
        </div>
      )}
    </article>
  );
}

// D10 — the catch-up sweep. One list, one button, one write.
//
// The list is shown rather than summarised on purpose: "clear 10 things you
// never read" is only an honest button if the rep can see what the ten are.
function TeamBriefCatchupCard({ items, olderCount, onSwept, onOpen }) {
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState("");
  if (!items.length) return null;

  // State the bound explicitly (§6 Phase 6). "10 most recent" is only true when
  // something was actually held back — saying it over a complete list of four
  // would invent an older pile that does not exist.
  const bound = olderCount > 0
    ? `${items.length} most recent`
    : `${items.length} brief${items.length === 1 ? "" : "s"}`;

  async function sweep() {
    setBusy(true);
    setFailure("");
    try {
      await window.acknowledgeTeamBriefsBulk(items.map(brief => brief.id));
      await onSwept();
    } catch (err) {
      setFailure(err.message || "Those briefs could not be cleared.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="tb-sweep">
      <div className="tb-sweep__head">
        <h3>Missed while you were away</h3>
        <span>{bound} — clearing these marks them seen, not done.</span>
      </div>
      <ul className="tb-sweep__list">
        {items.map(brief => (
          <li key={brief.id} className="tb-sweep__item">
            <span className="tb-sweep__date">{teamBriefHistoryDateKey(brief).label}</span>
            <span className="tb-sweep__title">{brief.title}</span>
          </li>
        ))}
      </ul>
      {failure && <div className="tb-sweep__error">{failure}</div>}
      <div className="tb-sweep__actions">
        {olderCount > 0 ? (
          <button
            className="tb-sweep__older"
            onClick={() => { requestTeamBriefTab("history"); onOpen(); }}
          >
            and {olderCount} older — see History
          </button>
        ) : <span />}
        <button className="tb-btn tb-btn--primary" disabled={busy} onClick={sweep}>
          {busy ? "Clearing…" : `Got it — clear these ${items.length}`}
        </button>
      </div>
    </section>
  );
}

// The Home hero. Renders inside `TeamBriefHeroSlot`, which owns the observed
// element — this component must never be the thing that unmounts the sentinel.
//
// The old version filtered with `teamBriefIsVisible` and ordered with
// `teamBriefSort`. The ordering is gone for good: §4.3 says the rung ordering
// *replaces* `teamBriefSort` for rep-facing surfaces and that two orderings must
// not coexist. Visibility came back in Phase 6, but only as the queue/pile split
// in `useBriefSurface` — `teamBriefOutstanding` itself never filtered on it, and
// an earlier version of this comment claimed otherwise.
function TeamBriefsTodayPanel({ view, heroMounted, authedUser, onOpen }) {
  const { loading, error, refresh, outstanding, catchup, topRung, shape } =
    useBriefSurface({ view, heroMounted, authedUser });
  const active = outstanding;
  const sweep = (
    <TeamBriefCatchupCard
      items={catchup.items}
      olderCount={catchup.olderCount}
      onSwept={refresh}
      onOpen={onOpen}
    />
  );

  // Nothing live to do. That is NOT the same as caught up: a rep back from PTO
  // can have an empty queue and fifteen missed briefs, and telling them they are
  // caught up while the pile sits underneath is defect #5 relocated. The sweep
  // card renders here too, and the headline follows whichever is true.
  if (!loading && !error && active.length === 0) {
    return (
      <>
        <style>{TEAM_BRIEF_STYLES}</style>
        <section className="tb-today tb-today--quiet">
          <div className="tb-today__head">
            <div>
              <h2>Today</h2>
              <span>
                {catchup.items.length
                  ? "Nothing new today — but you missed some while you were away."
                  : "You’re caught up on Team Briefs."}
              </span>
            </div>
          </div>
          {sweep}
        </section>
      </>
    );
  }

  // Outstanding briefs live on exactly one surface at a time. When the shape is
  // `strip` the hero renders nothing — but the slot around it stays mounted, so
  // scrolling back up brings this straight back.
  if (shape !== "hero" && !loading && !error) return null;

  return (
    <section className={topRung === 3 ? "tb-today tb-today--lead" : "tb-today"}>
      <style>{TEAM_BRIEF_STYLES}</style>
      <div className="tb-today__head">
        <div><h2>Today · Morning Brief</h2><span>{active.length} active message{active.length === 1 ? "" : "s"}</span></div>
        <button className="tb-btn" onClick={onOpen}>Open all <Icon name="arrow-right" size={12} /></button>
      </div>
      {loading && <div className="tb-loading">Loading Team Briefs…</div>}
      {error && <div className="tb-error">{error}</div>}
      <div className="tb-list">
        {active.map(brief => (
          <TeamBriefCard
            key={brief.id}
            brief={brief}
            authedUser={authedUser}
            managerial={false}
            onChanged={refresh}
            compact={true}
          />
        ))}
      </div>
      {sweep}
    </section>
  );
}

// RFC-164 §4.4 / D9 — the asks that went quiet.
//
// Two conditions, deliberately kept apart: `teamBriefIsStaleAsk` is pure and
// lives in data-model.js because it is only about age, and "somebody still owes
// it" composes here because audience state is this file's business.
//
// A stale ask with nobody outstanding is not a problem, it is a finished job
// that nobody archived — listing it would train the manager to ignore the
// section, which is exactly how the old Unread line died.
function TeamBriefStaleAsks({ briefs, now, onChanged }) {
  const [busyId, setBusyId] = React.useState("");
  const [error, setError] = React.useState("");

  const stale = briefs
    .filter(brief => window.teamBriefIsStaleAsk(brief, now))
    .map(brief => ({ brief, outstanding: teamBriefAudienceState(brief).outstanding }))
    .filter(entry => entry.outstanding.length > 0)
    .sort((a, b) => String(a.brief.due_at || "").localeCompare(String(b.brief.due_at || "")));

  if (stale.length === 0) return null;

  async function archive(brief) {
    setBusyId(brief.id);
    setError("");
    try {
      await window.archiveTeamBrief(brief.id);
      await onChanged();
    } catch (err) {
      setError(err.message || "That brief could not be archived.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="tb-stale">
      <div className="tb-stale__head">
        <h3>Stale asks</h3>
        <span>
          Overdue by more than {window.TEAM_BRIEF_STALE_DAYS} days and still owed. These have stopped
          escalating — chase them or archive them, but don't leave them sitting on the queue.
        </span>
      </div>
      <ul className="tb-stale__list">
        {stale.map(({ brief, outstanding }) => (
          <li className="tb-stale__item" key={brief.id}>
            <div>
              <div className="tb-stale__title">{brief.title}</div>
              <div className="tb-stale__meta">
                Due {teamBriefFormatDate(brief.due_at, brief.timezone)} · {outstanding.length} still outstanding
                {" — "}{outstanding.map(member => teamBriefRepName(member.rep_id)).join(", ")}
              </div>
            </div>
            <button
              className="tb-btn"
              disabled={busyId === brief.id}
              onClick={() => archive(brief)}
            >
              {busyId === brief.id ? "Archiving…" : "Archive"}
            </button>
          </li>
        ))}
      </ul>
      {error && <div className="tb-stale__error">{error}</div>}
    </section>
  );
}

function TeamBriefsManager({ authedUser, activeTeam, regionPill }) {
  const managerial = canManageAny(authedUser);
  const { briefs, loading, error, refresh, now } = useTeamBriefs(true);
  // Read-and-clear the sweep card's requested tab exactly once, at mount. A
  // manager never gets it — "history" is not one of their tabs — and the request
  // is consumed either way so it cannot survive to hijack a later visit.
  const [tab, setTab] = React.useState(() => {
    const requested = consumeTeamBriefTab();
    if (!managerial && requested) return requested;
    return managerial ? "active" : "current";
  });
  const [historyQuery, setHistoryQuery] = React.useState("");
  const [publishError, setPublishError] = React.useState("");
  const [publishing, setPublishing] = React.useState(false);
  const allowedAudiences = TEAM_BRIEF_AUDIENCES.filter(spec => canPublishTeamBrief(authedUser, spec));
  const preferred = allowedAudiences.find(spec =>
    spec.audience_mode === "team_region"
    && spec.audience_team_id === activeTeam
    && spec.audience_region === regionPill
  ) || allowedAudiences.find(spec =>
    spec.audience_mode === "team_region" && spec.audience_team_id === activeTeam
  ) || allowedAudiences[0];

  const [form, setForm] = React.useState(() => ({
    title: "",
    body: "",
    brief_type: "morning_message",
    audience_mode: preferred ? preferred.audience_mode : "sales_all",
    audience_team_id: preferred ? preferred.audience_team_id : null,
    audience_region: preferred ? preferred.audience_region : null,
    timezone_region: regionPill || "US",
    display_rule: "today_only",
    display_days: 3,
    expires_local: "",
    due_local: "",
    require_ack: true,
    allow_comments: true,
    auto_escalate: false,
  }));

  function patch(values) { setForm(current => ({ ...current, ...values })); }

  function selectAudience(value) {
    const spec = allowedAudiences[Number(value)];
    if (spec) patch({ ...spec });
  }

  function selectType(briefType) {
    const defaults = briefType === "morning_message"
      // RFC-164 D11 — a Friday morning message vanished before Monday under
      // `today_only`. It stays informational (`require_ack: false`); only its
      // display window changes.
      ? { display_rule: "for_days", display_days: 3, require_ack: false, auto_escalate: false }
      : briefType === "action_required"
        ? { display_rule: "manual_clear", require_ack: true, auto_escalate: true }
        : briefType === "reminder"
          ? { display_rule: "for_days", require_ack: true, auto_escalate: false }
          : { display_rule: "for_days", require_ack: false, auto_escalate: false };
    patch({ brief_type: briefType, ...defaults });
  }

  async function publish(event) {
    event.preventDefault();
    setPublishError("");
    if (!canPublishTeamBrief(authedUser, form)) {
      setPublishError("Your current team-admin scope does not fully cover this audience.");
      return;
    }
    const timezone = teamBriefTimezoneForAudience(form, form.timezone_region);
    const expiresAt = form.display_rule === "until_date"
      ? zonedLocalDateTimeToIso(form.expires_local, timezone)
      : null;
    const dueAt = form.due_local ? zonedLocalDateTimeToIso(form.due_local, timezone) : null;
    if (form.display_rule === "until_date" && !expiresAt) {
      setPublishError("Choose a valid expiry date and time.");
      return;
    }
    if (form.auto_escalate && !dueAt) {
      setPublishError("Auto-escalation requires a due date.");
      return;
    }
    setPublishing(true);
    try {
      await window.publishTeamBrief({
        ...form,
        timezone,
        display_days: form.display_rule === "for_days" ? Number(form.display_days) : null,
        expires_at: expiresAt,
        due_at: dueAt,
      });
      patch({ title: "", body: "", due_local: "", expires_local: "" });
      await refresh();
      setTab("active");
    } catch (err) {
      setPublishError(err.message || "Team Brief could not publish.");
    } finally {
      setPublishing(false);
    }
  }

  const currentOrHistory = !managerial ? briefs.filter(brief =>
    teamBriefRepSection(brief, teamBriefReadBy(brief, authedUser), now) === tab
  ) : [];
  const rungOrder = window.teamBriefRungOrder(
    teamBriefReceiptsFor(currentOrHistory, authedUser), now);
  const normalizedHistoryQuery = historyQuery.trim().toLowerCase();
  const historyMatches = brief => !normalizedHistoryQuery
    || `${brief.title || ""}\n${brief.body || ""}`.toLowerCase().includes(normalizedHistoryQuery);
  const filtered = managerial
    ? briefs
      .filter(brief => tab === "archived" ? brief.status === "archived" : brief.status === "published")
      .sort((a, b) => teamBriefSort(a, b, authedUser))
    : currentOrHistory
      .filter(brief => tab !== "history" || historyMatches(brief))
      // Current is a rep-facing surface, so it sorts by rung like the hero and
      // the strip (§4.3) — "Open all" must not reshuffle the list the rep just
      // read. History stays newest-first; it is a log, not a queue.
      .sort(tab === "history"
        ? (a, b) => String(b.publish_at || "").localeCompare(String(a.publish_at || ""))
        : rungOrder);
  const historyGroups = !managerial && tab === "history" ? teamBriefHistoryGroups(filtered) : [];

  return (
    <div className="team-briefs" data-screen-label="Team Briefs">
      <style>{TEAM_BRIEF_STYLES}</style>
      <header className="tb-head">
        <div>
          <h1>Team Briefs</h1>
          <p>{managerial ? "Publish operational context and track acknowledgement." : "Messages and actions for your team."}</p>
        </div>
        {managerial ? (
          <div className="tb-tabs">
            <button className="tb-tab" data-active={tab === "active" ? "1" : "0"} onClick={() => setTab("active")}>Active</button>
            <button className="tb-tab" data-active={tab === "archived" ? "1" : "0"} onClick={() => setTab("archived")}>Archived</button>
          </div>
        ) : (
          <div className="tb-tabs">
            <button className="tb-tab" data-active={tab === "current" ? "1" : "0"} onClick={() => setTab("current")}>Current</button>
            <button className="tb-tab" data-active={tab === "history" ? "1" : "0"} onClick={() => setTab("history")}>History</button>
          </div>
        )}
      </header>

      {managerial && tab === "active" && (
        <form className="tb-compose" onSubmit={publish}>
          <h2>Publish a brief</h2>
          <div className="tb-grid">
            <div className="tb-field tb-field--full">
              <label>Title</label>
              <input required maxLength={160} value={form.title} onChange={event => patch({ title: event.target.value })} />
            </div>
            <div className="tb-field tb-field--full">
              <label>Message</label>
              <textarea required maxLength={10000} value={form.body} onChange={event => patch({ body: event.target.value })} />
            </div>
            <div className="tb-field">
              <label>Audience</label>
              <select
                value={Math.max(0, allowedAudiences.findIndex(spec =>
                  spec.audience_mode === form.audience_mode
                  && spec.audience_team_id === form.audience_team_id
                  && spec.audience_region === form.audience_region
                ))}
                onChange={event => selectAudience(event.target.value)}
              >
                {allowedAudiences.map((spec, index) => <option key={`${spec.audience_mode}-${spec.audience_team_id}-${spec.audience_region}`} value={index}>{teamBriefAudienceLabel(spec)}</option>)}
              </select>
            </div>
            <div className="tb-field">
              <label>Type</label>
              <select value={form.brief_type} onChange={event => selectType(event.target.value)}>
                {TEAM_BRIEF_TYPES.map(type => <option key={type} value={type}>{TEAM_BRIEF_TYPE_LABELS[type]}</option>)}
              </select>
            </div>
            <div className="tb-field">
              <label>Display window</label>
              <select value={form.display_rule} onChange={event => patch({ display_rule: event.target.value })}>
                <option value="today_only">Today only</option>
                <option value="for_days">For days</option>
                {/* RFC-164 D12 — `until_acknowledged` is not offered: it removes
                    the brief the moment a rep confirms they read it, which is
                    exactly when an unfinished ask still needs to be visible. The
                    DB enum and the data-model branch stay for existing rows. */}
                <option value="until_date">Until date</option>
                <option value="manual_clear">Until archived</option>
              </select>
            </div>
            {form.display_rule === "for_days" && (
              <div className="tb-field"><label>Days</label><input type="number" min="1" max="365" value={form.display_days} onChange={event => patch({ display_days: event.target.value })} /></div>
            )}
            {form.display_rule === "until_date" && (
              <div className="tb-field"><label>Expires in operational timezone</label><input required type="datetime-local" value={form.expires_local} onChange={event => patch({ expires_local: event.target.value })} /></div>
            )}
            <div className="tb-field">
              <label>Due date (optional)</label>
              <input type="datetime-local" value={form.due_local} onChange={event => patch({ due_local: event.target.value })} />
            </div>
            {!["region", "team_region"].includes(form.audience_mode) && (
              <div className="tb-field">
                <label>Operational timezone</label>
                <select value={form.timezone_region} onChange={event => patch({ timezone_region: event.target.value })}>
                  {REGIONS.map(region => <option key={region.id} value={region.id}>{region.label} · {region.timezone}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="tb-checks">
            <label><input type="checkbox" checked={form.require_ack} onChange={event => patch({ require_ack: event.target.checked })} /> Require acknowledgement</label>
            <label><input type="checkbox" checked={form.allow_comments} onChange={event => patch({ allow_comments: event.target.checked })} /> Allow comments</label>
            <label><input type="checkbox" checked={form.auto_escalate} onChange={event => patch({ auto_escalate: event.target.checked })} /> Auto-escalate toward due date</label>
          </div>
          {publishError && <div className="tb-error">{publishError}</div>}
          <div><button className="tb-btn tb-btn--primary" disabled={publishing || allowedAudiences.length === 0} type="submit">{publishing ? "Publishing…" : "Publish now"}</button></div>
        </form>
      )}

      {loading && <div className="tb-loading">Loading Team Briefs…</div>}
      {error && <div className="tb-error">{error}</div>}
      {!managerial && tab === "history" && (
        <div className="tb-field">
          <label htmlFor="team-brief-history-search">Search past briefs</label>
          <input
            id="team-brief-history-search"
            type="search"
            value={historyQuery}
            onChange={event => setHistoryQuery(event.target.value)}
            placeholder="Search past briefs"
          />
        </div>
      )}
      {managerial && tab === "active" && (
        <TeamBriefStaleAsks briefs={filtered} now={now} onChanged={refresh} />
      )}
      <div className="tb-list">
        {!loading && filtered.length === 0 && (
          <div className="tb-empty">
            {managerial
              ? `No ${tab} Team Briefs.`
              : tab === "history"
                ? (normalizedHistoryQuery ? "No results found" : "No brief history yet")
                : "No current Team Briefs."}
          </div>
        )}
        {managerial || tab === "current" ? filtered.map(brief => (
          <TeamBriefCard
            key={brief.id}
            brief={brief}
            authedUser={authedUser}
            managerial={managerial}
            onChanged={refresh}
            compact={false}
          />
        )) : historyGroups.map(group => (
          <section className="tb-history-group" key={group.key}>
            <h2 className="tb-history-group__heading">{group.label}</h2>
            {group.briefs.map(brief => (
              <TeamBriefCard
                key={brief.id}
                brief={brief}
                authedUser={authedUser}
                managerial={false}
                onChanged={refresh}
                compact={false}
                readOnly={true}
              />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, {
  TeamBriefsProvider,
  TeamBriefsManager,
  TeamBriefsTodayPanel,
  TeamBriefHeroSlot,
  TeamBriefsStrip,
  // Exported so `HomeView` (which lives in index.html) can read `topRung` to
  // place the greeting. Hook, not data — call it at the top level of a render.
  useBriefSurface,
});
