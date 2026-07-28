// ── CS Region page (RFC-158 Phase 3) — window.CsRegionPage ──────────────────
// One region's CS performance: Renewals / Growth sub-tabs each showing monthly
// + quarterly + YTD target vs actual, the region's WoW row, and the region's
// PE / LT / LS product split. Mirrors the platform's Target Board idiom
// (target-board.jsx):
//   • props: { region, authedUser, activeTeam, viewerScope, regionPill } — the
//     platform signature from LeaderboardView plus a `region` selector.
//   • Salesforce-fed actuals render READ-ONLY with a synced_at freshness stamp;
//     actuals show "—" when the feed has no value — never fabricated.
//   • targets (cs_targets) render as manual values; PE/LT/LS are the manual-
//     editable product split (SF product feed not live yet) wired to cs_targets
//     rows via upsertCsTarget — no fake freshness stamp on manual numbers.
//   • currency via formatCurrencyAmount + regionCurrency (decision 3).
// Data: window.loadCsDashboard() ({ targets, snapshots, … }) +
// window.loadAttainment() (attainment_snapshot rows). Every number is sourced
// from these layers — zero hardcoded figures. Self-contained (no module system,
// window globals only) so it loads regardless of script order; the shared
// helpers mirror cs-performance.jsx deliberately.
// ─────────────────────────────────────────────────────────────────────────────

// Memoized attainment_snapshot load (latest row per rep). See cs-performance.jsx.
// Issue #24: resolves { rows, error } — a blocked read must not arrive as an
// empty quarter. Mirrors cs-performance.jsx (both copies resolve to one global;
// only the memo variable name differs).
let _csrAttPromise = null;
function loadCsActuals() {
  if (_csrAttPromise) return _csrAttPromise;
  const fn = window.loadAttainment;
  _csrAttPromise = fn
    ? Promise.resolve(fn()).then(rows => ({ rows: rows || [], error: null }))
        .catch(e => {
          const msg = (e && e.message) || String(e);
          console.error("loadCsActuals failed:", msg);
          return { rows: [], error: msg };
        })
    : Promise.resolve({ rows: [], error: null });
  return _csrAttPromise;
}

// ── value coercion / pct (null-safe) ─────────────────────────────────────────
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
// Duplicated verbatim from cs-performance.jsx. These helpers are plain top-level
// declarations in a no-module-system page, so both copies resolve to one global
// and MUST stay identical — the #30 dedup pass folds them together later.
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

// ── currency helpers (decision 3 native-currency) ──────────────────────────
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
function _csRepNativeCurrency(repId) {
  const r = (window.REPS || []).find(x => x.id === repId);
  if (!r || !r.region) return "USD";
  return _csRegionCurrencyLong(r.region);
}
function _csRepsInRegion(rid) {
  const weekIdx = window.currentWeekIndex ? window.currentWeekIndex() : null;
  return (window.REPS || []).filter(r =>
    r.team === "cs" && r.region === rid &&
    (window.repVisibleInWeek ? window.repVisibleInWeek(r, weekIdx != null ? weekIdx + 1 : 1) : true));
}

// ── fed actuals (attainment_snapshot) ────────────────────────────────────────
const _CS_ACT_FIELD = {
  renewal: { mtd: "ren_mtd_renewed", qtd: "ren_qtd_renewed", ytd: "ren_ytd_renewed" },
  growth:  { mtd: "exp_mtd_won",    qtd: "exp_qtd_won",    ytd: "exp_ytd_won" },
};
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

// ── manual targets (cs_targets) ──────────────────────────────────────────────
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
    return { amount: null, currency: _csRegionCurrencyLong(rid), present: false, positive: false, row: null };
  }
  const amount = rows.reduce((s, t) => s + (_csNum(t.amount) || 0), 0);
  // cs_targets rows carry their own currency (they are authored in GBP even for
  // a USD/AUD region) — issue #17. Never assume the region's native currency.
  const currency = (rows[0] && rows[0].currency) || _csRegionCurrencyLong(rid);
  return { amount, currency, present: true, positive: amount > 0, row: rows[0] };
}

// ── numerator/denominator pairing (issue #14) ────────────────────────────────
// Duplicated verbatim from cs-performance.jsx — see the note above _csFreshness.
// A unit joins BOTH sides of the ratio or NEITHER; anything dropped is reported.
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

