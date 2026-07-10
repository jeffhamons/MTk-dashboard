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

// ── Formatters ────────────────────────────────────────────────────────────────
function attFmtK(n)    { if (!n) return "$0"; if (n >= 1000000) return "$" + (n / 1000000).toFixed(n >= 10000000 ? 0 : 1).replace(/\.0$/, "") + "M"; if (n >= 1000) return "$" + (Math.round(n / 100) / 10).toLocaleString() + "K"; return "$" + Math.round(n); }
function attFmtKRaw(n) { if (!n) return "0"; if (n >= 1000000) return (n / 1000000).toFixed(n >= 10000000 ? 0 : 1).replace(/\.0$/, "") + "M"; if (n >= 1000) return (Math.round(n / 100) / 10).toLocaleString() + "K"; return String(Math.round(n)); }
function attFmtFull(n) { return "$" + Math.round(n || 0).toLocaleString(); }
function attFmtDate(iso) {
  if (!iso) return "";
  const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return isNaN(d) ? String(iso) : `${m[d.getMonth()]} ${d.getDate()}`;
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
function attNbCompute(rep) {
  const won = rep.deals.reduce((s, d) => s + d.amt, 0);
  const target = rep.quotaQ || 0;
  const gap = Math.max(0, target - won);
  const expected = target * (ATT_QUARTER.daysElapsed / ATT_QUARTER.daysTotal);
  const paceDelta = won - expected;
  const projection = ATT_QUARTER.daysElapsed > 0 ? won * (ATT_QUARTER.daysTotal / ATT_QUARTER.daysElapsed) : 0;
  const avg = rep.deals.length ? won / rep.deals.length : 0;
  const dealsToGo = avg > 0 ? gap / avg : 0;
  return { won, target, gap, expected, paceDelta, projection, projPct: target ? projection / target * 100 : 0, avg, dealsToGo, pct: rep.pct };
}

// ── Compute: Customer Success (renewal book) ──────────────────────────────────
function attCsCompute(rep) {
  const renewed = rep.book.filter(d => d.status === "renewed");
  const open    = rep.book.filter(d => d.status === "open");
  const churned = rep.book.filter(d => d.status === "churn");
  const renewedSum = renewed.reduce((s, d) => s + d.amt, 0);
  const openSum    = open.reduce((s, d) => s + d.amt, 0);
  const target = rep.qTarget || 0;
  const pct = target ? Math.round(renewedSum / target * 100) : null;
  const gap = Math.max(0, target - renewedSum);
  const coverage = gap > 0 ? openSum / gap : 0;
  return { renewed, open, churned, renewedSum, openSum, pct, gap, coverage, target, ren: rep.ren };
}

// ════════════════════════════════════════════════════════════════════════════
// SAMPLE FALLBACK — used when Supabase isn't configured / a load fails. Shapes
// match the live assembly exactly (CS ren.mtd === null per the comp plan).
// ════════════════════════════════════════════════════════════════════════════
const ATT_NB_SAMPLE = [
  { id: "cammy", pct: { mtd: 112, qtd: 94, ytd: 87 }, won: { mtd: 200000, qtd: 450000, ytd: 1000000 }, target: { mtd: 200000, qtd: 600000, ytd: 1200000 }, quotaQ: 600000, deals: [
    { acct: "Mega Retail Group", amt: 140000, date: "Apr 14" },
    { acct: "Lumen Health",      amt: 112000, date: "May 2"  },
    { acct: "Drake Labs",        amt: 77000,  date: "May 21" },
  ] },
  { id: "farah", pct: { mtd: 71, qtd: 67, ytd: 74 }, won: { mtd: 100000, qtd: 250000, ytd: 500000 }, target: { mtd: 100000, qtd: 250000, ytd: 1000000 }, quotaQ: 250000, deals: [
    { acct: "Acme Corp",         amt: 58000,  date: "Apr 9"  },
    { acct: "Globex",            amt: 74000,  date: "May 6"  },
  ] },
  { id: "don", pct: { mtd: 8, qtd: 12, ytd: 12 }, won: { mtd: 5600, qtd: 200000, ytd: 800000 }, target: { mtd: 70000, qtd: 210000, ytd: 840000 }, quotaQ: 210000, deals: [
    { acct: "Northwind Traders", amt: 26000,  date: "Jun 9"  },
  ] },
];
const ATT_CS_SAMPLE = [
  // qTarget = current-quarter (Q3) ramp amount. ren.qtd is early-quarter (~Jul 6 start).
  // Prior-quarter ramp fills stay as historical; only Q3 carries cur: true.
  { id: "dwayne", ren: { mtd: null, qtd: 6, ytd: 88 }, qTarget: 250000,
    ramp: [ { q: "Q1", na: true }, { q: "Q2", amt: 300000, fill: 92 }, { q: "Q3", amt: 250000, fill: 6, cur: true }, { q: "Q4", amt: 250000, fill: 0 } ],
    book: [
      { acct: "Atlas Group",   amt: 128000, date: "Renewed Apr 18", status: "renewed" },
      { acct: "Brightline",    amt: 96000,  date: "Renewed May 7",  status: "renewed" },
      { acct: "Cardinal Care", amt: 40000,  date: "Renewed May 22", status: "renewed" },
    ],
    upsell: 50000, cross: 50000, multi: 2, effective: "Plan effective 01 Apr 2026" },
  { id: "meri", ren: { mtd: null, qtd: 5, ytd: 81 }, qTarget: 200000,
    ramp: [ { q: "Q1", amt: 100000, fill: 100 }, { q: "Q2", amt: 500000, fill: 86 }, { q: "Q3", amt: 200000, fill: 5, cur: true }, { q: "Q4", amt: 300000, fill: 0 } ],
    book: [
      { acct: "Acuity Group", amt: 182000, date: "Renewed Apr 16", status: "renewed" },
      { acct: "Halden Foods", amt: 124500, date: "Renewed May 4",  status: "renewed" },
      { acct: "Trellis Co",   amt: 136700, date: "Renewed May 20", status: "renewed" },
    ],
    upsell: 0, cross: 7900, multi: 1, effective: "Annual target $1,000,000" },
];

// ── Live assembly: snapshot + deal/book/ramp tables → ATT_NB / ATT_CS ─────────
function attBuildLive(snapshots, deals, book, ramps) {
  const byRep = (rows) => { const m = {}; for (const r of (rows || [])) (m[r.rep_id] ||= []).push(r); return m; };
  const dealsBy = byRep(deals), bookBy = byRep(book), rampBy = byRep(ramps);
  const { fy, quarter } = ATT_QUARTER;
  const nb = [], cs = [];

  for (const row of (snapshots || [])) {
    const pcts = window.deriveAttainmentPcts(row);
    if (!pcts) continue;
    if (pcts.type === "newbiz") {
      nb.push({
        id: row.rep_id,
        pct: { mtd: pcts.mtd, qtd: pcts.qtd, ytd: pcts.ytd },
        won: { mtd: Number(row.nb_mtd_won) || 0, qtd: Number(row.nb_qtd_won) || 0, ytd: Number(row.nb_ytd_won) || 0 },
        target: { mtd: Number(row.nb_mtd_target) || 0, qtd: Number(row.nb_qtd_target) || 0, ytd: Number(row.nb_annual_target) || 0 },
        quotaQ: row.nb_qtd_target || 0,
        deals: (dealsBy[row.rep_id] || []).map(d => ({ acct: d.account, amt: Number(d.amount), date: attFmtDate(d.close_date) })),
      });
    } else {
      const repBook = (bookBy[row.rep_id] || []).map(b => ({
        acct: b.account, amt: Number(b.arr), status: b.status,
        date: b.status === "renewed" ? `Renewed ${attFmtDate(b.renewed_date || b.due_date)}`
            : b.status === "churn"   ? `Churned ${attFmtDate(b.due_date)}`
            :                          `Due ${attFmtDate(b.due_date)}`,
      }));
      // 4-quarter ramp from cs_quarterly_targets; fill = renewed-in-quarter ÷ target.
      const tByQ = {}; for (const t of (rampBy[row.rep_id] || [])) tByQ[t.quarter] = Number(t.target);
      const renewedInQ = (q) => (bookBy[row.rep_id] || [])
        .filter(b => b.status === "renewed" && (new Date((b.due_date || "") + "T00:00:00").getMonth() >= 0) && Math.floor(new Date((b.due_date || "") + "T00:00:00").getMonth() / 3) + 1 === q)
        .reduce((s, b) => s + Number(b.arr), 0);
      const ramp = [1, 2, 3, 4].map(q => {
        const amt = tByQ[q];
        if (amt == null) return { q: `Q${q}`, na: true, cur: q === quarter };
        return { q: `Q${q}`, amt, cur: q === quarter, fill: amt ? Math.min(100, Math.round(renewedInQ(q) / amt * 100)) : 0 };
      });
      cs.push({
        id: row.rep_id,
        ren: { mtd: null, qtd: pcts.qtd, ytd: pcts.ytd },   // no monthly target → "—"
        qTarget: row.ren_qtd_target || tByQ[quarter] || 0,
        ramp,
        book: repBook,
        // Backend lumps upsell+cross-sell into one "expansion" activity figure;
        // it does not split them or count multi-year deals. Show the combined
        // figure as upsell (the larger bucket) and "—" the unsplit fields.
        upsell: row.exp_qtd_won != null ? Number(row.exp_qtd_won) : null,
        cross: null,
        multi: null,
        effective: `FY${fy} renewal plan`,
      });
    }
  }
  return { nb, cs };
}

// Memoized live load (shared by Target Board + My Number — one fetch per session).
let _attV2Promise = null;
function loadAttainmentV2() {
  if (_attV2Promise) return _attV2Promise;
  const sample = { nb: ATT_NB_SAMPLE, cs: ATT_CS_SAMPLE };
  if (!window.SUPABASE_CONFIGURED || !window.loadAttainment || window.IS_PREVIEW) {
    // Design sandbox / unconfigured: show sample so the board is reviewable.
    // Production signed-in users always fall through to live-only data below.
    _attV2Promise = Promise.resolve(sample);
    return _attV2Promise;
  }
  // Configured (real env): use live data as-is — never substitute sample, so a
  // signed-in rep never sees fabricated numbers if the tables are empty/blocked.
  // An empty result renders an empty board; a load failure renders empty too.
  _attV2Promise = Promise.all([
    window.loadAttainment(),
    window.loadClosedWonDeals ? window.loadClosedWonDeals() : [],
    window.loadRenewalBook ? window.loadRenewalBook() : [],
    window.loadCsQuarterlyTargets ? window.loadCsQuarterlyTargets() : [],
  ]).then(([snap, deals, book, ramps]) => attBuildLive(snap, deals, book, ramps))
    .catch(e => { console.warn("loadAttainmentV2 failed:", e && e.message); return { nb: [], cs: [] }; });
  return _attV2Promise;
}

Object.assign(window, {
  ATT_QUARTER, ATT_NB_SAMPLE, ATT_CS_SAMPLE,
  attFmtK, attFmtKRaw, attFmtFull, attFmtDate, attTierColor, attPctColor, attPctText, attBarWidth,
  attRepMeta, attNbCompute, attCsCompute, attBuildLive, loadAttainmentV2,
  attCurrency, attCurrencyForRegion,
});
