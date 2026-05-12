// standup.jsx — Tue/Thu standup intake grid.
// Rows = active reps + manager (Jeff). Columns = 4 prompts. Each cell is an
// auto-saving textarea with @-mention autocomplete. Realtime so everyone
// sees everyone's typing within ~1s.

const { useState: useStandupState, useEffect: useStandupEffect, useRef: useStandupRef, useMemo: useStandupMemo } = React;

// Manager appears as a synthetic participant alongside the reps. Hue 250 = a
// purple distinct from the rest of the team's color wheel.
const MANAGER_PARTICIPANT = {
  id: "manager",
  name: "Jeff Hamons",
  role: "Manager",
  initials: "JH",
  hue: 250,
  skips: [],
  links: {},
};

const STANDUP_PROMPTS = [
  { key: "what_moved",    label: "Since last standup",   short: "moved" },
  { key: "pushing_next",  label: "What I'm pushing next", short: "next" },
  { key: "whats_slowing", label: "What's slowing me down", short: "slowing" },
  { key: "what_i_need",   label: "What I need",          short: "need" },
];

// Standup days: Tue (2) and Thu (4). All other days are skipped.
const STANDUP_DOWS = new Set([2, 4]);

function isStandupDay(d) {
  return STANDUP_DOWS.has(d.getDay());
}

