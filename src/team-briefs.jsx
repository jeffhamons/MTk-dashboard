// RFC-163 — Team Briefs manager + rep surfaces.
// Owns a separate Supabase load/realtime cycle; never joins App shared state.

const TEAM_BRIEF_TYPE_LABELS = {
  morning_message: "Morning message",
  fyi: "FYI",
  reminder: "Reminder",
  action_required: "Action required",
};

const TEAM_BRIEF_AUDIENCES = [
  { audience_mode: "sales_all", audience_team_id: null, audience_region: null },
  { audience_mode: "team", audience_team_id: "newbiz", audience_region: null },
  { audience_mode: "team", audience_team_id: "cs", audience_region: null },
  ...REGION_ORDER.map(region => ({
    audience_mode: "region", audience_team_id: null, audience_region: region,
  })),
  ...TEAMS.flatMap(team => REGION_ORDER.map(region => ({
    audience_mode: "team_region",
    audience_team_id: team.id,
    audience_region: region,
  }))),
];

const TEAM_BRIEF_STYLES = `
.team-briefs{display:grid;gap:20px}
.tb-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px}
.tb-head h1{margin:0;font-size:30px;letter-spacing:-.04em}
.tb-head p{margin:5px 0 0;color:var(--muted);font-size:13px}
.tb-tabs{display:flex;gap:6px}
.tb-tab,.tb-btn{border:1px solid var(--line);background:var(--paper);border-radius:9px;padding:8px 12px;font:inherit;font-size:12px;font-weight:700;cursor:pointer}
.tb-tab[data-active="1"],.tb-btn--primary{background:var(--ink);border-color:var(--ink);color:white}
.tb-btn:disabled{opacity:.45;cursor:not-allowed}
.tb-error{padding:10px 12px;border:1px solid #fecaca;background:#fff1f2;color:#9f1239;border-radius:9px;font-size:12px}
.tb-compose{border:1px solid var(--line);background:var(--paper);border-radius:14px;padding:18px;display:grid;gap:14px}
.tb-compose h2{margin:0;font-size:17px}
.tb-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.tb-field{display:grid;gap:5px}
.tb-field--full{grid-column:1/-1}
.tb-field label{font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);font-weight:750}
.tb-field input,.tb-field textarea,.tb-field select,.tb-comment-box textarea{width:100%;border:1px solid var(--line);border-radius:8px;background:white;padding:9px 10px;font:inherit;font-size:13px}
.tb-field textarea{min-height:92px;resize:vertical}
.tb-checks{display:flex;flex-wrap:wrap;gap:14px;align-items:center}
.tb-checks label{display:flex;gap:7px;align-items:center;font-size:12px}
.tb-list{display:grid;gap:12px}
.tb-empty{border:1px dashed var(--line);border-radius:12px;padding:22px;text-align:center;color:var(--muted);font-size:13px}
.tb-card{border:1px solid var(--line);border-left:4px solid #c7c6d8;background:var(--paper);border-radius:12px;padding:15px;display:grid;gap:11px}
.tb-card[data-urgency="soon"]{border-left-color:#f59e0b}
.tb-card[data-urgency="tomorrow"],.tb-card[data-urgency="today"]{border-left-color:#ea580c}
.tb-card[data-urgency="overdue"]{border-left-color:#dc2626;background:#fffafa}
.tb-card[data-read="1"]{opacity:.78}
.tb-card__top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.tb-card__meta{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:5px}
.tb-pill{display:inline-flex;border-radius:999px;background:#f1f0f7;padding:3px 7px;font-size:9px;text-transform:uppercase;letter-spacing:.06em;font-weight:800}
.tb-pill--urgent{background:#fee2e2;color:#991b1b}
.tb-card h3{margin:0;font-size:16px;letter-spacing:-.015em}
.tb-card__body{white-space:pre-wrap;font-size:13px;line-height:1.5;color:var(--ink)}
.tb-card__sub{font-size:11px;color:var(--muted)}
.tb-card__actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
.tb-ack{display:flex;align-items:center;gap:6px;border:1px solid var(--line);background:white;border-radius:8px;padding:7px 10px;font-size:11px;font-weight:750;cursor:pointer}
.tb-ack[data-read="1"]{color:#166534;background:#f0fdf4;border-color:#bbf7d0}
.tb-track{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.tb-track__cell{border-radius:8px;background:#f6f5f9;padding:9px}
.tb-track__cell strong{display:block;font-size:16px}
.tb-track__cell span{font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.tb-unread{font-size:11px;color:var(--muted)}
.tb-comments{border-top:1px solid var(--line);padding-top:10px;display:grid;gap:8px}
.tb-comment{background:#f7f7fa;border-radius:8px;padding:8px 10px;font-size:12px}
.tb-comment__head{display:flex;justify-content:space-between;gap:8px;color:var(--muted);font-size:10px;margin-bottom:3px}
.tb-comment--deleted{font-style:italic;color:var(--muted)}
.tb-comment-box{display:grid;gap:6px}
.tb-comment-box__actions{display:flex;justify-content:flex-end;gap:7px}
.tb-today{margin:18px 0;border:1px solid var(--line);background:linear-gradient(135deg,#fff,#f8f7ff);border-radius:14px;padding:16px;display:grid;gap:12px}
.tb-today__head{display:flex;justify-content:space-between;gap:12px;align-items:center}
.tb-today__head h2{margin:0;font-size:17px}
.tb-today__head span{font-size:11px;color:var(--muted)}
.tb-today--quiet{padding:12px 15px}
.tb-loading{color:var(--muted);font-size:12px}
@media(max-width:720px){.tb-grid{grid-template-columns:1fr}.tb-field--full{grid-column:auto}.tb-head{align-items:flex-start;flex-direction:column}.tb-track{grid-template-columns:repeat(2,1fr)}}
`;

