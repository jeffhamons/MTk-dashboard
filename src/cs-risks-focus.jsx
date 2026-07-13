// ── CS Risks + Current Focus pages (RFC-158 Phase 3) ─────────────────────────
// window.CsRisksPage — RAG risk register (region, RAG, risk, action, owner)
// window.CsFocusPage — Current Focus board by category
// Data: window.loadCsDashboard() → risks[] / currentFocus[];
// writes: insert/update/deleteCsRisk · insert/update/deleteCsCurrentFocus
// Region filter mirrors target-board (viewerScope + regionPill → regionsUnderScope).
// RAG: platform stores 'amber'; badge label is "Amber" (deliberate vs her YELLOW).
// No money on these pages — no currency helpers.
// ─────────────────────────────────────────────────────────────────────────────

const CsfR = React;

const CSF_RAGS = ["red", "amber", "green"];
const CSF_REGIONS = ["US", "EMEA", "APAC"];
const CSF_FOCUS_CATEGORIES = [
  { id: "priorities", title: "Current Priorities" },
  { id: "campaigns", title: "Campaigns" },
  { id: "incentives", title: "Incentives" },
  { id: "strategies", title: "Strategies" },
  { id: "internal", title: "Internal" },
  { id: "external", title: "External" },
  { id: "notes", title: "Notes" },
];

function csfRagLabel(rag) {
  if (rag === "amber") return "Amber";
  if (rag === "red") return "Red";
  if (rag === "green") return "Green";
  return "—";
}

function CsfRagBadge({ rag }) {
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
    }}>{csfRagLabel(key || null)}</span>
  );
}

function CsfEmpty({ label }) {
  return (
    <div style={{ color: "var(--ink-50)", fontSize: 13, padding: "10px 2px" }}>
      {label || "No rows yet."}
    </div>
  );
}

function CsfField({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, minWidth: 0 }}>
      <span style={{ color: "var(--ink-50)", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", fontSize: 10 }}>{label}</span>
      {children}
    </label>
  );
}

const csfInputStyle = {
  width: "100%", border: "1px solid var(--ink-20, #e2e8f0)", borderRadius: 8,
  padding: "7px 9px", font: "inherit", background: "#fff", boxSizing: "border-box",
};

function csfAllowedRegions(viewerScope, regionPill) {
  if (!viewerScope) return null;
  if (typeof window.regionsUnderScope === "function") {
    return window.regionsUnderScope(viewerScope, regionPill);
  }
  return null;
}

function csfDefaultRegion(viewerScope, regionPill) {
  const allowed = csfAllowedRegions(viewerScope, regionPill);
  if (allowed && allowed[0]) return allowed[0];
  if (viewerScope && viewerScope.regions && viewerScope.regions[0]) return viewerScope.regions[0];
  return "EMEA";
}

function csfRegionLabel(region) {
  if (region == null || region === "") return "Company-wide";
  return region;
}

// ── Risks data + CRUD ─────────────────────────────────────────────────────────

function emptyRiskDraft(region) {
  return {
    region: region || "EMEA",
    rag: "amber",
    risk: "",
    action: "",
    owner: "",
  };
}

function riskToDraft(row) {
  return {
    region: row.region || "EMEA",
    rag: row.rag || "amber",
    risk: row.risk || "",
    action: row.action || "",
    owner: row.owner || "",
  };
}

function riskDraftToPayload(draft) {
  return {
    region: draft.region,
    rag: draft.rag || "amber",
    risk: (draft.risk || "").trim(),
    action: (draft.action || "").trim(),
    owner: (draft.owner || "").trim() || null,
  };
}

function useCsRisksData(viewerScope, regionPill) {
  const [risks, setRisks] = CsfR.useState([]);
  const [loaded, setLoaded] = CsfR.useState(false);
  const [loadError, setLoadError] = CsfR.useState(null);

  const reload = CsfR.useCallback(() => {
    if (typeof window.loadCsDashboard !== "function") {
      setRisks([]);
      setLoaded(true);
      return Promise.resolve();
    }
    return window.loadCsDashboard().then(d => {
      setRisks((d && d.risks) || []);
      setLoaded(true);
      setLoadError(null);
    }).catch(e => {
      setRisks([]);
      setLoaded(true);
      setLoadError((e && e.message) || "Failed to load risks");
    });
  }, []);

  CsfR.useEffect(() => { reload(); }, [reload]);

  const allowedRegions = csfAllowedRegions(viewerScope, regionPill);

  const rows = CsfR.useMemo(() => {
    if (!allowedRegions) return risks || [];
    return (risks || []).filter(r => r && allowedRegions.includes(r.region));
  }, [risks, allowedRegions]);

  return {
    risks, setRisks, rows, loaded, loadError, reload,
    defaultRegion: csfDefaultRegion(viewerScope, regionPill),
    allowedRegions,
  };
}

