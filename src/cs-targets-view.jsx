// ── CS Targets (window.CsTargetsPage) — RFC-158 Phase 3 ──────────────────────
// Lara's target-model editor. A grid per region × period_type × component.
//   • period_type  — monthly (standing, period NULL) / quarterly (per Q 1-4) / ytd
//   • component    — renewal, growth, pe, lt, ls
// Region-level rows (rep_id NULL) are always visible; per-rep rows collapse
// under the region (chevron — mirrors target-board's expanding rows).
//
// Values edit-in-place, writing through window.upsertCsTarget (RLS enforces
// who can). Edit gating mirrors the server RLS predicates in
// db/migration-cs-dashboard.sql:
//   • region-level row → csCanEditRegion(user, region): manager OR cs
//     team_admin covering that region.
//   • per-rep row      → window.canManageRep(user, repId).
//
// A6 COMP GUARDRAIL: per-rep QUARTERLY RENEWAL cells drive commission
// attainment — those cells render with a distinct 'comp-sensitive' visual
// marker (CompMark: amber tint + inset bar + dot) and require a confirm()
// step before the upsert is sent. Region-level quarterly renewal is
// planning, not comp, so it is NOT marked. The DB audit trigger + Jeff
// notification are server-side; the UI's job is to make the weight of the
// edit visible before it lands. cs_dashboard_snapshot is NEVER written here.
// ─────────────────────────────────────────────────────────────────────────────

const { useState, useEffect, useMemo, useCallback } = React;

// Period types in the toggle order. Monthly standing first (Lara's model
// keeps one set, not per-month rows — period NULL), then quarterly per Q,
// then YTD.
const CST_PERIOD_TYPES = [
  { id: "monthly",   label: "Monthly",   hint: "Standing monthly target" },
  { id: "quarterly", label: "Quarterly", hint: "Per quarter (Q1–Q4)" },
  { id: "ytd",       label: "YTD",       hint: "Year-to-date target" },
];

// Component order (renewal first — it's the comp denominator).
const CST_COMPONENTS = [
  { id: "renewal", label: "Renewal" },
  { id: "growth",  label: "Growth" },
  { id: "pe",      label: "Performance Enablement" },
  { id: "lt",      label: "Learning Technologies" },
  { id: "ls",      label: "Learning Services" },
];

// Quarter labels for the quarterly grid columns.
const CST_QUARTERS = [
  { period: 1, label: "Q1" },
  { period: 2, label: "Q2" },
  { period: 3, label: "Q3" },
  { period: 4, label: "Q4" },
];

// ── RLS mirror: can `user` edit a region-level cs_targets row? ───────────────
// Mirrors "manager or cs admin inserts/updates/deletes cs_targets":
// manager (any region) OR team_admin with a cs scope covering `region`.
function csCanEditRegion(user, regionId) {
  if (!user || !regionId) return false;
  if (user.role === "manager") return true;
  if (user.role !== "team_admin") return false;
  if (!Array.isArray(user.adminScopes)) return false;
  return user.adminScopes.some(s => s && s.team_id === "cs" && s.region === regionId);
}

// A6: is this target cell comp-sensitive? Per-rep (rep_id != null) +
// quarterly + renewal drives commission attainment. Region-level quarterly
// renewal is planning, NOT comp — excluded.
function cstIsCompSensitive(repId, periodType, component) {
  return repId != null && periodType === "quarterly" && component === "renewal";
}

// Native currency for a region (USD/GBP/AUD) — drives upsert currency + display.
function cstRegionCurrencyLong(regionId) {
  return window.regionCurrencyLong ? window.regionCurrencyLong(regionId) : "USD";
}

// Format money with the region's native currency symbol/code.
function cstFmtMoney(amount, currency) {
  if (amount == null || isNaN(amount)) return "—";
  return window.formatCurrencyAmount
    ? window.formatCurrencyAmount(amount, currency)
    : String(Math.round(amount));
}

// Lookup a single target amount from the loaded targets array. Grain:
// region + rep_id (NULL = region-level) + period_type + fy + period + component.
function cstFindAmount(targets, region, repId, periodType, fy, period, component) {
  const row = (targets || []).find(t =>
    t.region === region &&
    (t.rep_id ?? null) === (repId ?? null) &&
    t.period_type === periodType &&
    Number(t.fy) === Number(fy) &&
    ((t.period == null && period == null) || Number(t.period) === Number(period)) &&
    t.component === component
  );
  return row ? Number(row.amount) : null;
}

