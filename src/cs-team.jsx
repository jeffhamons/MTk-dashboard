// ── CS Team (window.CsTeamPage) — RFC-158 Phase 3 ───────────────────────────
// Per-person view. Each CS rep's:
//   • targets  — from per-rep cs_targets rows (read-only here; edit on the
//                Targets page). Monthly standing (5 components) + quarterly
//                renewal Q1–Q4 (comp-sensitive marker, read-only here) + YTD.
//   • focus    — cs_team_focus text, editable via its helpers, keyed by rep
//                name. Writes gated by manager OR cs team_admin (the table
//                has no region column — any cs admin covers it).
//   • actuals  — fed attainment where the data has them (loadAttainmentV2 →
//                attCsCompute), read-only + freshness stamp; '—' when absent.
//
// Empty states everywhere; currency helpers for all money. cs_dashboard_snapshot
// is NEVER written here.
// ─────────────────────────────────────────────────────────────────────────────

const { useState, useEffect, useMemo, useCallback } = React;

const CSTT_COMPONENTS = [
  { id: "renewal", label: "Renewal" },
  { id: "growth",  label: "Growth" },
  { id: "pe",      label: "Performance Enablement" },
  { id: "lt",      label: "Learning Technologies" },
  { id: "ls",      label: "Learning Services" },
];

const CSTT_QUARTERS = [
  { period: 1, label: "Q1" },
  { period: 2, label: "Q2" },
  { period: 3, label: "Q3" },
  { period: 4, label: "Q4" },
];

// ── RLS mirrors ──────────────────────────────────────────────────────────────
// cs_targets reads: manager OR cs team member OR covering cs team_admin.
// cs_team_focus writes: manager OR cs team_admin (no region column → any cs
// admin covers the table). We gate the focus editor to the write predicate;
// targets are read-only here so the read predicate is enough to render.
function csttCanEditTeamFocus(user) {
  if (!user) return false;
  if (user.role === "manager") return true;
  if (user.role !== "team_admin") return false;
  if (!Array.isArray(user.adminScopes)) return false;
  return user.adminScopes.some(s => s && s.team_id === "cs");
}

// Per-rep quarterly renewal drives commission (A6) — same predicate as the
// Targets page, used here to mark the read-only quarterly renewal chips.
function csttIsCompSensitive(repId, periodType, component) {
  return repId != null && periodType === "quarterly" && component === "renewal";
}

function csttRegionCurrencyLong(regionId) {
  return window.regionCurrencyLong ? window.regionCurrencyLong(regionId) : "USD";
}

function csttFmtMoney(amount, currency) {
  if (amount == null || isNaN(amount)) return "—";
  return window.formatCurrencyAmount
    ? window.formatCurrencyAmount(amount, currency)
    : String(Math.round(amount));
}

function csttFindAmount(targets, region, repId, periodType, fy, period, component) {
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

// ── Comp-sensitive marker (read-only here) ───────────────────────────────────
function CsttCompDot() {
  return (
    <span title="Comp-sensitive — per-rep quarterly renewal drives commission attainment"
          style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%",
                   background: "#B45309", marginRight: 6, boxShadow: "0 0 0 2px rgba(180,83,9,0.18)" }}
          aria-label="comp-sensitive value" />
  );
}

// ── A single target chip (read-only): label + value, comp-marked when relevant ─
function CsttTargetChip({ label, amount, currency, isComp }) {
  const wrap = isComp
    ? { border: "1px solid rgba(180,83,9,0.35)", background: "rgba(180,83,9,0.06)", borderRadius: 8, padding: "6px 8px" }
    : { border: "1px solid var(--ink-10)", borderRadius: 8, padding: "6px 8px" };
  return (
    <div style={wrap}>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700, color: "var(--ink-50)" }}>
        {isComp && <CsttCompDot />}{label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{csttFmtMoney(amount, currency)}</div>
    </div>
  );
}