function teamBriefReadBy(brief, authId) {
  return (brief.reads || []).some(read => read.auth_id === authId);
}

function teamBriefRepName(repId) {
  const rep = repById(repId);
  return rep ? rep.name : (repId || "Manager");
}

function teamBriefFormatDate(value, timezone) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: timezone || undefined,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleString();
  }
}

function teamBriefSort(a, b, authId) {
  const ranks = { overdue: 0, today: 1, tomorrow: 2, soon: 3, normal: 4 };
  const ar = ranks[teamBriefUrgency(a)] ?? 4;
  const br = ranks[teamBriefUrgency(b)] ?? 4;
  if (ar !== br) return ar - br;
  const aRead = teamBriefReadBy(a, authId);
  const bRead = teamBriefReadBy(b, authId);
  if (aRead !== bRead) return aRead ? 1 : -1;
  return String(b.publish_at || "").localeCompare(String(a.publish_at || ""));
}

function useTeamBriefs(includeArchived) {
  const [briefs, setBriefs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const refresh = React.useCallback(async () => {
    try {
      const rows = await window.loadTeamBriefs({ includeArchived: !!includeArchived });
      setBriefs(Array.isArray(rows) ? rows : []);
      setError("");
    } catch (err) {
      setError(err.message || "Team Briefs could not load.");
    } finally {
      setLoading(false);
    }
  }, [includeArchived]);

  React.useEffect(() => {
    let alive = true;
    const guardedRefresh = async () => { if (alive) await refresh(); };
    guardedRefresh();
    const unsubscribe = window.subscribeTeamBriefs
      ? window.subscribeTeamBriefs(guardedRefresh)
      : () => {};
    return () => { alive = false; unsubscribe(); };
  }, [refresh]);

  return { briefs, loading, error, refresh };
}

function TeamBriefCard({ brief, authedUser, managerial, onChanged, compact }) {
  const authId = authedUser && authedUser.auth_id;
  const read = teamBriefReadBy(brief, authId);
  const urgency = teamBriefUrgency(brief);
  const [commentOpen, setCommentOpen] = React.useState(false);
  const [comment, setComment] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const active = brief.status === "published" && !brief.archived_at;
  const visibleComments = (brief.comments || []).filter(c => managerial || !c.deleted_at);
  const audience = brief.audience || [];
  const reads = brief.reads || [];
  const unread = audience.filter(member => !reads.some(readRow => readRow.auth_id === member.auth_id));

  async function act(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await onChanged();
    } catch (err) {
      setError(err.message || "That action failed.");
    } finally {
      setBusy(false);
    }
  }

  function submitComment() {
    const normalized = normalizeTeamBriefComment(comment);
    if (!normalized.ok) { setError(normalized.error); return; }
    act(async () => {
      await window.addTeamBriefComment(brief.id, normalized.value);
      setComment("");
      setCommentOpen(false);
    });
  }

  const urgencyLabel = urgency === "soon" ? "Due soon" : urgency;
  return (
    <article className="tb-card" data-urgency={urgency} data-read={read ? "1" : "0"}>
      <div className="tb-card__top">
        <div>
          <div className="tb-card__meta">
            <span className="tb-pill">{TEAM_BRIEF_TYPE_LABELS[brief.brief_type] || brief.brief_type}</span>
            <span className="tb-pill">{teamBriefAudienceLabel(brief)}</span>
            {urgency !== "normal" && <span className="tb-pill tb-pill--urgent">{urgencyLabel}</span>}
          </div>
          <h3>{brief.title}</h3>
        </div>
        {brief.due_at && (
          <div className="tb-card__sub">Due {teamBriefFormatDate(brief.due_at, brief.timezone)}</div>
        )}
      </div>
      <div className="tb-card__body">{brief.body}</div>
      <div className="tb-card__sub">
        {brief.author_email || "Manager"} · Published {teamBriefFormatDate(brief.publish_at, brief.timezone)}
      </div>

      {managerial && (
        <>
          <div className="tb-track">
            <div className="tb-track__cell"><strong>{reads.length}/{audience.length}</strong><span>Acknowledged</span></div>
            <div className="tb-track__cell"><strong>{unread.length}</strong><span>Unread</span></div>
            <div className="tb-track__cell"><strong>{visibleComments.filter(c => !c.deleted_at).length}</strong><span>Comments</span></div>
          </div>
          {unread.length > 0 && (
            <div className="tb-unread">Unread: {unread.map(member => teamBriefRepName(member.rep_id)).join(", ")}</div>
          )}
        </>
      )}

      {error && <div className="tb-error">{error}</div>}
      <div className="tb-card__actions">
        {!managerial && active && brief.require_ack && (
          <button
            className="tb-ack"
            data-read={read ? "1" : "0"}
            disabled={read || busy}
            onClick={() => act(() => window.acknowledgeTeamBrief(brief.id))}
          >
            <Icon name="check" size={13} /> {read ? "Acknowledged" : "Acknowledge"}
          </button>
        )}
        {active && brief.allow_comments && (
          <button className="tb-btn" disabled={busy} onClick={() => setCommentOpen(open => !open)}>
            Comment{visibleComments.length ? ` (${visibleComments.filter(c => !c.deleted_at).length})` : ""}
          </button>
        )}
        {managerial && active && (
          <button className="tb-btn" disabled={busy} onClick={() => act(() => window.archiveTeamBrief(brief.id))}>
            Archive
          </button>
        )}
      </div>

      {!compact && visibleComments.length > 0 && (
        <div className="tb-comments">
          {visibleComments.map(entry => (
            <div key={entry.id} className={"tb-comment" + (entry.deleted_at ? " tb-comment--deleted" : "")}>
              <div className="tb-comment__head">
                <span>{teamBriefRepName(entry.rep_id)}</span>
                <span>
                  {teamBriefFormatDate(entry.created_at, brief.timezone)}
                  {managerial && !entry.deleted_at && (
                    <button
                      className="tb-btn"
                      style={{ marginLeft: 7, padding: "2px 6px" }}
                      disabled={busy}
                      onClick={() => act(() => window.softDeleteTeamBriefComment(entry.id))}
                    >Remove</button>
                  )}
                </span>
              </div>
              {entry.deleted_at ? "Comment removed." : entry.body}
            </div>
          ))}
        </div>
      )}

      {commentOpen && active && (
        <div className="tb-comment-box">
          <textarea
            value={comment}
            maxLength={TEAM_BRIEF_COMMENT_MAX_LENGTH}
            onChange={event => setComment(event.target.value)}
            placeholder="Add a plain-text follow-up…"
            rows={3}
          />
          <div className="tb-comment-box__actions">
            <button className="tb-btn" onClick={() => setCommentOpen(false)}>Cancel</button>
            <button className="tb-btn tb-btn--primary" disabled={busy} onClick={submitComment}>Add comment</button>
          </div>
        </div>
      )}
    </article>
  );
}