function CsfRiskEditor({ draft, onChange, onSave, onCancel, busy, error }) {
  const set = (k, v) => onChange({ ...draft, [k]: v });
  return (
    <div style={{
      border: "1px solid var(--ink-20, #e2e8f0)", borderRadius: 14, padding: 14,
      background: "var(--surface, #fff)", marginBottom: 10,
      display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10,
    }}>
      <CsfField label="Region">
        <select style={csfInputStyle} value={draft.region} onChange={e => set("region", e.target.value)}>
          {CSF_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </CsfField>
      <CsfField label="RAG">
        <select style={csfInputStyle} value={draft.rag || "amber"} onChange={e => set("rag", e.target.value)}>
          {CSF_RAGS.map(r => <option key={r} value={r}>{csfRagLabel(r)}</option>)}
        </select>
      </CsfField>
      <CsfField label="Owner">
        <input style={csfInputStyle} value={draft.owner || ""} onChange={e => set("owner", e.target.value)} />
      </CsfField>
      <CsfField label="Risk">
        <input style={csfInputStyle} value={draft.risk || ""} onChange={e => set("risk", e.target.value)} />
      </CsfField>
      <CsfField label="Action">
        <input style={csfInputStyle} value={draft.action || ""} onChange={e => set("action", e.target.value)} />
      </CsfField>
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

function CsfRiskRow({ row, onEdit, onDelete, canWrite }) {
  return (
    <div style={{
      border: "1px solid var(--ink-20, #e2e8f0)", borderRadius: 14, padding: "12px 14px",
      marginBottom: 10, background: "var(--surface, #fff)",
      display: "grid",
      gridTemplateColumns: "80px 90px 1.2fr 1.2fr 1fr auto",
      gap: 10, alignItems: "center",
    }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>{row.region || "—"}</div>
      <div><CsfRagBadge rag={row.rag} /></div>
      <div style={{ fontSize: 13 }}>{row.risk || "—"}</div>
      <div style={{ fontSize: 13, color: "var(--ink-70, #334155)" }}>{row.action || "—"}</div>
      <div style={{ fontSize: 13 }}>{row.owner || "—"}</div>
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        {canWrite && (
          <>
            <button type="button" className="tb-toggle__btn" onClick={onEdit}>Edit</button>
            <button type="button" className="tb-toggle__btn" onClick={onDelete} style={{ color: "#991B1B" }}>Delete</button>
          </>
        )}
      </div>
    </div>
  );
}

function CsRisksPage({ authedUser, activeTeam, viewerScope, regionPill }) {
  const canWrite = typeof window.canManageAny === "function" ? window.canManageAny(authedUser) : true;
  const { rows, loaded, loadError, setRisks, defaultRegion } = useCsRisksData(viewerScope, regionPill);

  const [regionFilter, setRegionFilter] = CsfR.useState("all");
  const [ragFilter, setRagFilter] = CsfR.useState("all");
  const [editingKey, setEditingKey] = CsfR.useState(null);
  const [draft, setDraft] = CsfR.useState(null);
  const [busy, setBusy] = CsfR.useState(false);
  const [error, setError] = CsfR.useState(null);
  const editId = CsfR.useRef(null);

  const counts = CsfR.useMemo(() => {
    const c = { red: 0, amber: 0, green: 0 };
    (rows || []).forEach(r => {
      const k = (r.rag || "").toLowerCase();
      if (c[k] != null) c[k] += 1;
    });
    return c;
  }, [rows]);

  const filtered = CsfR.useMemo(() => {
    let list = rows || [];
    if (regionFilter !== "all") list = list.filter(r => r.region === regionFilter);
    if (ragFilter !== "all") list = list.filter(r => (r.rag || "").toLowerCase() === ragFilter);
    const order = { red: 0, amber: 1, green: 2 };
    return list.slice().sort((a, b) => {
      const ra = order[(a.rag || "").toLowerCase()];
      const rb = order[(b.rag || "").toLowerCase()];
      const oa = ra == null ? 9 : ra;
      const ob = rb == null ? 9 : rb;
      if (oa !== ob) return oa - ob;
      return String(a.region || "").localeCompare(String(b.region || ""));
    });
  }, [rows, regionFilter, ragFilter]);

  const onCancel = () => {
    setEditingKey(null);
    setDraft(null);
    setError(null);
    editId.current = null;
  };

  const onStartAdd = () => {
    editId.current = null;
    setEditingKey("new");
    setDraft(emptyRiskDraft(defaultRegion));
    setError(null);
  };

  const onStartEdit = (row) => {
    editId.current = row.id;
    setEditingKey(String(row.id));
    setDraft(riskToDraft(row));
    setError(null);
  };

  const onSave = async () => {
    if (!draft) return;
    const payload = riskDraftToPayload(draft);
    setBusy(true);
    setError(null);
    try {
      if (editId.current == null) {
        if (typeof window.insertCsRisk !== "function") throw new Error("insertCsRisk unavailable");
        const res = await window.insertCsRisk(payload);
        if (res && res.error) throw new Error(res.error.message || "Insert failed");
        const inserted = (res && res.data) || [];
        if (inserted.length) {
          setRisks(prev => [...(prev || []), ...inserted]);
        } else {
          setRisks(prev => [...(prev || []), { ...payload, id: `local-${Date.now()}` }]);
        }
      } else {
        const id = editId.current;
        if (typeof window.updateCsRisk !== "function") throw new Error("updateCsRisk unavailable");
        const res = await window.updateCsRisk(id, payload);
        if (res && res.error) throw new Error(res.error.message || "Update failed");
        const updated = (res && res.data && res.data[0]) || { id, ...payload };
        setRisks(prev => (prev || []).map(r => (r.id === id ? { ...r, ...updated } : r)));
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
    if (typeof window.deleteCsRisk !== "function") {
      setError("deleteCsRisk unavailable");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await window.deleteCsRisk(row.id);
      if (res && res.error) throw new Error(res.error.message || "Delete failed");
      setRisks(prev => (prev || []).filter(r => r.id !== row.id));
      if (editingKey === String(row.id)) onCancel();
    } catch (e) {
      setError((e && e.message) || "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tb-view" data-screen-label="CS Risks">
      <div className="tb-eyebrow"><span className="tb-eyebrow__dot" />
        Customer Success · flagged risks
      </div>
      <div className="tb-hrow">
        <div>
          <h1 className="tb-title"><em>Risks</em></h1>
          <p className="tb-sub">RAG register — region, risk, action, owner. Red first.</p>
        </div>
        {canWrite && (
          <button type="button" className="tb-toggle__btn on" onClick={onStartAdd} disabled={!!editingKey}>
            + Add risk
          </button>
        )}
      </div>

      <div className="tb-teamrow" style={{ marginBottom: 14, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
        {[
          { key: "red", label: "Red", color: "#EF4444", n: counts.red },
          { key: "amber", label: "Amber", color: "#F59E0B", n: counts.amber },
          { key: "green", label: "Green", color: "#22C55E", n: counts.green },
        ].map(card => (
          <div key={card.key} className="tb-tcard" style={{ minWidth: 0 }}>
            <div className="tb-tcard__l">
              <div className="tb-tcard__name">{card.label} risks</div>
              <div className="tb-tcard__money" style={{ color: card.color, fontSize: 28, fontWeight: 800 }}>{card.n}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <div className="tb-toggle">
          <button type="button" className={"tb-toggle__btn" + (regionFilter === "all" ? " on" : "")} onClick={() => setRegionFilter("all")}>All regions</button>
          {CSF_REGIONS.map(r => (
            <button key={r} type="button" className={"tb-toggle__btn" + (regionFilter === r ? " on" : "")} onClick={() => setRegionFilter(r)}>{r}</button>
          ))}
        </div>
        <div className="tb-toggle">
          <button type="button" className={"tb-toggle__btn" + (ragFilter === "all" ? " on" : "")} onClick={() => setRagFilter("all")}>All RAG</button>
          {CSF_RAGS.map(r => (
            <button key={r} type="button" className={"tb-toggle__btn" + (ragFilter === r ? " on" : "")} onClick={() => setRagFilter(r)}>{csfRagLabel(r)}</button>
          ))}
        </div>
      </div>

      {!loaded && <CsfEmpty label="Loading risks…" />}
      {loadError && <div style={{ color: "#991B1B", marginBottom: 12 }}>{loadError}</div>}
      {error && !editingKey && <div style={{ color: "#991B1B", marginBottom: 12 }}>{error}</div>}

      {loaded && (
        <section className="tb-section" style={{ marginTop: 8 }}>
          <div className="tb-section__head">
            <span className="tb-section__dot tb-section__dot--cs" />
            <h2 className="tb-section__title">Risk register</h2>
            <span className="tb-section__hint">{filtered.length} in view</span>
          </div>

          {editingKey === "new" && draft && (
            <CsfRiskEditor
              draft={draft}
              onChange={setDraft}
              onSave={onSave}
              onCancel={onCancel}
              busy={busy}
              error={error}
            />
          )}

          {filtered.length === 0 && editingKey !== "new" && (
            <CsfEmpty label="No risks match these filters." />
          )}

          {filtered.map(row => {
            const key = String(row.id);
            if (editingKey === key) {
              return (
                <CsfRiskEditor
                  key={key}
                  draft={draft}
                  onChange={setDraft}
                  onSave={onSave}
                  onCancel={onCancel}
                  busy={busy}
                  error={error}
                />
              );
            }
            return (
              <CsfRiskRow
                key={key}
                row={row}
                canWrite={canWrite}
                onEdit={() => onStartEdit(row)}
                onDelete={() => onDelete(row)}
              />
            );
          })}
        </section>
      )}

      <div className="tb-note">
        ● RAG values are green / amber / red. Amber is labeled Amber here (not YELLOW) to match the platform store value.
      </div>
    </div>
  );
}

// ── Current Focus data + CRUD ─────────────────────────────────────────────────

function emptyFocusDraft(category, region) {
  return {
    region: region === undefined ? null : region,
    category,
    content: "",
    position: 0,
  };
}

function focusToDraft(row) {
  return {
    region: row.region == null ? null : row.region,
    category: row.category,
    content: row.content || "",
    position: row.position == null ? 0 : row.position,
  };
}

function focusDraftToPayload(draft) {
  const region = draft.region === "" || draft.region === undefined ? null : draft.region;
  const posRaw = draft.position;
  const position = posRaw === "" || posRaw == null ? 0 : Number(posRaw);
  return {
    region,
    category: draft.category,
    content: (draft.content || "").trim(),
    position: isNaN(position) ? 0 : position,
  };
}

function useCsFocusData(viewerScope, regionPill) {
  const [currentFocus, setCurrentFocus] = CsfR.useState([]);
  const [loaded, setLoaded] = CsfR.useState(false);
  const [loadError, setLoadError] = CsfR.useState(null);

  const reload = CsfR.useCallback(() => {
    if (typeof window.loadCsDashboard !== "function") {
      setCurrentFocus([]);
      setLoaded(true);
      return Promise.resolve();
    }
    return window.loadCsDashboard().then(d => {
      setCurrentFocus((d && d.currentFocus) || []);
      setLoaded(true);
      setLoadError(null);
    }).catch(e => {
      setCurrentFocus([]);
      setLoaded(true);
      setLoadError((e && e.message) || "Failed to load current focus");
    });
  }, []);

  CsfR.useEffect(() => { reload(); }, [reload]);

  const allowedRegions = csfAllowedRegions(viewerScope, regionPill);

  const rows = CsfR.useMemo(() => {
    const all = currentFocus || [];
    if (!allowedRegions) return all;
    // Company-wide (region NULL) always visible; region-scoped filtered to allow-list.
    return all.filter(r => !r || r.region == null || allowedRegions.includes(r.region));
  }, [currentFocus, allowedRegions]);

  return {
    currentFocus, setCurrentFocus, rows, loaded, loadError, reload,
    defaultRegion: csfDefaultRegion(viewerScope, regionPill),
    allowedRegions,
  };
}

function CsfFocusEditor({ draft, onChange, onSave, onCancel, busy, error }) {
  const set = (k, v) => onChange({ ...draft, [k]: v });
  const regionVal = draft.region == null ? "" : draft.region;
  return (
    <div style={{
      border: "1px solid var(--ink-20, #e2e8f0)", borderRadius: 14, padding: 14,
      background: "var(--surface, #fff)", marginBottom: 10,
      display: "grid", gridTemplateColumns: "120px 1fr 90px auto", gap: 10, alignItems: "end",
    }}>
      <CsfField label="Scope">
        <select style={csfInputStyle} value={regionVal} onChange={e => set("region", e.target.value === "" ? null : e.target.value)}>
          <option value="">Company-wide</option>
          {CSF_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </CsfField>
      <CsfField label="Content">
        <textarea
          style={{ ...csfInputStyle, minHeight: 56, resize: "vertical" }}
          value={draft.content || ""}
          onChange={e => set("content", e.target.value)}
        />
      </CsfField>
      <CsfField label="Position">
        <input
          style={csfInputStyle}
          type="number"
          value={draft.position == null ? 0 : draft.position}
          onChange={e => set("position", e.target.value)}
        />
      </CsfField>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", paddingBottom: 2 }}>
        <button type="button" className="tb-toggle__btn on" disabled={busy} onClick={onSave} style={{ cursor: busy ? "wait" : "pointer" }}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className="tb-toggle__btn" disabled={busy} onClick={onCancel}>Cancel</button>
        {error && <span style={{ color: "#991B1B", fontSize: 12 }}>{error}</span>}
      </div>
    </div>
  );
}

function CsfFocusRow({ row, onEdit, onDelete, canWrite }) {
  return (
    <div style={{
      border: "1px solid var(--ink-20, #e2e8f0)", borderRadius: 14, padding: "12px 14px",
      marginBottom: 8, background: "var(--surface, #fff)",
      display: "grid", gridTemplateColumns: "110px 1fr auto", gap: 10, alignItems: "start",
    }}>
      <div>
        <div style={{ fontSize: 11, color: "var(--ink-50)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Scope</div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{csfRegionLabel(row.region)}</div>
        <div style={{ fontSize: 11, color: "var(--ink-50)", marginTop: 4 }}>#{row.position == null ? 0 : row.position}</div>
      </div>
      <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{row.content || "—"}</div>
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        {canWrite && (
          <>
            <button type="button" className="tb-toggle__btn" onClick={onEdit}>Edit</button>
            <button type="button" className="tb-toggle__btn" onClick={onDelete} style={{ color: "#991B1B" }}>Delete</button>
          </>
        )}
      </div>
    </div>
  );
}

function CsfFocusSection({
  category, title, rows, canWrite,
  editingKey, draft, setDraft, busy, error,
  onStartAdd, onStartEdit, onCancel, onSave, onDelete,
}) {
  const sectionKey = `${category}|new`;
  const isAdding = editingKey === sectionKey;
  const ordered = (rows || []).slice().sort((a, b) => {
    const pa = a.position == null ? 0 : a.position;
    const pb = b.position == null ? 0 : b.position;
    if (pa !== pb) return pa - pb;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });

  return (
    <section className="tb-section" style={{ marginTop: 22 }}>
      <div className="tb-section__head">
        <span className="tb-section__dot tb-section__dot--cs" />
        <h2 className="tb-section__title">{title}</h2>
        <span className="tb-section__hint">
          {ordered.length} item{ordered.length === 1 ? "" : "s"}
          {canWrite && (
            <button
              type="button"
              className="tb-toggle__btn"
              style={{ marginLeft: 10 }}
              onClick={onStartAdd}
              disabled={!!editingKey && !isAdding}
            >
              + Add item
            </button>
          )}
        </span>
      </div>

      {isAdding && draft && (
        <CsfFocusEditor
          draft={draft}
          onChange={setDraft}
          onSave={onSave}
          onCancel={onCancel}
          busy={busy}
          error={error}
        />
      )}

      {ordered.length === 0 && !isAdding && (
        <CsfEmpty label={`No ${title.toLowerCase()} yet.`} />
      )}

      {ordered.map(row => {
        const key = String(row.id);
        if (editingKey === key) {
          return (
            <CsfFocusEditor
              key={key}
              draft={draft}
              onChange={setDraft}
              onSave={onSave}
              onCancel={onCancel}
              busy={busy}
              error={error}
            />
          );
        }
        return (
          <CsfFocusRow
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

function CsFocusPage({ authedUser, activeTeam, viewerScope, regionPill }) {
  const canWrite = typeof window.canManageAny === "function" ? window.canManageAny(authedUser) : true;
  const { rows, loaded, loadError, setCurrentFocus } = useCsFocusData(viewerScope, regionPill);

  const [editingKey, setEditingKey] = CsfR.useState(null);
  const [draft, setDraft] = CsfR.useState(null);
  const [busy, setBusy] = CsfR.useState(false);
  const [error, setError] = CsfR.useState(null);
  const editMeta = CsfR.useRef({ category: null, id: null });

  const onCancel = () => {
    setEditingKey(null);
    setDraft(null);
    setError(null);
    editMeta.current = { category: null, id: null };
  };

  const onStartAdd = (category) => {
    const siblings = (rows || []).filter(r => r.category === category);
    const nextPos = siblings.reduce((m, r) => Math.max(m, r.position == null ? 0 : r.position), -1) + 1;
    editMeta.current = { category, id: null };
    setEditingKey(`${category}|new`);
    setDraft({ ...emptyFocusDraft(category, null), position: nextPos });
    setError(null);
  };

  const onStartEdit = (row) => {
    editMeta.current = { category: row.category, id: row.id };
    setEditingKey(String(row.id));
    setDraft(focusToDraft(row));
    setError(null);
  };

  const onSave = async () => {
    const { category, id } = editMeta.current;
    if (!draft || !category) return;
    const payload = focusDraftToPayload({ ...draft, category });
    setBusy(true);
    setError(null);
    try {
      if (id == null) {
        if (typeof window.insertCsCurrentFocus !== "function") throw new Error("insertCsCurrentFocus unavailable");
        const res = await window.insertCsCurrentFocus(payload);
        if (res && res.error) throw new Error(res.error.message || "Insert failed");
        const inserted = (res && res.data) || [];
        if (inserted.length) {
          setCurrentFocus(prev => [...(prev || []), ...inserted]);
        } else {
          setCurrentFocus(prev => [...(prev || []), { ...payload, id: `local-${Date.now()}` }]);
        }
      } else {
        if (typeof window.updateCsCurrentFocus !== "function") throw new Error("updateCsCurrentFocus unavailable");
        const res = await window.updateCsCurrentFocus(id, payload);
        if (res && res.error) throw new Error(res.error.message || "Update failed");
        const updated = (res && res.data && res.data[0]) || { id, ...payload };
        setCurrentFocus(prev => (prev || []).map(r => (r.id === id ? { ...r, ...updated } : r)));
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
    if (typeof window.deleteCsCurrentFocus !== "function") {
      setError("deleteCsCurrentFocus unavailable");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await window.deleteCsCurrentFocus(row.id);
      if (res && res.error) throw new Error(res.error.message || "Delete failed");
      setCurrentFocus(prev => (prev || []).filter(r => r.id !== row.id));
      if (editingKey === String(row.id)) onCancel();
    } catch (e) {
      setError((e && e.message) || "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tb-view" data-screen-label="CS Current Focus">
      <div className="tb-eyebrow"><span className="tb-eyebrow__dot" />
        Customer Success · current focus board
      </div>
      <div className="tb-hrow">
        <div>
          <h1 className="tb-title"><em>Current Focus</em></h1>
          <p className="tb-sub">
            Priorities, campaigns, incentives, strategies, internal/external work, and notes — ordered by position.
          </p>
        </div>
      </div>

      {!loaded && <CsfEmpty label="Loading current focus…" />}
      {loadError && <div style={{ color: "#991B1B", marginBottom: 12 }}>{loadError}</div>}
      {error && !editingKey && <div style={{ color: "#991B1B", marginBottom: 12 }}>{error}</div>}

      {loaded && CSF_FOCUS_CATEGORIES.map(cat => {
        const list = (rows || []).filter(r => r.category === cat.id);
        return (
          <CsfFocusSection
            key={cat.id}
            category={cat.id}
            title={cat.title}
            rows={list}
            canWrite={canWrite}
            editingKey={editingKey}
            draft={draft}
            setDraft={setDraft}
            busy={busy}
            error={error}
            onStartAdd={() => onStartAdd(cat.id)}
            onStartEdit={onStartEdit}
            onCancel={onCancel}
            onSave={onSave}
            onDelete={onDelete}
          />
        );
      })}

      <div className="tb-note">
        ● Scope Company-wide stores region NULL; region-scoped rows filter with the viewer allow-list while company-wide always remains visible.
      </div>
    </div>
  );
}

window.CsRisksPage = CsRisksPage;
window.CsFocusPage = CsFocusPage;
