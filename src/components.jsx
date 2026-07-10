// Shared UI primitives for the Weekly Review.
// All visual decisions concentrated here.

const { useState, useEffect, useRef, useMemo } = React;

// ---------- Icons (stroke-based, custom — not generic icon set) ----------
function Icon({ name, size = 20, stroke = 1.6 }) {
  const s = size;
  const sw = stroke;
  const common = {
    width: s, height: s, viewBox: "0 0 24 24",
    fill: "none", stroke: "currentColor",
    strokeWidth: sw, strokeLinecap: "round", strokeLinejoin: "round",
  };
  switch (name) {
    case "wins":
      // a small flag/pennant on a pole — wins are claimed territory
      return (
        <svg {...common}>
          <path d="M5 21V4" />
          <path d="M5 4h12l-3 4 3 4H5" />
        </svg>
      );
    case "outreach":
      // concentric tiered rings — the tiered focus list
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      );
    case "commitments":
      // SF cloud / database — activity logged
      return (
        <svg {...common}>
          <path d="M7 17a4 4 0 0 1-1-7.87 5 5 0 0 1 9.7-1.13A4 4 0 0 1 17 17H7z" />
        </svg>
      );
    case "tracker":
      // closed loop — commitment made and closed
      return (
        <svg {...common}>
          <path d="M4 12a8 8 0 1 0 4-6.93" />
          <path d="M4 4v4h4" />
        </svg>
      );
    case "check":
      return (<svg {...common}><path d="M5 12.5l4.5 4.5L19 7" /></svg>);
    case "arrow-right":
      return (<svg {...common}><path d="M5 12h14M13 6l6 6-6 6" /></svg>);
    case "arrow-left":
      return (<svg {...common}><path d="M19 12H5M11 6l-6 6 6 6" /></svg>);
    case "external":
      return (<svg {...common}><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></svg>);
    case "clock":
      return (<svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>);
    case "calendar":
      return (<svg {...common}><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></svg>);
    case "team":
      return (<svg {...common}><circle cx="9" cy="9" r="3.5" /><circle cx="17" cy="11" r="2.5" /><path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M15 19c0-2 1-3.5 2.5-4.2" /></svg>);
    case "user":
      return (<svg {...common}><circle cx="12" cy="9" r="3.5" /><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" /></svg>);
    case "mail":
      return (<svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>);
    case "chevron-down":
      return (<svg {...common}><path d="M6 9l6 6 6-6" /></svg>);
    case "flag":
      return (<svg {...common}><path d="M5 21V4" /><path d="M5 4h13l-2 4 2 4H5" /></svg>);
    case "lock":
      return (<svg {...common}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>);
    case "home":
      return (<svg {...common}><path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V10.5z" /><path d="M9 21V13h6v8" /></svg>);
    case "standup":
      return (<svg {...common}><circle cx="12" cy="7" r="3" /><path d="M5 21c0-4 3-7 7-7s7 3 7 7" /><path d="M12 14v4" /><path d="M10 17h4" /></svg>);
    case "leaderboard":
      return (<svg {...common}><rect x="3" y="13" width="4" height="7" rx="1" /><rect x="9" y="8" width="4" height="12" rx="1" /><rect x="15" y="4" width="4" height="16" rx="1" /></svg>);
    case "onboarding":
      return (<svg {...common}><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4a3 3 0 0 1 6 0" /><path d="M9 13l2 2 4-4" /></svg>);
    default: return null;
  }
}

// ---------- Avatar ----------
function Avatar({ rep, size = 36 }) {
  const fontSize = Math.round(size * 0.36);
  const bg = `oklch(0.86 0.06 ${rep.hue})`;
  const fg = `oklch(0.32 0.07 ${rep.hue})`;
  const isTBD = rep.initials === "—" || rep.name === "TBD";
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: isTBD ? "transparent" : bg,
      color: isTBD ? "var(--ink-50)" : fg,
      border: isTBD ? "1.5px dashed var(--ink-30)" : "none",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontFamily: "var(--font-display)",
      fontWeight: 600, fontSize, letterSpacing: "0.02em",
      flex: "none",
    }}>{rep.initials}</div>
  );
}