// ── Fed actuals block — read-only, from attainment data ──────────────────────
// loadAttainmentV2 → attCsCompute gives renewedSum, target, pct, gap. The
// freshness stamp is the synced-nightly ATT_QUARTER label (the same source
// target-board cites). '—' when the rep has no attainment row this quarter.
function CsttActuals({ rep, attainment }) {
  const repAtt = (attainment || []).find(a => a.id === rep.id);
  const qLabel = window.ATT_QUARTER ? window.ATT_QUARTER.label : "";
  if (!repAtt || !window.attCsCompute) {
    return (
      <div style={{ border: "1px dashed var(--ink-20)", borderRadius: 10, padding: "12px 14px", color: "var(--ink-50)", fontSize: 13 }}>
        <div style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>Fed actuals</div>
        — · no attainment synced for {rep.name} this quarter.
      </div>
    );
  }
  const c = window.attCsCompute(repAtt);
  const pctText = window.attPctText ? window.attPctText(c.pct) : (c.pct == null ? "—" : `${c.pct}%`);
  const pctColor = window.attPctColor ? window.attPctColor(c.pct) : "var(--ink)";
  const barColor = window.attTierColor ? window.attTierColor(c.pct) : "var(--brand)";
  const barWidth = window.attBarWidth ? window.attBarWidth(c.pct) : (c.pct == null ? 0 : Math.min(100, c.pct));
  const F = window.attFmtFull || (n => String(Math.round(n || 0)));
  return (
    <div style={{ border: "1px solid var(--ink-10)", borderRadius: 10, padding: "12px 14px", background: "var(--ink-02, #fafafa)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--ink-50)" }}>Fed actuals · {qLabel || "current quarter"}</span>
        <span style={{ fontSize: 11, color: "var(--ink-40)" }}>synced nightly from Salesforce</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 20, fontWeight: 900 }}>{F(c.renewedSum)}</span>
        <span style={{ fontSize: 13, color: "var(--ink-50)" }}>renewed of {F(c.target)} target</span>
        <span style={{ fontSize: 18, fontWeight: 800, color: pctColor }}>{pctText}</span>
      </div>
      <div style={{ height: 8, background: "var(--ink-10)", borderRadius: 99, overflow: "hidden", marginTop: 8 }}>
        <div style={{ height: "100%", width: `${barWidth}%`, background: barColor, borderRadius: 99 }} />
      </div>
      {c.gap > 0
        ? <div style={{ fontSize: 12, color: "var(--ink-60)", marginTop: 6 }}>{F(c.gap)} to hit target</div>
        : (c.target > 0
            ? <div style={{ fontSize: 12, color: "var(--done-deep, #166534)", marginTop: 6 }}>Target cleared · {F(c.renewedSum - c.target)} above</div>
            : null)}
    </div>
  );
}

