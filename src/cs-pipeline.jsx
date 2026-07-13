// ── CS Pipeline + Won/Lost pages (RFC-158 Phase 3) ────────────────────────────
// window.CsPipelinePage  — manual judgments (front-runner / in-motion), decision 4
// window.CsWonLostPage   — won + lost lists (incl. lost-growth, decision 7)
// Data: window.loadCsDashboard() → pipeline[]; writes via insert/update/deleteCsPipelineItem.
// Region filter mirrors target-board (viewerScope + regionPill → regionsUnderScope).
// Money: formatCurrencyAmount / convertAmount / regionCurrencyLong (decision 3).
// A9: no feed soft-match on this surface — judgment rows always render; totals never
// depend on a renewal_book/expansion_book hit (loadCsDashboard has no feed rows here).
// ─────────────────────────────────────────────────────────────────────────────

const CspR = React;

const CSP_PRODUCTS = [
  "Performance Enablement",
  "Learning Technologies",
  "Learning Services",
];
const CSP_RAGS = ["green", "amber", "red"];
const CSP_REGIONS = ["US", "EMEA", "APAC"];

function cspRepName(repId) {
  if (!repId) return "—";
  const r = (window.REPS || []).find(x => x.id === repId);
  return r ? r.name : repId;
}

function cspCsReps() {
  return (window.REPS || []).filter(r => r.team === "cs");
}

function cspFmt(amount, currency) {
  const fmt = window.formatCurrencyAmount;
  if (typeof fmt === "function") return fmt(amount, currency || "USD");
  const n = Math.round(Number(amount) || 0);
  return String(n);
}

function cspConvert(amount, from, to) {
  const fn = window.convertAmount;
  if (typeof fn === "function") return fn(amount, from || "USD", to || "USD");
  return Math.round(Number(amount) || 0);
}

function cspRegionCurrency(regionId) {
  if (typeof window.regionCurrencyLong === "function") return window.regionCurrencyLong(regionId);
  const reg = (window.REGIONS || []).find(r => r.id === regionId);
  return (reg && reg.currency) || "USD";
}

function cspSum(rows, displayCurrency) {
  return (rows || []).reduce((s, row) => {
    const from = row.currency || cspRegionCurrency(row.region);
    return s + cspConvert(row.amount, from, displayCurrency);
  }, 0);
}

function cspRagLabel(rag) {
  if (rag === "amber") return "Amber";
  if (rag === "red") return "Red";
  if (rag === "green") return "Green";
  return "—";
}

function CspRagBadge({ rag }) {
  const key = (rag || "").toLowerCase();
  const colors = {
    red: { bg: "#FEE2E2", fg: "#991B1B" },
    amber: { bg: "#FEF3C7", fg: "#92400E" },
    green: { bg: "#DCFCE7", fg: "#166534" },
  };
  const c = colors[key] || { bg: "var(--ink-10, #f1f5f9)", fg: "var(--ink-50, #64748b)" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      borderRadius: 99, padding: "3px 9px", fontSize: 12, fontWeight: 700,
      background: c.bg, color: c.fg,
    }}>{cspRagLabel(key || null)}</span>
  );
}

function CspEmpty({ label }) {
  return (
    <div style={{ color: "var(--ink-50)", fontSize: 13, padding: "10px 2px" }}>
      {label || "No rows yet."}
    </div>
  );
}

function CspField({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, minWidth: 0 }}>
      <span style={{ color: "var(--ink-50)", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", fontSize: 10 }}>{label}</span>
      {children}
    </label>
  );
}

const cspInputStyle = {
  width: "100%", border: "1px solid var(--ink-20, #e2e8f0)", borderRadius: 8,
  padding: "7px 9px", font: "inherit", background: "#fff", boxSizing: "border-box",
};

function emptyPipelineDraft(stage, kind, region) {
  const rid = region || "EMEA";
  return {
    region: rid,
    stage,
    kind,
    client: "",
    product: CSP_PRODUCTS[0],
    amount: "",
    currency: cspRegionCurrency(rid),
    rep_id: "",
    rag: "green",
    notes: "",
    original_month: kind === "renewal" && stage === "in-motion" ? "" : null,
    estimated_close: kind === "growth" && (stage === "front-runner" || stage === "in-motion") ? "" : null,
    lost_reason: stage === "lost" ? "" : null,
  };
}

