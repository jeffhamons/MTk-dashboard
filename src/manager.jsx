// manager.jsx — Manager-only features.
//
// Architecture: each manager feature is a self-contained component that
// reads from the shared `state` object and writes via the same handlers
// the rest of the app uses. To add a new manager page, drop a new
// component below and add it to APP_PAGES in pages.jsx.

// =====================================================================
// PAGE REGISTRY — single source of truth for nav.
// Filtered at render by user role. Append to extend.
// =====================================================================
const APP_PAGES = [
  { id: "rollup",        label: "Team rollup", icon: "team",  requires: "any"     },
  { id: "manager:flags", label: "Open flags",  icon: "flag",  requires: "manager" },
  // Future: { id: "manager:queue", label: "1:1 prep", requires: "manager" }
];

// =====================================================================
// FlagQueue — landing list of every open ask across the team, oldest first.
// The manager's "what needs attention right now" view.
// =====================================================================
function FlagQueue({ state, onPickRep }) {
  // Collect all open asks: state.asks is { "repId|weekId|delId": {text, at} }
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
  }, [state.asks, state.checks]);

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
  if (markedBy.role !== "manager") return null; // self-marks don't need attribution
  const when = markedBy.at ? new Date(markedBy.at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
  return (
    <div className="markedby">
      <Icon name="lock" size={11} />
      <span>Marked by <strong>{markedBy.name || markedBy.email}</strong> (manager){when ? ` · ${when}` : ""}</span>
    </div>
  );
}

window.APP_PAGES = APP_PAGES;
window.FlagQueue = FlagQueue;
window.ManagerNote = ManagerNote;
window.MarkedByStamp = MarkedByStamp;