// Last-editor + freshness stamp for a cell (updated_by / updated_at).
function cstFindMeta(targets, region, repId, periodType, fy, period, component) {
  const row = (targets || []).find(t =>
    t.region === region &&
    (t.rep_id ?? null) === (repId ?? null) &&
    t.period_type === periodType &&
    Number(t.fy) === Number(fy) &&
    ((t.period == null && period == null) || Number(t.period) === Number(period)) &&
    t.component === component
  );
  if (!row) return null;
  return { updated_by: row.updated_by || null, updated_at: row.updated_at || null };
}

function cstFmtStamp(meta) {
  if (!meta || !meta.updated_at) return null;
  const d = new Date(meta.updated_at);
  if (isNaN(d.getTime())) return null;
  const label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return meta.updated_by ? `${label} · ${meta.updated_by}` : label;
}

// ── CompMark — the A6 visual marker on per-rep quarterly renewal cells ────────
// Amber tint + inset left bar + a small dot. Read-only cells keep the marker
// too (it surfaces the comp weight even when the viewer can't edit).
function CompMark() {
  return (
    <span className="cst-compmark" title="Comp-sensitive — per-rep quarterly renewal drives commission attainment"
          style={{
            display: "inline-block", width: 7, height: 7, borderRadius: "50%",
            background: "#B45309", marginRight: 6, flex: "none",
            boxShadow: "0 0 0 2px rgba(180,83,9,0.18)",
          }} aria-label="comp-sensitive cell" />
  );
}

