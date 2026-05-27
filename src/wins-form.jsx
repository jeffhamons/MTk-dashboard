// wins-form.jsx — Weekly Wins intake form.
// Replaces the per-rep Excel spreadsheet. Reps fill in their own wins weekly;
// managers can browse any rep's submission.
// Data: Supabase `wins` table (integer week_index), localStorage fallback.
// Week navigation covers historical data back to Mar 16, 2026.

const {
  useState:  useWFState,
  useEffect: useWFEffect,
  useRef:    useWFRef,
  useMemo:   useWFMemo,
} = React;

// ── Extended weeks — Mar 16 2026 (idx -5) through Jun 29 2026 (idx 10) ──────
// week_index 1 = Apr 27 2026 (Q2 anchor), matching the import script.
const WF_ANCHOR = new Date(2026, 3, 27); // Apr 27 = index 1

function buildWinsWeeks() {
  const out = [];
  for (let idx = -5; idx <= 10; idx++) {
    const monday = new Date(WF_ANCHOR);
    monday.setDate(WF_ANCHOR.getDate() + (idx - 1) * 7);
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    out.push({ weekIndex: idx, monday, friday });
  }
  return out;
}
const WF_WEEKS = buildWinsWeeks(); // 16 weeks total

function currentWFWeekIdx() {
  const today = new Date(); today.setHours(0,0,0,0);
  for (let i = 0; i < WF_WEEKS.length; i++) {
    const w = WF_WEEKS[i];
    const sunday = new Date(w.monday); sunday.setDate(w.monday.getDate() + 6);
    if (today >= w.monday && today <= sunday) return i;
  }
  if (today < WF_WEEKS[0].monday) return 0;
  return WF_WEEKS.length - 1;
}

function wfWeekLabel(w) {
  return fmtRange(w.monday, w.friday);
}

function wfWeekTag(w) {
  // e.g. "W1" for Q2 weeks, "Q1" label for pre-quarter
  if (w.weekIndex >= 1 && w.weekIndex <= 10) return `W${w.weekIndex}`;
  if (w.weekIndex <= 0) return `Q1`;
  return `W${w.weekIndex}`;
}

// ── localStorage fallback ──────────────────────────────────────────────────
const WF_LS_KEY = "mtk-wins-v2";
function lsGet()      { try { return JSON.parse(localStorage.getItem(WF_LS_KEY) || "{}"); } catch { return {}; } }
function lsSet(data)  { try { localStorage.setItem(WF_LS_KEY, JSON.stringify(data)); } catch {} }

// ── Data layer — Supabase preferred, localStorage fallback ─────────────────
async function wfLoad(weekIndex, repId) {
  if (window.SUPABASE_CONFIGURED && window.loadWins) {
    return window.loadWins(weekIndex, repId);
  }
  return lsGet()[`${weekIndex}|${repId}`] || null;
}

async function wfSave(weekIndex, repId, data, email) {
  if (window.SUPABASE_CONFIGURED && window.saveWins) {
    return window.saveWins(weekIndex, repId, data, email);
  }
  const all = lsGet();
  all[`${weekIndex}|${repId}`] = data;
  lsSet(all);
}

function wfSubscribe(weekIndex, onRow) {
  if (window.SUPABASE_CONFIGURED && window.subscribeWinsChanges) {
    return window.subscribeWinsChanges(weekIndex, onRow);
  }
  return () => {};
}

// ── Empty form ─────────────────────────────────────────────────────────────
function emptyForm() {
  return {
    worked_on: [{ task: "", why: "" }, { task: "", why: "" }, { task: "", why: "" }],
    invisible: [{ task: "", context: "" }],
    big_win:   { win: "", why: "" },
    hype:      [{ source: "", quote: "" }],
    updated_at: null,
    updated_by: null,
  };
}