function TeamBriefsTodayPanel({ authedUser, onOpen }) {
  const { briefs, loading, error, refresh } = useTeamBriefs(false);
  const authId = authedUser && authedUser.auth_id;
  const active = briefs
    .filter(brief => teamBriefIsVisible(brief, teamBriefReadBy(brief, authId)))
    .sort((a, b) => teamBriefSort(a, b, authId));

  if (!loading && !error && active.length === 0) {
    return (
      <>
        <style>{TEAM_BRIEF_STYLES}</style>
        <section className="tb-today tb-today--quiet">
          <div className="tb-today__head">
            <div><h2>Today</h2><span>You’re caught up on Team Briefs.</span></div>
          </div>
        </section>
      </>
    );
  }

  return (
    <section className="tb-today">
      <style>{TEAM_BRIEF_STYLES}</style>
      <div className="tb-today__head">
        <div><h2>Today · Morning Brief</h2><span>{active.length} active message{active.length === 1 ? "" : "s"}</span></div>
        <button className="tb-btn" onClick={onOpen}>Open all <Icon name="arrow-right" size={12} /></button>
      </div>
      {loading && <div className="tb-loading">Loading Team Briefs…</div>}
      {error && <div className="tb-error">{error}</div>}
      <div className="tb-list">
        {active.slice(0, 3).map(brief => (
          <TeamBriefCard
            key={brief.id}
            brief={brief}
            authedUser={authedUser}
            managerial={false}
            onChanged={refresh}
            compact={true}
          />
        ))}
      </div>
    </section>
  );
}

