// ── LeaderboardView ──────────────────────────────────────────────────────────
// Inline leaderboard rendered inside the main app shell.
// Phase 1: hardcoded sample data. Phase 2: wire to Supabase attainment table.
// ─────────────────────────────────────────────────────────────────────────────

const LB_NEW_BIZ = [
  { id: "cammy",  name: "Cammy Bean",               initials: "CB", mtd: 112, qtd: 94, ytd: 87 },
  { id: "farah",  name: "Farah Issa",                initials: "FI", mtd: 71,  qtd: 67, ytd: 74 },
];

const LB_CS = [
  { id: "dwayne", name: "Dwayne Haskell", initials: "DH", mtd: 96, qtd: 99, ytd: 94, ren_mtd: 98, ren_qtd: 102, ren_ytd: 96, exp_mtd: 87, exp_qtd: 91, exp_ytd: 88 },
  { id: "meri",   name: "Meri Tosh",     initials: "MT", mtd: 88, qtd: 86, ytd: 83, ren_mtd: 91, ren_qtd: 88,  ren_ytd: 85, exp_mtd: 82, exp_qtd: 81, exp_ytd: 78 },
];

function lbTierOf(pct) {
  if (pct >= 100) return "over";
  if (pct >= 80)  return "on";
  if (pct >= 60)  return "close";
  return "risk";
}

function lbTeamAvg(reps, period) {
  return Math.round(reps.reduce((s, r) => s + r[period], 0) / reps.length);
}

function lbAllAvg(allReps, period) {
  if (!allReps.length) return 0;
  return Math.round(allReps.reduce((s, r) => s + r[period], 0) / allReps.length);
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
          {avg >= 80 ? "On track overall" : avg >= 60 ? "Needs attention" : "Behind target"}
        </div>
        <div className="lb-team__bar-wrap">
          <div className="lb-team__track">
            <div className={`lb-team__fill ${fillClass}`} style={{ width: `${Math.min(avg, 100)}%` }} />
          </div>
          <div className="lb-team__bar-labels">
            <span>0%</span>
            <span className="lb-team__bar-center">{avg}% to target</span>
            <span>100%</span>
          </div>
        </div>
      </div>
      <div className="lb-team__kpis">
        {kpis.map(k => (
          <div key={k} className={`lb-kpi ${k === period ? "lb-kpi--active" : ""}`}>
            <div className="lb-kpi__val">{lbAllAvg(allReps, k)}%</div>
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
function LBCSRow({ rep, rank, period, animate }) {
  const pct = rep[period];
  const tier = lbTierOf(pct);
  const renPct = rep[`ren_${period}`];
  const expPct = rep[`exp_${period}`];
  return (
    <div className="lb-row">
      <div className={`lb-row__rank lb-row__rank--${rank <= 1 ? "1" : rank <= 2 ? "2" : "3"}`}>{rank}</div>
      <div className="lb-row__avatar lb-row__avatar--cs">{rep.initials}</div>
      <div className="lb-row__name">{rep.name}</div>
      <div className="lb-row__bar-wrap">
        <div className="lb-cs-bars">
          <div className="lb-cs-row">
            <span className="lb-cs-tag">Ren</span>
            <div className="lb-row__track"><div className="lb-row__fill lb-cs-fill--ren" style={{ width: animate ? `${Math.min(renPct, 100)}%` : "0%" }} /></div>
            <span className="lb-cs-val lb-cs-val--ren">{renPct}%</span>
          </div>
          <div className="lb-cs-row">
            <span className="lb-cs-tag">Exp</span>
            <div className="lb-row__track"><div className="lb-row__fill lb-cs-fill--exp" style={{ width: animate ? `${Math.min(expPct, 100)}%` : "0%" }} /></div>
            <span className="lb-cs-val lb-cs-val--exp">{expPct}%</span>
          </div>
        </div>
      </div>
      <div className={`lb-row__pct lb-row__pct--${tier}`}>{pct}%</div>
    </div>
  );
}

// ── Board ────────────────────────────────────────────────────────────────────
function LBBoard({ title, dotClass, reps, period, RowComponent, animate }) {
  const sorted = [...reps].sort((a, b) => b[period] - a[period]);
  const avg = lbTeamAvg(reps, period);
  const tier = lbTierOf(avg);
  const avgColor = tier === "over" || tier === "on" ? "var(--brand-deep)" : tier === "close" ? "var(--flag)" : "#E03C3C";
  return (
    <div className="lb-board">
      <div className="lb-board__header">
        <div className="lb-board__title">
          <span className={`lb-board__dot ${dotClass}`}></span>
          {title}
        </div>
        <div className="lb-board__avg">
          Team avg <span style={{ color: avgColor, fontWeight: 700 }}>{avg}%</span>
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
        CS blended attainment = Renewal 70% + Expansion 30%, matching comp plan weighting. Data refreshes nightly from Salesforce.
      </div>
    </div>
  );
}

window.LeaderboardView = LeaderboardView;