// ── Editable cell ────────────────────────────────────────────────────────────
// Edit-in-place. On commit (Enter / blur with a real change), build the row
// and write through window.upsertCsTarget. Comp-sensitive cells run a
// window.confirm() first — the UI's job is to make the weight visible before
// the audit trigger fires server-side.
function CstCell({ region, repId, periodType, fy, period, component, amount, canEdit, isComp, currency, email, onSaved }) {
  const [val, setVal] = useState(amount == null ? "" : String(amount));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  // Keep the input in sync if the loaded amount changes (e.g. after a save
  // round-trip reloads targets, or the period-type toggle swaps the grid).
  useEffect(() => { setVal(amount == null ? "" : String(amount)); }, [amount]);

  const commit = useCallback(async () => {
    const parsed = val.trim() === "" ? null : Number(val);
    if (parsed != null && isNaN(parsed)) { setErr("Enter a number"); return; }
    if (parsed === amount) { setErr(null); return; } // no change
    if (!canEdit) return;
    if (isComp) {
      const qLabel = period != null ? `Q${period}` : "";
      const ok = window.confirm(
        `Confirm ${qLabel} renewal target edit?\n\n` +
        `Per-rep quarterly renewal drives commission attainment. ` +
        `This change is audited and notifies Jeff.\n\n` +
        `New value: ${parsed == null ? "(cleared)" : cstFmtMoney(parsed, currency)}`
      );
      if (!ok) { setVal(amount == null ? "" : String(amount)); return; }
    }
    setSaving(true); setErr(null);
    try {
      const row = {
        region,
        rep_id: repId || null,
        period_type: periodType,
        fy,
        period: period != null ? period : null,
        component,
        amount: parsed == null ? null : parsed,
        currency,
      };
      const res = window.upsertCsTarget(row, email || null);
      if (res && typeof res.then === "function") {
        const out = await res;
        if (out && out.error) setErr(out.error.message || "Save failed");
      }
      onSaved && onSaved();
    } catch (e) {
      setErr((e && e.message) || "Save failed");
    } finally {
      setSaving(false);
    }
  }, [val, amount, canEdit, isComp, region, repId, periodType, fy, period, component, currency, email, onSaved]);

  const baseStyle = {
    width: "100%", boxSizing: "border-box",
    border: "1px solid transparent", borderRadius: 8,
    padding: "6px 8px", font: "inherit", fontSize: 13,
    background: "transparent", color: "var(--ink)",
  };
  const editStyle = canEdit ? { ...baseStyle, border: "1px solid var(--ink-20)", background: "#fff" } : baseStyle;
  const wrapStyle = isComp
    ? { borderLeft: "3px solid #B45309", background: "rgba(180,83,9,0.06)", borderRadius: 8, padding: "3px 6px" }
    : { padding: "3px 6px" };

  return (
    <div style={wrapStyle}>
      <span style={{ display: "flex", alignItems: "center" }}>
        {isComp && <CompMark />}
        <input
          type="number"
          inputMode="numeric"
          value={val}
          disabled={!canEdit || saving}
          onChange={e => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") { e.currentTarget.blur(); } if (e.key === "Escape") { setVal(amount == null ? "" : String(amount)); e.currentTarget.blur(); } }}
          aria-label={`${component} ${period != null ? "Q" + period : ""} target`}
          style={editStyle}
        />
      </span>
      {err && <div style={{ fontSize: 11, color: "#E03C3C", marginTop: 3 }}>{err}</div>}
    </div>
  );
}

// ── Read-only value cell (used when canEdit is false but we want a tidy cell) ─
function CstReadCell({ amount, currency, isComp }) {
  return (
    <div style={isComp
      ? { borderLeft: "3px solid #B45309", background: "rgba(180,83,9,0.06)", borderRadius: 8, padding: "6px 8px" }
      : { padding: "6px 8px" }}>
      <span style={{ display: "flex", alignItems: "center" }}>
        {isComp && <CompMark />}
        <span style={{ fontSize: 13 }}>{cstFmtMoney(amount, currency)}</span>
      </span>
    </div>
  );
}

// ── A target row (region-level OR a single rep) ───────────────────────────────
// `columns` describes what to render per cell: each is { period, component }.
// For monthly/ytd the columns are the 5 components (period null); for
// quarterly the columns are the 4 quarters for the selected component.
function CstRow({ label, sub, region, repId, periodType, fy, columns, targets, canEdit, email, currency, onSaved }) {
  return (
    <tr style={{ borderTop: "1px solid var(--ink-10)" }}>
      <td style={{ padding: "8px 10px", verticalAlign: "middle" }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: "var(--ink-50)" }}>{sub}</div>}
      </td>
      {columns.map(col => {
        const isComp = cstIsCompSensitive(repId, periodType, col.component);
        const amt = cstFindAmount(targets, region, repId, periodType, fy, col.period, col.component);
        const meta = cstFindMeta(targets, region, repId, periodType, fy, col.period, col.component);
        const stamp = cstFmtStamp(meta);
        return (
          <td key={`${col.period}-${col.component}`} style={{ padding: "4px 6px", verticalAlign: "top" }}>
            {canEdit
              ? <CstCell region={region} repId={repId} periodType={periodType} fy={fy}
                         period={col.period} component={col.component} amount={amt}
                         canEdit={canEdit} isComp={isComp} currency={currency} email={email} onSaved={onSaved} />
              : <CstReadCell amount={amt} currency={currency} isComp={isComp} />}
            {stamp && <div style={{ fontSize: 10, color: "var(--ink-40)", marginTop: 3 }}>{stamp}</div>}
          </td>
        );
      })}
    </tr>
  );
}

