// ── My Number (window.MyNumber) — a rep's private target deep-dive on Home ────
// Collapsed: one-line summary. Expanded: full picture.
//   New Business → deal stack to quota, pace, projection, ledger
//   Customer Success → renewal book, coverage, ramp, ledger
// Data via window.loadAttainmentV2() (live Supabase or sample). Helpers from
// attainment-data.jsx. CS monthly has no target → "—". Styles in attainment.css.
// ─────────────────────────────────────────────────────────────────────────────

const MN_SEG = ["#5D5BED", "#7E7CF1"];
const MN_LATEST = "#00A0B4";
const MN_RENEW = ["#00A0B4", "#2BB7AE"];
const MN_OPEN = ["#FFC74D", "#FFB527"];

// ════════════ NEW BUSINESS ════════════
function MNNewBiz({ rep }) {
  const K = window.attFmtK, F = window.attFmtFull;
  const c = window.attNbCompute(rep);
  const ahead = c.paceDelta >= 0;
  const denom = Math.max(c.target, c.won) || 1;
  const Q = window.ATT_QUARTER;
  let cum = 0;

  return (
    <div className="mn-body">
      <div className="mn-hero">
        {c.gap > 0
          ? <>You're <b>{F(c.gap)}</b> from your {Q.label} goal — and <span className={ahead ? "mn-ahead" : "mn-behind"}>{ahead ? "ahead of" : "behind"} pace</span>.</>
          : <>You've <span className="mn-ahead">cleared</span> your {Q.label} goal — <b>{window.attPctText(c.pct.qtd)}</b> and still closing.</>}
      </div>

      <div className="mn-glance">
        {["mtd", "qtd", "ytd"].map(k => (
          <div key={k} className="mn-gcard" data-active={k === "qtd" ? "1" : "0"}>
            <div className="mn-gcard__k">{k.toUpperCase()}</div>
            <div className="mn-gcard__pct" style={{ color: window.attPctColor(rep.pct[k]) }}>{window.attPctText(rep.pct[k])}</div>
            <div className="mn-gcard__bar"><i style={{ width: `${window.attBarWidth(rep.pct[k])}%`, background: window.attTierColor(rep.pct[k]) }} /></div>
          </div>
        ))}
      </div>

      <div className="mn-stack">
        <div className="mn-stack__head">
          <div className="mn-stack__big"><span className="mn-stack__big-num">{F(c.won)}</span><span className="mn-stack__big-of">of {F(c.target)} {Q.label} quota</span></div>
          <div className="mn-stack__pct" style={{ color: window.attPctColor(c.pct.qtd) }}>{window.attPctText(c.pct.qtd)}</div>
        </div>
        <div className="mn-rail">
          {rep.deals.map((d, i) => {
            const w = d.amt / denom * 100, last = i === rep.deals.length - 1;
            return <div key={i} className="mn-seg" style={{ width: `${w}%`, background: last ? MN_LATEST : MN_SEG[i % 2] }}>{w > 7 ? <span>{K(d.amt)}</span> : null}</div>;
          })}
          {c.gap > 0 && <div className="mn-gapz"><span>{F(c.gap)} to go</span></div>}
          {c.target > 0 && c.pct.qtd < 100 && <div className="mn-pace" style={{ left: `${Math.min(100, c.expected / c.target * 100)}%` }}><span className="mn-pace__flag">pace · {Math.round(c.expected / c.target * 100)}%</span></div>}
          <div className="mn-goalcap" />
        </div>
        <div className="mn-scale"><span>$0</span><span>{F(c.target)} goal</span></div>
      </div>

      <div className={"mn-verdict " + (ahead ? "mn-verdict--ahead" : "mn-verdict--behind")}>
        <div><b>{ahead ? "Ahead of pace" : "Behind pace"} by {F(Math.abs(c.paceDelta))}.</b> Expected {F(c.expected)} by today (day {Q.daysElapsed} of {Q.daysTotal}).</div>
        <div className="mn-verdict__proj">on pace to finish<br /><b>{F(c.projection)}</b> · {Math.round(c.projPct)}%</div>
      </div>
      <div className="mn-nudge">
        {c.gap <= 0
          ? <><span className="mn-dot" />Goal cleared — every dollar from here is over-attainment.</>
          : <><span className="mn-dot" />At your average deal of <b>{F(c.avg)}</b>, you're about <b>{Math.max(1, Math.round(c.dealsToGo))} {Math.round(c.dealsToGo) <= 1 ? "close" : "closes"}</b> from goal.</>}
      </div>

      <div className="mn-ledger">
        <div className="mn-ledger__head"><span className="mn-ledger__title">Every closed-won deal</span><span className="mn-ledger__count">{rep.deals.length} deals · {Q.label}</span></div>
        {rep.deals.map((d, i) => { cum += d.amt; const share = c.target ? d.amt / c.target * 100 : 0; const last = i === rep.deals.length - 1; return (
          <div key={i} className="mn-lrow">
            <span className="mn-lrow__n">{String(i + 1).padStart(2, "0")}</span>
            <span className="mn-lrow__acct"><b>{d.acct}{last ? <span className="mn-latest">Latest</span> : null}</b><span className="mn-lrow__date">Closed {d.date}</span></span>
            <span className="mn-lrow__amt">{F(d.amt)}</span>
            <span className="mn-lrow__share"><span className="mn-lrow__share-bar"><i style={{ width: `${Math.min(100, share)}%`, background: last ? MN_LATEST : MN_SEG[i % 2] }} /></span><span className="mn-lrow__share-pct">{share.toFixed(1)}% of goal</span></span>
            <span className="mn-lrow__cum">running<br /><b>{c.target ? Math.round(cum / c.target * 100) : 0}%</b> · {K(cum)}</span>
          </div>
        ); })}
        <div className="mn-ledger__foot"><span className="mn-ledger__foot-label">Closed-won total</span><span className="mn-ledger__foot-amt">{F(c.won)}</span><span className="mn-ledger__foot-cum">{window.attPctText(c.pct.qtd)} of goal</span></div>
      </div>
    </div>
  );
}

// ════════════ CUSTOMER SUCCESS ════════════
function MNCs({ rep }) {
  const K = window.attFmtK, F = window.attFmtFull;
  const c = window.attCsCompute(rep);
  const hit = c.target > 0 && c.renewedSum >= c.target;
  const denom = Math.max(c.target, c.renewedSum + c.openSum) || 1;
  const ordered = [...c.renewed, ...c.open, ...c.churned];
  const Q = window.ATT_QUARTER;
  let cum = 0;

  return (
    <div className="mn-body">
      <div className="mn-hero">
        {c.gap > 0
          ? <>You're <b>{F(c.gap)}</b> from your {Q.label} renewal target{c.openSum > 0 ? <> — your open book <span className="mn-ahead">covers it {c.coverage.toFixed(1)}×</span></> : null}.</>
          : <>You've <span className="mn-ahead">cleared</span> your {Q.label} renewal target — <b>{window.attPctText(c.pct)}</b> and holding.</>}
      </div>

      <div className="mn-glance">
        {["mtd", "qtd", "ytd"].map(k => (
          <div key={k} className="mn-gcard" data-active={k === "qtd" ? "1" : "0"} data-cs="1">
            <div className="mn-gcard__k">{k.toUpperCase()}</div>
            <div className="mn-gcard__pct" style={{ color: window.attPctColor(rep.ren[k]) }}>{window.attPctText(rep.ren[k])}</div>
            <div className="mn-gcard__bar"><i style={{ width: `${window.attBarWidth(rep.ren[k])}%`, background: window.attTierColor(rep.ren[k]) }} /></div>
          </div>
        ))}
      </div>

      <div className="mn-stack">
        <div className="mn-stack__head">
          <div className="mn-stack__big"><span className="mn-stack__big-num">{F(c.renewedSum)}</span><span className="mn-stack__big-of">of {F(c.target)} {Q.label} target</span></div>
          <div className="mn-stack__pct" style={{ color: hit ? "var(--done-deep)" : "var(--ink)" }}>{window.attPctText(c.pct)}</div>
        </div>
        <div className="mn-rail">
          {c.renewed.map((d, i) => { const w = d.amt / denom * 100; return <div key={`r${i}`} className="mn-seg" style={{ width: `${w}%`, background: MN_RENEW[i % 2] }}>{w > 7 ? <span>{K(d.amt)}</span> : null}</div>; })}
          {c.open.map((d, i) => { const w = d.amt / denom * 100; return <div key={`o${i}`} className="mn-seg mn-seg--open" style={{ width: `${w}%`, background: MN_OPEN[i % 2] }}>{w > 7 ? <span style={{ color: "var(--open-deep)" }}>{K(d.amt)}</span> : null}</div>; })}
          {(c.renewedSum + c.openSum) < c.target && <div className="mn-gapz" style={{ flex: `0 0 ${(c.target - c.renewedSum - c.openSum) / denom * 100}%` }}><span>short</span></div>}
          {c.target > 0 && <div className="mn-csgoal" style={{ left: `${c.target / denom * 100}%` }}><span className="mn-csgoal__flag">Target</span></div>}
        </div>
        <div className="mn-legend">
          <span className="mn-legend__i"><span className="mn-legend__sw" style={{ background: "var(--done)" }} />Renewed</span>
          <span className="mn-legend__i"><span className="mn-legend__sw" style={{ background: "var(--open)", opacity: .85 }} />Open · due this quarter</span>
          <span className="mn-legend__i"><span className="mn-legend__sw" style={{ background: "var(--ink)", width: 3, borderRadius: 1 }} />Target</span>
        </div>
      </div>

      <div className="mn-verdict mn-verdict--ahead">
        <div>{c.gap > 0
          ? <><b>Renewed {window.attPctText(c.pct)} of target — {F(c.gap)} to go.</b>{c.openSum > 0 ? <> You have <b>{F(c.openSum)}</b> open this quarter ({c.coverage.toFixed(1)}× the gap). Hold the book and you clear it.</> : null}</>
          : <><b>Target cleared.</b> Every renewal from here is over-attainment.</>}</div>
      </div>
      {c.churned.length > 0 && (
        <div className="mn-churn"><span className="mn-dot mn-dot--open" />Watch — <b>{c.churned.length} account{c.churned.length === 1 ? "" : "s"} churned</b> this quarter: {c.churned.map(x => `${x.acct} (${K(x.amt)})`).join(", ")}.</div>
      )}

      <div className="mn-rampwrap">
        <div className="mn-rampwrap__title">Your year — targets are uneven, set by when each book renews</div>
        <div className="mn-ramp">
          {rep.ramp.map((cell, i) => (
            <div key={i} className="mn-rcell" data-cur={cell.cur ? "1" : "0"} data-na={cell.na ? "1" : "0"}>
              <div className="mn-rcell__q">{cell.q}{cell.cur ? <span className="mn-rcell__dot" /> : null}</div>
              <div className="mn-rcell__amt">{cell.na ? "—" : F(cell.amt)}</div>
              <div className="mn-rcell__bar">{cell.fill ? <i style={{ width: `${cell.fill}%` }} /> : null}</div>
            </div>
          ))}
        </div>
        <div className="mn-tiles">
          <div className="mn-tile"><div className="mn-tile__k">Expansion</div><div className="mn-tile__v">{rep.upsell != null ? K(rep.upsell) : "—"}</div><div className="mn-tile__s">upsell + cross-sell · activity</div></div>
          <div className="mn-tile"><div className="mn-tile__k">Multi-year</div><div className="mn-tile__v">{rep.multi != null ? rep.multi : "—"}</div><div className="mn-tile__s">not tracked yet</div></div>
        </div>
      </div>

      <div className="mn-ledger">
        <div className="mn-ledger__head"><span className="mn-ledger__title">Your {Q.label} renewal book</span><span className="mn-ledger__count">{c.renewed.length} renewed · {c.open.length} open · {c.churned.length} churned</span></div>
        {ordered.length === 0 && <div className="mn-lrow"><span className="mn-lrow__acct" style={{ color: "var(--ink-50)" }}>No renewal book synced yet.</span></div>}
        {ordered.map((d, i) => {
          const isRen = d.status === "renewed"; if (isRen) cum += d.amt;
          const share = c.target ? d.amt / c.target * 100 : 0;
          const chipCls = d.status === "renewed" ? "renewed" : d.status === "open" ? "open" : "churn";
          const chipLabel = d.status === "renewed" ? "Renewed" : d.status === "open" ? "Open" : "Churned";
          return (
            <div key={i} className="mn-lrow mn-lrow--cs">
              <span><span className={`mn-chip mn-chip--${chipCls}`}><span className="mn-chip__dot" />{chipLabel}</span></span>
              <span className="mn-lrow__acct"><b>{d.acct}</b><span className="mn-lrow__date">{d.date}</span></span>
              <span className={"mn-lrow__amt" + (d.status === "churn" ? " mn-muted" : "")}>{F(d.amt)}</span>
              <span className="mn-lrow__share">{isRen ? <><span className="mn-lrow__share-bar"><i style={{ width: `${Math.min(100, share)}%`, background: "var(--done)" }} /></span><span className="mn-lrow__share-pct">{share.toFixed(1)}% of target</span></> : <span className="mn-lrow__share-pct">{d.status === "open" ? "in the book" : "not counted"}</span>}</span>
              <span className="mn-lrow__cum">{isRen ? <>running<br /><b>{c.target ? Math.round(cum / c.target * 100) : 0}%</b> · {K(cum)}</> : null}</span>
            </div>
          );
        })}
        <div className="mn-ledger__foot"><span className="mn-ledger__foot-label">Renewed to date</span><span className="mn-ledger__foot-amt">{F(c.renewedSum)}</span><span className="mn-ledger__foot-cum">{window.attPctText(c.pct)} of target</span></div>
      </div>
    </div>
  );
}

// ════════════ Wrapper ════════════
function MyNumber({ repId }) {
  const [open, setOpen] = React.useState(false);
  const [data, setData] = React.useState(() => ({ nb: window.ATT_NB_SAMPLE || [], cs: window.ATT_CS_SAMPLE || [] }));

  React.useEffect(() => {
    let cancelled = false;
    if (window.loadAttainmentV2) window.loadAttainmentV2().then(d => { if (!cancelled && d) setData(d); });
    return () => { cancelled = true; };
  }, []);

  if (!repId) return null;
  const nb = (data.nb || []).find(r => r.id === repId);
  const cs = (data.cs || []).find(r => r.id === repId);
  if (!nb && !cs) return null;

  const F = window.attFmtFull;
  let summary, pct, tone;
  if (nb) {
    const c = window.attNbCompute(nb);
    pct = c.pct.qtd; tone = window.attPctColor(pct);
    summary = c.gap > 0 ? `${F(c.gap)} to go · ${window.ATT_QUARTER.label} quota` : `Goal cleared · ${window.attPctText(pct)}`;
  } else {
    const c = window.attCsCompute(cs);
    pct = c.pct; tone = window.attPctColor(pct);
    summary = c.gap > 0 ? `${F(c.gap)} to go · ${window.ATT_QUARTER.label} renewals` : `Target cleared · ${window.attPctText(pct)}`;
  }

  return (
    <div className={"mn-card" + (open ? " is-open" : "")}>
      <button className="mn-card__head" onClick={() => setOpen(o => !o)}>
        <div className="mn-card__l">
          <div className="mn-card__label">My Number</div>
          <div className="mn-card__summary">{summary}</div>
        </div>
        <div className="mn-card__pct" style={{ color: tone }}>{window.attPctText(pct)}</div>
        <div className="mn-card__chev">{window.Icon ? <window.Icon name="arrow-right" size={16} /> : "›"}</div>
      </button>
      {open && (nb ? <MNNewBiz rep={nb} /> : <MNCs rep={cs} />)}
    </div>
  );
}

window.MyNumber = MyNumber;
