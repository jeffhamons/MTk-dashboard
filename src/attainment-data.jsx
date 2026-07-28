// ── Attainment V2 — data + helpers (shared by Target Board + My Number) ───────
// Ported from the V2 design harness; PHASE 2 wiring (Crash): the sample shapes
// are now assembled from live Supabase reads via window.loadAttainmentV2().
//
// Live sources (populated by agents/sf_attainment_sync.py):
//   • attainment_snapshot   → headline %s (via deriveAttainmentPcts) + targets
//   • closed_won_deals      → New-Business deal stack (ATT_NB[].deals)
//   • renewal_book          → CS renewal book (ATT_CS[].book; renewed-only today)
//   • cs_quarterly_targets  → the 4-quarter CS ramp (ATT_CS[].ramp)
//
// CS is a QUARTERLY renewal metric (comp letters): QTD/YTD are real %, MTD has
// NO target → ren.mtd === null, rendered as "—" by the components. Upsell &
// cross-sell are 1% commission on ACTIVITY, not scored to target.
// ─────────────────────────────────────────────────────────────────────────────

// Where we are in the current (calendar) quarter — drives NB pace/projection.
function attCurrentQuarter(today) {
  const d = today || new Date();
  const q = Math.floor(d.getMonth() / 3) + 1;          // 1..4
  const qStartMonth = (q - 1) * 3;                      // 0,3,6,9
  const qStart = new Date(d.getFullYear(), qStartMonth, 1);
  const qEnd = new Date(d.getFullYear(), qStartMonth + 3, 0); // last day of quarter
  const dayMs = 86400000;
  const daysTotal = Math.round((qEnd - qStart) / dayMs) + 1;
  const daysElapsed = Math.min(daysTotal, Math.round((d - qStart) / dayMs) + 1);
  return { fy: d.getFullYear(), quarter: q, label: `Q${q} ${d.getFullYear()}`, daysElapsed, daysTotal };
}
const ATT_QUARTER = attCurrentQuarter();

