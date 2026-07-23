// manager.jsx — Manager-only features.
//
// Architecture: each manager feature is a self-contained component that
// reads from the shared `state` object and writes via the same handlers
// the rest of the app uses. To add a new manager page, drop a new
// component below and add it to APP_PAGES in this file (manager.jsx).

// =====================================================================
// PAGE REGISTRY — single source of truth for nav.
// Filtered at render by user role. Append to extend.
// =====================================================================
const APP_PAGES = [
  { id: "home",          label: "Home",         icon: "home",        requires: "any"     },
  { id: "rollup",        label: "Team",         icon: "team",        requires: "any"     },
  { id: "leaderboard",   label: "Leaderboard",  icon: "leaderboard", requires: "any"     },
  { id: "standup",       label: "Standup",      icon: "standup",     requires: "any"     },
  { id: "wins",          label: "Weekly Wins",  icon: "wins",        requires: "any"     },
  { id: "team-briefs",   label: "Team Briefs",  icon: "mail",        requires: "manager", component: window.TeamBriefsManager },
  // RFC-158 Phase 3 — CS workspace pages. requires:"cs" is filtered in App
  // nav the same way don-or-manager / stuart-or-manager gate on activeTeam.
  { id: "cs:home",       label: "CS Home",      icon: "home",        requires: "cs", component: window.CsPerformancePage },
  { id: "cs:region",     label: "Regions",      icon: "calendar",    requires: "cs", component: window.CsRegionPage },
  { id: "cs:pipeline",   label: "Pipeline",     icon: "tracker",     requires: "cs", component: window.CsPipelinePage },
  { id: "cs:wonlost",    label: "Won / Lost",   icon: "check",       requires: "cs", component: window.CsWonLostPage },
  { id: "cs:targets",    label: "Targets",      icon: "leaderboard", requires: "cs", component: window.CsTargetsPage },
  { id: "cs:team",       label: "CS Team",      icon: "user",        requires: "cs", component: window.CsTeamPage },
  { id: "cs:risks",      label: "Risks",        icon: "flag",        requires: "cs", component: window.CsRisksPage },
  { id: "cs:focus",      label: "Current Focus",icon: "outreach",    requires: "cs", component: window.CsFocusPage },
  { id: "manager:flags", label: "Open flags",   icon: "flag",        requires: "manager" },
  { id: "don:onboarding", label: "Don — Onboarding", icon: "onboarding", requires: "don-or-manager" },
  { id: "stuart:onboarding", label: "Stuart — Onboarding", icon: "onboarding", requires: "stuart-or-manager" },
];

