// Team rollup view — the 5-second scan.
// Goal: glance at this and know who's on track, who's behind. No drill-down required.

const { useMemo: useMemoRollup } = React;
const { REGIONS, regionForRep, repsByRegion, regionsUnderScope, zoneAbbrev, dueInstantForRegion } = window;

function TeamRollup({ state, weekIdx, setWeekIdx, onPickRep, activeTeam, viewerScope, regionPill }) {
  const week = WEEKS[weekIdx];
  const today = TODAY;
  const isCurrent = weekIdx === currentWeekIndex();
  const isPast = week.sunday < today;
  const curIdx = currentWeekIndex();
  const currentQ = currentQuarterId();
  const [qExpanded, setQExpanded] = React.useState({});

  // Auto-expand a non-current quarter when prev/next lands the selection there.
  React.useEffect(() => {
    const selQ = WEEKS[weekIdx].quarter;
    if (selQ !== currentQ) {
      setQExpanded(prev => prev[selQ] ? prev : { ...prev, [selQ]: true });
    }
  }, [weekIdx, currentQ]);

  // RFC-151 Phase 4: the rollup is workspace-scoped; no activeTeam (legacy
  // caller) means all teams.
  const inTeam = rep => !activeTeam || rep.team === activeTeam;

  // RFC-152: region scope. Defensive — undefined viewerScope means no region
  // filtering (legacy caller / data-model.js helpers not yet loaded).
  const allowedRegions = viewerScope ? regionsUnderScope(viewerScope, regionPill) : null;
  const inRegion = rep => !allowedRegions || allowedRegions.includes(rep.region);

  // Cadence zone: single active region shows its own abbreviation; multiple
  // regions (or legacy/all) get neutral "local" copy. Never a wrong single zone.
  const singleRegionId = allowedRegions && allowedRegions.length === 1 ? allowedRegions[0] : null;
  const cadenceZone = singleRegionId ? zoneAbbrev(singleRegionId) : "local";
  const multiRegion = !singleRegionId;

  // For each rep, compute completion for this week, respecting per-rep skips.
  // Reps who departed mid-cycle (activeThrough) drop off from their week N+1.
  const rows = REPS.filter(rep => inTeam(rep) && inRegion(rep) && repVisibleInWeek(rep, week.index)).map(rep => {
    const skips = rep.skips || [];
    const activeDels = DELIVERABLES.filter(d => !skips.includes(d.id));
    // We still produce a counts array aligned with the FULL DELIVERABLES list
    // so the rollup grid columns line up across all reps. Skipped cells get null.
    const counts = DELIVERABLES.map(d =>
      skips.includes(d.id) ? null : delComplete(rep.id, week, d.id, state)
    );
    const done = counts.filter(c => c === true).length;
    return { rep, counts, done, total: activeDels.length };
  });
  const teamDone = rows.reduce((a, r) => a + r.done, 0);
  const teamTotal = rows.reduce((a, r) => a + r.total, 0);
  const allClean = rows.every(r => r.done === r.total);

  // Group rows by region for sectioned display
  const regionSections = REGIONS
    .filter(reg => !allowedRegions || allowedRegions.includes(reg.id))
    .map(reg => {
      const rRows = rows.filter(r => {
        const repReg = regionForRep(r.rep);
        return repReg && repReg.id === reg.id;
      });
      const done = rRows.reduce((a, rr) => a + rr.done, 0);
      const total = rRows.reduce((a, rr) => a + rr.total, 0);
      return { region: reg, rows: rRows, done, total };
    })
    .filter(s => s.rows.length > 0);

  // Determine subtitle — single region or multi-region, workspace-labelled
  const teamLabelWord = activeTeam === "cs" ? "CS" : "BD";
  const regionSubtitle = regionSections.length === 1
    ? `${regionSections[0].region.label} ${teamLabelWord} · Weekly Operating Rhythm`
    : regionSections.map(s => s.region.label).join(" + ") + ` ${teamLabelWord} · Weekly Operating Rhythm`;

  // Days until Friday 5pm cutoff (deliverables due).
  // Single-region: true regional due instant via dueInstantForRegion.
  // Multi-region (singleRegionId null): helper falls back to browser-local;
  // the cadence label already says "local" in that case.
  const friday = dueInstantForRegion(week, singleRegionId);
  const msToFriday = friday - today;
  const hrsToFriday = Math.round(msToFriday / 36e5);
  const dueLabel = hrsToFriday > 24
    ? `${Math.round(hrsToFriday / 24)} days until Friday cutoff`
    : hrsToFriday > 0
      ? `${hrsToFriday} hours until Friday cutoff`
      : isPast ? "Week closed" : "Past due — chase before Monday";

  return (
    <div className="rollup">
      <div className="rollup__masthead">
        <div className="rollup__masthead-left">
          <div className="eyebrow">
            <span className="eyebrow__dot" />
            {regionSubtitle}
          </div>
          <h1 className="rollup__title">
            <span className="rollup__title-line1">The week of</span>
            <span className="rollup__title-line2">{fmtRange(week.monday, week.sunday)}</span>
          </h1>
          <p className="rollup__sub">
            {isCurrent ? "This week" : isPast ? "Closed week" : "Upcoming"} ·
            {quarterForWeek(week).label} · Week {week.qIndex} of {weeksForQuarter(week.quarter).length} ·
            {`Opens Mon 8:00 AM ${cadenceZone}, due Fri 5:00 PM ${cadenceZone}`}
          </p>
          <div className="rollup__weeknav">
            <button
              className="rollup__weeknav-btn"
              onClick={() => setWeekIdx(Math.max(0, weekIdx - 1))}
              disabled={weekIdx === 0}
              aria-label="Previous week"
            >
              <Icon name="arrow-left" size={16} />
              <span>Prev week</span>
            </button>
            <button
              className="rollup__weeknav-btn"
              onClick={() => setWeekIdx(Math.min(WEEKS.length - 1, weekIdx + 1))}
              disabled={weekIdx === WEEKS.length - 1}
              aria-label="Next week"
            >
              <span>Next week</span>
              <Icon name="arrow-right" size={16} />
            </button>
            {!isCurrent && (
              <button
                className="rollup__weeknav-btn rollup__weeknav-btn--today"
                onClick={() => setWeekIdx(curIdx)}
              >
                Jump to this week
              </button>
            )}
          </div>
          <div className="rollup__weekstrip">
            {(() => {
              const items = [];
              for (const q of QUARTERS) {
                const qWeeks = weeksForQuarter(q.id);
                const isCurrentQ = q.id === currentQ;
                const isExpanded = isCurrentQ || !!qExpanded[q.id];

                // Non-current quarters: collapsed chip that toggles expansion.
                if (!isCurrentQ) {
                  items.push(
                    <button
                      key={q.id}
                      className="rollup__weekstrip-cell"
                      data-qtoggle="1"
                      data-expanded={isExpanded ? "1" : "0"}
                      onClick={() => setQExpanded(prev => ({ ...prev, [q.id]: !prev[q.id] }))}
                    >
                      <div className="rollup__weekstrip-num">{q.label}</div>
                      <div className="rollup__weekstrip-num" style={{ fontWeight: 400, fontSize: 9, opacity: 0.75, letterSpacing: 0 }}>
                        {fmtRange(qWeeks[0].monday, qWeeks[qWeeks.length - 1].sunday)}
                      </div>
                    </button>
                  );
                }

                if (isExpanded) {
                  for (const w of qWeeks) {
                    const i = w.index - 1;
                    const isCur = i === curIdx;
                    const past = w.sunday < today;
                    const sel = i === weekIdx;
                    // Compute team completion for this week (respecting per-rep skips)
                    let done = 0, total = 0;
                    REPS.filter(rep => inTeam(rep) && inRegion(rep) && repVisibleInWeek(rep, w.index)).forEach(rep => {
                      const skips = rep.skips || [];
                      DELIVERABLES.forEach(d => {
                        if (skips.includes(d.id)) return;
                        total += 1;
                        if (delComplete(rep.id, w, d.id, state)) done += 1;
                      });
                    });
                    const pct = total ? done / total : 0;
                    items.push(
                      <button
                        key={w.id}
                        className="rollup__weekstrip-cell"
                        data-selected={sel ? "1" : "0"}
                        data-current={isCur ? "1" : "0"}
                        data-past={past ? "1" : "0"}
                        onClick={() => setWeekIdx(i)}
                        title={`${quarterForWeek(w).label} · Week ${w.qIndex} · ${done}/${total} done`}
                      >
                        <div className="rollup__weekstrip-num">W{w.qIndex}</div>
                        <div className="rollup__weekstrip-bar">
                          <div className="rollup__weekstrip-fill" style={{ width: (pct * 100) + "%" }} />
                        </div>
                      </button>
                    );
                  }
                }
              }
              return items;
            })()}
          </div>
        </div>

        <div className="rollup__stamp" data-clean={allClean ? "1" : "0"}>
          <div className="rollup__stamp-num">{teamDone}<span>/{teamTotal}</span></div>
          <div className="rollup__stamp-label">
            {allClean ? "Closed clean" : isCurrent ? dueLabel : `${teamTotal - teamDone} open`}
          </div>
        </div>
      </div>

      {/* The grid — reps × deliverables */}
      <div className="rollup__grid">
        <div className="rollup__grid-head">
          <div className="rollup__grid-head-rep">Rep</div>
          {DELIVERABLES.map(d => (
            <div key={d.id} className="rollup__grid-head-cell">
              <div className="rollup__grid-head-icon"><Icon name={d.icon} size={16} /></div>
              <div className="rollup__grid-head-text">{d.title}</div>
            </div>
          ))}
          <div className="rollup__grid-head-status">Week status</div>
        </div>

        {regionSections.map(({ region, rows: sectionRows, done: secDone, total: secTotal }) => {
          const secClean = secDone === secTotal;
          return (
            <div key={region.id} className="rollup__region-section">
              {/* Region section header */}
              <div className="rollup__region-head">
                <span className="rollup__region-head-label">{region.label}</span>
                <span className="rollup__region-head-badge">{region.currency}</span>
                {multiRegion && (
                  <span className="rollup__region-head-cadence">Fri 5 PM {zoneAbbrev(region.id)}</span>
                )}
              </div>

              {sectionRows.map(({ rep, counts, done, total }) => {
                const clean = done === total;
                const flags = (state.asks && DELIVERABLES
                  .filter(d => state.asks[`${rep.id}|${week.id}|${d.id}`])
                ) || [];
                const flagCount = flags.length;
                return (
                  <button
                    key={rep.id}
                    className="rolluprow"
                    data-clean={clean ? "1" : "0"}
                    onClick={() => onPickRep(rep.id)}
                  >
                    <div className="rolluprow__rep">
                      <Avatar rep={rep} size={40} />
                      <div className="rolluprow__rep-meta">
                        <div className="rolluprow__rep-name">
                          {rep.name}
                          {flagCount > 0 && (
                            <span className="rolluprow__flag" title={`${flagCount} ${flagCount === 1 ? "ask" : "asks"} from ${rep.name.split(" ")[0]}`}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4 21V4" />
                                <path d="M4 4h12l-2 4 2 4H4" />
                              </svg>
                              <span>Needs you</span>
                            </span>
                          )}
                        </div>
                        <div className="rolluprow__rep-role">{rep.role}</div>
                      </div>
                    </div>
                    {counts.map((c, i) => (
                      <div key={i} className="rolluprow__cell">
                        {c === null
                          ? <span className="rolluprow__na" title="Not applicable for this rep">—</span>
                          : <StatusDot checked={c} size={18} />}
                      </div>
                    ))}
                    <div className="rolluprow__status">
                      <div className="rolluprow__status-bar">
                        <div className="rolluprow__status-bar-fill" style={{ width: `${(done/total)*100}%` }} />
                      </div>
                      <div className="rolluprow__status-label">
                        {clean ? "Closed clean" : `${done}/${total}`}
                      </div>
                      <Icon name="arrow-right" size={16} />
                    </div>
                  </button>
                );
              })}

              {/* Per-region subtotal */}
              <div className="rolluprow rolluprow--subtotal" data-clean={secClean ? "1" : "0"}>
                <div className="rolluprow__rep">
                  <div className="rolluprow__rep-meta">
                    <div className="rolluprow__rep-name rolluprow__rep-name--subtotal">{region.label} total</div>
                    <div className="rolluprow__rep-role">{region.currency}</div>
                  </div>
                </div>
                {DELIVERABLES.map((d, i) => <span key={i} />)}
                <div className="rolluprow__status">
                  <div className="rolluprow__status-bar">
                    <div className="rolluprow__status-bar-fill" style={{ width: `${(secTotal ? (secDone/secTotal)*100 : 0)}%` }} />
                  </div>
                  <div className="rolluprow__status-label">
                    {secClean ? "Closed clean" : `${secDone}/${secTotal}`}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Global totals row */}
        <div className="rolluprow rolluprow--total">
          <div className="rolluprow__rep">
            <div className="rolluprow__rep-meta">
              <div className="rolluprow__rep-name rolluprow__rep-name--total">Team total</div>
              <div className="rolluprow__rep-role">GBP</div>
            </div>
          </div>
          {DELIVERABLES.map((d, i) => <span key={i} />)}
          <div className="rolluprow__status">
            <div className="rolluprow__status-bar">
              <div className="rolluprow__status-bar-fill" style={{ width: `${(teamTotal ? (teamDone/teamTotal)*100 : 0)}%` }} />
            </div>
            <div className="rolluprow__status-label">
              {allClean ? "Closed clean" : `${teamDone}/${teamTotal}`}
            </div>
          </div>
        </div>
      </div>

      {/* Cadence rules */}
      <div className="cadence">
        <div className="cadence__item">
          <Icon name="calendar" size={18} />
          <div>
            <div className="cadence__label">Week opens</div>
            <div className="cadence__value">{`Monday · 8:00 AM ${cadenceZone}`}</div>
          </div>
        </div>
        <div className="cadence__divider" />
        <div className="cadence__item">
          <Icon name="clock" size={18} />
          <div>
            <div className="cadence__label">Deliverables due</div>
            <div className="cadence__value">{`Friday · 5:00 PM ${cadenceZone}`}</div>
          </div>
        </div>
        <div className="cadence__divider" />
        <div className="cadence__item cadence__item--note">
          <div>
            <div className="cadence__label">Why this exists</div>
            <div className="cadence__value">Closing loops, every week — one visible system the whole team sees.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.TeamRollup = TeamRollup;