// ---------- Pill ----------
function Pill({ children, tone = "neutral", small = false }) {
  const tones = {
    neutral: { bg: "var(--ink-05)", fg: "var(--ink-70)" },
    sage:    { bg: "var(--sage-15)", fg: "var(--sage-deep)" },
    coral:   { bg: "var(--coral-15)", fg: "var(--coral-deep)" },
    open:    { bg: "transparent",     fg: "var(--ink-50)", border: "1px dashed var(--ink-20)" },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: small ? "2px 8px" : "4px 10px",
      borderRadius: 999,
      background: t.bg, color: t.fg, border: t.border || "none",
      fontSize: small ? 11 : 12, fontWeight: 500,
      letterSpacing: "0.02em",
      textTransform: "uppercase",
      fontFamily: "var(--font-ui)",
    }}>{children}</span>
  );
}

// ---------- Big Check toggle ----------
// The hero interaction. Not a tiny checkbox — a confident toggle that
// fills with sage when complete. Encouraging, not performative.
function BigCheck({ checked, onToggle, label, readOnly }) {
  return (
    <button
      type="button"
      onClick={readOnly ? undefined : onToggle}
      aria-pressed={checked}
      aria-label={label}
      className="bigcheck"
      data-checked={checked ? "1" : "0"}
      data-readonly={readOnly ? "1" : "0"}
      disabled={readOnly}
      title={readOnly ? "Read only — only the rep can mark this done" : undefined}
    >
      <span className="bigcheck__fill" />
      <span className="bigcheck__icon">
        <Icon name="check" size={22} stroke={2.4} />
      </span>
      <span className="bigcheck__label">{checked ? "Done" : "Mark done"}</span>
    </button>
  );
}

// ---------- Mini status dot (for rollup grid) ----------
function StatusDot({ checked, size = 14 }) {
  return (
    <span
      className="statusdot"
      data-checked={checked ? "1" : "0"}
      style={{ width: size, height: size }}
      aria-label={checked ? "complete" : "incomplete"}
    />
  );
}