// ── Region section: header + region-level row + collapsible per-rep rows ──────
function CstRegionSection({ region, reps, periodType, fy, columns, targets, authedUser, email, onSaved }) {
  const [open, setOpen] = useState(false);
  const regionObj = (window.REGIONS || []).find(r => r.id === region);
  const label = regionObj ? regionObj.label : region;
  const badge = regionObj ? regionObj.badge : "$";
  const currency = cstRegionCurrencyLong(region);
  const canEditRegion = csCanEditRegion(authedUser, region);

  // Per-rep edit uses window.canManageRep (self / manager / covering cs admin).
  const csReps = reps.filter(r => r.team === "cs");

  const headerStyle = {
    display: "flex", alignItems: "center", gap: 10,
    padding: "12px 14px", borderBottom: "1px solid var(--ink-10)",
  };
  const dotStyle = {
    width: 10, height: 10, borderRadius: "50%",
    background: regionObj ? regionObj.color : "var(--ink-30)", flex: "none",
  };

  return (
    <section style={{
      background: "#fff", border: "1px solid var(--ink-10)", borderRadius: 16,
      boxShadow: "0 6px 18px rgba(15,23,42,0.04)", marginBottom: 18, overflow: "hidden",
    }}>
      <div style={headerStyle}>
        <span style={dotStyle} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{label}</div>
          <div style={{ fontSize: 11, color: "var(--ink-50)" }}>
            {csReps.length} CS rep{csReps.length === 1 ? "" : "s"} · {badge}{currency}
          </div>
        </div>
        {csReps.length > 0 && (
          <button onClick={() => setOpen(o => !o)} aria-expanded={open}
                  style={{ border: "1px solid var(--ink-20)", background: "#fff", borderRadius: 8, padding: "6px 10px", cursor: "pointer", font: "inherit", fontSize: 12, fontWeight: 600 }}>
            {open ? "Hide reps" : `Show ${csReps.length} rep${csReps.length === 1 ? "" : "s"}`}
            <span style={{ marginLeft: 6, display: "inline-block", transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▾</span>
          </button>
        )}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 520 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "9px 10px", fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--ink-50)", fontWeight: 700, background: "var(--ink-05)" }}>
                {periodType === "quarterly" ? "Rep · " + (CST_COMPONENTS.find(c => c.id === (columns[0] || {}).component) || {}).label : "Rep · component"}
              </th>
              {columns.map(col => (
                <th key={`${col.period}-${col.component}`} style={{ textAlign: "left", padding: "9px 8px", fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--ink-50)", fontWeight: 700, background: "var(--ink-05)" }}>
                  {col.period != null ? `Q${col.period}` : (CST_COMPONENTS.find(c => c.id === col.component) || {}).label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <CstRow label={`${label} (region)`} sub="Region-level target"
                    region={region} repId={null} periodType={periodType} fy={fy}
                    columns={columns} targets={targets} canEdit={canEditRegion} email={email}
                    currency={currency} onSaved={onSaved} />
            {open && csReps.map(rep => {
              const canEditRep = window.canManageRep ? window.canManageRep(authedUser, rep.id) : false;
              const meta = window.attRepMeta ? window.attRepMeta(rep.id) : { name: rep.name, role: rep.role, initials: rep.initials };
              return (
                <CstRow key={rep.id} label={meta.name} sub={meta.role}
                        region={region} repId={rep.id} periodType={periodType} fy={fy}
                        columns={columns} targets={targets} canEdit={canEditRep} email={email}
                        currency={currency} onSaved={onSaved} />
              );
            })}
            {open && csReps.length === 0 && (
              <tr><td colSpan={columns.length + 1} style={{ padding: "12px 10px", color: "var(--ink-50)", fontSize: 13 }}>
                No CS reps in {label} yet.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {!canEditRegion && csReps.length === 0 && (
        <div style={{ padding: "12px 14px", color: "var(--ink-50)", fontSize: 13 }}>
          No {label} targets set yet. {canEditRegion ? "Add the first region-level target above." : "A CS admin for " + label + " can set the first target."}
        </div>
      )}
    </section>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
function CsTargetsPage({ authedUser, activeTeam, viewerScope, regionPill }) {
  const isManager = window.canManageAny ? window.canManageAny(authedUser) : false;
  const email = authedUser ? (authedUser.authEmail || (authedUser.email) || null) : null;

  // RFC-152 region scope (mirrors LeaderboardView): undefined scope → no filter.
  const allowedRegions = viewerScope ? window.regionsUnderScope(viewerScope, regionPill) : null;
  const regionOrder = window.REGION_ORDER || ["US", "EMEA", "APAC"];
  const regionsInView = allowedRegions ? regionOrder.filter(r => allowedRegions.includes(r)) : regionOrder.slice();

  // This page is CS-only; a non-cs activeTeam renders empty (RLS blanks the
  // other workspace's rows — hiding the shell removes the empty shell, same
  // rationale as target-board).
  const teamOk = !activeTeam || activeTeam === "cs";

  const [periodType, setPeriodType] = useState("monthly");
  const [quarterlyComponent, setQuarterlyComponent] = useState("renewal");
  const [data, setData] = useState({ targets: [] });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!window.loadCsDashboard) return;
    window.loadCsDashboard().then(d => { if (!cancelled && d) setData({ targets: d.targets || [] }); })
      .catch(() => { if (!cancelled) setData({ targets: [] }); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const fy = window.ATT_QUARTER ? window.ATT_QUARTER.fy : new Date().getFullYear();

  // Columns for the selected period_type.
  const columns = useMemo(() => {
    if (periodType === "quarterly") {
      return CST_QUARTERS.map(q => ({ period: q.period, component: quarterlyComponent }));
    }
    // monthly + ytd: 5 component columns, period NULL (standing / ytd).
    return CST_COMPONENTS.map(c => ({ period: null, component: c.id }));
  }, [periodType, quarterlyComponent]);

  const onSaved = useCallback(() => setReloadKey(k => k + 1), []);

  if (!teamOk) {
    return (
      <div className="cst-view" data-screen-label="CS Targets" style={{ maxWidth: 1320, margin: "0 auto", padding: "30px 32px 50px" }}>
        <div style={{ color: "var(--ink-50)", fontSize: 14 }}>
          CS Targets are part of the Customer Success workspace. Switch to the CS workspace to view them.
        </div>
      </div>
    );
  }

  const toggleBtn = (id, label, on) => ({
    border: "1px solid " + (on ? "var(--ink)" : "var(--ink-20)"),
    background: on ? "var(--ink)" : "#fff",
    color: on ? "#fff" : "var(--ink-70)",
    borderRadius: 999, padding: "7px 13px", fontWeight: 700, fontSize: 12,
    cursor: "pointer", font: "inherit",
  });

  return (
    <div className="cst-view" data-screen-label="CS Targets" style={{ maxWidth: 1320, margin: "0 auto", padding: "30px 32px 50px" }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-50)", marginBottom: 6 }}>
        ● CS target model · FY{fy}
      </div>
      <h1 style={{ fontSize: 32, fontWeight: 900, margin: "0 0 6px" }}><em>Targets</em></h1>
      <p style={{ color: "var(--ink-50)", margin: "0 0 18px", maxWidth: 760 }}>
        Lara's target model — region × period × component. Edit-in-place writes through the CS targets store;
        RLS enforces who can. Per-rep quarterly renewal drives commission attainment, so those cells carry a
        comp-sensitive marker and ask you to confirm before saving.
      </p>

      {/* Period-type toggle (shared across regions, like target-board's MTD/QTD/YTD). */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {CST_PERIOD_TYPES.map(pt => (
          <button key={pt.id} onClick={() => setPeriodType(pt.id)} aria-pressed={periodType === pt.id}
                  title={pt.hint} style={toggleBtn(pt.id, pt.label, periodType === pt.id)}>
            {pt.label}
          </button>
        ))}
      </div>

      {/* Quarterly: component selector (renewal first — surfaces the A6 marker by default). */}
      {periodType === "quarterly" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-50)", alignSelf: "center", marginRight: 4 }}>COMPONENT</span>
          {CST_COMPONENTS.map(c => (
            <button key={c.id} onClick={() => setQuarterlyComponent(c.id)} aria-pressed={quarterlyComponent === c.id}
                    style={toggleBtn(c.id, c.label, quarterlyComponent === c.id)}>{c.label}</button>
          ))}
        </div>
      )}

      {/* A6 legend — only relevant when the visible grid can show comp cells. */}
      {periodType === "quarterly" && quarterlyComponent === "renewal" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, fontSize: 12, color: "var(--ink-60)" }}>
          <CompMark />
          <span>comp-sensitive — per-rep quarterly renewal drives commission; confirm before saving.</span>
        </div>
      )}

      {regionsInView.length === 0 ? (
        <div style={{ color: "var(--ink-50)", fontSize: 14 }}>No regions in your scope.</div>
      ) : (
        regionsInView.map(region => {
          const reps = (window.REPS || []).filter(r => r.region === region);
          return (
            <CstRegionSection key={region} region={region} reps={reps}
                              periodType={periodType} fy={fy} columns={columns}
                              targets={data.targets} authedUser={authedUser} email={email} onSaved={onSaved} />
          );
        })
      )}

      <div style={{ fontSize: 12, color: "var(--ink-50)", marginTop: 8 }}>
        ● Region-level rows are planning targets; per-rep rows (collapse under each region) are the per-person model.
        {isManager ? " You can edit any region." : " Edits are scoped by your role."}
      </div>
    </div>
  );
}

window.CsTargetsPage = CsTargetsPage;