// ── WoW strip (cs_dashboard_snapshot) ────────────────────────────────────────
// Duplicated verbatim from cs-performance.jsx — see the note above _csFreshness.
// Issue #14 (stored path): the stored metric==='combined' pct is NOT trusted
// blind; the pct is DERIVED from the per-metric numerator/denominator rows with
// the pairing rule applied, and the stored value is only a cross-check whose
// disagreement raises a visible warning.
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
  // Issue #23: two consecutive dates with byte-identical numerators and
  // denominators is a stalled feed, not a flat week.
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

// Warning list attached to a snapshot-derived figure (issues #14 / #23).
function CsWowWarnings({ wow }) {
  if (!wow.warnings || !wow.warnings.length) return null;
  return (
    <div style={{ fontSize: 11, color: "#B26B00", marginTop: 8, fontWeight: 600, width: "100%" }}>
      {wow.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
    </div>
  );
}

// Issue #14: whatever the pairing rule dropped is stated, with the money it
// represents, so a headline % is never quietly narrower than the actuals above it.
function CsExcludedNote({ metric, style }) {
  if (!metric || !metric.excluded || !metric.excluded.length) return null;
  return (
    <div style={{ fontSize: 11, color: "#B26B00", marginTop: 6, ...(style || {}) }}>
      Excluded from the %: {metric.excluded.join(", ")} ({_csFmtMoney(metric.excludedActual, metric.currency)} with no target set).
    </div>
  );
}

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

// ── presentational helpers ───────────────────────────────────────────────────
function _csBarWidth(p) { return window.attBarWidth ? window.attBarWidth(p) : (p == null ? 0 : Math.min(100, p)); }
function _csTierColor(p) { return window.attTierColor ? window.attTierColor(p) : "var(--ink-20)"; }
function _csPctColor(p) { return window.attPctColor ? window.attPctColor(p) : "var(--ink)"; }

function CsProgressBar({ pct, color }) {
  return (
    <div className="tb-tcard__track" style={{ marginTop: 8 }}>
      <i style={{ width: `${_csBarWidth(pct)}%`, background: color || _csTierColor(pct) }} />
    </div>
  );
}

// Region WoW row (inline strip). Uses the platform's up/down cue.
function CsRegionWowRow({ snapshots, region }) {
  const wow = _csWow(snapshots, region);
  if (!wow.hasData) {
    return (
      <div className="tb-empty" style={{ marginBottom: 14 }}>
        No Monday snapshot recorded for {region} yet — the WoW trend appears after the second Monday cron run.
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
      padding: "14px 22px", marginBottom: 18,
    }}>
      <span className="tb-eyebrow" style={{ margin: 0 }}>
        <span className="tb-eyebrow__dot" />{region} · week over week
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 600, letterSpacing: "-.02em" }}>
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

// Period table for one component (Renewals or Growth): Monthly / Quarterly / YTD
// × Target / Actual / %. Targets are manual (displayed as values); actuals are
// fed (read-only, with a freshness stamp). "—" wherever the feed/target is empty.
function CsPeriodTable({ att, targets, region, component }) {
  const periods = [
    { key: "mtd", label: "Monthly" },
    { key: "qtd", label: "Quarterly" },
    { key: "ytd", label: "YTD" },
  ];
  const rows = periods.map(p => {
    const m = _csRegionMetric(att, targets, region, component, p.key);
    return { ...p, m };
  });
  const latestSync = rows.map(r => r.m.syncedAt).filter(Boolean).sort((a, b) => b - a)[0] || null;
  const tableFreshness = _csFreshness(latestSync);
  const cur = _csRegionCurrencyLong(region);
  const th = { fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-50)", textAlign: "left", padding: "11px 12px", background: "var(--paper-deep)" };
  const td = { padding: "11px 12px", borderTop: "1px solid var(--ink-10)", verticalAlign: "middle" };
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--ink-10)", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, padding: "14px 18px 8px", flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-50)" }}>
          {component === "renewal" ? "Renewals" : "Growth"} · target vs actual
        </span>
        <CsFreshnessStamp freshness={tableFreshness} style={{ marginTop: 0 }} />
      </div>
      <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, font: "inherit" }}>
        <thead>
          <tr>
            <th style={th}>Period</th>
            <th style={{ ...th, textAlign: "right" }}>Target</th>
            <th style={{ ...th, textAlign: "right" }}>Actual</th>
            <th style={{ ...th, textAlign: "right" }}>%</th>
            <th style={th}>Progress</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.key}>
              <td style={td}><b style={{ fontWeight: 600 }}>{r.label}</b></td>
              <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono)" }}>
                {r.m.hasTarget ? _csFmtMoney(r.m.target, cur) : <span style={{ color: "var(--ink-50)" }}>—</span>}
                {/* Issue #15: an absent or zero cs_targets amount is "no target
                    set", never a cleared/$0 target. */}
                <div style={{ fontSize: 10, color: "var(--ink-50)", marginTop: 2 }}>
                  {r.m.hasTarget ? "manual target" : "no target set"}
                </div>
              </td>
              <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono)" }}>
                {r.m.hasActual ? _csFmtMoney(r.m.actual, cur) : <span style={{ color: "var(--ink-50)" }}>—</span>}
                {/* Issue #16: a missing feed value is "not yet synced", which is
                    not the same claim as a genuine synced zero. */}
                <div style={{ fontSize: 10, color: "var(--ink-50)", marginTop: 2 }}>
                  {r.m.hasActual ? _csFreshness(r.m.syncedAt).label : "not yet synced"}
                </div>
              </td>
              <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 600, color: _csPctColor(r.m.pct) }}>
                {_csPctText(r.m.pct)}
              </td>
              <td style={td}>
                {r.m.hasTarget
                  ? <CsProgressBar pct={r.m.pct} />
                  : <span style={{ fontSize: 10, color: "var(--ink-50)" }}>—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ padding: "10px 18px", fontSize: 11, color: "var(--ink-50)", fontFamily: "var(--font-mono)" }}>
        Targets are manual values (cs_targets) — edit them on the targets page. Actuals are Salesforce-fed (attainment_snapshot).
      </div>
    </div>
  );
}