// =====================================================================
// FlagQueue — landing list of every open ask across the team, oldest first.
// The manager's "what needs attention right now" view.
// =====================================================================
function FlagQueue({ state, onPickRep, onReopenAsk, activeTeam, viewerScope, regionPill }) {
  // RFC-152: region scoping. viewerScope undefined => no region filtering.
  const allowedRegions = viewerScope ? window.regionsUnderScope(viewerScope, regionPill) : null;
  const inRegion = rep => !allowedRegions || (rep && allowedRegions.includes(rep.region));

  // Collect all open asks: state.asks is { "repId|weekId|delId": {text, at} }
  // Workspace-scoped (RFC-151 Phase 4): only the active team's flags render.
  const open = React.useMemo(() => {
    const out = [];
    if (!state.asks) return out;
    for (const k of Object.keys(state.asks)) {
      const ask = state.asks[k];
      if (!ask || !ask.text || !ask.text.trim()) continue;
      const [repId, weekId, delId] = k.split("|");
      const rep = REPS.find(r => r.id === repId);
      const week = WEEKS.find(w => w.id === weekId);
      const del = DELIVERABLES.find(d => d.id === delId);
      if (!rep || !week || !del) continue;
      if (activeTeam && rep.team !== activeTeam) continue;
      if (!inRegion(rep)) continue;
      // Skip if the deliverable was since marked done (issue resolved itself)
      const checkKey = `${repId}|${weekId}|${delId}`;
      const done = !!state.checks[checkKey];
      out.push({ key: k, repId, weekId, delId, rep, week, del, ask, done });
    }
    // Open ones first, then by ask age (oldest first)
    out.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return (a.ask.at || "").localeCompare(b.ask.at || "");
    });
    return out;
  }, [state.asks, state.checks, activeTeam, viewerScope, regionPill]);

  const openCount = open.filter(f => !f.done).length;

  if (open.length === 0) {
    return (
      <div className="flagq" data-screen-label="03 Flag Queue">
        <div className="flagq__head">
          <h1 className="flagq__title">Open flags</h1>
          <p className="flagq__sub">No flags raised this quarter — your team isn't blocked.</p>
        </div>
        <div className="flagq__empty">
          <div className="flagq__empty-mark">
            <Icon name="check" size={32} stroke={2.2} />
          </div>
          <div className="flagq__empty-text">
            Reps raise flags from their week view when they need help.
            They'll show up here, oldest first.
          </div>
        </div>
        <ResolvedSection state={state} onPickRep={onPickRep} onReopenAsk={onReopenAsk} activeTeam={activeTeam} viewerScope={viewerScope} regionPill={regionPill} />
      </div>
    );
  }

  return (
    <div className="flagq" data-screen-label="03 Flag Queue">
      <div className="flagq__head">
        <h1 className="flagq__title">Open flags</h1>
        <p className="flagq__sub">
          <strong>{openCount}</strong> active · sorted oldest first ·
          showing what reps need to move forward
        </p>
      </div>

      <div className="flagq__list">
        {open.map(f => (
          <div key={f.key} className="flagq__row" data-resolved={f.done ? "1" : "0"}>
            <div className="flagq__row-l">
              <Avatar rep={f.rep} size={36} />
              <div>
                <div className="flagq__row-rep">{f.rep.name}</div>
                <div className="flagq__row-meta">
                  Week {f.week.index} · {f.del.title}
                  {f.done && <span className="flagq__resolved-tag">Resolved (marked done)</span>}
                </div>
              </div>
            </div>
            <div className="flagq__row-text">"{f.ask.text}"</div>
            <button
              className="flagq__row-cta"
              onClick={() => onPickRep(f.repId, f.weekId)}
            >
              Open <Icon name="arrow-right" size={14} />
            </button>
          </div>
        ))}
      </div>

      <ResolvedSection state={state} onPickRep={onPickRep} onReopenAsk={onReopenAsk} activeTeam={activeTeam} viewerScope={viewerScope} regionPill={regionPill} />
    </div>
  );
}