function TeamBriefsManager({ authedUser, activeTeam, regionPill }) {
  const managerial = canManageAny(authedUser);
  const { briefs, loading, error, refresh } = useTeamBriefs(managerial);
  const [tab, setTab] = React.useState("active");
  const [publishError, setPublishError] = React.useState("");
  const [publishing, setPublishing] = React.useState(false);
  const allowedAudiences = TEAM_BRIEF_AUDIENCES.filter(spec => canPublishTeamBrief(authedUser, spec));
  const preferred = allowedAudiences.find(spec =>
    spec.audience_mode === "team_region"
    && spec.audience_team_id === activeTeam
    && spec.audience_region === regionPill
  ) || allowedAudiences.find(spec =>
    spec.audience_mode === "team_region" && spec.audience_team_id === activeTeam
  ) || allowedAudiences[0];

  const [form, setForm] = React.useState(() => ({
    title: "",
    body: "",
    brief_type: "morning_message",
    audience_mode: preferred ? preferred.audience_mode : "sales_all",
    audience_team_id: preferred ? preferred.audience_team_id : null,
    audience_region: preferred ? preferred.audience_region : null,
    timezone_region: regionPill || "US",
    display_rule: "today_only",
    display_days: 3,
    expires_local: "",
    due_local: "",
    require_ack: true,
    allow_comments: true,
    auto_escalate: false,
  }));

  function patch(values) { setForm(current => ({ ...current, ...values })); }

  function selectAudience(value) {
    const spec = allowedAudiences[Number(value)];
    if (spec) patch({ ...spec });
  }

  function selectType(briefType) {
    const defaults = briefType === "morning_message"
      ? { display_rule: "today_only", require_ack: false, auto_escalate: false }
      : briefType === "action_required"
        ? { display_rule: "manual_clear", require_ack: true, auto_escalate: true }
        : briefType === "reminder"
          ? { display_rule: "for_days", require_ack: true, auto_escalate: false }
          : { display_rule: "for_days", require_ack: false, auto_escalate: false };
    patch({ brief_type: briefType, ...defaults });
  }

  async function publish(event) {
    event.preventDefault();
    setPublishError("");
    if (!canPublishTeamBrief(authedUser, form)) {
      setPublishError("Your current team-admin scope does not fully cover this audience.");
      return;
    }
    const timezone = teamBriefTimezoneForAudience(form, form.timezone_region);
    const expiresAt = form.display_rule === "until_date"
      ? zonedLocalDateTimeToIso(form.expires_local, timezone)
      : null;
    const dueAt = form.due_local ? zonedLocalDateTimeToIso(form.due_local, timezone) : null;
    if (form.display_rule === "until_date" && !expiresAt) {
      setPublishError("Choose a valid expiry date and time.");
      return;
    }
    if (form.auto_escalate && !dueAt) {
      setPublishError("Auto-escalation requires a due date.");
      return;
    }
    setPublishing(true);
    try {
      await window.publishTeamBrief({
        ...form,
        timezone,
        display_days: form.display_rule === "for_days" ? Number(form.display_days) : null,
        expires_at: expiresAt,
        due_at: dueAt,
      });
      patch({ title: "", body: "", due_local: "", expires_local: "" });
      await refresh();
      setTab("active");
    } catch (err) {
      setPublishError(err.message || "Team Brief could not publish.");
    } finally {
      setPublishing(false);
    }
  }

  const authId = authedUser && authedUser.auth_id;
  const filtered = briefs
    .filter(brief => managerial
      ? (tab === "archived" ? brief.status === "archived" : brief.status === "published")
      : teamBriefIsVisible(brief, teamBriefReadBy(brief, authId)))
    .sort((a, b) => teamBriefSort(a, b, authId));

  return (
    <div className="team-briefs" data-screen-label="Team Briefs">
      <style>{TEAM_BRIEF_STYLES}</style>
      <header className="tb-head">
        <div>
          <h1>Team Briefs</h1>
          <p>{managerial ? "Publish operational context and track acknowledgement." : "Messages and actions for your team."}</p>
        </div>
        {managerial && (
          <div className="tb-tabs">
            <button className="tb-tab" data-active={tab === "active" ? "1" : "0"} onClick={() => setTab("active")}>Active</button>
            <button className="tb-tab" data-active={tab === "archived" ? "1" : "0"} onClick={() => setTab("archived")}>Archived</button>
          </div>
        )}
      </header>

      {managerial && tab === "active" && (
        <form className="tb-compose" onSubmit={publish}>
          <h2>Publish a brief</h2>
          <div className="tb-grid">
            <div className="tb-field tb-field--full">
              <label>Title</label>
              <input required maxLength={160} value={form.title} onChange={event => patch({ title: event.target.value })} />
            </div>
            <div className="tb-field tb-field--full">
              <label>Message</label>
              <textarea required maxLength={10000} value={form.body} onChange={event => patch({ body: event.target.value })} />
            </div>
            <div className="tb-field">
              <label>Audience</label>
              <select
                value={Math.max(0, allowedAudiences.findIndex(spec =>
                  spec.audience_mode === form.audience_mode
                  && spec.audience_team_id === form.audience_team_id
                  && spec.audience_region === form.audience_region
                ))}
                onChange={event => selectAudience(event.target.value)}
              >
                {allowedAudiences.map((spec, index) => <option key={`${spec.audience_mode}-${spec.audience_team_id}-${spec.audience_region}`} value={index}>{teamBriefAudienceLabel(spec)}</option>)}
              </select>
            </div>
            <div className="tb-field">
              <label>Type</label>
              <select value={form.brief_type} onChange={event => selectType(event.target.value)}>
                {TEAM_BRIEF_TYPES.map(type => <option key={type} value={type}>{TEAM_BRIEF_TYPE_LABELS[type]}</option>)}
              </select>
            </div>
            <div className="tb-field">
              <label>Display window</label>
              <select value={form.display_rule} onChange={event => patch({ display_rule: event.target.value })}>
                <option value="today_only">Today only</option>
                <option value="for_days">For days</option>
                <option value="until_acknowledged">Until acknowledged</option>
                <option value="until_date">Until date</option>
                <option value="manual_clear">Until archived</option>
              </select>
            </div>
            {form.display_rule === "for_days" && (
              <div className="tb-field"><label>Days</label><input type="number" min="1" max="365" value={form.display_days} onChange={event => patch({ display_days: event.target.value })} /></div>
            )}
            {form.display_rule === "until_date" && (
              <div className="tb-field"><label>Expires in operational timezone</label><input required type="datetime-local" value={form.expires_local} onChange={event => patch({ expires_local: event.target.value })} /></div>
            )}
            <div className="tb-field">
              <label>Due date (optional)</label>
              <input type="datetime-local" value={form.due_local} onChange={event => patch({ due_local: event.target.value })} />
            </div>
            {!["region", "team_region"].includes(form.audience_mode) && (
              <div className="tb-field">
                <label>Operational timezone</label>
                <select value={form.timezone_region} onChange={event => patch({ timezone_region: event.target.value })}>
                  {REGIONS.map(region => <option key={region.id} value={region.id}>{region.label} · {region.timezone}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="tb-checks">
            <label><input type="checkbox" checked={form.require_ack} onChange={event => patch({ require_ack: event.target.checked })} /> Require acknowledgement</label>
            <label><input type="checkbox" checked={form.allow_comments} onChange={event => patch({ allow_comments: event.target.checked })} /> Allow comments</label>
            <label><input type="checkbox" checked={form.auto_escalate} onChange={event => patch({ auto_escalate: event.target.checked })} /> Auto-escalate toward due date</label>
          </div>
          {publishError && <div className="tb-error">{publishError}</div>}
          <div><button className="tb-btn tb-btn--primary" disabled={publishing || allowedAudiences.length === 0} type="submit">{publishing ? "Publishing…" : "Publish now"}</button></div>
        </form>
      )}

      {loading && <div className="tb-loading">Loading Team Briefs…</div>}
      {error && <div className="tb-error">{error}</div>}
      <div className="tb-list">
        {!loading && filtered.length === 0 && <div className="tb-empty">No {managerial ? tab : "active"} Team Briefs.</div>}
        {filtered.map(brief => (
          <TeamBriefCard
            key={brief.id}
            brief={brief}
            authedUser={authedUser}
            managerial={managerial}
            onChanged={refresh}
            compact={false}
          />
        ))}
      </div>
    </div>
  );
}

Object.assign(window, {
  TeamBriefsManager,
  TeamBriefsTodayPanel,
});
