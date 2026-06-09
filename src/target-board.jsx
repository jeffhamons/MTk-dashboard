// ── Target Board (window.LeaderboardView) — Attainment V2 ─────────────────────
// Ranked rows (by % to target for the selected period) that expand to the full
// per-rep picture. Data via window.loadAttainmentV2() (live Supabase or sample).
// Helpers/format/colors from attainment-data.jsx. Styles in attainment.css (tb-*).
//
// CS is a quarterly renewal metric: QTD/YTD are real %, MTD has no target and
// renders "—" (ren.mtd === null). Upsell/cross-sell are activity, not target.
// ─────────────────────────────────────────────────────────────────────────────

const TB_SEG = ["#5D5BED", "#7E7CF1"];
const TB_LATEST = "#00A0B4";

function TBChevron() {
  return (
    <svg width="9" height="13" viewBox="0 0 9 13" fill="none">
      <path d="M1.5 1.5l5.5 5-5.5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Average a period across reps, skipping reps with no target (null) for it.
function tbAvg(arr, fn) {
  const vals = arr.map(fn).filter(v => v != null);
  return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
}

function TBTeamCard({ name, kind, pct, won, tar, period }) {
  const K = window.attFmtK;
  return (
    <div className="tb-tcard">
      <div className="tb-tcard__l">
        <div className="tb-tcard__name"><span className={`tb-tcard__dot tb-tcard__dot--${kind}`} />{name} · Team</div>
        <div className="tb-tcard__money"><b>{K(won)}</b> of {K(tar)} · {window.ATT_QUARTER.label}</div>
        <div className="tb-tcard__track"><i style={{ width: `${window.attBarWidth(pct)}%`, background: window.attTierColor(pct) }} /></div>
      </div>
      <div className="tb-tcard__pct">
        <div className="tb-tcard__pct-num" style={{ color: window.attPctColor(pct) }}>{window.attPctText(pct)}</div>
        <div className="tb-tcard__pct-label">{period}</div>
      </div>
    </div>
  );
}

function TBNbDetail({ rep, period, isManager, myRepId }) {
  const K = window.attFmtK, F = window.attFmtFull;
  const c = window.attNbCompute(rep);
  const denom = Math.max(c.target, c.won) || 1;
  // RLS hides peer deal rows from non-manager viewers (PR #1809). A rep peeking at a
  // teammate's row sees deals.length === 0 because rows are filtered, not because the
  // peer sold nothing. Distinguish the two cases so the empty state doesn't demoralize.
  const peerHidden = !isManager && !!myRepId && rep.id !== myRepId;
  return (
    <>
      <div className="tb-mini3">
        {["mtd", "qtd", "ytd"].map(k => (
          <div key={k} className="tb-mini" data-active={k === period ? "1" : "0"}>
            <div className="tb-mini__k">{k.toUpperCase()}</div>
            <div className="tb-mini__v" style={{ color: window.attPctColor(rep.pct[k]) }}>{window.attPctText(rep.pct[k])}</div>
          </div>
        ))}
      </div>
      <div className="tb-stack">
        <div className="tb-stack__cap"><span>{window.ATT_QUARTER.label} closed-won</span><span><b>{F(c.won)}</b> of {F(c.target)} quota</span></div>
        <div className="tb-rail">
          {rep.deals.map((d, i) => {
            const last = i === rep.deals.length - 1, w = d.amt / denom * 100;
            return <div key={i} className="tb-seg" style={{ width: `${w}%`, background: last ? TB_LATEST : TB_SEG[i % 2] }}>{w > 9 ? <span>{K(d.amt)}</span> : null}</div>;
          })}
          {c.gap > 0 && <div className="tb-gapz"><span>{F(c.gap)} to go</span></div>}
          <div className="tb-goalcap" />
        </div>
        {rep.deals.length === 0 && <div className="tb-dealrow"><span className="tb-dealrow__acct" style={{ color: "var(--ink-50)" }}>{peerHidden ? "Mind your own pipeline — that's where the commission lives." : "No closed-won deals synced this quarter yet."}</span></div>}
        {rep.deals.map((d, i) => (
          <div key={i} className="tb-dealrow">
            <span className="tb-dealrow__acct">{d.acct}</span>
            <span className="tb-dealrow__date">{d.date}</span>
            <span className="tb-dealrow__amt">{F(d.amt)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function TBCsDetail({ rep }) {
  const K = window.attFmtK, F = window.attFmtFull;
  const c = window.attCsCompute(rep);
  const hit = c.target > 0 && c.renewedSum >= c.target;
  const pct = c.pct;
  return (
    <div className="tb-csdetail">
      <div>
        <div className="tb-ren__head">
          <span className="tb-ren__label">{window.ATT_QUARTER.label} renewal target</span>
          <span className="tb-ren__pct" style={{ color: hit ? "var(--done-deep)" : "var(--ink)" }}>{window.attPctText(pct)}</span>
        </div>
        <div className="tb-ren__money"><b>{F(c.renewedSum)}</b> renewed of <b>{F(c.target)}</b></div>
        <div className="tb-cstrack"><i style={{ width: `${window.attBarWidth(pct)}%`, background: hit ? "linear-gradient(90deg,var(--done),var(--done-deep))" : "linear-gradient(90deg,var(--brand-light),var(--brand))" }} /></div>
        <div className={"tb-unlock " + (hit ? "tb-unlock--on" : "tb-unlock--off")}>
          {hit ? <>Target hit — <b>{F(c.renewedSum - c.target)}</b> above</> : <><b>{F(c.gap)}</b> to hit target</>}
        </div>
      </div>
      <div>
        <div className="tb-ramp">
          {rep.ramp.map((cell, i) => (
            <div key={i} className="tb-rcell" data-cur={cell.cur ? "1" : "0"} data-na={cell.na ? "1" : "0"}>
              <div className="tb-rcell__q">{cell.q}</div>
              <div className="tb-rcell__amt">{cell.na ? "—" : K(cell.amt)}</div>
              <div className="tb-rcell__bar">{cell.fill ? <i style={{ width: `${cell.fill}%` }} /> : null}</div>
            </div>
          ))}
        </div>
        <div className="tb-tiles">
          <div className="tb-tile"><div className="tb-tile__k">Expansion</div><div className="tb-tile__v">{rep.upsell != null ? K(rep.upsell) : "—"}</div><div className="tb-tile__s">upsell + cross-sell · activity</div></div>
          <div className="tb-tile"><div className="tb-tile__k">Multi-year</div><div className="tb-tile__v">{rep.multi != null ? rep.multi : "—"}</div><div className="tb-tile__s">not tracked yet</div></div>
        </div>
      </div>
    </div>
  );
}

function TBRow({ rep, rank, period, kind, isOpen, onToggle, isManager, myRepId }) {
  const meta = window.attRepMeta(rep.id);
  const p = kind === "nb" ? rep.pct[period] : rep.ren[period];
  return (
    <div className={"tb-row" + (isOpen ? " open" : "") + (rank === 1 ? " r1" : "")}>
      <button className="tb-row__main" onClick={onToggle}>
        <span className="tb-row__rank">{rank}</span>
        <span className="tb-row__av" style={{ background: `oklch(0.6 0.17 ${meta.hue})` }}>{meta.initials}</span>
        <span className="tb-row__id"><span className="tb-row__name">{meta.name}</span><span className="tb-row__role">{meta.role}</span></span>
        <span className="tb-row__bar"><i style={{ width: `${window.attBarWidth(p)}%`, background: window.attTierColor(p) }} /></span>
        <span className="tb-row__pct" style={{ color: window.attPctColor(p) }}>{window.attPctText(p)}</span>
        <span className="tb-row__chev"><TBChevron /></span>
      </button>
      <div className="tb-detail">
        <div className="tb-detail__inner">
          {kind === "nb" ? <TBNbDetail rep={rep} period={period} isManager={isManager} myRepId={myRepId} /> : <TBCsDetail rep={rep} />}
        </div>
      </div>
    </div>
  );
}

function TBBoard({ list, kind, period, openSet, toggle, isManager, myRepId }) {
  const key = kind === "nb" ? "pct" : "ren";
  // Sort by % desc; reps with no target this period (null) sort last.
  const sorted = [...list].sort((a, b) => {
    const av = a[key][period], bv = b[key][period];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return bv - av;
  });
  if (sorted.length === 0) {
    return <div className="tb-board"><div className="tb-row"><div className="tb-row__main" style={{ cursor: "default", color: "var(--ink-50)" }}>No attainment data synced yet — check back after tonight's Salesforce sync.</div></div></div>;
  }
  return (
    <div className="tb-board">
      {sorted.map((rep, i) => (
        <TBRow key={rep.id} rep={rep} rank={i + 1} period={period} kind={kind} isOpen={openSet.has(rep.id)} onToggle={() => toggle(rep.id)} isManager={isManager} myRepId={myRepId} />
      ))}
    </div>
  );
}

function LeaderboardView({ authedUser }) {
  const isManager = !!(authedUser && authedUser.role === "manager");
  const myRepId   = isManager ? null : ((authedUser && authedUser.rep_id) || null);

  const [period, setPeriod] = React.useState("qtd");
  const [openSet, setOpenSet] = React.useState(() => new Set());
  const [data, setData] = React.useState(() => ({ nb: window.ATT_NB_SAMPLE || [], cs: window.ATT_CS_SAMPLE || [] }));

  React.useEffect(() => {
    let cancelled = false;
    if (window.loadAttainmentV2) window.loadAttainmentV2().then(d => { if (!cancelled && d) setData(d); });
    return () => { cancelled = true; };
  }, []);

  const toggle = (id) => setOpenSet(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  // Reps who departed mid-cycle drop off the current standings.
  const visible = (rep) => {
    const r = (window.REPS || []).find(x => x.id === rep.id);
    if (!r || !window.repVisibleInWeek || !window.currentWeekIndex) return true;
    return window.repVisibleInWeek(r, window.currentWeekIndex() + 1);
  };
  const NB = (data.nb || []).filter(visible);
  const CS = (data.cs || []).filter(visible);

  const nbPct = tbAvg(NB, r => r.pct[period]);
  const nbWon = NB.reduce((s, r) => s + window.attNbCompute(r).won, 0);
  const nbTar = NB.reduce((s, r) => s + (r.quotaQ || 0), 0);
  const csPct = tbAvg(CS, r => r.ren[period]);
  const csWon = CS.reduce((s, r) => s + window.attCsCompute(r).renewedSum, 0);
  const csTar = CS.reduce((s, r) => s + (r.q2target || 0), 0);

  return (
    <div className="tb-view" data-screen-label="03 Target Board">
      <div className="tb-eyebrow"><span className="tb-eyebrow__dot" />North America BD · synced nightly from Salesforce</div>
      <div className="tb-hrow">
        <div>
          <h1 className="tb-title"><em>Target</em> board</h1>
          <p className="tb-sub">Ranked to target — open any row for the full picture behind the number.</p>
        </div>
        <div className="tb-toggle">
          {["mtd", "qtd", "ytd"].map(k => (
            <button key={k} className={"tb-toggle__btn" + (k === period ? " on" : "")} onClick={() => setPeriod(k)}>{k.toUpperCase()}</button>
          ))}
        </div>
      </div>

      <div className="tb-teamrow">
        <TBTeamCard name="New Business" kind="nb" pct={nbPct} won={nbWon} tar={nbTar} period={period} />
        <TBTeamCard name="Customer Success" kind="cs" pct={csPct} won={csWon} tar={csTar} period={period} />
      </div>

      <section className="tb-section">
        <div className="tb-section__head">
          <span className="tb-section__dot tb-section__dot--nb" />
          <h2 className="tb-section__title">New Business</h2>
          <span className="tb-section__hint">% to quota · expand for deal stack</span>
        </div>
        <TBBoard list={NB} kind="nb" period={period} openSet={openSet} toggle={toggle} isManager={isManager} myRepId={myRepId} />
      </section>

      <section className="tb-section">
        <div className="tb-section__head">
          <span className="tb-section__dot tb-section__dot--cs" />
          <h2 className="tb-section__title">Customer Success</h2>
          <span className="tb-section__hint">renewal % to quarter target · CS monthly has no target (—)</span>
        </div>
        <TBBoard list={CS} kind="cs" period={period} openSet={openSet} toggle={toggle} isManager={isManager} myRepId={myRepId} />
      </section>

      <div className="tb-note">● Renewal &amp; deal detail is live from Salesforce (renewal book ships renewed rows; open/churn arrive with the renewals-pipeline feed). CS quarterly targets are from the comp letters.</div>
    </div>
  );
}

window.LeaderboardView = LeaderboardView;