// =====================================================================
// ResolvedSection — collapsed log of dismissed flags. Lives at the bottom
// of the FlagQueue. Filter by rep + time range; reopen or jump to the
// rep's week view from any row.
// =====================================================================
function ResolvedSection({ state, onPickRep, onReopenAsk, activeTeam, viewerScope, regionPill }) {
  const allowedRegions = viewerScope ? window.regionsUnderScope(viewerScope, regionPill) : null;
  const inRegion = rep => !allowedRegions || (rep && allowedRegions.includes(rep.region));
  const [open, setOpen] = React.useState(false);
  const [repFilter, setRepFilter] = React.useState("all");
  const [timeFilter, setTimeFilter] = React.useState("all");

  // Build hydrated rows from state.resolvedAsks.
  const all = React.useMemo(() => {
    const out = [];
    const src = state.resolvedAsks || {};
    for (const k of Object.keys(src)) {
      const entry = src[k];
      if (!entry || !entry.text) continue;
      const [repId, weekId, delId] = k.split("|");
      const rep = REPS.find(r => r.id === repId);
      const week = WEEKS.find(w => w.id === weekId);
      const del = DELIVERABLES.find(d => d.id === delId);
      if (!rep || !week || !del) continue;
      if (activeTeam && rep.team !== activeTeam) continue;
      if (!inRegion(rep)) continue;
      const hadNote = !!(state.managerNotes && state.managerNotes[k] && state.managerNotes[k].note);
      out.push({ key: k, repId, weekId, delId, rep, week, del, entry, hadNote });
    }
    // Newest first
    out.sort((a, b) => (b.entry.resolvedAt || "").localeCompare(a.entry.resolvedAt || ""));
    return out;
  }, [state.resolvedAsks, state.managerNotes, activeTeam, viewerScope, regionPill]);

  const repsPresent = React.useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const r of all) {
      if (!seen.has(r.repId)) { seen.add(r.repId); out.push(r.rep); }
    }
    return out;
  }, [all]);

  const filtered = React.useMemo(() => {
    let out = all;
    if (repFilter !== "all") out = out.filter(r => r.repId === repFilter);
    if (timeFilter === "30d") {
      const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
      out = out.filter(r => (r.entry.resolvedAt || "") >= cutoff);
    } else if (timeFilter === "quarter") {
      const now = new Date();
      const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).toISOString();
      out = out.filter(r => (r.entry.resolvedAt || "") >= qStart);
    }
    return out;
  }, [all, repFilter, timeFilter]);

  if (all.length === 0) return null;

  const durHours = (a, b) => Math.round((new Date(b) - new Date(a)) / 3600000);
  const fmtDur = h => h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
  const durClass = h => h <= 8 ? "fast" : h <= 72 ? "medium" : "slow";
  const fmtDate = iso => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <div className="resolved">
      <button className="resolved__toggle" onClick={() => setOpen(o => !o)}>
        <span className={"resolved__toggle-chevron" + (open ? " is-open" : "")}>
          <Icon name="chevron-right" size={13} stroke={2.4} />
        </span>
        <span className="resolved__toggle-label">Resolved flags</span>
        <span className="resolved__toggle-count">{all.length}</span>
      </button>

      {open && (
        <div className="resolved__body">
          <div className="resolved__filters">
            <span className="resolved__filters-label">Rep</span>
            <div className="resolved__rep-chips">
              <button
                className={"resolved__rep-chip chip-all" + (repFilter === "all" ? " is-active" : "")}
                onClick={() => setRepFilter("all")}
              >All</button>
              {repsPresent.map(rep => (
                <button
                  key={rep.id}
                  className={"resolved__rep-chip" + (repFilter === rep.id ? " is-active" : "")}
                  onClick={() => setRepFilter(rep.id)}
                >
                  <Avatar rep={rep} size={14} />
                  {rep.name.split(" ")[0]}
                </button>
              ))}
            </div>
            <div className="resolved__filters-sep"></div>
            <select
              className="resolved__time-select"
              value={timeFilter}
              onChange={e => setTimeFilter(e.target.value)}
            >
              <option value="all">All time</option>
              <option value="30d">Last 30 days</option>
              <option value="quarter">This quarter</option>
            </select>
          </div>

          <div className="resolved__log">
            {filtered.length === 0 ? (
              <div className="resolved__empty">No resolved flags match this filter.</div>
            ) : (
              filtered.map(f => {
                const hours = durHours(f.entry.raisedAt, f.entry.resolvedAt);
                const role = f.entry.resolvedBy && f.entry.resolvedBy.role;
                const byName = f.entry.resolvedBy && (f.entry.resolvedBy.name || (f.entry.resolvedBy.email || "").split("@")[0]);
                return (
                  <div key={f.key} className="resolved__row">
                    <div className="resolved__row-id">
                      <Avatar rep={f.rep} size={26} />
                      <div>
                        <div className="resolved__row-rep">{f.rep.name}</div>
                        <div className="resolved__row-meta">Wk {f.week.index} · {f.del.title}</div>
                      </div>
                    </div>
                    <div className="resolved__row-ask">"{f.entry.text}"</div>
                    <div><span className={"dur dur--" + durClass(hours)}>{fmtDur(hours)}</span></div>
                    <div className="resolved__row-stamp">
                      <strong>{fmtDate(f.entry.resolvedAt)}</strong>
                      <span className="resolved__row-stamp-who">
                        {isManagerialRole(role)
                          ? <>by {byName || "manager"}</>
                          : <>self-resolved</>}
                        {f.hadNote && (
                          <span style={{ color: "var(--brand)", opacity: 0.65 }} title="Manager note on file">
                            <Icon name="lock" size={10} stroke={2} />
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="resolved__row-actions">
                      {onReopenAsk && (
                        <button
                          className="res-btn res-btn--reopen"
                          onClick={() => onReopenAsk(f.repId, f.weekId, f.delId)}
                          title="Move back to open flags"
                        >
                          <Icon name="rotate-ccw" size={10} stroke={2.2} />
                          Reopen
                        </button>
                      )}
                      <button
                        className="res-btn"
                        onClick={() => onPickRep(f.repId, f.weekId)}
                        title={`Open ${f.rep.name}'s week ${f.week.index}`}
                      >
                        Wk {f.week.index} <Icon name="arrow-right" size={10} stroke={2.2} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// ManagerNote — small private note slot on each deliverable card.
// Only managers see this. Saves via onSaveNote handler.
// =====================================================================
function ManagerNote({ repId, weekId, delId, state, onSaveNote }) {
  const key = `${repId}|${weekId}|${delId}`;
  const existing = (state.managerNotes || {})[key];
  const noteText = existing ? existing.note : "";

  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(noteText);

  React.useEffect(() => { setDraft(noteText); }, [noteText]);

  const hasNote = !!noteText.trim();

  if (!open && !hasNote) {
    return (
      <button
        type="button"
        className="mgrnote mgrnote--add"
        onClick={() => setOpen(true)}
      >
        <span className="mgrnote__lock"><Icon name="lock" size={11} /></span>
        Add private manager note
      </button>
    );
  }

  if (!open && hasNote) {
    return (
      <div className="mgrnote mgrnote--saved">
        <div className="mgrnote__head">
          <span className="mgrnote__tag">
            <Icon name="lock" size={11} />
            Manager note · private
          </span>
          <button className="mgrnote__edit" onClick={() => setOpen(true)}>Edit</button>
        </div>
        <div className="mgrnote__body">{noteText}</div>
        {existing && existing.updated_by && (
          <div className="mgrnote__meta">
            {existing.updated_by} · {new Date(existing.updated_at).toLocaleDateString()}
          </div>
        )}
      </div>
    );
  }

  // Open editor
  return (
    <div className="mgrnote mgrnote--editing">
      <div className="mgrnote__head">
        <span className="mgrnote__tag">
          <Icon name="lock" size={11} />
          Manager note · private (rep can't see this)
        </span>
      </div>
      <textarea
        className="mgrnote__input"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        placeholder="1:1 prep, coaching note, follow-up. Only managers can read this."
        rows={3}
        autoFocus
      />
      <div className="mgrnote__actions">
        <button className="mgrnote__btn mgrnote__btn--ghost" onClick={() => { setDraft(noteText); setOpen(false); }}>
          Cancel
        </button>
        {hasNote && (
          <button
            className="mgrnote__btn mgrnote__btn--ghost"
            onClick={() => { onSaveNote(repId, weekId, delId, ""); setOpen(false); }}
          >Clear</button>
        )}
        <button
          className="mgrnote__btn mgrnote__btn--save"
          onClick={() => { onSaveNote(repId, weekId, delId, draft.trim()); setOpen(false); }}
          disabled={draft.trim() === noteText.trim()}
        >Save</button>
      </div>
    </div>
  );
}

// =====================================================================
// MarkedByStamp — shows "Marked by Jen (manager) · Mon Mar 4" under done state.
// Only renders when the check was set by someone OTHER than the rep themselves.
// =====================================================================
function MarkedByStamp({ check }) {
  if (!check || !check.markedBy) return null;
  const { markedBy } = check;
  if (!isManagerialRole(markedBy.role)) return null; // self-marks don't need attribution
  const roleLabel = markedBy.role === "team_admin" ? "team admin" : "manager";
  const when = markedBy.at ? new Date(markedBy.at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
  return (
    <div className="markedby">
      <Icon name="lock" size={11} />
      <span>Marked by <strong>{markedBy.name || markedBy.email}</strong> ({roleLabel}){when ? ` · ${when}` : ""}</span>
    </div>
  );
}

window.APP_PAGES = APP_PAGES;
window.FlagQueue = FlagQueue;
window.ManagerNote = ManagerNote;
window.MarkedByStamp = MarkedByStamp;
