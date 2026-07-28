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
// Issue #24: this used to `.catch(() => [])`, so an attainment_snapshot read
// that was blocked or errored arrived here as zero rows and rendered as "not
// yet synced" on every card — a failure disguised as an empty quarter. Resolve
// { rows, error } instead and let the page say which it is.
let _csAttPromise = null;
function loadCsActuals() {
  if (_csAttPromise) return _csAttPromise;
  const fn = window.loadAttainment;
  _csAttPromise = fn
    ? Promise.resolve(fn()).then(rows => ({ rows: rows || [], error: null }))
        .catch(e => {
          const msg = (e && e.message) || String(e);
          console.error("loadCsActuals failed:", msg);
          return { rows: [], error: msg };
        })
    : Promise.resolve({ rows: [], error: null });
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

// ── freshness as a STATE, not decoration (issue #23) ────────────────────────
// The Salesforce feed is a nightly cron. Anything older than one night plus a
// grace window is aging; two nights is a failed feed. _csFreshness returns the
// age and a state so the surface can style a warning instead of quietly
// printing a stale date that looks identical to a fresh one.
const CS_FRESH_HOURS = 30;  // one nightly run + 6h grace
const CS_STALE_HOURS = 48;  // two missed nights → treat the feed as failed

function _csToDate(v) {
  if (v instanceof Date) return isNaN(v) ? null : v;
  return _csParseDate(v);
}
function _csAgo(hours) {
  if (hours == null) return "age unknown";
  if (hours < 1) return "just now";
  if (hours < 48) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
function _csFreshness(value, nowMs) {
  const d = _csToDate(value);
  if (!d) {
    return {
      known: false, state: "missing", tone: "warn", hours: null, at: null,
      label: "Actuals awaiting Salesforce sync",
    };
  }
  const now = nowMs == null ? Date.now() : nowMs;
  const hours = Math.max(0, (now - d.getTime()) / 36e5);
  const state = hours > CS_STALE_HOURS ? "stale" : (hours > CS_FRESH_HOURS ? "aging" : "fresh");
  return {
    known: true, state, hours, at: d,
    tone: state === "stale" ? "bad" : (state === "aging" ? "warn" : "ok"),
    label: `Synced ${_csFmtDate(d)} · ${_csAgo(hours)}`,
  };
}
const _CS_TONE_COLOR = { ok: "var(--ink-50)", warn: "#B26B00", bad: "#E03C3C" };
function _csFreshnessNote(f) {
  if (!f.known) return "no synced_at on any attainment_snapshot row in scope";
  if (f.state === "stale") return "feed has missed two or more nightly runs — numbers below are NOT current";
  if (f.state === "aging") return "older than the nightly cadence — the last sync may have failed";
  return "Salesforce-fed actuals (read-only); targets manual (cs_targets)";
}
// Shared freshness stamp. Warning/failed states get colour + an explicit
// explanation; only a genuinely fresh feed renders quietly.
function CsFreshnessStamp({ freshness, style }) {
  const bad = freshness.state === "stale" || freshness.state === "missing";
  return (
    <div style={{
      fontSize: 11, fontFamily: "var(--font-mono)", marginTop: 8,
      color: _CS_TONE_COLOR[freshness.tone] || "var(--ink-50)",
      fontWeight: freshness.tone === "ok" ? 400 : 600,
      ...(style || {}),
    }}>
      {bad ? "⚠ " : ""}{freshness.label} · {_csFreshnessNote(freshness)}
    </div>
  );
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
// `present` = a cs_targets row exists. `positive` = that row carries an amount
// worth measuring against. A zero-amount row is NOT a cleared target — it is an
// unset one (issue #15), and it must never reach a denominator (issue #14).
function _csRegionTarget(targets, rid, component, period) {
  const rows = _csTargetRows(targets, rid, component, period);
  if (!rows.length) {
    return { amount: null, currency: _csRegionCurrencyLong(rid), present: false, positive: false };
  }
  const amount = rows.reduce((s, t) => s + (_csNum(t.amount) || 0), 0);
  // cs_targets rows carry their own currency (they are authored in GBP even for
  // a USD/AUD region) — issue #17. Never assume the region's native currency.
  const currency = (rows[0] && rows[0].currency) || _csRegionCurrencyLong(rid);
  return { amount, currency, present: true, positive: amount > 0 };
}
// ── numerator/denominator pairing (issue #14) ────────────────────────────────
// A headline % is only honest when every unit contributing to the numerator
// also contributed to the denominator. Summing all-region actuals over a
// target that skipped the zero/absent-target regions is how a company number
// gets silently inflated. _csPairUnits enforces the pairing: a unit joins BOTH
// sides or NEITHER, and anything dropped is reported so the surface can say so
// out loud rather than hiding it.
//   unit = { label, hasActual, actual, hasTarget, target }  (one currency)
function _csPairUnits(units) {
  let num = null, den = null, totalActual = null, excludedActual = 0;
  const excluded = [];
  for (const u of (units || [])) {
    if (u.hasActual) totalActual = (totalActual || 0) + u.actual;
    if (u.hasTarget && u.target > 0) {
      den = (den || 0) + u.target;
      num = (num || 0) + (u.hasActual ? u.actual : 0);
    } else if (u.hasActual && u.actual !== 0) {
      excluded.push(u.label);
      excludedActual += u.actual;
    }
  }
  return {
    actual: num, target: den, totalActual, excluded, excludedActual,
    pct: den != null && den > 0 ? Math.round((num || 0) / den * 100) : null,
  };
}

// ── metric assembly (one component × period × scope) ─────────────────────────
// The target is converted into the ACTUAL's currency before it is displayed or
// divided (issue #17): cs_targets amounts are authored in GBP regardless of the
// region, so a raw comparison against a USD/AUD actual is both a wrong ratio and
// a wrong label.
function _csRegionMetric(att, targets, rid, component, period) {
  const a = _csRegionActual(att, rid, component, period);
  const t = _csRegionTarget(targets, rid, component, period);
  const targetNative = t.positive ? _csConvert(t.amount, t.currency, a.currency) : null;
  return {
    actual: a.hasValue ? a.nativeTotal : null, hasActual: a.hasValue, syncedAt: a.syncedAt,
    target: targetNative, hasTarget: targetNative != null && targetNative > 0,
    targetRowPresent: t.present, targetSourceCurrency: t.currency,
    pct: (a.hasValue && targetNative != null && targetNative > 0)
      ? _csPct(a.nativeTotal, targetNative) : null,
    currency: a.currency,
  };
}
// Combined (renewal+growth) for a region. Both components share the region's
// native currency, so the pairing sum is exact with no further conversion.
function _csRegionCombinedMetric(att, targets, rid, period) {
  const ren = _csRegionMetric(att, targets, rid, "renewal", period);
  const gro = _csRegionMetric(att, targets, rid, "growth", period);
  const paired = _csPairUnits([
    { label: "renewals", ...ren },
    { label: "growth", ...gro },
  ]);
  const synced = (ren.syncedAt && gro.syncedAt
    ? (ren.syncedAt > gro.syncedAt ? ren.syncedAt : gro.syncedAt)
    : (ren.syncedAt || gro.syncedAt));
  return {
    actual: paired.actual, hasActual: paired.actual != null,
    target: paired.target, hasTarget: paired.target != null,
    totalActual: paired.totalActual, excluded: paired.excluded,
    excludedActual: paired.excludedActual,
    pct: paired.pct, currency: ren.currency, syncedAt: synced,
    renewal: ren, growth: gro,
  };
}
// Combined rollup across regions in toCurrency (GBP-canonical on the home).
// Built from region×component UNITS rather than from pre-summed rollups, so the
// pairing rule above applies at the grain where the mismatch actually happens:
// a region that has renewal actuals but no renewal target no longer lands in the
// company numerator (issue #14).
function _csRollupCombinedMetric(att, targets, regions, period, toCur) {
  const units = [], renUnits = [], groUnits = [];
  let synced = null;
  for (const rid of regions) {
    for (const component of ["renewal", "growth"]) {
      const m = _csRegionMetric(att, targets, rid, component, period);
      if (m.syncedAt && (!synced || m.syncedAt > synced)) synced = m.syncedAt;
      const unit = {
        label: `${rid} ${component === "renewal" ? "renewals" : "growth"}`,
        hasActual: m.hasActual,
        actual: m.hasActual ? _csConvert(m.actual, m.currency, toCur) : null,
        hasTarget: m.hasTarget,
        target: m.hasTarget ? _csConvert(m.target, m.currency, toCur) : null,
      };
      units.push(unit);
      (component === "renewal" ? renUnits : groUnits).push(unit);
    }
  }
  const paired = _csPairUnits(units);
  const ren = _csPairUnits(renUnits);
  const gro = _csPairUnits(groUnits);
  const asMetric = (p) => ({
    hasActual: p.actual != null, actual: p.actual,
    hasTarget: p.target != null, target: p.target,
    totalActual: p.totalActual, excluded: p.excluded, excludedActual: p.excludedActual,
    pct: p.pct, currency: toCur,
  });
  return {
    actual: paired.actual, hasActual: paired.actual != null,
    target: paired.target, hasTarget: paired.target != null,
    totalActual: paired.totalActual, excluded: paired.excluded,
    excludedActual: paired.excludedActual,
    pct: paired.pct, currency: toCur, syncedAt: synced,
    renewal: asMetric(ren), growth: asMetric(gro),
  };
}

// ── WoW strip (cs_dashboard_snapshot) ────────────────────────────────────────
// scopeLabel = 'company' for the rollup, or a region id. Returns combined %
// for the most recent snapshot_date and the prior Monday's.
//
// Issue #14 (stored path): the stored metric==='combined' pct is NOT trusted
// blind. cs_dashboard_snapshot is written by a cron that has historically summed
// every scope's numerator while only summing the scopes that had a target — the
// same inflation the live rollup had. So the pct is DERIVED here from the
// per-metric numerator/denominator rows with the pairing rule applied (a row
// whose denominator is absent or non-positive contributes to neither side), and
// the stored value is used only as a cross-check: a disagreement raises a
// visible warning instead of silently winning.
function _csSnapshotSignature(rowsOnDate) {
  return rowsOnDate
    .map(r => `${String(r.metric)}:${_csNum(r.numerator)}/${_csNum(r.denominator)}`)
    .sort()
    .join("|");
}
function _csWow(snapshots, scopeLabel) {
  const rows = (snapshots || []).filter(r => r && r.region === scopeLabel);
  const dates = [];
  const seen = new Set();
  for (const r of rows) {
    if (r.snapshot_date == null || seen.has(r.snapshot_date)) continue;
    seen.add(r.snapshot_date);
    dates.push(r.snapshot_date);
  }
  const readOn = (date) => {
    const onDate = rows.filter(r => r.snapshot_date === date);
    const combined = onDate.find(r => String(r.metric).toLowerCase() === "combined");
    let num = 0, den = 0, any = false, dropped = 0;
    for (const r of onDate) {
      if (r === combined) continue;  // the aggregate row is not a unit
      const n = _csNum(r.numerator), d = _csNum(r.denominator);
      if (d != null && d > 0) { num += (n || 0); den += d; any = true; }
      else if (n != null && n !== 0) { dropped += 1; }
    }
    let derived = any && den > 0 ? Math.round((num / den) * 100) : null;
    // Only a lone combined row (no per-metric units) may stand in for itself.
    if (derived == null && combined) {
      const cn = _csNum(combined.numerator), cd = _csNum(combined.denominator);
      if (cn != null && cd != null && cd > 0) derived = Math.round((cn / cd) * 100);
    }
    const stored = combined ? _csNum(combined.pct) : null;
    const pct = derived != null ? derived : stored;
    const mismatch = derived != null && stored != null && Math.abs(derived - stored) > 1;
    return {
      pct, derived, stored, mismatch, dropped,
      unverified: derived == null && stored != null,
      signature: _csSnapshotSignature(onDate),
    };
  };
  const cur = dates.length >= 1 ? readOn(dates[0]) : null;
  const prior = dates.length >= 2 ? readOn(dates[1]) : null;
  const currentPct = cur ? cur.pct : null;
  const priorPct = prior ? prior.pct : null;
  const delta = (currentPct != null && priorPct != null) ? currentPct - priorPct : null;
  // Issue #23: a cron that fails after writing its row, or that re-writes last
  // week's figures, produces two consecutive dates with byte-identical
  // numerators and denominators. That is a stalled feed, not a flat week.
  const stalled = !!(cur && prior && cur.signature && cur.signature === prior.signature);
  const warnings = [];
  if (cur && cur.mismatch) {
    warnings.push(`stored combined % (${cur.stored}%) disagrees with the paired numerator/denominator (${cur.derived}%) — showing the paired figure`);
  }
  if (cur && cur.dropped) {
    warnings.push(`${cur.dropped} snapshot row${cur.dropped === 1 ? "" : "s"} excluded from the % (no positive target)`);
  }
  if (cur && cur.unverified) {
    warnings.push("stored % could not be verified against numerator/denominator rows");
  }
  if (stalled) {
    warnings.push("this Monday's snapshot is identical to the prior one — the nightly feed may not have run");
  }
  return {
    currentPct, priorPct, delta,
    currentDate: _csParseDate(dates[0]), priorDate: _csParseDate(dates[1]),
    hasData: dates.length > 0, stalled, warnings,
  };
}

// Monday-to-Monday range label (Lara's mechanic). Anchor = most recent company
// snapshot Monday (a real cron Monday); else this Monday. End = anchor + 7.
// NOTE: cs-region.jsx declares this same helper with a `scopeLabel` parameter,
// and (loading later) its copy wins for BOTH files — a one-argument call here
// was silently matching `r.region === undefined` and always falling back to the
// current calendar Monday. Signatures kept identical; callers pass the scope.
function _csMondayRangeLabel(snapshots, scopeLabel) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = today.getDay();
  const thisMon = new Date(today);
  thisMon.setDate(today.getDate() - ((day + 6) % 7));
  let anchor = null;
  for (const r of (snapshots || [])) {
    if (r && r.region === scopeLabel && r.snapshot_date != null) {
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
  // Issue #15: no target on file is "no target set", never "$0 to hit". The
  // progress bar is suppressed entirely — a bar against no target reads as 0%.
  const money = metric.hasTarget
    ? <><b>{_csFmtMoney(metric.actual, cur)}</b> of {_csFmtMoney(metric.target, cur)} · {_csPctText(metric.pct)}</>
    : <><b>{metric.totalActual != null ? _csFmtMoney(metric.totalActual, cur) : "—"}</b> · no target set</>;
  return (
    <div className="tb-stack" style={{ marginTop: 14 }}>
      <div className="tb-stack__cap">
        <span>{label}</span>
        <span>{money}</span>
      </div>
      {metric.hasTarget && <CsProgressBar pct={metric.pct} />}
      <CsExcludedNote metric={metric} />
    </div>
  );
}

// Issue #14: whatever the pairing rule dropped is stated, with the money it
// represents, so a headline % is never quietly narrower than the actuals above
// it.
function CsExcludedNote({ metric, style }) {
  if (!metric || !metric.excluded || !metric.excluded.length) return null;
  return (
    <div style={{ fontSize: 11, color: "#B26B00", marginTop: 6, ...(style || {}) }}>
      Excluded from the %: {metric.excluded.join(", ")} ({_csFmtMoney(metric.excludedActual, metric.currency)} with no target set).
    </div>
  );
}

// Warning list attached to a snapshot-derived figure (issues #14 / #23).
function CsWowWarnings({ wow }) {
  if (!wow.warnings || !wow.warnings.length) return null;
  return (
    <div style={{ fontSize: 11, color: "#B26B00", marginTop: 8, fontWeight: 600, width: "100%" }}>
      {wow.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
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
      <CsWowWarnings wow={wow} />
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
  return (
    <div className="tb-tcard tb-tcard--region" style={{ flexDirection: "column", alignItems: "stretch", gap: 0 }}>
      <div className="tb-region-head">
        <span className="tb-region-head__active" />
        <span className="tb-region-head__label">{rObj ? rObj.label : region}</span>
        <span className="tb-region-head__badge">{badge}{rObj ? rObj.currency : "USD"}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginTop: 4 }}>
        <div className="tb-tcard__money">
          {m.hasTarget ? (
            <><b>{_csFmtMoney(m.actual, m.currency)}</b> of {_csFmtMoney(m.target, m.currency)}</>
          ) : (
            <><b>{m.totalActual != null ? _csFmtMoney(m.totalActual, m.currency) : "—"}</b> · no target set</>
          )}
        </div>
        <div className="tb-tcard__pct">
          <div className="tb-tcard__pct-num" style={{ color: _csPctColor(m.pct) }}>{_csPctText(m.pct)}</div>
          <div className="tb-tcard__pct-label">{window.ATT_QUARTER ? window.ATT_QUARTER.label : "QTD"}</div>
        </div>
      </div>
      {m.hasTarget && <CsProgressBar pct={m.pct} />}
      <CsExcludedNote metric={m} />
      <CsFreshnessStamp freshness={freshness} />
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
        <b>{m.hasTarget
          ? _csFmtMoney(m.actual, "GBP")
          : (m.totalActual != null ? _csFmtMoney(m.totalActual, "GBP") : "—")}</b>
        <span style={{ fontSize: 14, color: "var(--ink-50)" }}>
          {m.hasTarget ? <> of {_csFmtMoney(m.target, "GBP")}</> : <> · no target set</>}
        </span>
      </div>
      {m.hasTarget && <CsProgressBar pct={m.pct} />}
      <CsExcludedNote metric={m} />
      <CsFreshnessStamp freshness={freshness} />
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
  const [attError, setAttError] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    const loadCs = window.loadCsDashboard ? window.loadCsDashboard() : Promise.resolve(cs);
    Promise.all([loadCs, loadCsActuals()]).then(([d, a]) => {
      if (cancelled) return;
      if (d) setCs(d);
      if (a) { setAtt(a.rows || []); setAttError(a.error || null); }
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

  const csErr = (key) => (cs && cs.errors && cs.errors[key]) || null;
  const rangeLabel = _csMondayRangeLabel(cs.snapshots, "company");
  const companyWow = _csWow(cs.snapshots, "company");
  const companyFreshness = _csFreshness(_csRollupActual(att, regions, "renewal", "qtd", "GBP").syncedAt);
  const companyStale = companyFreshness.state === "stale" || companyFreshness.state === "missing";

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
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 11,
            color: _CS_TONE_COLOR[companyFreshness.tone] || "var(--ink-50)",
            fontWeight: companyFreshness.tone === "ok" ? 400 : 600,
          }}>
            {companyStale ? "⚠ " : ""}{companyFreshness.label}
          </span>
        </div>
      </div>

      {companyStale && (
        <div role="alert" style={{
          marginTop: 14, padding: "12px 16px", borderRadius: "var(--radius-card)",
          border: "1px solid #E03C3C", background: "rgba(224,60,60,.08)",
          color: "#8E1E1E", fontSize: 13, fontWeight: 600,
        }}>
          {companyFreshness.known
            ? `Salesforce actuals last synced ${_csAgo(companyFreshness.hours)} — the nightly feed has missed at least two runs. Treat every figure on this page as out of date.`
            : "No Salesforce sync timestamp is present on any attainment_snapshot row in scope — these actuals cannot be dated."}
        </div>
      )}

      {/* Issue #25: cs_targets and cs_dashboard_snapshot are settled separately
          by loadCsDashboard. A failed targets read would otherwise present as
          "no target set" on every card, and a failed snapshot read as a flat
          week-over-week — both indistinguishable from a real reading. */}
      {window.CsSectionError && attError && (
        <window.CsSectionError error={attError} label="Salesforce actuals"
                               style={{ marginTop: 14 }} />
      )}
      {window.CsSectionError && csErr("targets") && (
        <window.CsSectionError error={csErr("targets")} label="CS targets"
                               style={{ marginTop: 14 }} />
      )}
      {window.CsSectionError && csErr("snapshots") && (
        <window.CsSectionError error={csErr("snapshots")} label="The week-over-week history"
                               style={{ marginTop: 14 }} />
      )}

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