function rowToDraft(row) {
  return {
    region: row.region || "EMEA",
    stage: row.stage,
    kind: row.kind,
    client: row.client || "",
    product: row.product || "",
    amount: row.amount == null ? "" : String(row.amount),
    currency: row.currency || cspRegionCurrency(row.region),
    rep_id: row.rep_id || "",
    rag: row.rag || "green",
    notes: row.notes || "",
    original_month: row.original_month || "",
    estimated_close: row.estimated_close || "",
    lost_reason: row.lost_reason || "",
  };
}

function draftToPayload(draft, stage, kind) {
  const amountRaw = String(draft.amount == null ? "" : draft.amount).trim();
  const amount = amountRaw === "" ? null : Number(amountRaw);
  const payload = {
    region: draft.region,
    stage,
    kind,
    client: (draft.client || "").trim(),
    product: draft.product || null,
    amount: amount != null && !isNaN(amount) ? amount : null,
    currency: draft.currency || cspRegionCurrency(draft.region),
    rep_id: draft.rep_id || null,
    rag: draft.rag || null,
    notes: draft.notes || null,
    original_month: null,
    estimated_close: null,
    lost_reason: null,
  };
  if (kind === "renewal" && stage === "in-motion") {
    payload.original_month = draft.original_month || null;
  }
  if (kind === "growth" && (stage === "front-runner" || stage === "in-motion")) {
    payload.estimated_close = draft.estimated_close || null;
  }
  if (stage === "lost") {
    payload.lost_reason = draft.lost_reason || null;
  }
  return payload;
}