// ── Nullable numeric coercion (issues #16 / #27) ──────────────────────────────
// The `Number(x) || 0` idiom this file used to lean on collapsed three very
// different states into one confident zero:
//   • a genuine synced 0        — the rep really closed nothing
//   • a null / absent column    — the nightly sync never populated this field
//   • a non-numeric value       — a malformed row
// attNum keeps them apart: null / undefined / "" / NaN → null, everything else
// → a real Number (including 0). The display helpers below render null as "—"
// and a real 0 as "$0", so "not yet synced" never masquerades as "$0 sold".
function attNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ── Source currency of every attainment amount (issue #17) ────────────────────
// The nightly Salesforce sync (agents/sf_attainment_sync.py) writes
// attainment_snapshot, closed_won_deals, renewal_book and cs_quarterly_targets
// in GBP — the finance reporting currency — regardless of which region the rep
// belongs to. Neither attainment_snapshot nor cs_quarterly_targets carries a
// currency column (see db/migration-attainment-v2.sql), so the currency cannot
// be read per row; it is pinned here.
//
// Do NOT infer it from the rep's region. That was the bug: a US rep's £250,000
// renewal target was labelled "$250,000" and then FX-converted as if it were
// already USD, double-counting the rate. Amounts are tagged with this currency
// at assembly time and converted from it into the viewer's display currency.
const ATT_SOURCE_CURRENCY = "GBP";

// Currency an assembled rep row's amounts are denominated in. Rows built by
// attBuildLive carry it explicitly; sample/legacy rows fall back to the source
// currency rather than to the rep's region.
function attRepCurrency(rep) {
  return (rep && rep.currency) || ATT_SOURCE_CURRENCY;
}

// Convert an amount OUT of the attainment source currency into `to`.
// Returns null for null (never a fabricated 0).
function attConvert(n, from, to) {
  if (n == null) return null;
  if (!to || typeof window.convertAmount !== "function") return n;
  return window.convertAmount(n, from || ATT_SOURCE_CURRENCY, to);
}

// ── Formatters ────────────────────────────────────────────────────────────────
// null → "—" (no value synced). A real 0 still renders as a zero amount.
function attFmtK(n)    { if (n == null) return "—"; if (!n) return "$0"; if (n >= 1000000) return "$" + (n / 1000000).toFixed(n >= 10000000 ? 0 : 1).replace(/\.0$/, "") + "M"; if (n >= 1000) return "$" + (Math.round(n / 100) / 10).toLocaleString() + "K"; return "$" + Math.round(n); }
function attFmtKRaw(n) { if (n == null) return "—"; if (!n) return "0"; if (n >= 1000000) return (n / 1000000).toFixed(n >= 10000000 ? 0 : 1).replace(/\.0$/, "") + "M"; if (n >= 1000) return (Math.round(n / 100) / 10).toLocaleString() + "K"; return String(Math.round(n)); }
function attFmtFull(n) { return n == null ? "—" : "$" + Math.round(n).toLocaleString(); }
// Currency-correct money formatter (issue #17). Uses data-model's
// formatCurrencyAmount so a GBP figure renders "£250,000", not "$250,000".
function attFmtMoney(n, currency) {
  if (n == null) return "—";
  const cur = currency || ATT_SOURCE_CURRENCY;
  if (typeof window.formatCurrencyAmount === "function") return window.formatCurrencyAmount(Math.round(n), cur);
  return "$" + Math.round(n).toLocaleString();
}
function attFmtMoneyK(n, currency) {
  if (n == null) return "—";
  return attCurrencyBadge(currency) + attFmtKRaw(n);
}
function attFmtDate(iso) {
  if (!iso) return "";
  const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return isNaN(d) ? String(iso) : `${m[d.getMonth()]} ${d.getDate()}`;
}
function attFmtDateTime(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (!value || isNaN(d)) return "";
  const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${m[d.getMonth()]} ${d.getDate()}, ${hh}:${mm}`;
}
function attCurrencyBadge(code) {
  switch (code) {
    case "GBP": return "£";
    case "USD": return "$";
    case "AUD": return "A$";
    case "ZAR": return "R";
    default:    return code || "$";
  }
}

// ── Sync freshness (issue #21) ────────────────────────────────────────────────
// attainment_snapshot.synced_at was ordered on but never surfaced, so a board
// showing numbers from three days ago read as current and the copy cheerfully
// said "synced nightly from Salesforce". attSyncState turns a raw timestamp
// into { known, hours, stale, label } so the UI can say when — and shout when
// the nightly sync has plainly not run.
const ATT_STALE_HOURS = 24;
function attSyncState(iso, nowMs) {
  const now = nowMs != null ? nowMs : Date.now();
  if (!iso) return { iso: null, known: false, hours: null, stale: true, label: "", ago: "never synced" };
  const d = new Date(iso);
  if (isNaN(d)) return { iso, known: false, hours: null, stale: true, label: String(iso), ago: "unknown" };
  const hours = (now - d.getTime()) / 3600000;
  let ago;
  if (hours < 0) ago = "just now";
  else if (hours < 1) ago = "less than an hour ago";
  else if (hours < 48) ago = `${Math.round(hours)}h ago`;
  else ago = `${Math.floor(hours / 24)} days ago`;
  return { iso, known: true, hours, stale: hours > ATT_STALE_HOURS, label: attFmtDateTime(d), ago };
}

// ── Tier colors (null-safe: no target → neutral) ──────────────────────────────
function attTierColor(p) { if (p == null) return "var(--ink-20)"; if (p >= 100) return "var(--done)"; if (p >= 80) return "var(--brand)"; if (p >= 60) return "var(--flag)"; return "#E03C3C"; }
function attPctColor(p)  { if (p == null) return "var(--ink-50)"; if (p >= 100) return "var(--done-deep)"; if (p >= 80) return "var(--ink)"; if (p >= 60) return "var(--flag-deep)"; return "#E03C3C"; }
// "92%" for a real pct, "—" when there's no target for the period.
function attPctText(p)   { return p == null ? "—" : `${p}%`; }
function attBarWidth(p)  { return p == null ? 0 : Math.min(100, p); }

// ── Currency badge for a rep (by region) ──────────────────────────────────────
function attCurrency(rep) {
  // Look up the full rep from REPS to get the region, then find the region badge.
  const full = rep && rep.id ? (window.REPS || []).find(x => x.id === rep.id) : null;
  const region = full && full.region ? (window.REGIONS || []).find(r => r.id === full.region) : null;
  return region ? region.badge : "$";
}
function attCurrencyForRegion(regionId) {
  return window.regionCurrency ? window.regionCurrency(regionId) : "$";
}

// ── Rep display meta (from REPS in data-model.js) ─────────────────────────────
function attRepMeta(id) {
  const r = (window.REPS || []).find(x => x.id === id) || {};
  return { name: r.name || id, role: r.role || "", initials: r.initials || id.slice(0, 2).toUpperCase(), hue: r.hue != null ? r.hue : 250 };
}

// ── Compute: New Business (deal stack to quota + pace) ────────────────────────
// hasTarget/targetRaw are the issue-#15 contract: a rep with NO quarterly quota
// (null) or a zero quota must never be told the goal is "cleared" or that they
// are "$0 from goal". `target` stays a plain number so the pace/projection math
// below can't produce NaN — callers branch on hasTarget for copy and bars.
function attNbCompute(rep) {
  const won = rep.deals.reduce((s, d) => s + d.amt, 0);
  const targetRaw = attNum(rep.quotaQ);
  const hasTarget = targetRaw != null && targetRaw > 0;
  const target = targetRaw || 0;
  const gap = Math.max(0, target - won);
  const expected = target * (ATT_QUARTER.daysElapsed / ATT_QUARTER.daysTotal);
  const paceDelta = won - expected;
  const projection = ATT_QUARTER.daysElapsed > 0 ? won * (ATT_QUARTER.daysTotal / ATT_QUARTER.daysElapsed) : 0;
  const avg = rep.deals.length ? won / rep.deals.length : 0;
  const dealsToGo = avg > 0 ? gap / avg : 0;
  return { won, target, targetRaw, hasTarget, gap, expected, paceDelta, projection, projPct: hasTarget ? projection / target * 100 : 0, avg, dealsToGo, pct: rep.pct, currency: attRepCurrency(rep), missing: !!rep.missing };
}

// ── Compute: Customer Success (renewal book) ──────────────────────────────────
function attCsCompute(rep) {
  const renewed = rep.book.filter(d => d.status === "renewed");
  const open    = rep.book.filter(d => d.status === "open");
  const churned = rep.book.filter(d => d.status === "churn");
  // Historical reps (quarter finals) carry the archived renewed $ directly —
  // their book is empty because deal-level detail is current-quarter only.
  const renewedSum = rep.renewedQ != null ? rep.renewedQ
                                          : renewed.reduce((s, d) => s + d.amt, 0);
  const openSum    = open.reduce((s, d) => s + d.amt, 0);
  // Issue #15: qTarget null (no per-rep quarterly target) and qTarget 0 are
  // both "no target set" — neither one means the rep has nothing left to hit.
  const targetRaw = attNum(rep.qTarget);
  const hasTarget = targetRaw != null && targetRaw > 0;
  const target = targetRaw || 0;
  const pct = hasTarget ? Math.round(renewedSum / target * 100) : null;
  const gap = Math.max(0, target - renewedSum);
  const coverage = gap > 0 ? openSum / gap : 0;
  return { renewed, open, churned, renewedSum, openSum, pct, gap, coverage, target, targetRaw, hasTarget, targetSource: rep.qTargetSource || null, currency: attRepCurrency(rep), missing: !!rep.missing, ren: rep.ren };
}

// ════════════════════════════════════════════════════════════════════════════
// SAMPLE FALLBACK — used when Supabase isn't configured / a load fails. Shapes
// match the live assembly exactly (CS ren.mtd === null per the comp plan).
// ════════════════════════════════════════════════════════════════════════════
const ATT_NB_SAMPLE = [
  { id: "cammy", pct: { mtd: 100, qtd: 80, ytd: 70 }, won: { mtd: 200000, qtd: 500000, ytd: 1000000 }, target: { mtd: 200000, qtd: 600000, ytd: 1200000 }, quotaQ: 600000, deals: [
    { acct: "Mega Retail Group", amt: 100000, date: "Apr 14" },
    { acct: "Lumen Health",      amt: 100000, date: "May 2"  },
    { acct: "Drake Labs",        amt: 100000,  date: "May 21" },
  ] },
  { id: "farah", pct: { mtd: 60, qtd: 50, ytd: 60 }, won: { mtd: 100000, qtd: 250000, ytd: 500000 }, target: { mtd: 100000, qtd: 250000, ytd: 1000000 }, quotaQ: 250000, deals: [
    { acct: "Acme Corp",         amt: 100000,  date: "Apr 9"  },
    { acct: "Globex",            amt: 100000,  date: "May 6"  },
  ] },
  { id: "don", pct: { mtd: 50, qtd: 60, ytd: 50 }, won: { mtd: 50000, qtd: 200000, ytd: 800000 }, target: { mtd: 100000, qtd: 250000, ytd: 1000000 }, quotaQ: 250000, deals: [
    { acct: "Northwind Traders", amt: 100000,  date: "Jun 9"  },
  ] },
];
const ATT_CS_SAMPLE = [
  // qTarget = current-quarter (Q3) ramp amount. ren.qtd is early-quarter (~Jul 6 start).
  // Prior-quarter ramp fills stay as historical; only Q3 carries cur: true.
  { id: "dwayne", ren: { mtd: null, qtd: 50, ytd: 70 }, qTarget: 250000,
    ramp: [ { q: "Q1", na: true }, { q: "Q2", amt: 250000, fill: 90 }, { q: "Q3", amt: 250000, fill: 50, cur: true }, { q: "Q4", amt: 250000, fill: 0 } ],
    book: [
      { acct: "Atlas Group",   amt: 100000, date: "Renewed Apr 18", status: "renewed" },
      { acct: "Brightline",    amt: 100000,  date: "Renewed May 7",  status: "renewed" },
      { acct: "Cardinal Care", amt: 100000,  date: "Renewed May 22", status: "renewed" },
    ],
    upsell: 50000, cross: 50000, multi: 2, effective: "Plan effective 01 Apr 2026" },
  { id: "meri", ren: { mtd: null, qtd: 60, ytd: 80 }, qTarget: 200000,
    ramp: [ { q: "Q1", amt: 100000, fill: 100 }, { q: "Q2", amt: 500000, fill: 80 }, { q: "Q3", amt: 200000, fill: 60, cur: true }, { q: "Q4", amt: 300000, fill: 0 } ],
    book: [
      { acct: "Acuity Group", amt: 100000, date: "Renewed Apr 16", status: "renewed" },
      { acct: "Halden Foods", amt: 100000, date: "Renewed May 4",  status: "renewed" },
      { acct: "Trellis Co",   amt: 100000, date: "Renewed May 20", status: "renewed" },
    ],
    upsell: 0, cross: 50000, multi: 1, effective: "Annual target $1,000,000" },
];

// ── Roster reps with no attainment_snapshot row (issue #19) ───────────────────
// attBuildLive used to iterate ONLY over snapshot rows, so a rep the nightly
// sync never wrote simply did not exist on the Target Board or in My Number —
// visually identical to "this rep isn't on the team". These stubs make the
// absence explicit. They are returned in SEPARATE arrays (missingNb/missingCs)
// rather than merged into nb/cs so callers keep control: a rollup must not sum
// them, and a non-manager viewer must only ever be shown their own stub.
function attMissingRoster(haveIds) {
  const have = new Set(haveIds || []);
  const missingNb = [], missingCs = [];
  for (const rep of (window.REPS || [])) {
    if (!rep || !rep.id || have.has(rep.id)) continue;
    if (rep.emit === false) continue;                    // intentionally hidden
    if (rep.team === "newbiz") {
      missingNb.push({
        id: rep.id, missing: true,
        pct: { mtd: null, qtd: null, ytd: null },
        won: { mtd: null, qtd: null, ytd: null },
        target: { mtd: null, qtd: null, ytd: null },
        quotaQ: null, deals: [], currency: ATT_SOURCE_CURRENCY, syncedAt: null,
      });
    } else if (rep.team === "cs") {
      missingCs.push({
        id: rep.id, missing: true,
        ren: { mtd: null, qtd: null, ytd: null },
        qTarget: null, qTargetSource: null,
        ramp: [], book: [], upsell: null, cross: null, multi: null,
        effective: `FY${ATT_QUARTER.fy} renewal plan`,
        currency: ATT_SOURCE_CURRENCY, syncedAt: null,
      });
    }
  }
  return { missingNb, missingCs };
}

// ── Live assembly: snapshot + deal/book/ramp tables → ATT_NB / ATT_CS ─────────
function attBuildLive(snapshots, deals, book, ramps) {
  const byRep = (rows) => { const m = {}; for (const r of (rows || [])) (m[r.rep_id] ||= []).push(r); return m; };
  const dealsBy = byRep(deals), bookBy = byRep(book), rampBy = byRep(ramps);
  const { fy, quarter } = ATT_QUARTER;
  const nb = [], cs = [];
  const seen = [];
  let newestSync = null, oldestSync = null;

  for (const row of (snapshots || [])) {
    const pcts = window.deriveAttainmentPcts(row);
    if (!pcts) continue;
    seen.push(row.rep_id);
    // Issue #21: attainment_snapshot.synced_at was ordered on but never
    // surfaced. Carry it per row AND track the board-wide window so the page
    // can say "last synced X" and shout when the nightly sync did not run.
    const syncedAt = row.synced_at || null;
    if (syncedAt) {
      if (!newestSync || syncedAt > newestSync) newestSync = syncedAt;
      if (!oldestSync || syncedAt < oldestSync) oldestSync = syncedAt;
    }
    if (pcts.type === "newbiz") {
      nb.push({
        id: row.rep_id,
        pct: { mtd: pcts.mtd, qtd: pcts.qtd, ytd: pcts.ytd },
        // attNum, not `Number(x) || 0` (issues #16 / #27): a column the sync
        // never populated stays null and renders "—"; a real synced 0 stays 0.
        won: { mtd: attNum(row.nb_mtd_won), qtd: attNum(row.nb_qtd_won), ytd: attNum(row.nb_ytd_won) },
        target: { mtd: attNum(row.nb_mtd_target), qtd: attNum(row.nb_qtd_target), ytd: attNum(row.nb_annual_target) },
        quotaQ: attNum(row.nb_qtd_target),
        deals: (dealsBy[row.rep_id] || []).map(d => ({ acct: d.account, amt: attNum(d.amount) || 0, date: attFmtDate(d.close_date) })),
        currency: ATT_SOURCE_CURRENCY,
        syncedAt,
      });
    } else {
      const repBook = (bookBy[row.rep_id] || []).map(b => ({
        acct: b.account, amt: attNum(b.arr) || 0, status: b.status,
        date: b.status === "renewed" ? `Renewed ${attFmtDate(b.renewed_date || b.due_date)}`
            : b.status === "churn"   ? `Churned ${attFmtDate(b.due_date)}`
            :                          `Due ${attFmtDate(b.due_date)}`,
      }));
      // 4-quarter ramp from cs_quarterly_targets; fill = renewed-in-quarter ÷ target.
      const tByQ = {}; for (const t of (rampBy[row.rep_id] || [])) tByQ[t.quarter] = attNum(t.target);
      const renewedInQ = (q) => (bookBy[row.rep_id] || [])
        .filter(b => b.status === "renewed" && (new Date((b.due_date || "") + "T00:00:00").getMonth() >= 0) && Math.floor(new Date((b.due_date || "") + "T00:00:00").getMonth() / 3) + 1 === q)
        .reduce((s, b) => s + (attNum(b.arr) || 0), 0);
      const ramp = [1, 2, 3, 4].map(q => {
        const amt = tByQ[q];
        if (amt == null) return { q: `Q${q}`, na: true, cur: q === quarter };
        return { q: `Q${q}`, amt, cur: q === quarter, fill: amt ? Math.min(100, Math.round(renewedInQ(q) / amt * 100)) : 0 };
      });
      // Issue #13: the old expression was
      //   row.ren_qtd_target || tByQ[quarter] || 0
      // Two defects. (a) `||` is falsy-tested, so a REAL synced 0 in
      // ren_qtd_target silently jumped to the ramp figure — a rep whose target
      // was deliberately zeroed got shown someone's planned ramp instead.
      // (b) the trailing `|| 0` manufactured a target of zero when NOTHING was
      // set, which downstream reads as "target cleared / $0 to hit". Now: use
      // the per-rep snapshot target if present, else the per-rep ramp row for
      // this quarter, else null — "no per-rep quarterly target", rendered as an
      // explicit empty state, never as a zero target and never from a
      // region-level figure.
      const qTarget = attNum(row.ren_qtd_target) != null ? attNum(row.ren_qtd_target)
                    : (tByQ[quarter] != null ? tByQ[quarter] : null);
      const qTargetSource = attNum(row.ren_qtd_target) != null ? "snapshot"
                          : (tByQ[quarter] != null ? "ramp" : null);
      cs.push({
        id: row.rep_id,
        ren: { mtd: null, qtd: pcts.qtd, ytd: pcts.ytd },   // no monthly target → "—"
        qTarget,
        qTargetSource,
        ramp,
        book: repBook,
        // Backend lumps upsell+cross-sell into one "expansion" activity figure;
        // it does not split them or count multi-year deals. Show the combined
        // figure as upsell (the larger bucket) and "—" the unsplit fields.
        upsell: attNum(row.exp_qtd_won),
        cross: null,
        multi: null,
        effective: `FY${fy} renewal plan`,
        currency: ATT_SOURCE_CURRENCY,
        syncedAt,
      });
    }
  }
  const { missingNb, missingCs } = attMissingRoster(seen);
  return {
    nb, cs, missingNb, missingCs,
    sync: { newest: newestSync, oldest: oldestSync },
    loadError: null,
  };
}

// ── Historical quarter finals (attainment_quarter_final) → board shape ───────
// Rows are written at quarter close by agents/sf_attainment_sync.py
// (archive_quarter_finals) — real final numbers, recomputed from deal close
// dates. NEVER fabricates: only archived rows render; MTD/YTD are null (a
// final has no "to-date"), and deals/book stay empty because the detail
// tables only hold the current quarter — the UI disables row expand instead.
function attBuildQuarterFinal(rows) {
  const pctOf = (won, target) => (Number(target) ? Math.round((Number(won) || 0) / Number(target) * 100) : null);
  const nb = [], cs = [];
  for (const row of (rows || [])) {
    if (row.track === "newbiz") {
      const won = Number(row.nb_won) || 0, target = Number(row.nb_target) || 0;
      nb.push({
        id: row.rep_id, hist: true,
        pct: { mtd: null, qtd: pctOf(won, target), ytd: null },
        won: { mtd: null, qtd: won, ytd: null },
        target: { mtd: null, qtd: target, ytd: null },
        quotaQ: target, deals: [],
      });
    } else if (row.track === "cs") {
      const renewed = Number(row.ren_renewed) || 0;
      const target = Number(row.ren_target) || 0;
      cs.push({
        id: row.rep_id, hist: true,
        ren: { mtd: null, qtd: pctOf(renewed, target), ytd: null },
        qTarget: target, renewedQ: renewed,
        ramp: [], book: [],
        upsell: row.exp_won != null ? Number(row.exp_won) : null,
        cross: null, multi: null,
        effective: `FY${row.fy} renewal plan`,
      });
    }
  }
  return { nb, cs };
}

// Distinct archived quarters, oldest first, EXCLUDING the current quarter —
// these are the only lookback options the switcher may offer.
function attQuarterFinalOptions(rows, currentFy, currentQuarter) {
  const seen = new Set(), opts = [];
  for (const row of (rows || [])) {
    const fy = Number(row.fy), q = Number(row.quarter);
    if (!fy || !q) continue;
    if (fy === Number(currentFy) && q === Number(currentQuarter)) continue;
    const key = `${fy}-${q}`;
    if (seen.has(key)) continue;
    seen.add(key);
    opts.push({ key, fy, quarter: q, label: `Q${q} ${fy}` });
  }
  return opts.sort((a, b) => (a.fy - b.fy) || (a.quarter - b.quarter));
}

// Sample quarter finals (Q2 2026) — sandbox/preview only, matching the DB row
// shape so the switcher is reviewable. Production never renders these.
const ATT_QF_SAMPLE = [
  { rep_id: "cammy",  fy: 2026, quarter: 2, track: "newbiz", nb_won: 500000, nb_target: 600000, ren_renewed: null,   ren_target: null,   exp_won: null },
  { rep_id: "farah",  fy: 2026, quarter: 2, track: "newbiz", nb_won: 250000, nb_target: 250000, ren_renewed: null,   ren_target: null,   exp_won: null },
  { rep_id: "don",    fy: 2026, quarter: 2, track: "newbiz", nb_won: 200000, nb_target: 250000, ren_renewed: null,   ren_target: null,   exp_won: null },
  { rep_id: "dwayne", fy: 2026, quarter: 2, track: "cs",     nb_won: null,   nb_target: null,   ren_renewed: 250000, ren_target: 250000, exp_won: 50000 },
  { rep_id: "meri",   fy: 2026, quarter: 2, track: "cs",     nb_won: null,   nb_target: null,   ren_renewed: 500000, ren_target: 500000, exp_won: 50000 },
];

// Memoized quarter-finals load (one fetch per session). Sandbox/unconfigured
// gets the sample; a configured client gets live rows only — an error or an
// empty table yields [] and the switcher simply doesn't render.
let _attQFPromise = null;
function loadQuarterFinals() {
  if (_attQFPromise) return _attQFPromise;
  if (!window.SUPABASE_CONFIGURED || !window.loadAttainmentQuarterFinals || window.IS_PREVIEW) {
    _attQFPromise = Promise.resolve(ATT_QF_SAMPLE);
    return _attQFPromise;
  }
  _attQFPromise = window.loadAttainmentQuarterFinals()
    .catch(e => { console.warn("loadQuarterFinals failed:", e && e.message); return []; });
  return _attQFPromise;
}

// Memoized live load (shared by Target Board + My Number — one fetch per session).
let _attV2Promise = null;
function loadAttainmentV2() {
  if (_attV2Promise) return _attV2Promise;
  if (!window.SUPABASE_CONFIGURED || !window.loadAttainment || window.IS_PREVIEW) {
    // Design sandbox / unconfigured: show sample so the board is reviewable.
    // Production signed-in users always fall through to live-only data below.
    _attV2Promise = Promise.resolve({
      nb: ATT_NB_SAMPLE, cs: ATT_CS_SAMPLE,
      missingNb: [], missingCs: [],
      sync: { newest: null, oldest: null }, loadError: null, sample: true,
    });
    return _attV2Promise;
  }
  // Configured (real env): use live data as-is — never substitute sample, so a
  // signed-in rep never sees fabricated numbers if the tables are empty/blocked.
  _attV2Promise = Promise.all([
    window.loadAttainment(),
    window.loadClosedWonDeals ? window.loadClosedWonDeals() : [],
    window.loadRenewalBook ? window.loadRenewalBook() : [],
    window.loadCsQuarterlyTargets ? window.loadCsQuarterlyTargets() : [],
  ]).then(([snap, deals, book, ramps]) => attBuildLive(snap, deals, book, ramps))
    // Issue #24: this used to swallow the failure and return an empty board,
    // which the UI rendered as "No attainment data synced yet" — i.e. a read
    // error (RLS denial, network drop, bad column) was indistinguishable from a
    // quarter in which nobody had closed anything. loadError carries the reason
    // so the board can render a distinct, visible failure panel instead.
    .catch(e => {
      const msg = (e && e.message) || String(e);
      console.error("loadAttainmentV2 failed:", msg);
      return {
        nb: [], cs: [], missingNb: [], missingCs: [],
        sync: { newest: null, oldest: null }, loadError: msg,
      };
    });
  return _attV2Promise;
}

Object.assign(window, {
  ATT_QUARTER, ATT_NB_SAMPLE, ATT_CS_SAMPLE,
  attFmtK, attFmtKRaw, attFmtFull, attFmtDate, attTierColor, attPctColor, attPctText, attBarWidth,
  attRepMeta, attNbCompute, attCsCompute, attBuildLive, loadAttainmentV2,
  attBuildQuarterFinal, attQuarterFinalOptions, loadQuarterFinals, ATT_QF_SAMPLE,
  attCurrency, attCurrencyForRegion,
  // Nullable/currency/freshness helpers (issues #13/#15/#16/#17/#19/#21/#27).
  attNum, ATT_SOURCE_CURRENCY, attRepCurrency, attConvert,
  attFmtMoney, attFmtMoneyK, attFmtDateTime, attCurrencyBadge,
  ATT_STALE_HOURS, attSyncState, attMissingRoster,
});
