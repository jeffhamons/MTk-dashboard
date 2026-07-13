// ── CS Performance home (RFC-158 Phase 3) — window.CsPerformancePage ───────
// Combined CS Performance home: per-region renewal+growth summary cards plus a
// GBP-canonical company rollup, and a Monday-to-Monday WoW strip sourced from
// cs_dashboard_snapshot. Mirrors the platform's Target Board idiom
// (target-board.jsx):
//   • props signature copied from LeaderboardView: { authedUser, activeTeam,
//     viewerScope, regionPill }.
//   • Salesforce-fed actuals render READ-ONLY with a synced_at freshness stamp;
//     manual targets (cs_targets) render as values Lara edits elsewhere — never
//     both editable and fed for the same number.
//   • currency via formatCurrencyAmount + regionCurrency (decision 3); the
//     combined rollup labels its currency explicitly (GBP-canonical).
// Data: window.loadCsDashboard() ({ targets, snapshots, … }) +
// window.loadAttainment() (attainment_snapshot rows carry ren_*_renewed /
// exp_*_won $ + synced_at). Every number is sourced from these layers — zero
// hardcoded figures. Styles reuse the tb-* family from attainment.css; layout
// particulars are inline (the platform mixes classes + inline styles the same
// way in rep-view.jsx / target-board.jsx).
// ─────────────────────────────────────────────────────────────────────────────

// Memoized attainment_snapshot load (latest row per rep). loadAttainment isn't
// memoized itself; cache one fetch per session so home + region don't re-fetch.
let _csAttPromise = null;
function loadCsActuals() {
  if (_csAttPromise) return _csAttPromise;
  const fn = window.loadAttainment;
  _csAttPromise = fn ? Promise.resolve(fn()).catch(() => []) : Promise.resolve([]);
  return _csAttPromise;
}

