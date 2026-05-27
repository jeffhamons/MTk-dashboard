// Per-rep view: shows three deliverables for a selected week, with check toggles.
// Includes week navigator and a 10-week timeline strip.

function RepView({ rep, state, weekIdx, setWeekIdx, onCheck, onAsk, onAskResponse, onSaveNote, onBack, readOnly, isManager, onOpenWins }) {
  const week = WEEKS[weekIdx];
  const today = TODAY;
  const skips = rep.skips || [];
  const activeDeliverables = DELIVERABLES.filter(d => !skips.includes(d.id));
  const checks = activeDeliverables.map(d => !!state.checks[checkKey(rep.id, week.id, d.id)]);
  const done = checks.filter(Boolean).length;
  const total = activeDeliverables.length;
  const clean = done === total;
  const cur = currentWeekIndex();
  const isCurrent = weekIdx === cur;
  const isPast = week.sunday < today;
  const isFuture = week.monday > today;

  return (
    <div className="repview">
      {/* Top bar — back to team + rep identity */}
      <div className="repview__topbar">
        <button className="ghostbtn" onClick={onBack}>
          <Icon name="arrow-left" size={16} />
          <span>Team rollup</span>
        </button>

        <div className="repview__identity">
          <Avatar rep={rep} size={48} />
          <div>
            <div className="repview__name">{rep.name}</div>
            <div className="repview__role">{rep.role}</div>
          </div>
        </div>

        <div className="repview__topbar-actions">
          {!readOnly && <EmailButton rep={rep} week={week} state={state} />}
          <div className="repview__stamp" data-clean={clean ? "1" : "0"}>
            <span>{done}<i>/</i>{total}</span>
            <em>{clean ? "Closed clean" : "this week"}</em>
          </div>
        </div>
      </div>

      {/* 10-week timeline strip */}
      <div className="weekstrip">
        {WEEKS.map((w, i) => {
          const wChecks = activeDeliverables.map(d => !!state.checks[checkKey(rep.id, w.id, d.id)]);
          const wDone = wChecks.filter(Boolean).length;
          const wClean = wDone === activeDeliverables.length;
          const isSel = i === weekIdx;
          const isCur = i === cur;
          const past = w.sunday < today;
          return (
            <button
              key={w.id}
              className="weekstrip__item"
              data-selected={isSel ? "1" : "0"}
              data-clean={wClean ? "1" : "0"}
              data-current={isCur ? "1" : "0"}
              data-past={past ? "1" : "0"}
              onClick={() => setWeekIdx(i)}
            >
              <div className="weekstrip__num">W{w.index}</div>
              <div className="weekstrip__date">{fmtShort(w.monday)}</div>
              <div className="weekstrip__bar">
              {wChecks.map((c, di) => (
                <span key={di} className="weekstrip__seg" data-checked={c ? "1" : "0"} />
              ))}
              </div>
              {isCur && <div className="weekstrip__badge">Now</div>}
            </button>
          );
        })}
      </div>

      {/* Selected week heading */}
      <div className="repview__weekhead">
        <div>
          <div className="eyebrow">
            <span className="eyebrow__dot" />
            Week {week.index} · {isCurrent ? "This week" : isPast ? "Past" : "Upcoming"}
          </div>
          <h2 className="repview__weektitle">{fmtRange(week.monday, week.sunday)}</h2>
        </div>
        <div className="repview__weeknav">
          <button onClick={() => setWeekIdx(Math.max(0, weekIdx - 1))} disabled={weekIdx === 0} aria-label="Previous week">
            <Icon name="arrow-left" size={18} />
          </button>
          <button onClick={() => setWeekIdx(Math.min(WEEKS.length - 1, weekIdx + 1))} disabled={weekIdx === WEEKS.length - 1} aria-label="Next week">
            <Icon name="arrow-right" size={18} />
          </button>
        </div>
      </div>

      {/* Closed-clean banner */}
      {clean && (
        <div className="cleanbanner">
          <div className="cleanbanner__seal">
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="32" cy="32" r="28" />
              <circle cx="32" cy="32" r="22" strokeDasharray="2 4" />
              <path d="M21 33l7 7 15-15" strokeWidth="2.6" />
            </svg>
          </div>
          <div className="cleanbanner__text">
            <div className="cleanbanner__big">Week {week.index} — closed clean.</div>
            <div className="cleanbanner__small">All loops shut. {rep.name.split(" ")[0]} delivered the week.</div>
          </div>
          <div className="cleanbanner__date">{fmtLong(week.friday)}</div>
        </div>
      )}

      {/* Open asks summary — shows what this rep needs help with this week.
          Visible to both rep (so it stays top-of-mind) and manager (so 1:1
          finds them instead of needing to be chased). */}
      {(() => {
        const openAsks = activeDeliverables
          .map(d => ({ d, ask: state.asks && state.asks[`${rep.id}|${week.id}|${d.id}`] }))
          .filter(x => x.ask);
        if (openAsks.length === 0) return null;
        return (
          <div className="askbar">
            <div className="askbar__head">
              <span className="askbar__pulse" />
              {openAsks.length} {openAsks.length === 1 ? "ask" : "asks"} open this week
            </div>
            <ul className="askbar__list">
              {openAsks.map(({ d, ask }) => (
                <li key={d.id} className="askbar__item">
                  <span className="askbar__del">{d.title}</span>
                  <span className="askbar__sep">→</span>
                  <span className="askbar__text">{ask.text}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })()}

      {/* The deliverables for this rep (skipped ones filtered out) */}
      <div className="deliverables" style={{ "--deliv-count": activeDeliverables.length }}>
        {activeDeliverables.map((d, i) => {
          const checkVal = state.checks[checkKey(rep.id, week.id, d.id)];
          const checked = !!checkVal;
          return (
            <article key={d.id} className="deliverable" data-checked={checked ? "1" : "0"}>
              <div className="deliverable__head">
                <div className="deliverable__num">0{i + 1}</div>
                <div className="deliverable__icon"><Icon name={d.icon} size={28} stroke={1.4} /></div>
              </div>
              <div className="deliverable__body">
                <h3 className="deliverable__title">{d.title}</h3>
                <p className="deliverable__short">{d.short}</p>
                <div className="deliverable__why">
                  <span className="deliverable__why-label">Why it matters</span>
                  <p>{d.why}</p>
                </div>
                {(() => {
                  // Wins deliverable → navigate in-app instead of opening spreadsheet
                  if (d.id === "wins" && onOpenWins) {
                    return (
                      <button
                        className="deliverable__link"
                        onClick={onOpenWins}
                        style={{ background:"none", border:"none", cursor:"pointer", padding:0, font:"inherit", textAlign:"left" }}
                      >
                        <Icon name="wins" size={14} />
                        <span>Open Weekly Wins form</span>
                      </button>
                    );
                  }
                  const href = (rep.links && rep.links[d.id]) || d.docHref;
                  const isReal = href && typeof href === "string" && href.startsWith("http");
                  // No-link deliverable — show a note instead (e.g. "tracked in Apollo")
                  if (!d.docLabel) {
                    return (
                      <div className="deliverable__note">
                        <Icon name="external" size={14} />
                        <span>{d.note || ""}</span>
                      </div>
                    );
                  }
                  return (
                    <a
                      className="deliverable__link"
                      href={href}
                      target={isReal ? "_blank" : undefined}
                      rel={isReal ? "noopener noreferrer" : undefined}
                      onClick={e => { if (!isReal) e.preventDefault(); }}
                      data-stub={isReal ? "0" : "1"}
                    >
                      <Icon name="external" size={14} />
                      <span>{isReal ? d.docLabel : `${d.docLabel} (link pending)`}</span>
                    </a>
                  );
                })()}
              </div>
              <div className="deliverable__foot">
                <BigCheck
                  checked={checked}
                  onToggle={() => onCheck(rep.id, week.id, d.id)}
                  label={`Mark ${d.title} done`}
                  readOnly={readOnly}
                />
                <AskForHelp
                  rep={rep}
                  weekId={week.id}
                  delId={d.id}
                  state={state}
                  onAsk={onAsk}
                  onAskResponse={onAskResponse}
                  isManager={isManager}
                  disabled={checked || readOnly}
                />
              </div>
              {checked && checkVal && checkVal.markedBy && checkVal.markedBy.role === "manager" && (
                <MarkedByStamp check={checkVal} />
              )}
              {isManager && onSaveNote && (
                <ManagerNote
                  repId={rep.id}
                  weekId={week.id}
                  delId={d.id}
                  state={state}
                  onSaveNote={onSaveNote}
                />
              )}
            </article>
          );
        })}
      </div>

      {/* Footer note — the spirit */}
      <div className="repfoot">
        <div className="repfoot__rule" />
        <p>
          This isn't a leash. It's the loop. <strong>Change comes by putting in the reps</strong>, every week.
          Green when shut. Quiet when not.
        </p>
      </div>
    </div>
  );
}

window.RepView = RepView;
