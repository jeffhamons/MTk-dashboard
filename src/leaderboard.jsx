// ── LeaderboardView ──────────────────────────────────────────────────────────
// Inline leaderboard rendered inside the main app shell.
// Phase 1: hardcoded sample data. Phase 2: wire to Supabase attainment table.
// ─────────────────────────────────────────────────────────────────────────────

const LB_NEW_BIZ = [
  { id: "cammy",  name: "Cammy Bean",               initials: "CB", mtd: 112, qtd: 94, ytd: 87 },
  { id: "farah",  name: "Farah Issa",                initials: "FI", mtd: 71,  qtd: 67, ytd: 74 },
];

// Sample/fallback shape mirrors deriveAttainmentPcts (CS): mtd has no target
// (null → "—"), qtd/ytd are real %, expansion + MTD-renewal are $ activity.
const LB_CS = [
  { id: "dwayne", name: "Dwayne Haskell", initials: "DH", mtd: null, qtd: 92, ytd: 88,
    ren_mtd: null, ren_qtd: 92, ren_ytd: 88,
    exp_mtd_won: 12000, exp_qtd_won: 28000, exp_ytd_won: 51000,
    ren_mtd_renewed: 22000, ren_qtd_renewed: 240000, ren_ytd_renewed: 240000 },
  { id: "meri",   name: "Meri Tosh",     initials: "MT", mtd: null, qtd: 86, ytd: 81,
    ren_mtd: null, ren_qtd: 86, ren_ytd: 81,
    exp_mtd_won: 8000, exp_qtd_won: 19000, exp_ytd_won: 34000,
    ren_mtd_renewed: 41000, ren_qtd_renewed: 442000, ren_ytd_renewed: 477000 },
];

function lbTierOf(pct) {
  if (pct === null || pct === undefined) return "none";  // no target this period
  if (pct >= 100) return "over";
  if (pct >= 80)  return "on";
  if (pct >= 60)  return "close";
  return "risk";
}

// Average only reps that HAVE a % this period — a CS rep with no monthly target
// (mtd === null) must not count as 0 and drag the team number down.
function lbAvg(reps, period) {
  const vals = reps.map(r => r[period]).filter(v => v !== null && v !== undefined);
  if (!vals.length) return null;
  return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
}

function lbTeamAvg(reps, period) { return lbAvg(reps, period); }
function lbAllAvg(allReps, period) { return lbAvg(allReps, period); }

// "92%" for a real pct, "—" when there's no target for the period.
function lbPctLabel(pct) {
  return (pct === null || pct === undefined) ? "—" : `${pct}%`;
}

// Compact USD for activity figures, e.g. 240000 → "$264k", 8000 → "$8.0k".
function lbMoney(v) {
  if (v === null || v === undefined) return "—";
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
  return `$${Math.round(v)}`;
}