// PE / LT / LS product split — the one manual-editable block on this page. The
// SF product feed is not live yet, so these render as editable manual numbers
// wired to cs_targets rows (component pe/lt/ls, quarterly, current fy/quarter).
// No freshness stamp on manual figures. Read-only for non-managers.
function CsPeLtLsSplit({ targets, region, isManager, onCommit }) {
  const { fy, quarter } = _csCurrentFyQ();
  const currency = _csRegionCurrencyLong(region);
  const badge = _csRegionObj(region) ? _csRegionObj(region).badge : "$";
  const comps = [
    { component: "pe", label: "Performance Enablement" },
    { component: "lt", label: "Technologies" },
    { component: "ls", label: "Learning Services" },
  ];
  const rows = comps.map(c => {
    const t = _csRegionTarget(targets, region, c.component, "qtd");
    return { ...c, amount: t.present ? (_csNum(t.amount) || 0) : 0, present: t.present, currency };
  });
  const total = rows.reduce((s, r) => s + (r.present ? r.amount : 0), 0);
  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--ink-10)",
      borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-sm)", padding: "18px 22px",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div className="tb-eyebrow" style={{ margin: 0 }}>
            <span className="tb-eyebrow__dot" />Product split · {window.ATT_QUARTER ? window.ATT_QUARTER.label : "QTD"}
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-50)", marginTop: 6 }}>
            PE / LT / LS targets — manual (the SF product feed is not live yet). Combined: <b style={{ color: "var(--ink)" }}>{_csFmtMoney(total, currency)}</b>
          </div>
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-50)" }}>
          {isManager ? "Editable · save on blur" : "Read-only"}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 14 }}>
        {rows.map(r => (
          <CsEditableTarget
            key={r.component}
            label={r.label}
            component={r.component}
            region={region}
            amount={r.amount}
            currency={currency}
            badge={badge}
            isManager={isManager}
            onCommit={onCommit}
          />
        ))}
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: "var(--ink-50)", fontFamily: "var(--font-mono)" }}>
        Manual figures · no freshness stamp (the manual-vs-fed rule: never both editable and fed).
      </div>
    </div>
  );
}

