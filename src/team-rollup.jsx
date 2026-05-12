// Team rollup view — the 5-second scan.
// Goal: glance at this and know who's on track, who's behind. No drill-down required.

const { useMemo: useMemoRollup } = React;

function TeamRollup({ state, weekIdx, setWeekIdx, onPickRep }) {
  const week = WEEKS[weekIdx];
  const today = TODAY;
  const isCurrent = weekIdx === currentWeekIndex();
  const isPast = week.sunday < today;
  const curIdx = currentWeekIndex();

  // For each rep, compute completion for this week, respecting per-rep skips
  const rows = REPS.map(rep => {
    const skips = rep.skips || [];
    const activeDels = DELIVERABLES.filter(d => !skips.includes(d.id));
    // We still produce a counts array aligned with the FULL DELIVERABLES list
    // so the rollup grid columns line up across all reps. Skipped cells get null.
    const counts = DELIVERABLES.map(d =>
      skips.includes(d.id) ? null : !!state.checks[checkKey(rep.id, week.id, d.id)]
    );
    const done = counts.filter(c => c === true).length;
    return { rep, counts, done, total: activeDels.length };
  });
  const teamDone = rows.reduce((a, r) => a + r.done, 0);
  const teamTotal = rows.reduce((a, r) => a + r.total, 0);
  const allClean = rows.every(r => r.done === r.total);

  // Days until Friday 5pm CT (deliverables due)
  const friday = new Date(week.friday);
  friday.setHours(17, 0, 0, 0);
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
            North America BD · Weekly Operating Rhythm
          </div>
          <h1 className="rollup__title">
            <span className="rollup__title-line1">The week of</span>
            <span className="rollup__title-line2">{fmtRange(week.monday, week.sunday)}</span>
          </h1>
          <p className="rollup__sub">
            {isCurrent ? "This week" : isPast ? "Closed week" : "Upcoming"} ·
            Week {week.index} of {WEEKS.length} ·
            Opens Mon 8:00 AM CT, due Fri 5:00 PM CT
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
            {WEEKS.map((w, i) => {
              const isCur = i === curIdx;
              const past = w.sunday < today;
              const sel = i === weekIdx;
              // Compute team completion for this week (respecting per-rep skips)
              let done = 0, total = 0;
              REPS.forEach(rep => {
                const skips = rep.skips || [];
                DELIVERABLES.forEach(d => {
                  if (skips.includes(d.id)) return;
                  total += 1;
                  if (state.checks[checkKey(rep.id, w.id, d.id)]) done += 1;
                });
              });
              const pct = total ? done / total : 0;
              return (
                <button
                  key={w.id}
                  className="rollup__weekstrip-cell"
                  data-selected={sel ? "1" : "0"}
                  data-current={isCur ? "1" : "0"}
                  data-past={past ? "1" : "0"}
                  onClick={() => setWeekIdx(i)}
                  title={`Week ${w.index} · ${done}/${total} done`}
                >
                  <div className="rollup__weekstrip-num">W{w.index}</div>
                  <div className="rollup__weekstrip-bar">
                    <div className="rollup__weekstrip-fill" style={{ width: (pct * 100) + "%" }} />
                  </div>
                </button>
              );
            })}
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

        {rows.map(({ rep, counts, done, total }) => {
          const clean = done === total;
          // Count active asks for this rep this week
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
      </div>

      {/* Cadence rules */}
      <div className="cadence">
        <div className="cadence__item">
          <Icon name="calendar" size={18} />
          <div>
            <div className="cadence__label">Week opens</div>
            <div className="cadence__value">Monday · 8:00 AM CT</div>
          </div>
        </div>
        <div className="cadence__divider" />
        <div className="cadence__item">
          <Icon name="clock" size={18} />
          <div>
            <div className="cadence__label">Deliverables due</div>
            <div className="cadence__value">Friday · 5:00 PM CT</div>
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