// ── Focus editor — cs_team_focus, keyed by rep name ──────────────────────────
function CsttFocusEditor({ rep, focusRow, canEdit, email, onSaved }) {
  const [text, setText] = useState(focusRow ? focusRow.focus : "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => { setText(focusRow ? focusRow.focus : ""); }, [focusRow && focusRow.id, focusRow && focusRow.focus]);

  const save = useCallback(async () => {
    const trimmed = text.trim();
    if (!canEdit) return;
    setSaving(true); setErr(null);
    try {
      let res;
      if (trimmed === "") {
        // Clear → delete if a row exists.
        if (focusRow && focusRow.id && window.deleteCsTeamFocus) {
          res = window.deleteCsTeamFocus(focusRow.id);
        }
      } else if (focusRow && focusRow.id) {
        res = window.updateCsTeamFocus(focusRow.id, { focus: trimmed }, email || null);
      } else {
        res = window.insertCsTeamFocus({ person: rep.name, focus: trimmed }, email || null);
      }
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
  }, [text, canEdit, focusRow, rep.name, email, onSaved]);

  const stamp = focusRow && focusRow.updated_at
    ? new Date(focusRow.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;

  return (
    <div style={{ border: "1px solid var(--ink-10)", borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--ink-50)" }}>Team focus</span>
        {stamp && <span style={{ fontSize: 11, color: "var(--ink-40)" }}>updated {stamp}{focusRow.updated_by ? ` · ${focusRow.updated_by}` : ""}</span>}
      </div>
      <textarea
        value={text}
        disabled={!canEdit || saving}
        onChange={e => setText(e.target.value)}
        onBlur={save}
        rows={2}
        aria-label={`Team focus for ${rep.name}`}
        style={{ width: "100%", boxSizing: "border-box", border: canEdit ? "1px solid var(--ink-20)" : "1px solid transparent",
                 borderRadius: 8, padding: "8px 10px", font: "inherit", fontSize: 13, background: canEdit ? "#fff" : "transparent",
                 color: "var(--ink)", resize: "vertical", minHeight: 44 }}
      />
      {err && <div style={{ fontSize: 11, color: "#E03C3C", marginTop: 4 }}>{err}</div>}
      {!canEdit && <div style={{ fontSize: 11, color: "var(--ink-40)", marginTop: 4 }}>Read-only — a CS admin can edit team focus.</div>}
    </div>
  );
}

// ── Rep card ─────────────────────────────────────────────────────────────────
function CsttRepCard({ rep, region, targets, teamFocus, attainment, fy, authedUser, email, onSaved }) {
  const meta = window.attRepMeta ? window.attRepMeta(rep.id) : { name: rep.name, role: rep.role, initials: rep.initials, hue: rep.hue };
  const regionObj = (window.REGIONS || []).find(r => r.id === region);
  const badge = regionObj ? regionObj.badge : "$";
  const currency = csttRegionCurrencyLong(region);
  const focusRow = (teamFocus || []).find(f => f.person === rep.name) || null;
  const canEditFocus = csttCanEditTeamFocus(authedUser);

  const cardStyle = {
    background: "#fff", border: "1px solid var(--ink-10)", borderRadius: 16,
    boxShadow: "0 6px 18px rgba(15,23,42,0.04)", padding: "16px 18px", marginBottom: 16,
  };
  const sectionLabel = { fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 800, color: "var(--ink-50)", marginBottom: 8 };

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        {window.Avatar
          ? <window.Avatar rep={{ ...rep, initials: meta.initials, hue: meta.hue }} size={40} />
          : <span style={{ width: 40, height: 40, borderRadius: "50%", background: `oklch(0.86 0.06 ${meta.hue || 250})`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 600 }}>{meta.initials}</span>}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{meta.name}</div>
          <div style={{ fontSize: 12, color: "var(--ink-50)" }}>{meta.role} · {regionObj ? regionObj.label : region} · {badge}{currency}</div>
        </div>
      </div>

      {/* Targets — read-only here (edit on the Targets page) */}
      <div style={{ marginBottom: 14 }}>
        <div style={sectionLabel}>Targets · FY{fy} <span style={{ color: "var(--ink-30)", fontWeight: 600 }}>· read-only — edit on the Targets page</span></div>

        {/* Monthly standing (5 components) */}
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-60)", margin: "6px 0 4px" }}>Monthly standing</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8 }}>
          {CSTT_COMPONENTS.map(c => {
            const amt = csttFindAmount(targets, region, rep.id, "monthly", fy, null, c.id);
            return <CsttTargetChip key={c.id} label={c.label} amount={amt} currency={currency} isComp={false} />;
          })}
        </div>

        {/* Quarterly renewal Q1–Q4 (comp-sensitive, read-only) */}
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-60)", margin: "12px 0 4px", display: "flex", alignItems: "center" }}>
          <CsttCompDot /> Quarterly renewal — comp-sensitive
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
          {CSTT_QUARTERS.map(q => {
            const amt = csttFindAmount(targets, region, rep.id, "quarterly", fy, q.period, "renewal");
            return <CsttTargetChip key={q.period} label={q.label} amount={amt} currency={currency} isComp={true} />;
          })}
        </div>

        {/* YTD (5 components) */}
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-60)", margin: "12px 0 4px" }}>YTD</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8 }}>
          {CSTT_COMPONENTS.map(c => {
            const amt = csttFindAmount(targets, region, rep.id, "ytd", fy, null, c.id);
            return <CsttTargetChip key={c.id} label={c.label} amount={amt} currency={currency} isComp={false} />;
          })}
        </div>
      </div>

      {/* Fed actuals */}
      <div style={{ marginBottom: 14 }}>
        <CsttActuals rep={rep} attainment={attainment} />
      </div>

      {/* Focus */}
      <CsttFocusEditor rep={rep} focusRow={focusRow} canEdit={canEditFocus} email={email} onSaved={onSaved} />
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
function CsTeamPage({ authedUser, activeTeam, viewerScope, regionPill }) {
  const email = authedUser ? (authedUser.authEmail || authedUser.email || null) : null;

  // RFC-152 region scope (mirrors LeaderboardView).
  const allowedRegions = viewerScope ? window.regionsUnderScope(viewerScope, regionPill) : null;
  const regionOrder = window.REGION_ORDER || ["US", "EMEA", "APAC"];
  const regionsInView = allowedRegions ? regionOrder.filter(r => allowedRegions.includes(r)) : regionOrder.slice();

  // CS workspace only.
  const teamOk = !activeTeam || activeTeam === "cs";

  const [cs, setCs] = useState({ targets: [], teamFocus: [] });
  const [attainment, setAttainment] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (window.loadCsDashboard) {
      window.loadCsDashboard().then(d => {
        if (!cancelled && d) setCs({ targets: d.targets || [], teamFocus: d.teamFocus || [] });
      }).catch(() => { if (!cancelled) setCs({ targets: [], teamFocus: [] }); });
    }
    if (window.loadAttainmentV2) {
      window.loadAttainmentV2().then(d => { if (!cancelled && d) setAttainment(d.cs || []); })
        .catch(() => { if (!cancelled) setAttainment([]); });
    }
    return () => { cancelled = true; };
  }, [reloadKey]);

  const fy = window.ATT_QUARTER ? window.ATT_QUARTER.fy : new Date().getFullYear();
  const onSaved = useCallback(() => setReloadKey(k => k + 1), []);

  // CS reps in scope (team + region).
  const reps = useMemo(() => {
    return (window.REPS || []).filter(r =>
      r.team === "cs" && regionsInView.includes(r.region) &&
      (!window.currentWeekIndex || !window.repVisibleInWeek ||
       window.repVisibleInWeek(r, window.currentWeekIndex() + 1))
    );
  }, [regionsInView]);

  if (!teamOk) {
    return (
      <div className="cstt-view" data-screen-label="CS Team" style={{ maxWidth: 1320, margin: "0 auto", padding: "30px 32px 50px" }}>
        <div style={{ color: "var(--ink-50)", fontSize: 14 }}>
          The CS Team page is part of the Customer Success workspace. Switch to the CS workspace to view it.
        </div>
      </div>
    );
  }

  // Group reps by region for section headers (mirrors target-board's region sections).
  const byRegion = {};
  for (const rep of reps) { (byRegion[rep.region] ||= []).push(rep); }

  return (
    <div className="cstt-view" data-screen-label="CS Team" style={{ maxWidth: 1320, margin: "0 auto", padding: "30px 32px 50px" }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-50)", marginBottom: 6 }}>
        ● CS team · per-person view · FY{fy}
      </div>
      <h1 style={{ fontSize: 32, fontWeight: 900, margin: "0 0 6px" }}><em>Team</em></h1>
      <p style={{ color: "var(--ink-50)", margin: "0 0 18px", maxWidth: 760 }}>
        Each CS rep's targets (read-only — edit on the Targets page), fed renewal actuals, and team focus.
        Per-rep quarterly renewal carries the comp-sensitive marker; actuals sync nightly from Salesforce.
      </p>

      {reps.length === 0 ? (
        <div style={{ color: "var(--ink-50)", fontSize: 14 }}>
          No CS reps in your scope yet. {allowedRegions && allowedRegions.length === 0 ? "Your region scope is empty." : "Reps appear once the CS workspace is staffed."}
        </div>
      ) : (
        regionsInView.map(region => {
          const regionReps = byRegion[region] || [];
          if (regionReps.length === 0) return null;
          const regionObj = (window.REGIONS || []).find(r => r.id === region);
          const label = regionObj ? regionObj.label : region;
          return (
            <section key={region} style={{ marginBottom: 22 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: regionObj ? regionObj.color : "var(--ink-30)" }} />
                <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{label}</h2>
                <span style={{ fontSize: 12, color: "var(--ink-50)" }}>· {regionReps.length} rep{regionReps.length === 1 ? "" : "s"}</span>
              </div>
              {regionReps.map(rep => (
                <CsttRepCard key={rep.id} rep={rep} region={region}
                             targets={cs.targets} teamFocus={cs.teamFocus} attainment={attainment}
                             fy={fy} authedUser={authedUser} email={email} onSaved={onSaved} />
              ))}
            </section>
          );
        })
      )}

      <div style={{ fontSize: 12, color: "var(--ink-50)", marginTop: 8 }}>
        ● Targets are read-only here — open the Targets page to edit. Fed actuals are read-only and refresh with the nightly Salesforce sync.
      </div>
    </div>
  );
}

window.CsTeamPage = CsTeamPage;