// One editable PE/LT/LS field. Local state keeps typing smooth; commits on
// change (blur) via upsertCsTarget. Shows a tiny save status.
function CsEditableTarget({ label, component, region, amount, currency, badge, isManager, onCommit }) {
  const [val, setVal] = React.useState(amount == null ? "" : String(amount));
  const [status, setStatus] = React.useState(null); // "saved" | "error" | null
  React.useEffect(() => { setVal(amount == null ? "" : String(amount)); }, [amount]);
  const commit = () => {
    const n = val === "" ? null : _csNum(val);
    if (n == null && val !== "") { setStatus("error"); return; }
    if (n === amount) return;
    onCommit({ region, component, amount: n || 0, currency })
      .then(() => setStatus("saved"))
      .catch(() => setStatus("error"));
  };
  const fieldStyle = {
    width: "100%", padding: "8px 10px", borderRadius: 8, font: "inherit",
    fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 600,
    border: isManager ? "1px solid var(--ink-20)" : "1px solid transparent",
    background: isManager ? "var(--card)" : "transparent",
    color: "var(--ink)",
  };
  return (
    <div style={{ border: "1px solid var(--ink-10)", borderRadius: 12, padding: "12px 14px", background: "var(--paper-deep)" }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-50)" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 600, color: "var(--ink-50)" }}>{badge}</span>
        <input
          type="number"
          inputMode="decimal"
          aria-label={`${label} target`}
          disabled={!isManager}
          readOnly={!isManager}
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={commit}
          style={fieldStyle}
        />
      </div>
      <div style={{ fontSize: 10, color: status === "error" ? "#E03C3C" : "var(--ink-50)", marginTop: 5, fontFamily: "var(--font-mono)" }}>
        {status === "saved" ? "saved" : status === "error" ? "enter a number" : "manual · cs_targets"}
      </div>
    </div>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────
function CsRegionPage({ region, authedUser, activeTeam, viewerScope, regionPill }) {
  const isManager = window.canManageAny ? window.canManageAny(authedUser) : false;
  const [cs, setCs] = React.useState(() => ({ targets: [], snapshots: [], pipeline: [], risks: [], currentFocus: [], teamFocus: [] }));
  const [att, setAtt] = React.useState([]);
  const [attError, setAttError] = React.useState(null);
  const [tab, setTab] = React.useState("renewal");

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

  if (activeTeam && activeTeam !== "cs") {
    return (
      <div className="tb-view">
        <div className="tb-empty">The CS region view lives in the Customer Success workspace.</div>
      </div>
    );
  }

  const allowedRegions = window.regionsUnderScope
    ? window.regionsUnderScope(viewerScope, regionPill)
    : (window.REGION_ORDER || ["US", "EMEA", "APAC"]);
  const rid = region || "US";
  if (!allowedRegions.includes(rid)) {
    return (
      <div className="tb-view">
        <div className="tb-empty">{rid} is not in your region scope.</div>
      </div>
    );
  }

  const rObj = _csRegionObj(rid);
  const badge = rObj ? rObj.badge : "$";
  const cur = _csRegionCurrencyLong(rid);
  const csErr = (key) => (cs && cs.errors && cs.errors[key]) || null;
  const rangeLabel = _csMondayRangeLabel(cs.snapshots, rid);
  // Issue #14: renewal and growth are paired independently — a component with
  // actuals but no target contributes to neither side of the combined %.
  const qCombined = (function () {
    const ren = _csRegionMetric(att, cs.targets, rid, "renewal", "qtd");
    const gro = _csRegionMetric(att, cs.targets, rid, "growth", "qtd");
    const paired = _csPairUnits([
      { label: "renewals", ...ren },
      { label: "growth", ...gro },
    ]);
    const synced = (ren.syncedAt && gro.syncedAt ? (ren.syncedAt > gro.syncedAt ? ren.syncedAt : gro.syncedAt) : (ren.syncedAt || gro.syncedAt));
    return {
      actual: paired.actual, hasActual: paired.actual != null,
      target: paired.target, hasTarget: paired.target != null,
      totalActual: paired.totalActual, excluded: paired.excluded,
      excludedActual: paired.excludedActual,
      pct: paired.pct, currency: cur, syncedAt: synced,
    };
  })();
  const freshness = _csFreshness(qCombined.syncedAt);
  const regionStale = freshness.state === "stale" || freshness.state === "missing";

  const handleCommit = (payload) => {
    const upsert = window.upsertCsTarget;
    if (!upsert) return Promise.reject(new Error("upsertCsTarget unavailable"));
    const { fy, quarter } = _csCurrentFyQ();
    return upsert({
      region: payload.region,
      rep_id: null,
      period_type: "quarterly",
      fy,
      period: quarter,
      component: payload.component,
      amount: payload.amount,
      currency: payload.currency || cur,
    }, (authedUser && (authedUser.email || authedUser.authEmail)) || null)
      .then(() => {
        // Reflect the edit locally so the card updates without a reload. Re-fetch
        // the memoized cs data once it invalidates — simplest: patch local state.
        setCs(prev => {
          const t = prev.targets || [];
          const idx = t.findIndex(x => x && x.region === payload.region && x.rep_id == null &&
            String(x.period_type).toLowerCase() === "quarterly" && Number(x.fy) === fy &&
            Number(x.period) === quarter && String(x.component).toLowerCase() === payload.component);
          const stamped = {
            region: payload.region, rep_id: null, period_type: "quarterly",
            fy, period: quarter, component: payload.component,
            amount: payload.amount, currency: payload.currency || cur,
            updated_at: new Date().toISOString(),
          };
          const next = idx >= 0 ? t.slice() : t.slice();
          if (idx >= 0) next[idx] = { ...next[idx], ...stamped };
          else next.push(stamped);
          return { ...prev, targets: next };
        });
      });
  };

  const tabBtn = (key, label) => (
    <button
      key={key}
      className={"tb-toggle__btn" + (tab === key ? " on" : "")}
      aria-pressed={tab === key}
      onClick={() => setTab(key)}
    >{label}</button>
  );

  return (
    <div className="tb-view" data-screen-label={`CS ${rid}`}>
      <div className="tb-eyebrow">
        <span className="tb-eyebrow__dot" />
        {rObj ? rObj.label : rid} · {badge}{rObj ? rObj.currency : "USD"} · {window.ATT_QUARTER ? window.ATT_QUARTER.label : "current quarter"}
      </div>
      <div className="tb-hrow">
        <div>
          <h1 className="tb-title"><em>{rid}</em> CS performance</h1>
          <p className="tb-sub">
            {rObj ? rObj.label : rid} Customer Success · tracking period <strong>{rangeLabel}</strong> · Monday to Monday
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 11,
            color: _CS_TONE_COLOR[freshness.tone] || "var(--ink-50)",
            fontWeight: freshness.tone === "ok" ? 400 : 600,
          }}>
            {regionStale ? "⚠ " : ""}{freshness.label}
          </span>
        </div>
      </div>

      {regionStale && (
        <div role="alert" style={{
          marginTop: 14, padding: "12px 16px", borderRadius: "var(--radius-card)",
          border: "1px solid #E03C3C", background: "rgba(224,60,60,.08)",
          color: "#8E1E1E", fontSize: 13, fontWeight: 600,
        }}>
          {freshness.known
            ? `Salesforce actuals last synced ${_csAgo(freshness.hours)} — the nightly feed has missed at least two runs. Treat every figure on this page as out of date.`
            : "No Salesforce sync timestamp is present on any attainment_snapshot row for this region — these actuals cannot be dated."}
        </div>
      )}

      {/* Issue #25: per-table load failures, so a blocked cs_targets read reads
          as an error rather than as "no target set" on every row. */}
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

      <div style={{
        background: "var(--card)", border: "1px solid var(--ink-10)",
        borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-sm)",
        padding: "18px 22px", margin: "16px 0",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div className="tb-eyebrow" style={{ margin: 0 }}>
            <span className="tb-eyebrow__dot" />Combined · {window.ATT_QUARTER ? window.ATT_QUARTER.label : "QTD"}
          </div>
          <div className="tb-tcard__pct">
            <div className="tb-tcard__pct-num" style={{ color: _csPctColor(qCombined.pct) }}>{_csPctText(qCombined.pct)}</div>
            <div className="tb-tcard__pct-label">renewal + growth</div>
          </div>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 600, letterSpacing: "-.02em", marginTop: 8 }}>
          <b>{qCombined.hasTarget
            ? _csFmtMoney(qCombined.actual, cur)
            : (qCombined.totalActual != null ? _csFmtMoney(qCombined.totalActual, cur) : "—")}</b>
          <span style={{ fontSize: 13, color: "var(--ink-50)" }}>
            {qCombined.hasTarget ? <> of {_csFmtMoney(qCombined.target, cur)}</> : <> · no target set</>}
          </span>
        </div>
        {qCombined.hasTarget && <CsProgressBar pct={qCombined.pct} />}
        <CsExcludedNote metric={qCombined} />
      </div>

      <CsRegionWowRow snapshots={cs.snapshots} region={rid} />

      <div className="tb-toggle" style={{ marginBottom: 14 }}>
        {tabBtn("renewal", "Renewals")}
        {tabBtn("growth", "Growth")}
      </div>

      <CsPeriodTable att={att} targets={cs.targets} region={rid} component={tab} />

      <div style={{ marginTop: 18 }}>
        <CsPeLtLsSplit targets={cs.targets} region={rid} isManager={isManager} onCommit={handleCommit} />
      </div>

      <div className="tb-note">
        ● Renewal &amp; growth actuals are live from Salesforce (attainment_snapshot); targets are manual (cs_targets). PE/LT/LS are manual figures until the SF product feed goes live — editable here for managers, no freshness stamp.
      </div>
    </div>
  );
}

window.CsRegionPage = CsRegionPage;