// ── Auto-growing textarea ──────────────────────────────────────────────────
function WFTextarea({ value, onChange, placeholder, readOnly }) {
  const ref = useWFRef(null);
  useWFEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [value]);
  return (
    <textarea
      ref={ref}
      className="wf-ta"
      value={value}
      onChange={e => onChange && onChange(e.target.value)}
      onInput={e => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
      placeholder={placeholder}
      readOnly={readOnly}
      rows={2}
    />
  );
}

// ── Section card ───────────────────────────────────────────────────────────
function WFSection({ title, time, hint, highlight, children }) {
  return (
    <div className={"wf-section" + (highlight ? " wf-section--hl" : "")}>
      <div className="wf-section__head">
        <div>
          <div className="wf-section__title">{title}</div>
          {hint && <div className="wf-section__hint">{hint}</div>}
        </div>
        {time && <span className="wf-section__time">{time}</span>}
      </div>
      {children}
    </div>
  );
}

// ── Table primitives ───────────────────────────────────────────────────────
function WFTableHead({ col1, col2, withDel }) {
  return (
    <div className={"wf-table__head" + (withDel ? " has-del" : "")}>
      <div className="wf-col-label">{col1}</div>
      <div className="wf-col-label">{col2}</div>
      {withDel && <div />}
    </div>
  );
}

function WFTableRow({ children, withDel }) {
  return <div className={"wf-table__row" + (withDel ? " has-del" : "")}>{children}</div>;
}

function WFDel({ onClick, disabled }) {
  return (
    <button type="button" className="wf-del" onClick={onClick} disabled={disabled} aria-label="Remove">×</button>
  );
}

function WFAddRow({ onClick }) {
  return <button type="button" className="wf-add-row" onClick={onClick}>+ Add row</button>;
}

