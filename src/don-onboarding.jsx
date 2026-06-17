// ============================================================
//  Don — Onboarding  ·  src/don-onboarding.jsx
//
//  Renders Don Hazelwood's induction as a live, checkable checklist.
//  Content is parsed at runtime from window.DON_INDUCTION_MD
//  (src/don-induction-content.js) — itself auto-derived from the
//  OneDrive master markdown. Nothing is hand-authored here; edit the
//  master, re-derive the content file, and this view reflows.
//
//  Persistence is PER-USER and durable, via the same Supabase round-trip
//  the rest of the dashboard uses (window.loadInductionState /
//  window.setInductionItem), with a localStorage fallback so the design
//  sandbox + offline both work. Checkboxes store '1'/'0'; the access-notes
//  textarea stores its text. Free-text fields don't count toward progress.
// ============================================================
(function () {
  const { useState, useEffect, useRef, useMemo } = React;

  // Day 1 of the induction == today (the master is dated 2026-06-18).
  const TODAY_LABEL = "Thursday, June 18, 2026";

  // Resource pack — shared OneDrive folder (confirmed share link). Per-file
  // deep links require per-file share URLs; until those exist, every REF opens
  // the shared folder and we show the exact relative path so Don finds the file.
  const PACK_FOLDER_URL =
    "https://mindtoolsltd-my.sharepoint.com/:f:/g/personal/jhamons_mindtools_com/IgDRXHdLLx5SSbQ2cqX-DvzvAcJvuJNkertMh7P0C2_xZDo?e=xdAjfJ";
  const PACK_ROOT = "NA Sales/Enablement/Onboarding/";

  // ----------------------------------------------------------
  //  Parser — markdown → structured model
  // ----------------------------------------------------------
  function parseRef(label) {
    const m = label.match(/\(REF:\s*([^)]+)\)/);
    if (!m) return { label: label.trim(), ref: null };
    const cleanLabel = label.replace(/\s*\(REF:\s*[^)]+\)\s*$/, "").trim();
    let path = m[1].trim();
    const rel = path.startsWith(PACK_ROOT) ? path.slice(PACK_ROOT.length) : path;
    return { label: cleanLabel, ref: { full: path, rel } };
  }

  function parseInduction(md) {
    const lines = md.split("\n");
    const meta = [];
    let intro = "";
    const sections = [];
    let cur = null;
    let curSub = "";          // most recent **subhead** within the section
    let inPreamble = true;

    // Parse the last MM/DD in a header into a 2026 Date (range end for spans).
    const sectionDate = (h) => {
      const all = [...h.matchAll(/(\d{1,2})\/(\d{1,2})/g)];
      if (!all.length) return null;
      const m = all[all.length - 1];
      const d = new Date(2026, parseInt(m[1], 10) - 1, parseInt(m[2], 10));
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const pushSection = (headerText) => {
      let day = headerText, title = "";
      if (headerText.includes(" — ")) {
        const i = headerText.indexOf(" — ");
        day = headerText.slice(0, i).trim();
        title = headerText.slice(i + 3).trim();
      } else if (headerText.includes(" · ")) {
        const i = headerText.indexOf(" · ");
        day = headerText.slice(0, i).trim();
        title = headerText.slice(i + 3).trim();
      }
      const dayNumMatch = day.match(/^Day (\d+)$/);
      const dayNum = dayNumMatch ? parseInt(dayNumMatch[1], 10) : null;
      const isResource = /resource pack/i.test(headerText);
      if (isResource) { day = ""; title = "Your resource pack"; }
      cur = {
        day, title, dayNum,
        date: sectionDate(headerText),
        isToday: false,
        isFocus: false,
        isResource,
        items: [],
      };
      curSub = "";
      sections.push(cur);
    };

    for (let raw of lines) {
      const line = raw.replace(/\s+$/, "");
      if (!line.trim()) continue;
      if (line === "---") continue;

      if (line.startsWith("# ") && inPreamble) continue; // page title — own header

      if (line.startsWith("## ")) {
        inPreamble = false;
        pushSection(line.slice(3).trim());
        continue;
      }

      if (inPreamble) {
        // meta: one or more **Key:** value pairs (· separated)
        if (line.startsWith("**")) {
          const re = /\*\*([^:*]+):\*\*\s*([^*]+?)(?=\s*\*\*|$)/g;
          let mm;
          while ((mm = re.exec(line)) !== null) {
            meta.push({ k: mm[1].trim(), v: mm[2].replace(/[·\s]+$/, "").trim() });
          }
        } else if (line.startsWith("> ")) {
          intro += (intro ? " " : "") + line.slice(2).trim();
        }
        continue;
      }

      // ---- section body ----
      if (!cur) continue;

      // resource bullet: - **Label** — desc
      let mRes = line.match(/^- \*\*(.+?)\*\*\s*[—-]\s*(.+)$/);
      if (cur.isResource && mRes) {
        cur.items.push({ type: "res", label: mRes[1].trim(), desc: mRes[2].trim() });
        continue;
      }

      // checkbox: - [ ] id :: label   /  - [x] id :: label
      let mChk = line.match(/^- \[([ xX])\]\s+(\S+)\s+::\s+(.+)$/);
      if (mChk) {
        const parsed = parseRef(mChk[3]);
        cur.items.push({
          type: "check",
          id: mChk[2],
          defaultChecked: mChk[1].toLowerCase() === "x",
          label: parsed.label,
          ref: parsed.ref,
          subgroup: curSub,
        });
        continue;
      }

      // free-text field: - [text] id :: placeholder
      let mTxt = line.match(/^- \[text\]\s+(\S+)\s+::\s+(.+)$/);
      if (mTxt) {
        cur.items.push({ type: "text", id: mTxt[1], placeholder: mTxt[2].trim() });
        continue;
      }

      // subhead: **bold** on its own line
      let mSub = line.match(/^\*\*(.+?)\*\*$/);
      if (mSub) { curSub = mSub[1].trim(); cur.items.push({ type: "subhead", text: curSub }); continue; }

      // blockquote helper / italic note
      if (line.startsWith("> ")) { cur.items.push({ type: "note", text: line.slice(2).trim() }); continue; }
      let mIt = line.match(/^_(.+)_$/);
      if (mIt) { cur.items.push({ type: "note", text: mIt[1].trim() }); continue; }

      // plain paragraph (section intro / resource lead-in) — strip md emphasis + backticks
      const para = line.replace(/`/g, "").replace(/\*\*/g, "");
      cur.items.push({ type: "para", text: para.trim() });
    }

    // Date-aware focus: highlight + expand the day section that IS today, else
    // the next upcoming day. Only "Day N" sections are candidates (not the
    // already-behind "Before Day 1" block or the far-out 30/60/90 milestones).
    const today = (typeof TODAY !== "undefined" && TODAY instanceof Date) ? new Date(TODAY) : new Date();
    today.setHours(0, 0, 0, 0);
    const dayS = sections.filter((s) => s.dayNum != null && s.date);
    const focus = dayS.find((s) => +s.date === +today)
      || dayS.filter((s) => +s.date >= +today).sort((a, b) => +a.date - +b.date)[0]
      || null;
    if (focus) { focus.isFocus = true; if (+focus.date === +today) focus.isToday = true; }

    return { meta, intro, sections };
  }

  // ----------------------------------------------------------
  //  Icons
  // ----------------------------------------------------------
  const Chevron = () => (
    <svg className="ind__sec-chev" width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
  const CheckMark = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
  );
  const SecDone = () => (
    <svg className="ind__sec-check" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></svg>
  );
  const ExtIcon = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></svg>
  );
  const FolderIcon = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
  );

  // ----------------------------------------------------------
  //  Access-notes textarea (debounced persistence)
  // ----------------------------------------------------------
  function NotesField({ id, placeholder, value, onSave, readOnly }) {
    const [text, setText] = useState(value || "");
    const [saved, setSaved] = useState(false);
    const timer = useRef(null);
    useEffect(() => { setText(value || ""); }, [value]);
    if (readOnly) {
      return (
        <div className="ind__notes-field ind__notes-field--ro">
          {value ? <div className="ind__ro-text">{value}</div>
                 : <div className="ind__ro-empty">Nothing logged yet.</div>}
        </div>
      );
    }
    const onChange = (e) => {
      const v = e.target.value;
      setText(v);
      setSaved(false);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { onSave(id, v); setSaved(true); }, 550);
    };
    return (
      <div className="ind__notes-field">
        <textarea value={text} placeholder={placeholder} onChange={onChange}
          onBlur={() => { if (timer.current) clearTimeout(timer.current); onSave(id, text); setSaved(true); }} />
        <div className="ind__notes-saved">{saved ? "Saved ✓ — Jeff can see this" : (text ? "Editing…" : "")}</div>
      </div>
    );
  }

  // Per-item inline note — used on each access/login row so Don can flag a
  // specific system right where it lives. Collapsed until there's something to
  // say; persists per-user under `<itemId>-note` like everything else.
  function ItemNote({ id, value, onSave, onFlag, readOnly }) {
    if (readOnly) {
      if (!value) return null;
      return (
        <div className="ind__inote ind__inote--ro">
          <span className="ind__inote-rolabel">Don noted:</span>
          <span className="ind__ro-text">{value}</span>
        </div>
      );
    }
    const [open, setOpen] = useState(!!value);
    const [text, setText] = useState(value || "");
    const [saved, setSaved] = useState(false);
    const timer = useRef(null);
    useEffect(() => { setText(value || ""); if (value) setOpen(true); }, [value]);
    const commit = (v) => { onSave(id, v); if (onFlag) onFlag(v); setSaved(true); };
    const onChange = (e) => {
      const v = e.target.value;
      setText(v); setSaved(false);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => commit(v), 500);
    };
    if (!open) {
      return (
        <button type="button" className="ind__inote ind__inote-add"
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
          + Add a note
        </button>
      );
    }
    return (
      <div className="ind__inote" onClick={(e) => e.stopPropagation()}>
        <input type="text" value={text} autoFocus={!value}
          placeholder='Working? Broken? e.g. "logs in but my territory is empty"'
          onChange={onChange}
          onBlur={() => { if (timer.current) clearTimeout(timer.current); commit(text); }} />
        <span className="ind__inote-saved">{text ? (saved ? "Saved ✓" : "…") : ""}</span>
      </div>
    );
  }

  // ----------------------------------------------------------
  //  Main view
  // ----------------------------------------------------------
  function DonOnboarding({ viewerIsManager = false, viewerRepId = "", onFlag } = {}) {
    const model = useMemo(() => parseInduction(window.DON_INDUCTION_MD || ""), []);
    // Manager (anyone who isn't Don) sees Don's induction READ-ONLY.
    const readOnly = !!viewerIsManager && viewerRepId !== "don";
    const [items, setItems] = useState({});   // id -> stored value ('1'/'0' or text)
    const [ready, setReady] = useState(false);
    const [open, setOpen] = useState(() => {
      const o = {};
      model.sections.forEach((s, i) => { if (s.isFocus) o[i] = true; });
      return o;
    });

    // Load persisted per-user state on mount
    useEffect(() => {
      let cancelled = false;
      (async () => {
        try {
          const loaded = readOnly
            ? (window.loadInductionStateFor ? await window.loadInductionStateFor("don") : {})
            : (window.loadInductionState ? await window.loadInductionState() : {});
          if (!cancelled) setItems(loaded || {});
        } catch (e) { console.error("loadInductionState", e); }
        if (!cancelled) setReady(true);
      })();
      return () => { cancelled = true; };
    }, [readOnly]);

    const isChecked = (it) => {
      const v = items[it.id];
      return v === "1" ? true : v === "0" ? false : !!it.defaultChecked;
    };

    const toggle = (it) => {
      if (readOnly) return;
      const next = isChecked(it) ? "0" : "1";
      setItems((s) => ({ ...s, [it.id]: next }));
      if (window.setInductionItem) window.setInductionItem(it.id, next).catch(console.error);
    };

    const saveText = (id, value) => {
      if (readOnly) return;
      const v = value || "";
      setItems((s) => { const n = { ...s }; if (v) n[id] = v; else delete n[id]; return n; });
      if (window.setInductionItem) window.setInductionItem(id, v).catch(console.error);
    };

    // progress helpers
    const secProgress = (sec) => {
      const checks = sec.items.filter((i) => i.type === "check");
      const done = checks.filter(isChecked).length;
      return { done, total: checks.length };
    };
    const overall = useMemo(() => {
      let done = 0, total = 0;
      model.sections.forEach((s) => { const p = secProgress(s); done += p.done; total += p.total; });
      return { done, total, pct: total ? (done / total) * 100 : 0 };
    }, [items, model]);

    const toggleOpen = (i) => setOpen((o) => ({ ...o, [i]: !o[i] }));

    // Manager summary — everything Don has logged about access/logins.
    const accessNotes = useMemo(() => {
      const out = [];
      model.sections.forEach((sec) => sec.items.forEach((it) => {
        if (it.type === "text") { const v = items[it.id]; if (v) out.push({ label: "Access notes (summary)", text: v }); }
        if (it.type === "check" && /^access/i.test(it.subgroup || "")) {
          const v = items[it.id + "-note"]; if (v) out.push({ label: it.label, text: v });
        }
      }));
      return out;
    }, [items, model]);

    return (
      <div className={"ind" + (readOnly ? " is-readonly" : "")} data-screen-label="05 Don Onboarding">
        {/* Header */}
        <div className="ind__head">
          <div className="ind__eyebrow"><span className="dot" /> New starter · Induction</div>
          <h1 className="ind__title">Don Hazelwood — Onboarding</h1>
          <div className="ind__meta">
            {model.meta.map((m, i) => (
              <div className="ind__meta-item" key={i}>
                <span className="ind__meta-k">{m.k}</span>
                <span className="ind__meta-v">{m.v}</span>
              </div>
            ))}
          </div>
          {model.intro && <p className="ind__intro">{model.intro}</p>}
        </div>

        {/* Manager read-only summary */}
        {readOnly && (
          <div className="ind__mgr">
            <div className="ind__mgr-banner">
              <span className="ind__mgr-dot" /> Read-only — this is <strong>Don's</strong> induction. You see his live
              progress and notes; only Don can check items off.
            </div>
            <div className="ind__mgr-notes">
              <div className="ind__mgr-notes-h">Access notes from Don</div>
              {accessNotes.length ? accessNotes.map((n, i) => (
                <div className="ind__mgr-note" key={i}>
                  <span className="ind__mgr-note-k">{n.label}</span>
                  <span className="ind__mgr-note-v">{n.text}</span>
                </div>
              )) : <div className="ind__ro-empty">No access issues logged yet.</div>}
            </div>
          </div>
        )}

        {/* Overall progress */}
        <div className="ind__overall">
          <span className="ind__overall-label">Overall progress</span>
          <div className="ind__overall-track">
            <div className="ind__overall-fill" style={{ width: `${overall.pct}%` }} />
          </div>
          <span className="ind__overall-num">{overall.done} / {overall.total}</span>
        </div>

        {/* Sections */}
        {model.sections.map((sec, si) => {
          const p = secProgress(sec);
          const isOpen = !!open[si];
          const allDone = p.total > 0 && p.done === p.total;
          return (
            <section
              key={si}
              className={
                "ind__sec" +
                (isOpen ? " is-open" : "") +
                (sec.isFocus ? " is-today" : "") +
                (allDone ? " is-done" : "")
              }
              data-day={sec.day}
            >
              <button className="ind__sec-head" onClick={() => toggleOpen(si)} aria-expanded={isOpen}>
                <Chevron />
                <div className="ind__sec-titles">
                  {sec.day && <div className="ind__sec-day">{sec.day}</div>}
                  <div className="ind__sec-title">{sec.title || sec.day}</div>
                </div>
                {sec.isToday
                  ? <span className="ind__today-pill">Today</span>
                  : sec.isFocus
                    ? <span className="ind__today-pill ind__next-pill">Up next</span>
                    : null}
                {p.total > 0 && (
                  allDone ? <SecDone /> : (
                    <div className="ind__sec-prog">
                      <div className="ind__sec-prog-track">
                        <div className="ind__sec-prog-fill" style={{ width: `${(p.done / p.total) * 100}%` }} />
                      </div>
                      <span className="ind__sec-prog-num">{p.done}/{p.total}</span>
                    </div>
                  )
                )}
              </button>

              {isOpen && (
                <div className="ind__sec-body">
                  {sec.isResource && (
                    <div className="ind__res">
                      {sec.items.map((it, ii) => {
                        if (it.type === "res")
                          return <div className="ind__res-row" key={ii}><strong>{it.label}</strong> — {it.desc}</div>;
                        if (it.type === "para")
                          return <div className="ind__res-row" key={ii}>{it.text}</div>;
                        return null;
                      })}
                      <a className="ind__res-folder" href={PACK_FOLDER_URL} target="_blank" rel="noopener noreferrer">
                        <FolderIcon /> Open the resource pack folder in OneDrive <ExtIcon />
                      </a>
                    </div>
                  )}

                  {!sec.isResource && sec.items.map((it, ii) => {
                    if (it.type === "subhead") return <div className="ind__subhead" key={ii}>{it.text}</div>;
                    if (it.type === "para") return <p className="ind__sec-intro" key={ii}>{it.text}</p>;
                    if (it.type === "note") return <div className="ind__note" key={ii}>{it.text}</div>;
                    if (it.type === "text")
                      return (
                        <NotesField key={ii} id={it.id} placeholder={it.placeholder}
                          value={items[it.id]} onSave={saveText} readOnly={readOnly} />
                      );
                    if (it.type === "check") {
                      const checked = isChecked(it);
                      return (
                        <div
                          key={ii}
                          className={"ind__item" + (checked ? " is-checked" : "")}
                          onClick={(e) => { if (e.target.closest("a") || e.target.closest(".ind__inote")) return; toggle(it); }}
                          role="checkbox" aria-checked={checked} tabIndex={0}
                          onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(it); } }}
                        >
                          <span className="ind__box"><CheckMark /></span>
                          <div className="ind__item-body">
                            <div className="ind__item-label">{it.label}</div>
                            {it.ref && (() => {
                              const direct = window.ONBOARDING_LINKS &&
                                (window.ONBOARDING_LINKS[it.ref.rel] || window.ONBOARDING_LINKS[it.ref.full]);
                              return (
                                <a className="ind__ref" href={direct || PACK_FOLDER_URL}
                                  target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                                  <FolderIcon /> {direct ? "Open file" : "Open in pack"}
                                  <span className="ind__ref-path">{it.ref.rel}</span>
                                  <ExtIcon />
                                </a>
                              );
                            })()}
                            {/^access/i.test(it.subgroup || "") && (
                              <ItemNote id={it.id + "-note"} value={items[it.id + "-note"]} onSave={saveText}
                                onFlag={onFlag ? (text) => onFlag(it.id, (it.label.split(" — ")[0] || it.label).trim(), text) : undefined}
                                readOnly={readOnly} />
                            )}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })}

                  {sec.isResource && (
                    <div className="ind__pack-note">
                      Each item above lives in the shared <strong>Onboarding</strong> folder. Per-file quick links
                      can be added once individual share links are issued — for now, open the folder and navigate
                      to the path shown on each task.
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    );
  }

  window.DonOnboarding = DonOnboarding;

  // Lightweight summary for the manager Home card — given a stored items map,
  // returns onboarding progress + how many access items have a note logged.
  window.donInductionSummary = function (items) {
    const model = parseInduction(window.DON_INDUCTION_MD || "");
    const m = items || {};
    let done = 0, total = 0, blockers = 0;
    model.sections.forEach((s) => s.items.forEach((it) => {
      if (it.type === "check") {
        total++;
        const v = m[it.id];
        const c = v === "1" ? true : v === "0" ? false : !!it.defaultChecked;
        if (c) done++;
        if (/^access/i.test(it.subgroup || "") && m[it.id + "-note"]) blockers++;
      }
    }));
    return { done, total, blockers };
  };
})();