// ---------- Ask for Help ----------
// Optional flag a rep raises when they want the manager to look. Framed
// FORWARD ("what I need"), not backward ("why I failed"). Click to expand,
// type, save. Once raised, persists and shows on the rollup as a small flag.
//
// Two-way: when a manager is viewing a raised flag they can write a short
// response inline. The response is stored on the same row and is visible
// to the rep (closing the loop without scheduling a separate conversation).
function AskForHelp({ rep, weekId, delId, state, onAsk, onAskResponse, isManager, disabled }) {
  const askKey = `${rep.id}|${weekId}|${delId}`;
  const existing = state.asks && state.asks[askKey];
  const response = existing && existing.response;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(existing ? existing.text : "");
  const [respOpen, setRespOpen] = useState(false);
  const [respDraft, setRespDraft] = useState(response ? response.text : "");

  useEffect(() => {
    setDraft(existing ? existing.text : "");
  }, [askKey, existing && existing.text]);

  useEffect(() => {
    setRespDraft(response ? response.text : "");
  }, [askKey, response && response.text]);

  const hasFlag = !!existing;
  const hasResp = !!response;

  if (disabled && !hasFlag) return null;

  // Collapsed: no flag yet — show CTA
  if (!open && !hasFlag) {
    return (
      <button
        type="button"
        className="ask ask--cta"
        onClick={() => setOpen(true)}
      >
        <span className="ask__flag" aria-hidden>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 21V4" />
            <path d="M4 4h12l-2 4 2 4H4" />
          </svg>
        </span>
        <span>Need help on this</span>
      </button>
    );
  }

  // Response block — visible to both rep and manager whenever a response
  // exists. Manager can edit or clear from this block.
  const responseBlock = hasResp && !respOpen && (
    <div className="ask__response">
      <div className="ask__response-head">
        <span className="ask__response-tag">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          Manager response
          {response.byName ? ` · ${response.byName}` : ""}
          {response.at ? ` · ${new Date(response.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}
        </span>
        {isManager && onAskResponse && (
          <button
            type="button"
            className="ask__btn ask__btn--ghost"
            onClick={() => setRespOpen(true)}
          >Edit</button>
        )}
      </div>
      <div className="ask__response-text">{response.text}</div>
    </div>
  );

  // Response composer — manager-only, only when viewing a raised flag.
  const responseComposer = isManager && onAskResponse && hasFlag && (respOpen || !hasResp) && (
    <div className="ask__response ask__response--editing">
      <div className="ask__response-head">
        <span className="ask__response-tag">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          {hasResp ? "Edit response" : "Respond to this flag"}
        </span>
      </div>
      <textarea
        className="ask__input"
        placeholder="Two sentences. What you can offer, when, or what you need from them next."
        value={respDraft}
        onChange={e => setRespDraft(e.target.value)}
        rows={2}
        autoFocus={respOpen}
      />
      <div className="ask__foot">
        {hasResp && (
          <button
            type="button"
            className="ask__btn ask__btn--ghost"
            onClick={() => { setRespDraft(response.text); setRespOpen(false); }}
          >Cancel</button>
        )}
        {hasResp && (
          <button
            type="button"
            className="ask__btn ask__btn--ghost"
            onClick={() => { onAskResponse(rep.id, weekId, delId, ""); setRespOpen(false); setRespDraft(""); }}
            title="Clear response"
          >Clear</button>
        )}
        <button
          type="button"
          className="ask__btn ask__btn--primary"
          onClick={() => {
            const text = respDraft.trim();
            if (!text) return;
            onAskResponse(rep.id, weekId, delId, text);
            setRespOpen(false);
          }}
          disabled={!respDraft.trim() || (hasResp && respDraft.trim() === response.text)}
        >
          {hasResp ? "Update" : "Send response"}
        </button>
      </div>
    </div>
  );

  // Collapsed: flag is raised — show saved chip with the text, click to edit
  if (!open && hasFlag) {
    return (
      <div className="ask ask--saved" data-flag="1">
        <div className="ask__saved-main">
          <span className="ask__flag" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 21V4" />
              <path d="M4 4h12l-2 4 2 4H4" />
            </svg>
          </span>
          <div className="ask__saved-body">
            <div className="ask__saved-label">Flagged · what you need</div>
            <div className="ask__saved-text">{existing.text}</div>
          </div>
          <div className="ask__saved-actions">
            <button
              type="button"
              className="ask__btn ask__btn--ghost"
              onClick={() => setOpen(true)}
              disabled={disabled}
            >Edit</button>
            <button
              type="button"
              className="ask__btn ask__btn--ghost"
              onClick={() => { onAsk(rep.id, weekId, delId, ""); setDraft(""); }}
              disabled={disabled}
              title="Clear flag — issue is resolved"
            >Resolved</button>
          </div>
        </div>
        {responseBlock}
        {responseComposer}
      </div>
    );
  }

  return (
    <div className="ask ask--open" data-flag={hasFlag ? "1" : "0"}>
      <div className="ask__head">
        <span className="ask__label">
          <span className="ask__flag" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 21V4" />
              <path d="M4 4h12l-2 4 2 4H4" />
            </svg>
          </span>
          What I need to move this forward
        </span>
        {hasFlag && (
          <button
            type="button"
            className="ask__clear"
            onClick={() => { onAsk(rep.id, weekId, delId, ""); setOpen(false); setDraft(""); }}
            title="Clear flag"
          >Clear</button>
        )}
      </div>
      <textarea
        className="ask__input"
        placeholder="An intro, a decision, 15 minutes, a thought partner…"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        rows={2}
        autoFocus={open && !hasFlag}
      />
      <div className="ask__foot">
        <button type="button" className="ask__btn ask__btn--ghost" onClick={() => { setDraft(existing ? existing.text : ""); setOpen(false); }}>
          Cancel
        </button>
        <button
          type="button"
          className="ask__btn ask__btn--primary"
          onClick={() => {
            const text = draft.trim();
            onAsk(rep.id, weekId, delId, text);
            // Always close the editor after save/update — collapses to saved chip
            setOpen(false);
          }}
          disabled={!draft.trim()}
        >
          {hasFlag ? "Update" : "Raise flag"}
        </button>
      </div>
    </div>
  );
}

// =====================================================================
// EmailButton — opens user's default mail client with a Friday recap
// pre-filled. Two modes:
//   • "This week"     — current week only, the Friday close-out ritual
//   • "Whole quarter" — every week, used at end of cycle
// =====================================================================
function EmailButton({ rep, week, state }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const sendThisWeek = async () => {
    const msg = window.buildWeekEmail(rep, week, state);
    setOpen(false);
    await window.openMailto(msg);
  };
  const sendQuarter = async () => {
    const msg = window.buildQuarterEmail(rep, state, week && week.quarter ? week.quarter : undefined);
    setOpen(false);
    await window.openMailto(msg);
  };

  return (
    <div className="emailbtn" ref={ref}>
      <button
        className="emailbtn__trigger"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        title="Email this recap to yourself or your manager"
      >
        <Icon name="mail" size={15} />
        <span>Email recap</span>
        <Icon name="chevron-down" size={13} />
      </button>
      {open && (
        <div className="emailbtn__menu" role="menu">
          <button className="emailbtn__item" onClick={sendThisWeek}>
            <div className="emailbtn__item-title">This week only</div>
            <div className="emailbtn__item-sub">Friday close-out — week of {window.fmtShort(week.monday)}</div>
          </button>
          <button className="emailbtn__item" onClick={sendQuarter}>
            <div className="emailbtn__item-title">Full quarter recap</div>
            <div className="emailbtn__item-sub">All 10 weeks · status + asks</div>
          </button>
          <div className="emailbtn__hint">
            Opens your mail app in a new draft. Long recaps are copied to your clipboard — just paste.
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- QuarterGroup ----------
// Shared collapsible section for grouping weeks (or any content) by quarter.
// Header shows quarter label, date range, optional summary, and a chevron.
// When collapsed, children are not rendered — only the header stays.
function QuarterGroup({ quarter, defaultCollapsed, summary, children }) {
  const [collapsed, setCollapsed] = useState(!!defaultCollapsed);
  const qWeeks = (window.weeksForQuarter && window.weeksForQuarter(quarter.id)) || [];
  const rangeLabel = qWeeks.length && window.fmtRange
    ? window.fmtRange(qWeeks[0].monday, qWeeks[qWeeks.length - 1].sunday)
    : "";

  return (
    <div className={"qgroup" + (collapsed ? " qgroup--collapsed" : "")}>
      <button
        type="button"
        className="qgroup__header"
        onClick={() => setCollapsed(c => !c)}
        aria-expanded={!collapsed}
      >
        <span className="qgroup__label">{quarter.label}</span>
        <span className="qgroup__meta">
          {rangeLabel}
          {summary ? (rangeLabel ? " · " : "") + summary : null}
        </span>
        <span className="qgroup__chevron" aria-hidden="true">
          <Icon name="chevron-down" size={16} />
        </span>
      </button>
      {!collapsed && children}
    </div>
  );
}

Object.assign(window, { Icon, Avatar, Pill, BigCheck, StatusDot, AskForHelp, EmailButton, QuarterGroup });