// ── Team Strip ───────────────────────────────────────────────────────────────
function LBTeamStrip({ period, allReps }) {
  const avg = lbAllAvg(allReps, period);
  const tier = lbTierOf(avg);
  const kpis = ["mtd", "qtd", "ytd"];
  const fillClass = tier === "over" || tier === "on" ? "lb-fill--done" : tier === "risk" ? "lb-fill--risk" : "";

  return (
    <div className="lb-team">
      <div className="lb-team__left">
        <div className="lb-team__label">Team · All Reps</div>
        <div className="lb-team__title">
          {avg === null ? "No target this period" : avg >= 80 ? "On track overall" : avg >= 60 ? "Needs attention" : "Behind target"}
        </div>
        <div className="lb-team__bar-wrap">
          <div className="lb-team__track">
            <div className={`lb-team__fill ${fillClass}`} style={{ width: `${Math.min(avg || 0, 100)}%` }} />
          </div>
          <div className="lb-team__bar-labels">
            <span>0%</span>
            <span className="lb-team__bar-center">{lbPctLabel(avg)} to target</span>
            <span>100%</span>
          </div>
        </div>
      </div>
      <div className="lb-team__kpis">
        {kpis.map(k => (
          <div key={k} className={`lb-kpi ${k === period ? "lb-kpi--active" : ""}`}>
            <div className="lb-kpi__val">{lbPctLabel(lbAllAvg(allReps, k))}</div>
            <div className="lb-kpi__label">{k.toUpperCase()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── New Biz Row ──────────────────────────────────────────────────────────────
function LBNewBizRow({ rep, rank, period, animate }) {
  const pct = rep[period];
  const tier = lbTierOf(pct);
  return (
    <div className="lb-row">
      <div className={`lb-row__rank lb-row__rank--${rank <= 1 ? "1" : rank <= 2 ? "2" : "3"}`}>{rank}</div>
      <div className="lb-row__avatar lb-row__avatar--nb">{rep.initials}</div>
      <div className="lb-row__name">{rep.name}</div>
      <div className="lb-row__bar-wrap">
        <div className="lb-row__track">
          <div className={`lb-row__fill lb-row__fill--${tier}`} style={{ width: animate ? `${Math.min(pct, 100)}%` : "0%" }} />
        </div>
        {pct >= 100 && <div className="lb-row__over-label">Over quota</div>}
      </div>
      <div className={`lb-row__pct lb-row__pct--${tier}`}>{pct}%</div>
    </div>
  );
}

// ── CS Row ───────────────────────────────────────────────────────────────────
// Renewal is the scored line: a bar + % for QTD/YTD, or "$X renewed" activity
// for MTD (no monthly target). Expansion (upsell + cross-sell) is always $
// activity — 1% commission, never scored to a target — so it shows no bar.
function LBCSRow({ rep, rank, period, animate }) {
  const pct = rep[period];
  const tier = lbTierOf(pct);
  const noTarget = pct === null || pct === undefined;
  const renPct = rep[`ren_${period}`];
  const renWon = rep[`ren_${period}_renewed`];
  const expWon = rep[`exp_${period}_won`];
  const renHasPct = renPct !== null && renPct !== undefined;
  return (
    <div className="lb-row">
      <div className={`lb-row__rank lb-row__rank--${rank <= 1 ? "1" : rank <= 2 ? "2" : "3"}`}>{rank}</div>
      <div className="lb-row__avatar lb-row__avatar--cs">{rep.initials}</div>
      <div className="lb-row__name">{rep.name}</div>
      <div className="lb-row__bar-wrap">
        <div className="lb-cs-bars">
          <div className="lb-cs-row">
            <span className="lb-cs-tag">Ren</span>
            {renHasPct ? (
              <>
                <div className="lb-row__track"><div className="lb-row__fill lb-cs-fill--ren" style={{ width: animate ? `${Math.min(renPct, 100)}%` : "0%" }} /></div>
                <span className="lb-cs-val lb-cs-val--ren">{renPct}%</span>
              </>
            ) : (
              <span className="lb-cs-val lb-cs-val--ren" title="Renewals are scored quarterly — no monthly target">
                {lbMoney(renWon)} <span style={{ opacity: 0.6, fontWeight: 500 }}>renewed</span>
              </span>
            )}
          </div>
          <div className="lb-cs-row">
            <span className="lb-cs-tag">Exp</span>
            <span className="lb-cs-val lb-cs-val--exp" title="Upsell + cross-sell — 1% commission on activity, not scored to target">
              {lbMoney(expWon)} <span style={{ opacity: 0.6, fontWeight: 500 }}>activity</span>
            </span>
          </div>
        </div>
      </div>
      <div className={`lb-row__pct lb-row__pct--${tier}`} style={noTarget ? { color: "#8A8A92" } : undefined}>{lbPctLabel(pct)}</div>
    </div>
  );
}

// ── Board ────────────────────────────────────────────────────────────────────
function LBBoard({ title, dotClass, reps, period, RowComponent, animate }) {
  // Sort by % desc; reps with no target this period (null) sort last.
  const sorted = [...reps].sort((a, b) => {
    const av = a[period], bv = b[period];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return bv - av;
  });
  const avg = lbTeamAvg(reps, period);
  const tier = lbTierOf(avg);
  const avgColor = avg === null ? "#8A8A92" : tier === "over" || tier === "on" ? "var(--brand-deep)" : tier === "close" ? "var(--flag)" : "#E03C3C";
  return (
    <div className="lb-board">
      <div className="lb-board__header">
        <div className="lb-board__title">
          <span className={`lb-board__dot ${dotClass}`}></span>
          {title}
        </div>
        <div className="lb-board__avg">
          Team avg <span style={{ color: avgColor, fontWeight: 700 }}>{lbPctLabel(avg)}</span>
        </div>
      </div>
      <div className="lb-board__body">
        {sorted.map((rep, i) => (
          <RowComponent key={rep.id} rep={rep} rank={i + 1} period={period} animate={animate} />
        ))}
      </div>
    </div>
  );
}

// ── Main View ────────────────────────────────────────────────────────────────
function LeaderboardView() {
  const [period, setPeriod] = React.useState("mtd");
  const [animate, setAnimate] = React.useState(false);
  const [animKey, setAnimKey] = React.useState(0);
  const [lbData, setLbData] = React.useState({ newbiz: LB_NEW_BIZ, cs: LB_CS });

  React.useEffect(() => {
    const t = setTimeout(() => setAnimate(true), 80);
    return () => clearTimeout(t);
  }, []);

  React.useEffect(() => {
    if (!window.SUPABASE_CONFIGURED || !window.loadAttainment) return;
    let cancelled = false;
    window.loadAttainment().then(rows => {
      if (cancelled) return;
      // Reps who departed mid-cycle drop off the current standings too.
      const curWeekIndex = window.currentWeekIndex() + 1; // 1-based WEEKS index
      const newbiz = [], cs = [];
      for (const row of rows) {
        const pcts = window.deriveAttainmentPcts(row);
        if (!pcts) continue;
        const rep = (window.REPS || []).find(r => r.id === row.rep_id);
        if (rep && !window.repVisibleInWeek(rep, curWeekIndex)) continue;
        const entry = {
          id: row.rep_id,
          name: rep ? rep.name : row.rep_id,
          initials: rep ? rep.initials : row.rep_id.slice(0, 2).toUpperCase(),
          ...pcts,
        };
        if (pcts.type === "newbiz") newbiz.push(entry);
        else cs.push(entry);
      }
      if (newbiz.length || cs.length) setLbData({ newbiz, cs });
    });
    return () => { cancelled = true; };
  }, []);

  function switchPeriod(p) {
    setAnimate(false);
    setPeriod(p);
    setAnimKey(k => k + 1);
    setTimeout(() => setAnimate(true), 60);
  }

  const periodLabels = { mtd: "Month to date", qtd: "Quarter to date", ytd: "Year to date" };
  const allReps = [...lbData.newbiz, ...lbData.cs];

  return (
    <div className="lb-view" data-screen-label="03 Leaderboard">
      <div className="lb-header">
        <div className="eyebrow"><span className="eyebrow__dot" />North America BD</div>
        <h2 className="lb-title"><em>Target</em> Leaderboard</h2>
        <p className="lb-sub">% attainment to individual target — updated nightly from Salesforce</p>
      </div>

      <div className="lb-period-row">
        <div className="lb-toggle">
          {["mtd", "qtd", "ytd"].map(p => (
            <button key={p} className={`lb-toggle__btn ${p === period ? "lb-toggle__btn--active" : ""}`} onClick={() => switchPeriod(p)}>
              {p.toUpperCase()}
            </button>
          ))}
        </div>
        <span className="lb-period-label">{periodLabels[period]}</span>
      </div>

      <LBTeamStrip period={period} allReps={allReps} key={`team-${animKey}`} />

      <div className="lb-boards" key={animKey}>
        <LBBoard title="New Business" dotClass="lb-board__dot--nb" reps={lbData.newbiz} period={period} RowComponent={LBNewBizRow} animate={animate} />
        <LBBoard title="Customer Success" dotClass="lb-board__dot--cs" reps={lbData.cs} period={period} RowComponent={LBCSRow} animate={animate} />
      </div>

      <div className="lb-footnote">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{marginTop:1,flexShrink:0}}>
          <circle cx="7" cy="7" r="6" stroke="#8A8A92" strokeWidth="1.4"/>
          <path d="M7 6.5v4M7 4.5v.5" stroke="#8A8A92" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
        CS attainment = renewals vs the quarter's target (uneven; QTD &amp; cumulative YTD). Monthly has no target, so CS MTD shows "—". Upsell &amp; cross-sell are 1% commission on activity, not scored to target. Data refreshes nightly from Salesforce.
      </div>
    </div>
  );
}

window.LeaderboardView = LeaderboardView;