function ymd(d) {
  // Local-time YYYY-MM-DD. Avoids the UTC-shift bug where new Date('2026-05-14')
  // becomes the previous evening in CST.
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${yr}-${mo}-${da}`;
}

function parseYmd(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function prevStandupDate(d) {
  const x = new Date(d); x.setDate(x.getDate() - 1);
  while (!isStandupDay(x)) x.setDate(x.getDate() - 1);
  return x;
}

function nextStandupDate(d) {
  const x = new Date(d); x.setDate(x.getDate() + 1);
  while (!isStandupDay(x)) x.setDate(x.getDate() + 1);
  return x;
}

function defaultStandupDate() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (isStandupDay(today)) return today;
  return prevStandupDate(today);
}

function formatStandupDate(d) {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

// Read ?date=YYYY-MM-DD from URL; fall back to default.
function dateFromUrl() {
  try {
    const p = new URLSearchParams(window.location.search);
    const v = p.get("date");
    if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) return parseYmd(v);
  } catch {}
  return defaultStandupDate();
}

function setDateInUrl(d) {
  try {
    const u = new URL(window.location.href);
    u.searchParams.set("date", ymd(d));
    history.replaceState({}, "", u.toString());
  } catch {}
}

// ── @-mention parsing ───────────────────────────────────────────────────────
// Pulls @<id> tokens out of text and returns the matching subset of `knownIds`.
// Case-insensitive; matches `@cammy`, `@Cammy`, `@CAMMY` all to "cammy".
function parseMentions(text, knownIds) {
  if (!text) return [];
  const re = /@([a-z][a-z0-9_-]*)/gi;
  const found = new Set();
  let m;
  while ((m = re.exec(text)) !== null) {
    const id = m[1].toLowerCase();
    if (knownIds.includes(id)) found.add(id);
  }
  return Array.from(found);
}

// Detect an active @-token at the cursor position. Returns { start, query }
// if the user is mid-mention (i.e. last `@` is unbroken by whitespace), or
// null otherwise.
function activeMentionAtCursor(text, caret) {
  const upto = text.slice(0, caret);
  const at = upto.lastIndexOf("@");
  if (at === -1) return null;
  const fragment = upto.slice(at + 1);
  // No space/newline between @ and caret → still actively mentioning.
  if (/\s/.test(fragment)) return null;
  // @ must be at start-of-string or preceded by whitespace (to avoid emails).
  if (at > 0 && !/\s/.test(text[at - 1])) return null;
  return { start: at, query: fragment.toLowerCase() };
}

// ── MentionAutocomplete ──────────────────────────────────────────────────────
function MentionAutocomplete({ participants, query, onPick, onClose }) {
  const items = useStandupMemo(() => {
    const q = query.trim();
    return participants
      .filter(p => p.id.toLowerCase().startsWith(q) || p.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [participants, query]);

  const [idx, setIdx] = useStandupState(0);
  useStandupEffect(() => { setIdx(0); }, [query]);

  useStandupEffect(() => {
    function onKey(e) {
      if (e.key === "ArrowDown") { e.preventDefault(); setIdx(i => Math.min(items.length - 1, i + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); }
      else if (e.key === "Enter" || e.key === "Tab") {
        if (items[idx]) { e.preventDefault(); onPick(items[idx]); }
      } else if (e.key === "Escape") { e.preventDefault(); onClose(); }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [items, idx, onPick, onClose]);

  if (items.length === 0) return null;

  return (
    <div className="standup-mention-pop" role="listbox">
      {items.map((p, i) => (
        <button
          type="button"
          key={p.id}
          role="option"
          aria-selected={i === idx}
          className={"standup-mention-pop__item" + (i === idx ? " is-on" : "")}
          onMouseDown={(e) => { e.preventDefault(); onPick(p); }}
          onMouseEnter={() => setIdx(i)}
        >
          <Avatar rep={p} size={20} />
          <span className="standup-mention-pop__name">{p.name}</span>
          <span className="standup-mention-pop__id">@{p.id}</span>
        </button>
      ))}
    </div>
  );
}

// ── StandupCell ─────────────────────────────────────────────────────────────
// Single textarea with debounced auto-save + @-mention autocomplete.
function StandupCell({ value, onChange, readOnly, placeholder, participants, cellId }) {
  const taRef = useStandupRef(null);
  const [local, setLocal] = useStandupState(value || "");
  const [mention, setMention] = useStandupState(null);

  const dirtyRef    = useStandupRef(false);
  // Keep refs to latest values so flush() is never a stale closure
  const localRef    = useStandupRef(local);
  const valueRef    = useStandupRef(value || "");
  const onChangeRef = useStandupRef(onChange);

  useStandupEffect(() => { localRef.current    = local;       }, [local]);
  useStandupEffect(() => { valueRef.current    = value || ""; }, [value]);
  useStandupEffect(() => { onChangeRef.current = onChange;    }, [onChange]);

  useStandupEffect(() => {
    if (!dirtyRef.current) setLocal(value || "");
  }, [value]);

  const saveTimerRef = useStandupRef(null);

  // flush always reads from refs — no stale closure
  function flush() {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    if (dirtyRef.current && localRef.current !== valueRef.current) {
      dirtyRef.current = false;
      onChangeRef.current(localRef.current);
    }
  }
  const flushRef = useStandupRef(flush);
  useStandupEffect(() => { flushRef.current = flush; });

  useStandupEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  function handleInput(e) {
    const v = e.target.value;
    localRef.current = v;       // update ref immediately, before setState
    setLocal(v);
    dirtyRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => flushRef.current(), 500);
    const caret = e.target.selectionStart;
    setMention(activeMentionAtCursor(v, caret));
  }

  function handleKeyUp(e) {
    if (!taRef.current) return;
    const caret = taRef.current.selectionStart;
    setMention(activeMentionAtCursor(local, caret));
  }

  function pickMention(participant) {
    if (!mention || !taRef.current) return;
    const before = local.slice(0, mention.start);
    const after = local.slice(mention.start + 1 + mention.query.length);
    const insertion = `@${participant.id} `;
    const next = before + insertion + after;
    localRef.current = next;
    setLocal(next);
    dirtyRef.current = true;
    setMention(null);
    // Restore focus + caret position just after the inserted handle.
    const newCaret = before.length + insertion.length;
    requestAnimationFrame(() => {
      if (taRef.current) {
        taRef.current.focus();
        taRef.current.setSelectionRange(newCaret, newCaret);
      }
    });
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flush, 500);
  }

  return (
    <div className="standup-cell">
      <textarea
        ref={taRef}
        id={cellId}
        className="standup-cell__ta"
        value={local}
        onChange={handleInput}
        onKeyUp={handleKeyUp}
        onBlur={() => flushRef.current()}
        placeholder={placeholder}
        readOnly={readOnly}
        rows={3}
      />
      {mention && !readOnly && (
        <MentionAutocomplete
          participants={participants}
          query={mention.query}
          onPick={pickMention}
          onClose={() => setMention(null)}
        />
      )}
    </div>
  );
}

// ── MentionedYouBanner ──────────────────────────────────────────────────────
// Surfaces any field on the current date where someone else tagged you.
function MentionedYouBanner({ myRepId, participants, entries, onJump }) {
  if (!myRepId) return null;
  const hits = [];
  for (const rowRepId of Object.keys(entries)) {
    if (rowRepId === myRepId) continue;
    const row = entries[rowRepId];
    if (!row) continue;
    for (const p of STANDUP_PROMPTS) {
      const text = row[p.key] || "";
      const m = parseMentions(text, [myRepId]);
      if (m.length > 0) {
        const fromRep = participants.find(x => x.id === rowRepId);
        hits.push({ fromRep, field: p, text });
      }
    }
  }
  if (hits.length === 0) return null;

  return (
    <div className="standup-banner" role="status">
      <div className="standup-banner__head">
        <span className="standup-banner__icon" aria-hidden="true">💬</span>
        <span>You were mentioned</span>
      </div>
      <ul className="standup-banner__list">
        {hits.map((h, i) => (
          <li key={i}>
            <button
              type="button"
              className="standup-banner__link"
              onClick={() => onJump(h.fromRep.id, h.field.key)}
            >
              <strong>{h.fromRep.name}</strong> in <em>{h.field.label}</em>
            </button>
            <div className="standup-banner__quote">"{h.text}"</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── StandupView ─────────────────────────────────────────────────────────────
function StandupView({ authedUser }) {
  const isManager = authedUser && authedUser.role === "manager";
  const myRepId = isManager ? "manager" : (authedUser && authedUser.rep_id) || null;

  // Participants: active reps (skip name === "TBD") + Jeff.
  const participants = useStandupMemo(() => {
    const active = REPS.filter(r => r.name !== "TBD");
    return [...active, MANAGER_PARTICIPANT];
  }, []);
  const participantIds = useStandupMemo(() => participants.map(p => p.id), [participants]);

  const [date, setDateState] = useStandupState(() => dateFromUrl());
  const [entries, setEntries] = useStandupState({}); // { rep_id: row }
  const [loading, setLoading] = useStandupState(true);

  function setDate(d) {
    setDateState(d);
    setDateInUrl(d);
  }

  // Load + subscribe whenever the date changes.
  useStandupEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const rows = await window.loadStandupForDate(ymd(date));
        if (cancelled) return;
        setEntries(rows);
        setLoading(false);
      } catch (e) {
        console.error("loadStandupForDate", e);
        if (!cancelled) setLoading(false);
      }
    })();
    const unsub = window.subscribeStandupChanges(ymd(date), (row) => {
      // Realtime echo — replace just that rep's row.
      setEntries(prev => ({ ...prev, [row.rep_id]: row }));
    });
    return () => { cancelled = true; unsub && unsub(); };
  }, [date]);

  async function onChangeField(repId, field, value) {
    // Optimistic local update.
    setEntries(prev => ({
      ...prev,
      [repId]: { ...(prev[repId] || {}), [field]: value },
    }));
    // Compute mentions across all 4 fields for the row after this edit lands.
    const current = entries[repId] || {};
    const merged = { ...current, [field]: value };
    const mergedText = STANDUP_PROMPTS.map(p => merged[p.key] || "").join("\n");
    const mentions = parseMentions(mergedText, participantIds);
    try {
      await window.saveStandupField(
        ymd(date), repId, field, value, mentions,
        authedUser ? authedUser.authEmail : null
      );
    } catch (e) {
      console.error("saveStandupField", e);
    }
  }

  function jumpTo(repId, fieldKey) {
    const el = document.getElementById(`standup-cell-${repId}-${fieldKey}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus({ preventScroll: true });
    }
  }

  const [sendoff, setSendoff] = useStandupState(false);

  useStandupEffect(() => {
    if (!sendoff) return;
    const t = setTimeout(() => setSendoff(false), 4200);
    const onKey = () => setSendoff(false);
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); };
  }, [sendoff]);

  const dateLabel = formatStandupDate(date);
  const today = new Date(); today.setHours(0,0,0,0);
  const todayYmd = ymd(today), dateYmd = ymd(date);
  const isTodayStandup = isStandupDay(today) && todayYmd === dateYmd;
  const isFutureStandup = dateYmd > todayYmd;
  const dateSubLabel = isTodayStandup
    ? "Today's standup"
    : isFutureStandup
      ? "Upcoming standup"
      : "Past standup";

  return (
    <div className="standup" data-screen-label="03 Standup">
      <style>{__STANDUP_STYLE}</style>
      {sendoff && (
        <div className="standup-sendoff" onClick={() => setSendoff(false)}>
          <div className="standup-sendoff__inner">
            <div className="standup-sendoff__line standup-sendoff__line--1">Now,</div>
            <div className="standup-sendoff__line standup-sendoff__line--2">go sell</div>
            <div className="standup-sendoff__line standup-sendoff__line--3">some shit.</div>
          </div>
          <div className="standup-sendoff__hint">tap or press any key to dismiss</div>
        </div>
      )}

      <header className="standup__head">
        <div className="standup__date-nav">
          <button
            type="button"
            className="standup__nav-btn"
            aria-label="Previous standup"
            onClick={() => setDate(prevStandupDate(date))}
          >‹</button>
          <div className="standup__date-label">
            <div className="standup__date-main">{dateLabel}</div>
            <div className="standup__date-sub">{dateSubLabel}</div>
          </div>
          <button
            type="button"
            className="standup__nav-btn"
            aria-label="Next standup"
            onClick={() => setDate(nextStandupDate(date))}
          >›</button>
        </div>
        <button
          type="button"
          className="standup__today-btn"
          onClick={() => setDate(defaultStandupDate())}
          disabled={ymd(date) === ymd(defaultStandupDate())}
        >Jump to current</button>
      </header>

      <MentionedYouBanner
        myRepId={myRepId}
        participants={participants}
        entries={entries}
        onJump={jumpTo}
      />

      {loading ? (
        <div className="standup__loading">Loading…</div>
      ) : (
        <div className="standup__grid" role="table" aria-label={`Standup for ${dateLabel}`}>
          <div className="standup__row standup__row--head" role="row">
            <div className="standup__cell standup__cell--rep-head" role="columnheader">Rep</div>
            {STANDUP_PROMPTS.map(p => (
              <div key={p.key} className="standup__cell standup__cell--prompt-head" role="columnheader">
                {p.label}
              </div>
            ))}
          </div>
          {participants.map(p => {
            const row = entries[p.id] || {};
            const isMyRow = p.id === myRepId;
            const canEdit = isMyRow || isManager;
            return (
              <div
                key={p.id}
                className={"standup__row" + (isMyRow ? " is-mine" : "")}
                role="row"
              >
                <div className="standup__cell standup__cell--rep" role="rowheader">
                  <Avatar rep={p} size={28} />
                  <div className="standup__rep-meta">
                    <div className="standup__rep-name">{p.name}</div>
                    <div className="standup__rep-role">{p.role}</div>
                  </div>
                </div>
                {STANDUP_PROMPTS.map(prompt => (
                  <div key={prompt.key} className="standup__cell standup__cell--input" role="cell">
                    <StandupCell
                      cellId={`standup-cell-${p.id}-${prompt.key}`}
                      value={row[prompt.key]}
                      onChange={(v) => onChangeField(p.id, prompt.key, v)}
                      readOnly={!canEdit}
                      placeholder=""
                      participants={participants}
                    />
                    {row.updated_at && row[prompt.key] && (
                      <div className="standup__cell-meta">
                        {row.updated_by ? `${row.updated_by.split("@")[0]} · ` : ""}
                        {new Date(row.updated_at).toLocaleTimeString([], {hour:"numeric", minute:"2-digit"})}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
      {isTodayStandup && (
        <div className="standup__sendoff-wrap">
          <button
            type="button"
            className="standup__end-btn"
            onClick={() => setSendoff(true)}
          >
            End standup
          </button>
        </div>
      )}
    </div>
  );
}

const __STANDUP_STYLE = `
  .standup { padding: 0; }
  .standup__head {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 18px; gap: 16px;
  }
  .standup__date-nav { display: flex; align-items: center; gap: 12px; }
  .standup__nav-btn {
    appearance: none; border: 1px solid rgba(0,0,0,.12); background: #fff;
    width: 32px; height: 32px; border-radius: 8px;
    font-size: 18px; line-height: 1; cursor: pointer;
    color: rgba(0,0,0,.7);
  }
  .standup__nav-btn:hover { background: rgba(0,0,0,.04); color: #000; }
  .standup__date-label { text-align: center; min-width: 200px; }
  .standup__date-main { font-size: 18px; font-weight: 600; }
  .standup__date-sub { font-size: 11px; color: rgba(0,0,0,.5); text-transform: uppercase; letter-spacing: .04em; }
  .standup__today-btn {
    appearance: none; border: 1px solid rgba(0,0,0,.12); background: #fff;
    padding: 7px 14px; border-radius: 8px; font-size: 13px; font-weight: 500;
    cursor: pointer;
  }
  .standup__today-btn:hover:not(:disabled) { background: rgba(0,0,0,.04); }
  .standup__today-btn:disabled { opacity: .4; cursor: default; }

  .standup__loading { text-align: center; padding: 40px; color: rgba(0,0,0,.4); }

  .standup__grid {
    display: grid;
    grid-template-columns: 200px repeat(4, minmax(180px, 1fr));
    background: rgba(0,0,0,.08);
    gap: 1px;
    border: 1px solid rgba(0,0,0,.08);
    border-radius: 12px;
    overflow: hidden;
  }
  .standup__row { display: contents; }
  .standup__cell {
    background: #fff;
    padding: 10px 12px;
    min-height: 60px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .standup__row--head .standup__cell {
    background: hsl(var(--accent-h, 250), 30%, 96%);
    font-weight: 600; font-size: 13px;
    color: rgba(0,0,0,.75);
    padding: 12px;
    min-height: 0;
  }
  .standup__cell--rep {
    flex-direction: row; align-items: center; gap: 10px;
  }
  .standup__cell--rep .standup__rep-meta { line-height: 1.3; }
  .standup__rep-name { font-weight: 600; font-size: 14px; }
  .standup__rep-role { font-size: 11px; color: rgba(0,0,0,.5); }
  .standup__row.is-mine .standup__cell--rep {
    background: hsl(var(--accent-h, 250), 40%, 97%);
  }

  .standup-cell { position: relative; flex: 1; display: flex; flex-direction: column; }
  .standup-cell__ta {
    width: 100%;
    border: 1px solid transparent;
    background: transparent;
    font: inherit; color: inherit;
    resize: none;
    padding: 6px 8px;
    border-radius: 6px;
    outline: none;
    min-height: 60px;
    line-height: 1.4;
    resize: vertical;
  }
  .standup-cell__ta:hover:not([readonly]) { background: rgba(0,0,0,.02); border-color: rgba(0,0,0,.06); }
  .standup-cell__ta:focus:not([readonly]) {
    background: #fff;
    border-color: hsl(var(--accent-h, 250), 50%, 55%);
    box-shadow: 0 0 0 3px hsla(var(--accent-h, 250), 50%, 55%, .15);
  }
  .standup-cell__ta[readonly] { cursor: default; color: rgba(0,0,0,.7); }

  .standup__cell-meta {
    font-size: 10px; color: rgba(0,0,0,.4);
    padding: 0 8px;
  }

  .standup-mention-pop {
    position: absolute;
    left: 0; right: 0; top: 100%;
    z-index: 100;
    background: #fff;
    border: 1px solid rgba(0,0,0,.12);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,.12);
    overflow: hidden;
    margin-top: 2px;
    max-width: 280px;
  }
  .standup-mention-pop__item {
    display: flex; align-items: center; gap: 8px;
    width: 100%; padding: 6px 10px;
    background: transparent; border: 0; cursor: pointer;
    font: inherit; text-align: left;
  }
  .standup-mention-pop__item.is-on { background: hsla(var(--accent-h, 250), 50%, 55%, .12); }
  .standup-mention-pop__name { font-weight: 500; }
  .standup-mention-pop__id { color: rgba(0,0,0,.45); font-size: 12px; margin-left: auto; }

  .standup-banner {
    background: hsla(var(--accent-h, 250), 60%, 95%, 1);
    border: 1px solid hsla(var(--accent-h, 250), 50%, 80%, 1);
    border-radius: 10px;
    padding: 14px 16px;
    margin-bottom: 16px;
  }
  .standup-banner__head { display: flex; align-items: center; gap: 8px; font-weight: 600; margin-bottom: 8px; }
  .standup-banner__icon { font-size: 16px; }
  .standup-banner__list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
  .standup-banner__link {
    appearance: none; border: 0; background: transparent; padding: 0;
    font: inherit; color: inherit; cursor: pointer; text-decoration: underline; text-decoration-color: rgba(0,0,0,.2);
  }
  .standup-banner__link:hover { text-decoration-color: rgba(0,0,0,.6); }
  .standup-banner__quote { color: rgba(0,0,0,.6); font-style: italic; font-size: 13px; padding-left: 12px; border-left: 2px solid rgba(0,0,0,.15); margin-top: 4px; }

  @media (max-width: 700px) {
    .standup__grid { grid-template-columns: 1fr; }
    .standup__row--head { display: none; }
    .standup__cell--rep { border-top: 2px solid rgba(0,0,0,.1); padding-top: 14px; }
    .standup__cell--input::before {
      content: attr(data-prompt);
      display: block;
      font-size: 11px; font-weight: 600; text-transform: uppercase;
      color: rgba(0,0,0,.5); letter-spacing: .04em; margin-bottom: 4px;
    }
  }

  /* End standup button */
  .standup__sendoff-wrap {
    display: flex; justify-content: center;
    margin-top: 40px; padding-bottom: 16px;
  }
  .standup__end-btn {
    appearance: none;
    background: #000; color: #fff;
    border: none; border-radius: 12px;
    padding: 14px 36px;
    font-family: inherit; font-size: 15px; font-weight: 700;
    letter-spacing: 0.06em; text-transform: uppercase;
    cursor: pointer;
    transition: background 150ms, transform 100ms;
  }
  .standup__end-btn:hover { background: #1a1a1a; transform: translateY(-1px); }
  .standup__end-btn:active { transform: translateY(0); }

  /* Sendoff overlay */
  .standup-sendoff {
    position: fixed; inset: 0; z-index: 9999;
    background: #000;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    cursor: pointer;
    animation: sendoff-in 0.3s ease-out forwards;
  }
  @keyframes sendoff-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  .standup-sendoff__inner {
    display: flex; flex-direction: column;
    align-items: center; gap: 4px;
    text-align: center;
  }
  .standup-sendoff__line {
    font-family: "Inter", -apple-system, sans-serif;
    font-weight: 700;
    font-size: clamp(52px, 10vw, 112px);
    line-height: 1.05;
    letter-spacing: -0.03em;
    text-transform: uppercase;
    opacity: 0;
    transform: translateY(24px);
  }
  .standup-sendoff__line--1 {
    color: rgba(255,255,255,0.5);
    font-size: clamp(28px, 5vw, 56px);
    font-weight: 400;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    animation: sendoff-word 0.5s cubic-bezier(0.16,1,0.3,1) 0.2s forwards;
  }
  .standup-sendoff__line--2 {
    color: #fff;
    animation: sendoff-word 0.5s cubic-bezier(0.16,1,0.3,1) 0.55s forwards;
  }
  .standup-sendoff__line--3 {
    color: #FF8200;
    animation: sendoff-word 0.5s cubic-bezier(0.16,1,0.3,1) 0.85s forwards;
  }
  @keyframes sendoff-word {
    from { opacity: 0; transform: translateY(24px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .standup-sendoff__hint {
    position: absolute; bottom: 32px;
    font-size: 12px; color: rgba(255,255,255,0.25);
    letter-spacing: 0.06em; text-transform: uppercase;
    animation: sendoff-word 0.5s cubic-bezier(0.16,1,0.3,1) 1.4s forwards;
    opacity: 0;
  }
`;

window.StandupView = StandupView;
window.__STANDUP_PROMPTS = STANDUP_PROMPTS;