// ── value coercion / pct (null-safe: null means "no target/value" → "—") ─────
function _csNum(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function _csPct(num, denom) {
  const n = _csNum(num), d = _csNum(denom);
  if (n == null || d == null || d === 0) return null;
  return Math.round((n / d) * 100);
}
function _csPctText(p) {
  if (window.attPctText) return window.attPctText(p);
  return p == null ? "—" : `${p}%`;
}
function _csParseDate(iso) {
  if (!iso) return null;
  const s = String(iso);
  const d = new Date(s.length === 10 ? s + "T00:00:00" : s);
  return isNaN(d) ? null : d;
}
function _csFmtDate(d) {
  if (!d) return "";
  const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${m[d.getMonth()]} ${d.getDate()}`;
}
function _csFreshness(iso) {
  const d = _csParseDate(iso);
  return d ? `Synced ${_csFmtDate(d)}` : "";
}

// ── currency helpers (mirror target-board's native-currency decision 3) ─────
function _csRegionObj(rid) { return (window.REGIONS || []).find(r => r.id === rid) || null; }
function _csRegionCurrencyLong(rid) {
  return window.regionCurrencyLong ? window.regionCurrencyLong(rid) : "USD";
}
function _csFmtMoney(amount, currency) {
  return window.formatCurrencyAmount
    ? window.formatCurrencyAmount(amount || 0, currency)
    : String(amount || 0);
}
function _csConvert(amount, fromCur, toCur) {
  return window.convertAmount ? window.convertAmount(amount || 0, fromCur, toCur) : (amount || 0);
}

// CS reps in a region (team==='cs'), week-visible at the current week.
function _csRepsInRegion(rid) {
  const weekIdx = window.currentWeekIndex ? window.currentWeekIndex() : null;
  return (window.REPS || []).filter(r =>
    r.team === "cs" && r.region === rid &&
    (window.repVisibleInWeek ? window.repVisibleInWeek(r, weekIdx != null ? weekIdx + 1 : 1) : true));
}

// ── fed actuals (attainment_snapshot) ────────────────────────────────────────
// field map: component × period → attainment_snapshot column. A CS snapshot
// row carries MTD renewal $ (activity, no target), QTD/YTD renewal $, and
// expansion $ MTD/QTD/YTD. All amounts are the rep's native currency (decision
// 3 — same convention convertTeamTotal applies on the Target Board).
const _CS_ACT_FIELD = {
  renewal: { mtd: "ren_mtd_renewed", qtd: "ren_qtd_renewed", ytd: "ren_ytd_renewed" },
  growth:  { mtd: "exp_mtd_won",    qtd: "exp_qtd_won",    ytd: "exp_ytd_won" },
};
// Sum a fed $ field across a region's CS reps (native currency). hasValue is
// false when the feed has no value for any rep in that region×period → render
// "—" (never fabricate). syncedAt = freshest synced_at in scope.
function _csRegionActual(attRows, rid, component, period) {
  const field = _CS_ACT_FIELD[component] && _CS_ACT_FIELD[component][period];
  const reps = _csRepsInRegion(rid);
  const repIds = new Set(reps.map(r => r.id));
  const native = _csRegionCurrencyLong(rid);
  let total = 0, hasValue = false, synced = null;
  if (field) {
    for (const row of (attRows || [])) {
      if (!row || !repIds.has(row.rep_id)) continue;
      const v = _csNum(row[field]);
      if (v != null) { total += v; hasValue = true; }
      const s = _csParseDate(row.synced_at);
      if (s && (!synced || s > synced)) synced = s;
    }
  }
  return { nativeTotal: total, hasValue, syncedAt: synced, currency: native };
}

// Company rollup actual: convert each region's native total → toCurrency, then
// sum (per-region native sums are exact; cross-currency rollup converts each
// region separately so rounding never compounds across a single total).
function _csRollupActual(attRows, regions, component, period, toCurrency) {
  let total = 0, hasValue = false, synced = null;
  for (const rid of regions) {
    const a = _csRegionActual(attRows, rid, component, period);
    if (a.hasValue) { total += _csConvert(a.nativeTotal, a.currency, toCurrency); hasValue = true; }
    if (a.syncedAt && (!synced || a.syncedAt > synced)) synced = a.syncedAt;
  }
  return { total, hasValue, syncedAt: synced, currency: toCurrency };
}

// ── manual targets (cs_targets) ──────────────────────────────────────────────
// Region-level rows (rep_id NULL). period → period_type/period match. Monthly
// uses the standing null-period row (Lara's one-set model); falls back to
// summed month-specific rows. Quarterly pins the current quarter; YTD the fy.
function _csCurrentFyQ() {
  const q = window.ATT_QUARTER || {};
  const now = new Date();
  return {
    fy: q.fy || now.getFullYear(),
    quarter: q.quarter || (Math.floor(now.getMonth() / 3) + 1),
  };
}
function _csTargetRows(targets, rid, component, period) {
  const { fy, quarter } = _csCurrentFyQ();
  const rows = (targets || []).filter(t =>
    t && t.region === rid && t.rep_id == null &&
    String(t.component).toLowerCase() === component);
  if (period === "mtd") {
    const standing = rows.filter(t =>
      String(t.period_type).toLowerCase() === "monthly" &&
      Number(t.fy) === fy && t.period == null);
    if (standing.length) return standing;
    return rows.filter(t =>
      String(t.period_type).toLowerCase() === "monthly" && Number(t.fy) === fy);
  }
  if (period === "qtd") {
    return rows.filter(t =>
      String(t.period_type).toLowerCase() === "quarterly" &&
      Number(t.fy) === fy && Number(t.period) === quarter);
  }
  return rows.filter(t =>
    String(t.period_type).toLowerCase() === "ytd" &&
    Number(t.fy) === fy && t.period == null);
}
function _csRegionTarget(targets, rid, component, period) {
  const rows = _csTargetRows(targets, rid, component, period);
  if (!rows.length) return { amount: null, currency: _csRegionCurrencyLong(rid), present: false };
  const amount = rows.reduce((s, t) => s + (_csNum(t.amount) || 0), 0);
  const currency = (rows[0] && rows[0].currency) || _csRegionCurrencyLong(rid);
  return { amount, currency, present: true };
}
function _csRollupTarget(targets, regions, component, period, toCurrency) {
  let total = 0, present = false;
  for (const rid of regions) {
    const t = _csRegionTarget(targets, rid, component, period);
    if (t.present) { total += _csConvert(t.amount, t.currency, toCurrency); present = true; }
  }
  return { amount: present ? total : null, currency: toCurrency, present };
}

// ── metric assembly (one component × period × scope) ─────────────────────────
function _csRegionMetric(att, targets, rid, component, period) {
  const a = _csRegionActual(att, rid, component, period);
  const t = _csRegionTarget(targets, rid, component, period);
  const pct = (a.hasValue && t.present) ? _csPct(a.nativeTotal, t.amount) : null;
  return {
    actual: a.nativeTotal, hasActual: a.hasValue, syncedAt: a.syncedAt,
    target: t.present ? t.amount : null, hasTarget: t.present,
    pct, currency: a.currency,
  };
}
// Combined (renewal+growth) for a region. Both components share the region's
// native currency, so the sum is exact with no conversion.
function _csRegionCombinedMetric(att, targets, rid, period) {
  const ren = _csRegionMetric(att, targets, rid, "renewal", period);
  const gro = _csRegionMetric(att, targets, rid, "growth", period);
  const hasActual = ren.hasActual || gro.hasActual;
  const actual = (ren.hasActual ? ren.actual : 0) + (gro.hasActual ? gro.actual : 0);
  const hasTarget = ren.hasTarget || gro.hasTarget;
  const target = (ren.hasTarget ? ren.target : 0) + (gro.hasTarget ? gro.target : 0);
  const pct = (hasActual && hasTarget) ? _csPct(actual, target) : null;
  const synced = (ren.syncedAt && gro.syncedAt
    ? (ren.syncedAt > gro.syncedAt ? ren.syncedAt : gro.syncedAt)
    : (ren.syncedAt || gro.syncedAt));
  return { actual, hasActual, target, hasTarget, pct, currency: ren.currency, syncedAt: synced, renewal: ren, growth: gro };
}
// Combined rollup across regions in toCurrency (GBP-canonical on the home).
function _csRollupCombinedMetric(att, targets, regions, period, toCur) {
  const renA = _csRollupActual(att, regions, "renewal", period, toCur);
  const groA = _csRollupActual(att, regions, "growth", period, toCur);
  const renT = _csRollupTarget(targets, regions, "renewal", period, toCur);
  const groT = _csRollupTarget(targets, regions, "growth", period, toCur);
  const hasActual = renA.hasValue || groA.hasValue;
  const actual = (renA.hasValue ? renA.total : 0) + (groA.hasValue ? groA.total : 0);
  const hasTarget = renT.present || groT.present;
  const target = (renT.present ? renT.amount : 0) + (groT.present ? groT.amount : 0);
  const pct = (hasActual && hasTarget) ? _csPct(actual, target) : null;
  const synced = (renA.syncedAt && groA.syncedAt
    ? (renA.syncedAt > groA.syncedAt ? renA.syncedAt : groA.syncedAt)
    : (renA.syncedAt || groA.syncedAt));
  return {
    actual, hasActual, target, hasTarget, pct, currency: toCur, syncedAt: synced,
    renewal: {
      hasActual: renA.hasValue, actual: renA.total,
      hasTarget: renT.present, target: renT.amount,
      pct: (renA.hasValue && renT.present) ? _csPct(renA.total, renT.amount) : null,
    },
    growth: {
      hasActual: groA.hasValue, actual: groA.total,
      hasTarget: groT.present, target: groT.amount,
      pct: (groA.hasValue && groT.present) ? _csPct(groA.total, groT.amount) : null,
    },
  };
}

// ── WoW strip (cs_dashboard_snapshot) ────────────────────────────────────────
// scopeLabel = 'company' for the rollup, or a region id. Returns combined %
// for the most recent snapshot_date and the prior Monday's. Defensive about
// unknown metric names: prefers a metric==='combined' row, else derives from
// numerator/denominator sums across the date's rows for that scope. A null pct
// means "no stored value" — the strip renders "—" and never fabricates.
function _csWow(snapshots, scopeLabel) {
  const rows = (snapshots || []).filter(r => r && r.region === scopeLabel);
  const dates = [];
  const seen = new Set();
  for (const r of rows) {
    if (r.snapshot_date == null || seen.has(r.snapshot_date)) continue;
    seen.add(r.snapshot_date);
    dates.push(r.snapshot_date);
  }
  const pctOn = (date) => {
    const onDate = rows.filter(r => r.snapshot_date === date);
    const combined = onDate.find(r => String(r.metric).toLowerCase() === "combined");
    if (combined) {
      const p = _csNum(combined.pct);
      if (p != null) return p;
      const num = _csNum(combined.numerator), den = _csNum(combined.denominator);
      if (num != null && den != null && den !== 0) return Math.round((num / den) * 100);
    }
    let num = 0, den = 0, any = false;
    for (const r of onDate) {
      const n = _csNum(r.numerator), d = _csNum(r.denominator);
      if (n != null && d != null && d !== 0) { num += n; den += d; any = true; }
    }
    return any && den !== 0 ? Math.round((num / den) * 100) : null;
  };
  const currentPct = dates.length >= 1 ? pctOn(dates[0]) : null;
  const priorPct = dates.length >= 2 ? pctOn(dates[1]) : null;
  const delta = (currentPct != null && priorPct != null) ? currentPct - priorPct : null;
  return {
    currentPct, priorPct, delta,
    currentDate: _csParseDate(dates[0]), priorDate: _csParseDate(dates[1]),
    hasData: dates.length > 0,
  };
}

// Monday-to-Monday range label (Lara's mechanic). Anchor = most recent company
// snapshot Monday (a real cron Monday); else this Monday. End = anchor + 7.
function _csMondayRangeLabel(snapshots) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = today.getDay();
  const thisMon = new Date(today);
  thisMon.setDate(today.getDate() - ((day + 6) % 7));
  let anchor = null;
  for (const r of (snapshots || [])) {
    if (r && r.region === "company" && r.snapshot_date != null) {
      anchor = _csParseDate(r.snapshot_date); break;
    }
  }
  if (!anchor) anchor = thisMon;
  const next = new Date(anchor); next.setDate(anchor.getDate() + 7);
  return `${_csFmtDate(anchor)} – ${_csFmtDate(next)}`;
}

// ── presentational helpers (reuse attainment formatters/colors) ─────────────
function _csBarWidth(p) { return window.attBarWidth ? window.attBarWidth(p) : (p == null ? 0 : Math.min(100, p)); }
function _csTierColor(p) { return window.attTierColor ? window.attTierColor(p) : "var(--ink-20)"; }
function _csPctColor(p) { return window.attPctColor ? window.attPctColor(p) : "var(--ink)"; }

function CsProgressBar({ pct, color }) {
  return (
    <div className="tb-tcard__track" style={{ marginTop: 10 }}>
      <i style={{ width: `${_csBarWidth(pct)}%`, background: color || _csTierColor(pct) }} />
    </div>
  );
}

// A label/value/actual-row rendered inside a region or rollup card. The actual
// carries the fed freshness stamp; the target is a manual value (no stamp).
// _csFmtMoney already includes the currency symbol (formatCurrencyAmount), so
// no badge prefix is prepended (avoids a doubled "££1,234" rendering).
function CsMetricRow({ label, metric }) {
  const cur = metric.currency;
  const actualTxt = metric.hasActual ? _csFmtMoney(metric.actual, cur) : "—";
  const targetTxt = metric.hasTarget ? _csFmtMoney(metric.target, cur) : "—";
  return (
    <div className="tb-stack" style={{ marginTop: 14 }}>
      <div className="tb-stack__cap">
        <span>{label}</span>
        <span>
          <b>{actualTxt}</b> of {targetTxt} · {_csPctText(metric.pct)}
        </span>
      </div>
      <CsProgressBar pct={metric.pct} />
    </div>
  );
}

// WoW strip — current combined % vs the prior Monday snapshot, delta styled
// with the platform's up/down cue (teal-deep up / red down).
function CsWowStrip({ wow, scopeLabel }) {
  if (!wow.hasData) {
    return (
      <div className="tb-empty" style={{ marginBottom: 18 }}>
        No Monday snapshot recorded yet — the week-over-week trend appears after the second Monday cron run.
      </div>
    );
  }
  const up = wow.delta == null ? null : wow.delta >= 0;
  const deltaColor = up == null ? "var(--ink-50)" : (up ? "var(--done-deep)" : "#E03C3C");
  const arrow = up == null ? "·" : (up ? "▲" : "▼");
  const deltaTxt = wow.delta == null ? "—" : `${Math.abs(wow.delta)} pts`;
  const priorTxt = wow.priorDate ? `vs ${_csFmtDate(wow.priorDate)}` : "no prior Monday yet";
  return (
    <div style={{
      display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap",
      background: "var(--card)", border: "1px solid var(--ink-10)",
      borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-sm)",
      padding: "16px 22px", marginBottom: 18,
    }}>
      <span className="tb-eyebrow" style={{ margin: 0 }}>
        <span className="tb-eyebrow__dot" />{scopeLabel} · week over week
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 30, fontWeight: 600, letterSpacing: "-.02em" }}>
        {_csPctText(wow.currentPct)}
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600, color: deltaColor }}>
        {arrow} {deltaTxt}
      </span>
      <span style={{ fontSize: 12, color: "var(--ink-50)" }}>{priorTxt}</span>
    </div>
  );
}

// Per-region summary card: combined actual/target/% in the region's native
// currency, the region's WoW delta, and renewal + growth mini-rows.
function CsRegionCard({ region, cs, att }) {
  const rObj = _csRegionObj(region);
  const badge = rObj ? rObj.badge : "$";
  const m = _csRegionCombinedMetric(att, cs.targets, region, "qtd");
  const wow = _csWow(cs.snapshots, region);
  const freshness = _csFreshness(m.syncedAt);
  const combinedActualTxt = m.hasActual ? _csFmtMoney(m.actual, m.currency) : "—";
  const combinedTargetTxt = m.hasTarget ? _csFmtMoney(m.target, m.currency) : "—";
  return (
    <div className="tb-tcard tb-tcard--region" style={{ flexDirection: "column", alignItems: "stretch", gap: 0 }}>
      <div className="tb-region-head">
        <span className="tb-region-head__active" />
        <span className="tb-region-head__label">{rObj ? rObj.label : region}</span>
        <span className="tb-region-head__badge">{badge}{rObj ? rObj.currency : "USD"}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginTop: 4 }}>
        <div className="tb-tcard__money">
          <b>{combinedActualTxt}</b> of {combinedTargetTxt}
        </div>
        <div className="tb-tcard__pct">
          <div className="tb-tcard__pct-num" style={{ color: _csPctColor(m.pct) }}>{_csPctText(m.pct)}</div>
          <div className="tb-tcard__pct-label">{window.ATT_QUARTER ? window.ATT_QUARTER.label : "QTD"}</div>
        </div>
      </div>
      <CsProgressBar pct={m.pct} />
      {freshness && (
        <div style={{ fontSize: 11, color: "var(--ink-50)", fontFamily: "var(--font-mono)", marginTop: 8 }}>
          {freshness} · Salesforce-fed actuals (read-only)
        </div>
      )}
      {!freshness && (
        <div style={{ fontSize: 11, color: "var(--ink-50)", fontFamily: "var(--font-mono)", marginTop: 8 }}>
          Actuals awaiting Salesforce sync — targets are manual (cs_targets).
        </div>
      )}
      <div style={{ display: "flex", gap: 18, marginTop: 6, fontSize: 12, flexWrap: "wrap" }}>
        <span style={{ color: "var(--ink-50)" }}>
          WoW: {wow.hasData ? (
            <>
              <span style={{ color: wow.delta == null ? "var(--ink-50)" : (wow.delta >= 0 ? "var(--done-deep)" : "#E03C3C"), fontWeight: 600 }}>
                {wow.delta == null ? "—" : (wow.delta >= 0 ? "▲" : "▼") + " " + Math.abs(wow.delta) + " pts"}
              </span>
              {" "}{wow.priorDate ? `vs ${_csFmtDate(wow.priorDate)}` : ""}
            </>
          ) : "no snapshot yet"}
        </span>
      </div>
      <CsMetricRow label="Renewals" metric={m.renewal} />
      <CsMetricRow label="Growth" metric={m.growth} />
    </div>
  );
}

// Company rollup card: combined in GBP (canonical), labeled explicitly, with the
// company WoW strip on top and renewal + growth summary rows.
function CsRollupCard({ cs, att, regions }) {
  const m = _csRollupCombinedMetric(att, cs.targets, regions, "qtd", "GBP");
  const wow = _csWow(cs.snapshots, "company");
  const freshness = _csFreshness(m.syncedAt);
  const actualTxt = m.hasActual ? _csFmtMoney(m.actual, "GBP") : "—";
  const targetTxt = m.hasTarget ? _csFmtMoney(m.target, "GBP") : "—";
  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--ink-10)",
      borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-sm)",
      padding: "22px 26px",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <div className="tb-eyebrow" style={{ margin: 0 }}>
            <span className="tb-eyebrow__dot" />Company rollup · {window.ATT_QUARTER ? window.ATT_QUARTER.label : "QTD"}
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-50)", marginTop: 6 }}>
            Combined renewal + growth · <b style={{ color: "var(--ink)" }}>GBP-canonical</b> (per-region native converted via FX)
          </div>
        </div>
        <div className="tb-tcard__pct">
          <div className="tb-tcard__pct-num" style={{ color: _csPctColor(m.pct) }}>{_csPctText(m.pct)}</div>
          <div className="tb-tcard__pct-label">combined</div>
        </div>
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 600, letterSpacing: "-.02em", marginTop: 10 }}>
        <b>{actualTxt}</b>
        <span style={{ fontSize: 14, color: "var(--ink-50)" }}> of {targetTxt}</span>
      </div>
      <CsProgressBar pct={m.pct} />
      {freshness && (
        <div style={{ fontSize: 11, color: "var(--ink-50)", fontFamily: "var(--font-mono)", marginTop: 8 }}>
          {freshness} · Salesforce-fed actuals (read-only); targets manual (cs_targets)
        </div>
      )}
      <CsMetricRow label="Renewals" metric={{ ...m.renewal, currency: "GBP" }} />
      <CsMetricRow label="Growth" metric={{ ...m.growth, currency: "GBP" }} />
      <div style={{ marginTop: 14 }}>
        <CsWowStrip wow={wow} scopeLabel="Company" />
      </div>
    </div>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────
function CsPerformancePage({ authedUser, activeTeam, viewerScope, regionPill }) {
  const isManager = window.canManageAny ? window.canManageAny(authedUser) : false;
  const [cs, setCs] = React.useState(() => ({ targets: [], snapshots: [], pipeline: [], risks: [], currentFocus: [], teamFocus: [] }));
  const [att, setAtt] = React.useState([]);

  React.useEffect(() => {
    let cancelled = false;
    const loadCs = window.loadCsDashboard ? window.loadCsDashboard() : Promise.resolve(cs);
    Promise.all([loadCs, loadCsActuals()]).then(([d, a]) => {
      if (cancelled) return;
      if (d) setCs(d);
      if (a) setAtt(a);
    });
    return () => { cancelled = true; };
  }, []);

  // RFC-151 Phase 4: this page lives in the CS workspace. A legacy caller with
  // no activeTeam still renders (back-compatible, like LeaderboardView).
  if (activeTeam && activeTeam !== "cs") {
    return (
      <div className="tb-view">
        <div className="tb-empty">Combined CS performance lives in the Customer Success workspace.</div>
      </div>
    );
  }

  const allowedRegions = window.regionsUnderScope
    ? window.regionsUnderScope(viewerScope, regionPill)
    : (window.REGION_ORDER || ["US", "EMEA", "APAC"]);
  const regions = (window.REGION_ORDER || ["US", "EMEA", "APAC"]).filter(r => allowedRegions.includes(r));

  if (regions.length === 0) {
    return (
      <div className="tb-view">
        <div className="tb-empty">No CS regions are in your scope.</div>
      </div>
    );
  }

  const rangeLabel = _csMondayRangeLabel(cs.snapshots);
  const companyWow = _csWow(cs.snapshots, "company");
  const companyFreshness = _csFreshness(_csRollupActual(att, regions, "renewal", "qtd", "GBP").syncedAt);

  return (
    <div className="tb-view" data-screen-label="CS Combined Performance">
      <div className="tb-eyebrow">
        <span className="tb-eyebrow__dot" />
        {window.ATT_QUARTER ? window.ATT_QUARTER.label : "Current quarter"} · Salesforce-fed actuals, manual targets
      </div>
      <div className="tb-hrow">
        <div>
          <h1 className="tb-title"><em>CS</em> performance</h1>
          <p className="tb-sub">
            Combined Customer Success · tracking period <strong>{rangeLabel}</strong> · Monday to Monday
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          {companyFreshness && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-50)" }}>{companyFreshness}</span>
          )}
          {!companyFreshness && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-50)" }}>Actuals awaiting sync</span>
          )}
        </div>
      </div>

      <div style={{ marginTop: 22 }}>
        <CsWowStrip wow={companyWow} scopeLabel="Company" />
      </div>

      <div style={{ marginTop: 4 }}>
        <CsRollupCard cs={cs} att={att} regions={regions} />
      </div>

      <section className="tb-section">
        <div className="tb-section__head">
          <span className="tb-section__dot tb-section__dot--cs" />
          <h2 className="tb-section__title">By region</h2>
          <span className="tb-section__hint">renewal + growth · {window.ATT_QUARTER ? window.ATT_QUARTER.label : "QTD"} · native currency</span>
        </div>
        {regions.length === 0 ? (
          <div className="tb-empty">No regions in scope.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
            {regions.map(r => (
              <CsRegionCard key={r} region={r} cs={cs} att={att} />
            ))}
          </div>
        )}
      </section>

      <div className="tb-note">
        ● Renewal &amp; growth actuals are live from Salesforce (attainment_snapshot, synced nightly); quarterly targets are manual (cs_targets). The company rollup is GBP-canonical; per-region cards show each region's native currency.
      </div>
    </div>
  );
}

window.CsPerformancePage = CsPerformancePage;