function CspRowEditor({ draft, onChange, stage, kind, onSave, onCancel, busy, error }) {
  const showMonth = kind === "renewal" && stage === "in-motion";
  const showClose = kind === "growth" && (stage === "front-runner" || stage === "in-motion");
  const showLost = stage === "lost";
  const set = (k, v) => onChange({ ...draft, [k]: v });
  const onRegion = (rid) => {
    const next = { ...draft, region: rid };
    if (!draft.currency || draft.currency === cspRegionCurrency(draft.region)) {
      next.currency = cspRegionCurrency(rid);
    }
    onChange(next);
  };
  return (
    <div style={{
      border: "1px solid var(--ink-20, #e2e8f0)", borderRadius: 14, padding: 14,
      background: "var(--surface, #fff)", marginBottom: 10,
      display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10,
    }}>
      <CspField label="Client">
        <input style={cspInputStyle} value={draft.client} onChange={e => set("client", e.target.value)} />
      </CspField>
      <CspField label="Product">
        <select style={cspInputStyle} value={draft.product || ""} onChange={e => set("product", e.target.value)}>
          <option value="">—</option>
          {CSP_PRODUCTS.map(p => <option key={p} value={p}>{p}</option>)}
          {draft.product && !CSP_PRODUCTS.includes(draft.product) && (
            <option value={draft.product}>{draft.product}</option>
          )}
        </select>
      </CspField>
      <CspField label="Amount">
        <input style={cspInputStyle} type="number" value={draft.amount} onChange={e => set("amount", e.target.value)} />
      </CspField>
      <CspField label="Currency">
        <select style={cspInputStyle} value={draft.currency || "USD"} onChange={e => set("currency", e.target.value)}>
          {(window.DISPLAY_CURRENCIES || ["GBP", "USD", "AUD"]).map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </CspField>
      <CspField label="Owner">
        <select style={cspInputStyle} value={draft.rep_id || ""} onChange={e => set("rep_id", e.target.value)}>
          <option value="">Unassigned</option>
          {cspCsReps().map(r => (
            <option key={r.id} value={r.id}>{r.name} ({r.region})</option>
          ))}
        </select>
      </CspField>
      <CspField label="RAG">
        <select style={cspInputStyle} value={draft.rag || "green"} onChange={e => set("rag", e.target.value)}>
          {CSP_RAGS.map(r => <option key={r} value={r}>{cspRagLabel(r)}</option>)}
        </select>
      </CspField>
      <CspField label="Region">
        <select style={cspInputStyle} value={draft.region} onChange={e => onRegion(e.target.value)}>
          {CSP_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </CspField>
      {showMonth && (
        <CspField label="Original month">
          <input style={cspInputStyle} value={draft.original_month || ""} onChange={e => set("original_month", e.target.value)} />
        </CspField>
      )}
      {showClose && (
        <CspField label="Estimated close">
          <input style={cspInputStyle} type="date" value={draft.estimated_close || ""} onChange={e => set("estimated_close", e.target.value)} />
        </CspField>
      )}
      {showLost ? (
        <CspField label="Lost reason">
          <input style={cspInputStyle} value={draft.lost_reason || ""} onChange={e => set("lost_reason", e.target.value)} />
        </CspField>
      ) : (
        <CspField label="Notes">
          <input style={cspInputStyle} value={draft.notes || ""} onChange={e => set("notes", e.target.value)} />
        </CspField>
      )}
      <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="tb-toggle__btn on" disabled={busy} onClick={onSave} style={{ cursor: busy ? "wait" : "pointer" }}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className="tb-toggle__btn" disabled={busy} onClick={onCancel}>Cancel</button>
        {error && <span style={{ color: "#991B1B", fontSize: 12 }}>{error}</span>}
      </div>
    </div>
  );
}

function CspRowView({ row, onEdit, onDelete, canWrite }) {
  const cur = row.currency || cspRegionCurrency(row.region);
  const meta = [];
  if (row.kind === "renewal" && row.stage === "in-motion" && row.original_month) {
    meta.push(`Original month: ${row.original_month}`);
  }
  if (row.kind === "growth" && row.estimated_close) {
    meta.push(`Est. close: ${row.estimated_close}`);
  }
  if (row.stage === "lost" && row.lost_reason) {
    meta.push(`Reason: ${row.lost_reason}`);
  } else if (row.notes) {
    meta.push(row.notes);
  }
  return (
    <div style={{
      border: "1px solid var(--ink-20, #e2e8f0)", borderRadius: 14, padding: "12px 14px",
      marginBottom: 10, background: "var(--surface, #fff)",
      display: "grid", gridTemplateColumns: "1.2fr 1fr 110px 1fr 90px auto", gap: 10, alignItems: "center",
    }}>
      <div>
        <div style={{ fontWeight: 700 }}>{row.client || "—"}</div>
        <div style={{ fontSize: 12, color: "var(--ink-50)" }}>{row.region}</div>
      </div>
      <div style={{ fontSize: 13 }}>{row.product || "—"}</div>
      <div style={{ fontFamily: "var(--font-mono, monospace)", fontWeight: 700 }}>{cspFmt(row.amount, cur)}</div>
      <div style={{ fontSize: 13 }}>{cspRepName(row.rep_id)}</div>
      <div><CspRagBadge rag={row.rag} /></div>
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        {canWrite && (
          <>
            <button type="button" className="tb-toggle__btn" onClick={onEdit}>Edit</button>
            <button type="button" className="tb-toggle__btn" onClick={onDelete} style={{ color: "#991B1B" }}>Delete</button>
          </>
        )}
      </div>
      {meta.length > 0 && (
        <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--ink-50)" }}>{meta.join(" · ")}</div>
      )}
    </div>
  );
}

function CspSection({ title, hint, rows, stage, kind, displayCurrency, canWrite, editingKey, draft, setDraft, busy, error, onStartAdd, onStartEdit, onCancel, onSave, onDelete, totalLabel }) {
  const total = cspSum(rows, displayCurrency);
  const sectionKey = `${stage}|${kind}|new`;
  const isAdding = editingKey === sectionKey;
  const sumLabel = totalLabel || (stage === "won" ? "Manual Won sum" : stage === "lost" ? "Lost sum" : "Potential");
  return (
    <section className="tb-section" style={{ marginTop: 22 }}>
      <div className="tb-section__head">
        <span className="tb-section__dot tb-section__dot--cs" />
        <h2 className="tb-section__title">{title}</h2>
        <span className="tb-section__hint">
          {hint ? `${hint} · ` : ""}
          {sumLabel} {cspFmt(total, displayCurrency)}
          {canWrite && (
            <button type="button" className="tb-toggle__btn" style={{ marginLeft: 10 }} onClick={onStartAdd} disabled={!!editingKey && !isAdding}>
              + Add row
            </button>
          )}
        </span>
      </div>
      {isAdding && draft && (
        <CspRowEditor
          draft={draft}
          onChange={setDraft}
          stage={stage}
          kind={kind}
          onSave={onSave}
          onCancel={onCancel}
          busy={busy}
          error={error}
        />
      )}
      {rows.length === 0 && !isAdding && <CspEmpty label={`No ${title.toLowerCase()} rows yet.`} />}
      {rows.map(row => {
        const key = String(row.id);
        if (editingKey === key) {
          return (
            <CspRowEditor
              key={key}
              draft={draft}
              onChange={setDraft}
              stage={stage}
              kind={kind}
              onSave={onSave}
              onCancel={onCancel}
              busy={busy}
              error={error}
            />
          );
        }
        return (
          <CspRowView
            key={key}
            row={row}
            canWrite={canWrite}
            onEdit={() => onStartEdit(row)}
            onDelete={() => onDelete(row)}
          />
        );
      })}
    </section>
  );
}

function useCsPipelineData(viewerScope, regionPill) {
  const [pipeline, setPipeline] = CspR.useState([]);
  const [loaded, setLoaded] = CspR.useState(false);
  const [loadError, setLoadError] = CspR.useState(null);

  const reload = CspR.useCallback(() => {
    if (typeof window.loadCsDashboard !== "function") {
      setPipeline([]);
      setLoaded(true);
      return Promise.resolve();
    }
    return window.loadCsDashboard().then(d => {
      setPipeline((d && d.pipeline) || []);
      setLoaded(true);
      setLoadError(null);
    }).catch(e => {
      setPipeline([]);
      setLoaded(true);
      setLoadError((e && e.message) || "Failed to load pipeline");
    });
  }, []);

  CspR.useEffect(() => { reload(); }, [reload]);

  const allowedRegions = viewerScope
    ? (typeof window.regionsUnderScope === "function"
      ? window.regionsUnderScope(viewerScope, regionPill)
      : null)
    : null;

  const rows = CspR.useMemo(() => {
    if (!allowedRegions) return pipeline || [];
    return (pipeline || []).filter(r => r && allowedRegions.includes(r.region));
  }, [pipeline, allowedRegions]);

  const defaultRegion = (allowedRegions && allowedRegions[0])
    || (viewerScope && viewerScope.regions && viewerScope.regions[0])
    || "EMEA";

  return { pipeline, setPipeline, rows, loaded, loadError, reload, defaultRegion, allowedRegions };
}

function usePipelineCrud(setPipeline) {
  const [editingKey, setEditingKey] = CspR.useState(null);
  const [draft, setDraft] = CspR.useState(null);
  const [busy, setBusy] = CspR.useState(false);
  const [error, setError] = CspR.useState(null);
  const editMeta = CspR.useRef({ stage: null, kind: null, id: null });

  const onCancel = () => {
    setEditingKey(null);
    setDraft(null);
    setError(null);
    editMeta.current = { stage: null, kind: null, id: null };
  };

  const onStartAdd = (stage, kind, defaultRegion) => {
    editMeta.current = { stage, kind, id: null };
    setEditingKey(`${stage}|${kind}|new`);
    setDraft(emptyPipelineDraft(stage, kind, defaultRegion));
    setError(null);
  };

  const onStartEdit = (row) => {
    editMeta.current = { stage: row.stage, kind: row.kind, id: row.id };
    setEditingKey(String(row.id));
    setDraft(rowToDraft(row));
    setError(null);
  };

  const onSave = async () => {
    const { stage, kind, id } = editMeta.current;
    if (!draft || !stage || !kind) return;
    const payload = draftToPayload(draft, stage, kind);
    setBusy(true);
    setError(null);
    try {
      if (id == null) {
        if (typeof window.insertCsPipelineItem !== "function") throw new Error("insertCsPipelineItem unavailable");
        const res = await window.insertCsPipelineItem(payload);
        if (res && res.error) throw new Error(res.error.message || "Insert failed");
        const inserted = (res && res.data) || [];
        if (inserted.length) {
          setPipeline(prev => [...(prev || []), ...inserted]);
        } else {
          // Local echo if API returned empty (offline/preview)
          setPipeline(prev => [...(prev || []), { ...payload, id: `local-${Date.now()}` }]);
        }
      } else {
        if (typeof window.updateCsPipelineItem !== "function") throw new Error("updateCsPipelineItem unavailable");
        const res = await window.updateCsPipelineItem(id, payload);
        if (res && res.error) throw new Error(res.error.message || "Update failed");
        const updated = (res && res.data && res.data[0]) || { id, ...payload };
        setPipeline(prev => (prev || []).map(r => (r.id === id ? { ...r, ...updated } : r)));
      }
      onCancel();
    } catch (e) {
      setError((e && e.message) || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (row) => {
    if (!row || row.id == null) return;
    if (typeof window.deleteCsPipelineItem !== "function") {
      setError("deleteCsPipelineItem unavailable");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await window.deleteCsPipelineItem(row.id);
      if (res && res.error) throw new Error(res.error.message || "Delete failed");
      setPipeline(prev => (prev || []).filter(r => r.id !== row.id));
      if (editingKey === String(row.id)) onCancel();
    } catch (e) {
      setError((e && e.message) || "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  return { editingKey, draft, setDraft, busy, error, onCancel, onStartAdd, onStartEdit, onSave, onDelete };
}

function CspCurrencyToggle({ value, onChange }) {
  const opts = window.DISPLAY_CURRENCIES || ["GBP", "USD", "AUD"];
  return (
    <div className="tb-toggle">
      {opts.map(c => (
        <button
          key={c}
          type="button"
          className={"tb-toggle__btn" + (c === value ? " on" : "")}
          aria-pressed={c === value}
          onClick={() => onChange(c)}
        >{c}</button>
      ))}
    </div>
  );
}

function CsPipelinePage({ authedUser, activeTeam, viewerScope, regionPill }) {
  const canWrite = typeof window.canManageAny === "function" ? window.canManageAny(authedUser) : true;
  const { rows, loaded, loadError, setPipeline, defaultRegion } = useCsPipelineData(viewerScope, regionPill);
  const crud = usePipelineCrud(setPipeline);
  const [displayCurrency, setDisplayCurrency] = CspR.useState("GBP");

  const sections = [
    { title: "Renewals · Front Runners", stage: "front-runner", kind: "renewal", hint: "manual tag" },
    { title: "Renewals · Dragger Inners", stage: "in-motion", kind: "renewal", hint: "in motion · original month" },
    { title: "Growth · Front Runners", stage: "front-runner", kind: "growth", hint: "manual tag" },
    { title: "Growth · In Motion", stage: "in-motion", kind: "growth", hint: "estimated close" },
  ];

  return (
    <div className="tb-view" data-screen-label="CS Pipeline">
      <div className="tb-eyebrow"><span className="tb-eyebrow__dot" />
        Customer Success · manual pipeline tags (not Salesforce stages)
      </div>
      <div className="tb-hrow">
        <div>
          <h1 className="tb-title"><em>Pipeline</em></h1>
          <p className="tb-sub">Front Runners and In Motion / Dragger Inners — Lara&apos;s judgment tags, edit-in-place.</p>
        </div>
        <CspCurrencyToggle value={displayCurrency} onChange={setDisplayCurrency} />
      </div>

      {!loaded && <CspEmpty label="Loading pipeline…" />}
      {loadError && <div style={{ color: "#991B1B", marginBottom: 12 }}>{loadError}</div>}
      {crud.error && !crud.editingKey && <div style={{ color: "#991B1B", marginBottom: 12 }}>{crud.error}</div>}

      {loaded && sections.map(sec => {
        const list = rows.filter(r => r.stage === sec.stage && r.kind === sec.kind);
        return (
          <CspSection
            key={`${sec.stage}-${sec.kind}`}
            title={sec.title}
            hint={sec.hint}
            rows={list}
            stage={sec.stage}
            kind={sec.kind}
            displayCurrency={displayCurrency}
            canWrite={canWrite}
            editingKey={crud.editingKey}
            draft={crud.draft}
            setDraft={crud.setDraft}
            busy={crud.busy}
            error={crud.error}
            onStartAdd={() => crud.onStartAdd(sec.stage, sec.kind, defaultRegion)}
            onStartEdit={crud.onStartEdit}
            onCancel={crud.onCancel}
            onSave={crud.onSave}
            onDelete={crud.onDelete}
          />
        );
      })}

      <div className="tb-note">
        ● Section totals are potential sums of open judgments only. Account linkage to Salesforce feed rows is best-effort and not used here — unmatched rows still show; no number depends on a match (A9).
      </div>
    </div>
  );
}

function CsWonLostPage({ authedUser, activeTeam, viewerScope, regionPill }) {
  const canWrite = typeof window.canManageAny === "function" ? window.canManageAny(authedUser) : true;
  const { rows, loaded, loadError, setPipeline, defaultRegion } = useCsPipelineData(viewerScope, regionPill);
  const crud = usePipelineCrud(setPipeline);
  const [displayCurrency, setDisplayCurrency] = CspR.useState("GBP");
  const [mode, setMode] = CspR.useState("won");

  const sections = mode === "won"
    ? [
      { title: "Won · Renewals", stage: "won", kind: "renewal", hint: "manual Won sum (not the fed home-page aggregate)" },
      { title: "Won · Growth", stage: "won", kind: "growth", hint: "manual Won sum (not the fed home-page aggregate)" },
    ]
    : [
      { title: "Lost · Renewals", stage: "lost", kind: "renewal", hint: "lost reason shown on each row" },
      { title: "Lost · Growth", stage: "lost", kind: "growth", hint: "lost-growth included per decision 7" },
    ];

  const modeRows = rows.filter(r => r.stage === mode);
  const modeTotal = cspSum(modeRows, displayCurrency);

  return (
    <div className="tb-view" data-screen-label="CS Won Lost">
      <div className="tb-eyebrow"><span className="tb-eyebrow__dot" />
        Customer Success · manual outcomes
      </div>
      <div className="tb-hrow">
        <div>
          <h1 className="tb-title"><em>{mode === "won" ? "Won" : "Lost"}</em></h1>
          <p className="tb-sub">
            {mode === "won"
              ? "Manual Won lists that feed Lara's actuals mechanic. Fed Salesforce aggregates live on the home page."
              : "Lost renewals and growth — every modeled outcome is rendered."}
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
          <div className="tb-toggle">
            <button type="button" className={"tb-toggle__btn" + (mode === "won" ? " on" : "")} aria-pressed={mode === "won"} onClick={() => setMode("won")}>Won</button>
            <button type="button" className={"tb-toggle__btn" + (mode === "lost" ? " on" : "")} aria-pressed={mode === "lost"} onClick={() => setMode("lost")}>Lost</button>
          </div>
          <CspCurrencyToggle value={displayCurrency} onChange={setDisplayCurrency} />
        </div>
      </div>

      <div className="tb-teamrow" style={{ marginBottom: 8 }}>
        <div className="tb-tcard">
          <div className="tb-tcard__l">
            <div className="tb-tcard__name">
              <span className="tb-tcard__dot tb-tcard__dot--cs" />
              {mode === "won" ? "Manual Won sum" : "Lost sum"} · in scope
            </div>
            <div className="tb-tcard__money">
              <b>{cspFmt(modeTotal, displayCurrency)}</b>
              {mode === "won"
                ? " · judgment totals only (home page shows fed actuals)"
                : " · amount at risk written off"}
            </div>
          </div>
        </div>
      </div>

      {!loaded && <CspEmpty label="Loading outcomes…" />}
      {loadError && <div style={{ color: "#991B1B", marginBottom: 12 }}>{loadError}</div>}
      {crud.error && !crud.editingKey && <div style={{ color: "#991B1B", marginBottom: 12 }}>{crud.error}</div>}

      {loaded && sections.map(sec => {
        const list = rows.filter(r => r.stage === sec.stage && r.kind === sec.kind);
        return (
          <CspSection
            key={`${sec.stage}-${sec.kind}`}
            title={sec.title}
            hint={sec.hint}
            rows={list}
            stage={sec.stage}
            kind={sec.kind}
            displayCurrency={displayCurrency}
            canWrite={canWrite}
            editingKey={crud.editingKey}
            draft={crud.draft}
            setDraft={crud.setDraft}
            busy={crud.busy}
            error={crud.error}
            onStartAdd={() => crud.onStartAdd(sec.stage, sec.kind, defaultRegion)}
            onStartEdit={crud.onStartEdit}
            onCancel={crud.onCancel}
            onSave={crud.onSave}
            onDelete={crud.onDelete}
          />
        );
      })}

      <div className="tb-note">
        {mode === "won"
          ? "● These are manual Won amounts. They intentionally stay separate from Salesforce-fed aggregates on the CS home page."
          : "● Lost-growth is modeled in the original file but was never rendered there — rendered here per decision 7."}
      </div>
    </div>
  );
}

window.CsPipelinePage = CsPipelinePage;
window.CsWonLostPage = CsWonLostPage;