// ── Save status ────────────────────────────────────────────────────────────
function WFStatus({ status, lastSaved }) {
  const label = { saved: "Saved", saving: "Saving…", error: "Save failed" }[status] || "Saved";
  return (
    <div className="wf-status">
      <span className={"wf-status__dot wf-status__dot--" + status} />
      <span className="wf-status__label">{label}</span>
      {lastSaved && status === "saved" && <span className="wf-status__time">· {lastSaved}</span>}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
function WinsFormView({ authedUser }) {
  const isManager = authedUser && authedUser.role === "manager";
  const myRepId   = isManager ? null : (authedUser && authedUser.rep_id) || null;
  const email     = authedUser ? authedUser.authEmail : null;

  const activeReps = useWFMemo(() => REPS.filter(r => r.name !== "TBD"), []);

  const [viewingRepId, setViewingRepId] = useWFState(() =>
    isManager ? (activeReps[0]?.id || null) : (myRepId || activeReps[0]?.id || null)
  );

  const canEdit = !isManager;

  // Self-contained week navigation over the extended WF_WEEKS list
  const [wfIdx, setWfIdx] = useWFState(() => currentWFWeekIdx());
  const week = WF_WEEKS[wfIdx];

  const [form,    setForm   ] = useWFState(emptyForm);
  const [loading, setLoading] = useWFState(true);
  const [status,  setStatus ] = useWFState("saved");

  const saveTimer = useWFRef(null);

  // Load + subscribe on week/rep change
  useWFEffect(() => {
    if (!viewingRepId || !week) return;
    let cancelled = false;
    setLoading(true);
    wfLoad(week.weekIndex, viewingRepId).then(saved => {
      if (!cancelled) { setForm(saved || emptyForm()); setLoading(false); }
    }).catch(() => {
      if (!cancelled) { setForm(emptyForm()); setLoading(false); }
    });

    const unsub = wfSubscribe(week.weekIndex, (row) => {
      if (!cancelled && row.rep_id === viewingRepId) {
        setForm({
          worked_on:  row.worked_on  || [],
          invisible:  row.invisible  || [],
          big_win:    row.big_win    || { win: "", why: "" },
          hype:       row.hype       || [],
          updated_at: row.updated_at || null,
          updated_by: row.updated_by || null,
        });
      }
    });
    return () => { cancelled = true; unsub && unsub(); };
  }, [week?.weekIndex, viewingRepId]);

  // Debounced save
  function schedSave(next) {
    setStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const stamped = { ...next, updated_at: new Date().toISOString(), updated_by: email };
      wfSave(week.weekIndex, viewingRepId, stamped, email)
        .then(() => setStatus("saved"))
        .catch(() => setStatus("error"));
    }, 450);
  }

  function update(patch) {
    setForm(prev => {
      const next = { ...prev, ...patch };
      schedSave(next);
      return next;
    });
  }

  // Section helpers
  function setWorkedOn(idx, field, val) { update({ worked_on: form.worked_on.map((r,i) => i===idx ? {...r,[field]:val} : r) }); }
  function addWorkedOn() { update({ worked_on: [...form.worked_on, { task:"", why:"" }] }); }
  function delWorkedOn(idx) { if (form.worked_on.length<=1) return; update({ worked_on: form.worked_on.filter((_,i)=>i!==idx) }); }

  function setInvisible(idx, field, val) { update({ invisible: form.invisible.map((r,i) => i===idx ? {...r,[field]:val} : r) }); }
  function addInvisible() { update({ invisible: [...form.invisible, { task:"", context:"" }] }); }
  function delInvisible(idx) { if (form.invisible.length<=1) return; update({ invisible: form.invisible.filter((_,i)=>i!==idx) }); }

  function setBigWin(field, val) { update({ big_win: { ...form.big_win, [field]: val } }); }

  function setHype(idx, field, val) { update({ hype: form.hype.map((r,i) => i===idx ? {...r,[field]:val} : r) }); }
  function addHype() { update({ hype: [...form.hype, { source:"", quote:"" }] }); }
  function delHype(idx) { if (form.hype.length<=1) return; update({ hype: form.hype.filter((_,i)=>i!==idx) }); }

  const lastSaved = form.updated_at
    ? new Date(form.updated_at).toLocaleTimeString([], { hour:"numeric", minute:"2-digit" })
    : null;

  const isQ1Week = week && week.weekIndex < 1;
  const isFutureWeek = week && week.monday > new Date();

  return (
    <div className="wf" data-screen-label="04 Weekly Wins">
      <style>{__WF_STYLE}</style>

      {/* ── Header ── */}
      <div className="wf__header">
        <div className="wf__week-nav">
          <button type="button" className="wf__nav-btn"
            onClick={() => setWfIdx(i => Math.max(0, i-1))}
            disabled={wfIdx === 0} aria-label="Previous week">‹</button>
          <div className="wf__week-label">
            <div className="wf__week-main">
              <span className={"wf__week-tag" + (isQ1Week ? " wf__week-tag--q1" : "")}>{wfWeekTag(week)}</span>
              {wfWeekLabel(week)}
            </div>
            <div className="wf__week-sub">
              {isQ1Week ? "Q1 · Historical" : isFutureWeek ? "Upcoming" : "Due Friday 5 PM CT"}
            </div>
          </div>
          <button type="button" className="wf__nav-btn"
            onClick={() => setWfIdx(i => Math.min(WF_WEEKS.length-1, i+1))}
            disabled={wfIdx === WF_WEEKS.length-1} aria-label="Next week">›</button>
        </div>

        <div className="wf__header-right">
          <button type="button" className="wf__today-btn"
            onClick={() => setWfIdx(currentWFWeekIdx())}
            disabled={wfIdx === currentWFWeekIdx()}>
            Current week
          </button>

          {isManager ? (
            <div className="wf__rep-bar">
              <span className="wf__rep-bar-lbl">Viewing</span>
              <div className="wf__rep-pills">
                {activeReps.map(r => (
                  <button key={r.id} type="button"
                    className={"wf__rep-pill" + (viewingRepId===r.id ? " is-active" : "")}
                    onClick={() => setViewingRepId(r.id)}>
                    <Avatar rep={r} size={18} />
                    {r.name.split(" ")[0]}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            (() => {
              const rep = REPS.find(r => r.id === viewingRepId);
              return rep ? (
                <div className="wf__identity">
                  <Avatar rep={rep} size={28} />
                  <div>
                    <div className="wf__identity-name">{rep.name}</div>
                    <div className="wf__identity-role">{rep.role}</div>
                  </div>
                </div>
              ) : null;
            })()
          )}
        </div>
      </div>

      {loading ? (
        <div className="wf__loading">Loading…</div>
      ) : (
        <>
          {/* ── 1. What You Worked On ── */}
          <WFSection title="What You Worked On" time="~3 mins"
            hint="List 3–5 key tasks, deals, or major contributions.">
            <WFTableHead col1="Task / Deal / Activity"
              col2="Why It Mattered (saved time, reduced risk, moved a deal forward?)" withDel={canEdit} />
            {form.worked_on.map((row, idx) => (
              <WFTableRow key={idx} withDel={canEdit}>
                <WFTextarea value={row.task} onChange={v => setWorkedOn(idx,"task",v)} placeholder="What you did…" readOnly={!canEdit} />
                <WFTextarea value={row.why}  onChange={v => setWorkedOn(idx,"why",v)}  placeholder="Moved a deal forward, built trust, reduced risk…" readOnly={!canEdit} />
                {canEdit && <WFDel onClick={() => delWorkedOn(idx)} disabled={form.worked_on.length<=1} />}
              </WFTableRow>
            ))}
            {canEdit && <WFAddRow onClick={addWorkedOn} />}
          </WFSection>

          {/* ── 2. Invisible / Extra Work ── */}
          <WFSection title="Invisible / Extra Work" time="~1 min"
            hint="What did you do outside your job description, or that others might not notice?">
            <WFTableHead col1="What you did" col2="Context (why you stepped in, what it prevented or enabled)" withDel={canEdit} />
            {form.invisible.map((row, idx) => (
              <WFTableRow key={idx} withDel={canEdit}>
                <WFTextarea value={row.task}    onChange={v => setInvisible(idx,"task",v)}    placeholder="The thing you did…" readOnly={!canEdit} />
                <WFTextarea value={row.context} onChange={v => setInvisible(idx,"context",v)} placeholder="Why it mattered…" readOnly={!canEdit} />
                {canEdit && <WFDel onClick={() => delInvisible(idx)} disabled={form.invisible.length<=1} />}
              </WFTableRow>
            ))}
            {canEdit && <WFAddRow onClick={addInvisible} />}
          </WFSection>

          {/* ── 3. One Big Win ── */}
          <WFSection title="One Big Win" time="~1 min"
            hint="One thing that went well: resolved issue, closed deal, milestone, or positive feedback." highlight>
            <WFTableHead col1="The win" col2="Why it matters" withDel={false} />
            <WFTableRow withDel={false}>
              <WFTextarea value={form.big_win.win} onChange={v => setBigWin("win",v)} placeholder="What happened…" readOnly={!canEdit} />
              <WFTextarea value={form.big_win.why} onChange={v => setBigWin("why",v)} placeholder="Why it's significant…" readOnly={!canEdit} />
            </WFTableRow>
          </WFSection>

          {/* ── 4. Feedback / Hype File ── */}
          <WFSection title="Feedback / Signals" time="~2 mins"
            hint="Copy-paste any positive Teams messages, emails, or praise from clients or colleagues.">
            <WFTableHead col1="Who said it / Source" col2="What they said (copy-paste is fine)" withDel={canEdit} />
            {form.hype.map((row, idx) => (
              <WFTableRow key={idx} withDel={canEdit}>
                <WFTextarea value={row.source} onChange={v => setHype(idx,"source",v)} placeholder="Client name, colleague…" readOnly={!canEdit} />
                <WFTextarea value={row.quote}  onChange={v => setHype(idx,"quote",v)}  placeholder='"Direct quote or paraphrase…"' readOnly={!canEdit} />
                {canEdit && <WFDel onClick={() => delHype(idx)} disabled={form.hype.length<=1} />}
              </WFTableRow>
            ))}
            {canEdit && <WFAddRow onClick={addHype} />}
          </WFSection>

          {/* ── Footer ── */}
          {canEdit && (
            <div className="wf__footer"><WFStatus status={status} lastSaved={lastSaved} /></div>
          )}
          {isManager && form.updated_at && (
            <div className="wf__footer">
              <span style={{ fontSize:12, color:"var(--ink-50)" }}>
                Last updated {new Date(form.updated_at).toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"})}
                {form.updated_by ? ` by ${form.updated_by.split("@")[0]}` : ""}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── CSS ────────────────────────────────────────────────────────────────────
const __WF_STYLE = `
  .wf { display: flex; flex-direction: column; gap: 24px; padding-bottom: 56px; }

  .wf__header {
    display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 16px;
  }
  .wf__header-right { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }

  .wf__week-nav { display: flex; align-items: center; gap: 12px; }
  .wf__nav-btn {
    appearance: none; border: 1px solid var(--ink-20); background: var(--card);
    width: 32px; height: 32px; border-radius: 8px; font-size: 18px; line-height: 1;
    cursor: pointer; color: var(--ink-70);
    display: flex; align-items: center; justify-content: center; transition: background 100ms;
  }
  .wf__nav-btn:hover:not(:disabled) { background: var(--ink-05); color: var(--ink); }
  .wf__nav-btn:disabled { opacity: .3; cursor: default; }

  .wf__week-label { text-align: center; min-width: 200px; }
  .wf__week-main { font-size: 17px; font-weight: 600; display: flex; align-items: center; gap: 8px; justify-content: center; }
  .wf__week-sub  { font-size: 11px; color: var(--ink-50); text-transform: uppercase; letter-spacing: .05em; margin-top: 2px; }
  .wf__week-tag {
    font-size: 10px; font-weight: 700; letter-spacing: .05em;
    background: var(--brand-light); color: var(--brand-deep);
    border-radius: 4px; padding: 2px 6px;
  }
  .wf__week-tag--q1 { background: var(--ink-10); color: var(--ink-50); }

  .wf__today-btn {
    appearance: none; border: 1px solid var(--ink-20); background: var(--card);
    padding: 6px 12px; border-radius: 8px; font: inherit; font-size: 12px; font-weight: 500;
    cursor: pointer; color: var(--ink-70); white-space: nowrap; transition: background 100ms;
  }
  .wf__today-btn:hover:not(:disabled) { background: var(--ink-05); }
  .wf__today-btn:disabled { opacity: .35; cursor: default; }

  .wf__identity { display: flex; align-items: center; gap: 10px; }
  .wf__identity-name { font-size: 14px; font-weight: 600; }
  .wf__identity-role { font-size: 11px; color: var(--ink-50); }

  .wf__rep-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .wf__rep-bar-lbl { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--ink-50); }
  .wf__rep-pills { display: flex; flex-wrap: wrap; gap: 6px; }
  .wf__rep-pill {
    display: flex; align-items: center; gap: 6px;
    padding: 5px 12px 5px 7px; border-radius: var(--radius-pill);
    border: 1px solid var(--ink-20); background: var(--card);
    font: inherit; font-size: 13px; font-weight: 500; cursor: pointer;
    transition: border-color 120ms, background 120ms;
  }
  .wf__rep-pill:hover { border-color: var(--ink-50); }
  .wf__rep-pill.is-active { background: var(--brand); border-color: var(--brand); color: #fff; }

  .wf__loading { text-align: center; padding: 60px 0; color: var(--ink-50); font-size: 14px; }

  .wf-section {
    background: var(--card); border: 1px solid var(--ink-10);
    border-radius: var(--radius-card); overflow: hidden; box-shadow: var(--shadow-sm);
  }
  .wf-section--hl { border-color: var(--brand-light); box-shadow: var(--shadow-sm), 0 0 0 3px var(--brand-tint); }
  .wf-section__head {
    display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
    padding: 18px 22px 14px; border-bottom: 1px solid var(--ink-10);
  }
  .wf-section--hl .wf-section__head { background: var(--brand-tint); border-bottom-color: var(--brand-light); }
  .wf-section__title { font-size: 14px; font-weight: 700; letter-spacing: -.01em; }
  .wf-section--hl .wf-section__title { color: var(--brand-deep); }
  .wf-section__hint { margin-top: 3px; font-size: 12px; color: var(--ink-50); line-height: 1.45; }
  .wf-section__time {
    flex-shrink: 0; font-size: 11px; font-weight: 500; color: var(--ink-50);
    background: var(--ink-05); border-radius: var(--radius-pill); padding: 3px 10px;
    white-space: nowrap; margin-top: 1px;
  }
  .wf-section--hl .wf-section__time { background: var(--brand-light); color: var(--brand-deep); }

  .wf-table__head {
    display: grid; grid-template-columns: 1fr 1fr;
    background: var(--ink-05); border-bottom: 1px solid var(--ink-10);
  }
  .wf-table__head.has-del { grid-template-columns: 1fr 1fr 36px; }
  .wf-col-label { padding: 8px 16px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-50); }

  .wf-table__row { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid var(--ink-10); }
  .wf-table__row:last-of-type { border-bottom: 0; }
  .wf-table__row.has-del { grid-template-columns: 1fr 1fr 36px; }

  .wf-ta {
    display: block; width: 100%; border: none; border-right: 1px solid var(--ink-10);
    background: transparent; font: inherit; font-size: 13.5px; line-height: 1.55;
    color: var(--ink); padding: 11px 16px; resize: none; outline: none; overflow: hidden;
    min-height: 56px; transition: background 100ms;
  }
  .wf-table__row > .wf-ta:nth-child(2) { border-right: none; }
  .wf-ta:hover:not([readonly]) { background: oklch(97.5% .003 265); }
  .wf-ta:focus:not([readonly]) { background: var(--card); box-shadow: inset 0 0 0 2px var(--brand); position: relative; z-index: 1; }
  .wf-ta[readonly] { cursor: default; color: var(--ink-90); }
  .wf-ta::placeholder { color: var(--ink-30); }

  .wf-del {
    appearance: none; border: none; border-left: 1px solid var(--ink-10);
    background: transparent; width: 36px; min-height: 56px;
    font-size: 16px; color: var(--ink-30); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: color 120ms, background 120ms;
  }
  .wf-del:hover:not(:disabled) { color: #c33; background: #fff0f0; }
  .wf-del:disabled { opacity: .2; cursor: default; }

  .wf-add-row {
    display: block; width: 100%; padding: 9px 16px; text-align: left;
    font: inherit; font-size: 12.5px; font-weight: 500; color: var(--brand);
    background: transparent; border: none; border-top: 1px dashed var(--ink-20);
    cursor: pointer; transition: background 100ms;
  }
  .wf-add-row:hover { background: var(--brand-tint); }

  .wf__footer { display: flex; align-items: center; justify-content: flex-end; padding-top: 2px; }
  .wf-status { display: flex; align-items: center; gap: 6px; }
  .wf-status__dot { width: 6px; height: 6px; border-radius: 999px; background: var(--ink-30); flex-shrink: 0; transition: background 400ms; }
  .wf-status__dot--saved  { background: var(--done); }
  .wf-status__dot--saving { background: var(--orange-bright); }
  .wf-status__dot--error  { background: #c33; }
  .wf-status__label { font-size: 12px; color: var(--ink-50); }
  .wf-status__time  { font-size: 12px; color: var(--ink-30); }

  @media (max-width: 620px) {
    .wf__header { flex-direction: column; align-items: flex-start; }
    .wf-table__head, .wf-table__head.has-del,
    .wf-table__row,  .wf-table__row.has-del { grid-template-columns: 1fr; }
    .wf-table__head { display: none; }
    .wf-ta { border-right: none; border-bottom: 1px solid var(--ink-10); }
    .wf-ta:last-of-type { border-bottom: none; }
    .wf-del { border-left: none; border-top: 1px solid var(--ink-10); width: 100%; height: 36px; min-height: 0; }
  }
`;

window.WinsFormView = WinsFormView;
