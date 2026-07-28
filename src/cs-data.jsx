// ── CS Dashboard — Phase-1 data-access layer (RFC-158) ───────────────────────
// Six Supabase tables back the CS dashboard view:
//   • cs_targets          — rep/period/component target rows (upsertable)
//   • cs_pipeline_items   — judgment pipeline (insert/update/delete)
//   • cs_risks            — judgment risks (insert/update/delete)
//   • cs_current_focus    — judgment current-focus items (insert/update/delete)
//   • cs_team_focus       — judgment team-focus items (insert/update/delete)
//   • cs_dashboard_snapshot — append-only derived snapshot, READ-ONLY here
//
// Live sources are read by window.loadCsDashboard(), one async assembly that
// mirrors loadAttainmentV2's shape (a memoized Promise.all over the six reads,
// never substituting fabricated rows when a table is empty/blocked — an empty
// result renders an empty board). The JUDGMENT tables (pipeline / risks /
// current-focus / team-focus) get thin insert/update/delete wrappers, and
// cs_targets gets an upsert wrapper. cs_dashboard_snapshot is NEVER written
// from the client; it is populated by a backend job only.
//
// Audit fields: where a table carries updated_by (targets, current-focus,
// team-focus, pipeline) the helpers stamp updated_by from the session user
// via window.getMyUser (the same idiom saveStandupField/saveWins use, where
// the caller's email is threaded in). cs_risks has no updated_by column —
// only created_at/updated_at — so it is not stamped with a user.
// ─────────────────────────────────────────────────────────────────────────────

// Resolve the current user's email for audit stamping. The caller may pass an
// explicit `updatedBy` (managers threading effectiveUser.email); otherwise we
// fall back to the session user exactly the way migrateLocalToSupabase does.
async function _csUpdatedBy(override) {
  if (override) return override;
  if (typeof window.getMyUser !== "function") return null;
  const me = await window.getMyUser();
  return (me && (me.email || me.authEmail)) || null;
}

const _now = () => new Date().toISOString();

// ── READ — one async assembly of all six tables ──────────────────────────────
// Issue #25: the six reads are INDEPENDENT. A single Promise.all(...).catch(...)
// meant one blocked table (an RLS denial on cs_risks, say) blanked every other
// section on the page and rendered as "no data" — indistinguishable from an
// empty table. Each read is now settled on its own and carries its own error, so
// the five healthy sections still render and the sixth says what went wrong.
//
// Note that PostgREST does NOT reject on an RLS denial: it RESOLVES with
// { data: null, error }. Both failure modes are collapsed into one per-table
// error string below — a rejected promise and a resolved-with-error response
// are equally a failed section.
const CS_DASH_KEYS = ["targets", "pipeline", "risks", "currentFocus", "teamFocus", "snapshots"];

function _csEmptyDash(errors) {
  const out = { errors: errors || {}, hasErrors: false, failedSections: [] };
  for (const k of CS_DASH_KEYS) {
    out[k] = [];
    if (out.errors[k]) { out.hasErrors = true; out.failedSections.push(k); }
    else out.errors[k] = out.errors[k] || null;
  }
  return out;
}

// Normalize one settled read into { rows, error }. `error` is a string or null.
function _csSettled(settled, label) {
  if (!settled || settled.status === "rejected") {
    const e = settled && settled.reason;
    const msg = (e && (e.message || String(e))) || "read failed";
    console.warn(`loadCsDashboard: ${label} failed:`, msg);
    return { rows: [], error: msg };
  }
  const res = settled.value;
  if (res && res.error) {
    const msg = res.error.message || String(res.error);
    console.warn(`loadCsDashboard: ${label} failed:`, msg);
    return { rows: [], error: msg };
  }
  return { rows: (res && res.data) || [], error: null };
}

let _csDashPromise = null;
function loadCsDashboard() {
  if (_csDashPromise) return _csDashPromise;
  // Unconfigured / preview: return empty shapes — never fabricate rows. A
  // signed-in user always falls through to live reads; an empty table yields []
  // and the dashboard renders empty, matching the live-only principle
  // loadAttainmentV2 applies in production.
  if (!window.SUPABASE_CONFIGURED || typeof window.getSupabaseClient !== "function") {
    _csDashPromise = Promise.resolve(_csEmptyDash());
    return _csDashPromise;
  }
  const sb = window.getSupabaseClient();
  _csDashPromise = Promise.allSettled([
    sb.from("cs_targets").select("*").order("region", { ascending: true })
      .order("fy", { ascending: true }).order("period", { ascending: true }),
    sb.from("cs_pipeline_items").select("*")
      .order("region", { ascending: true }).order("stage", { ascending: true }),
    sb.from("cs_risks").select("*").order("region", { ascending: true }),
    sb.from("cs_current_focus").select("*")
      .order("region", { ascending: true }).order("position", { ascending: true }),
    sb.from("cs_team_focus").select("*").order("person", { ascending: true }),
    // Append-only derived snapshot: newest Mondays first. We pull all rows
    // ordered by snapshot_date desc and keep only the rows belonging to the
    // most recent ~12 distinct snapshot_dates (each Monday carries one row
    // per region×metric, so the distinct-date slice is the bounded window).
    sb.from("cs_dashboard_snapshot").select("*")
      .order("snapshot_date", { ascending: false }),
  ]).then((settled) => {
    const labels = ["cs_targets", "cs_pipeline_items", "cs_risks", "cs_current_focus", "cs_team_focus", "cs_dashboard_snapshot"];
    const parts = settled.map((s, i) => _csSettled(s, labels[i]));
    const out = { errors: {}, hasErrors: false, failedSections: [] };
    CS_DASH_KEYS.forEach((key, i) => {
      out[key] = parts[i].rows;
      out.errors[key] = parts[i].error;
      if (parts[i].error) { out.hasErrors = true; out.failedSections.push(key); }
    });
    out.snapshots = _recentSnapshotMondays(out.snapshots, 12);
    return out;
  }).catch((e) => {
    // allSettled itself only rejects if the array build threw — a wiring bug,
    // not a table failure. Surface it on every section rather than swallowing.
    const msg = (e && e.message) || String(e);
    console.warn("loadCsDashboard failed:", msg);
    const errors = {};
    for (const k of CS_DASH_KEYS) errors[k] = msg;
    return _csEmptyDash(errors);
  });
  return _csDashPromise;
}

// Shared per-section error banner for CS surfaces (issue #25). `error` is the
// per-table string from loadCsDashboard().errors — null renders nothing.
function CsSectionError({ error, label, style }) {
  if (!error) return null;
  return (
    <div role="alert" style={{
      border: "1px solid #E03C3C", background: "rgba(224,60,60,.08)",
      color: "#8E1E1E", borderRadius: "var(--radius-card)",
      padding: "12px 16px", fontSize: 13, fontWeight: 600, margin: "10px 0",
      ...(style || {}),
    }}>
      ⚠ {label || "This section"} could not be loaded — {error}. Nothing below is
      a real empty result; retry or report this.
    </div>
  );
}

// Keep only rows whose snapshot_date is among the `keep` most recent distinct
// dates. Rows arrive ordered by snapshot_date desc, so the first `keep` new
// dates seen are the window. Guards against an unbounded derived table.
function _recentSnapshotMondays(rows, keep) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    if (!row || row.snapshot_date == null) continue;
    if (!seen.has(row.snapshot_date)) {
      if (seen.size >= keep) break;
      seen.add(row.snapshot_date);
    }
    out.push(row);
  }
  return out;
}

// ── WRITE — cs_targets upsert ─────────────────────────────────────────────────
// Row grain (region, rep_id, period_type, fy, period, component) is the
// natural conflict key. Stamps updated_by/updated_at from the session user.
async function upsertCsTarget(row, updatedBy) {
  const sb = window.getSupabaseClient();
  const by = await _csUpdatedBy(updatedBy);
  const payload = {
    region: row.region,
    rep_id: row.rep_id,
    period_type: row.period_type,
    fy: row.fy,
    period: row.period,
    component: row.component,
    amount: row.amount,
    currency: row.currency,
    updated_by: by,
    updated_at: _now(),
  };
  return sb.from("cs_targets").upsert(payload, {
    onConflict: "region,rep_id,period_type,fy,period,component",
  }).select();
}

// ── WRITE — cs_pipeline_items insert/update/delete ───────────────────────────
async function insertCsPipelineItem(row, updatedBy) {
  const sb = window.getSupabaseClient();
  const by = await _csUpdatedBy(updatedBy);
  const now = _now();
  const payload = {
    region: row.region,
    stage: row.stage,
    kind: row.kind,
    client: row.client,
    product: row.product,
    amount: row.amount,
    currency: row.currency,
    rep_id: row.rep_id,
    rag: row.rag,
    notes: row.notes,
    original_month: row.original_month,
    estimated_close: row.estimated_close,
    lost_reason: row.lost_reason,
    created_by: by,
    created_at: now,
    updated_by: by,
    updated_at: now,
  };
  if (row.id != null) payload.id = row.id;
  return sb.from("cs_pipeline_items").insert(payload).select();
}

async function updateCsPipelineItem(id, patch, updatedBy) {
  const sb = window.getSupabaseClient();
  const by = await _csUpdatedBy(updatedBy);
  const payload = { ...patch, updated_by: by, updated_at: _now() };
  return sb.from("cs_pipeline_items").update(payload).eq("id", id).select();
}

async function deleteCsPipelineItem(id) {
  const sb = window.getSupabaseClient();
  return sb.from("cs_pipeline_items").delete().eq("id", id);
}

// ── WRITE — cs_risks insert/update/delete (no updated_by column) ──────────────
async function insertCsRisk(row) {
  const sb = window.getSupabaseClient();
  const now = _now();
  const payload = {
    region: row.region,
    rag: row.rag,
    risk: row.risk,
    action: row.action,
    owner: row.owner,
    created_at: now,
    updated_at: now,
  };
  if (row.id != null) payload.id = row.id;
  return sb.from("cs_risks").insert(payload).select();
}

async function updateCsRisk(id, patch) {
  const sb = window.getSupabaseClient();
  const payload = { ...patch, updated_at: _now() };
  return sb.from("cs_risks").update(payload).eq("id", id).select();
}

async function deleteCsRisk(id) {
  const sb = window.getSupabaseClient();
  return sb.from("cs_risks").delete().eq("id", id);
}

// ── WRITE — cs_risks soft-dismiss / reopen (issue #28) ────────────────────────
// cs_risks previously had only a hard DELETE for dismissing a risk, unlike
// `asks` which stamps resolved_at + attribution instead of deleting (see
// setAskSupabase / reopenAskSupabase in supabase-client.js). This mirrors
// that same soft-resolve contract for cs_risks: dismiss sets resolved_at +
// who dismissed it, reopen clears those fields. Requires the resolved_at /
// resolved_by_* columns added by db/migration-cs-risks-resolved-flags.sql
// (manual apply against live Supabase — see that file's header note).
async function resolveCsRisk(id, resolvedBy) {
  const sb = window.getSupabaseClient();
  const by = await _csUpdatedBy(resolvedBy);
  const payload = {
    resolved_at: _now(),
    resolved_by_email: (resolvedBy && resolvedBy.email) || by || null,
    resolved_by_name: (resolvedBy && resolvedBy.name) || null,
    resolved_by_role: (resolvedBy && resolvedBy.role) || null,
  };
  return sb.from("cs_risks").update(payload).eq("id", id).select();
}

async function reopenCsRisk(id) {
  const sb = window.getSupabaseClient();
  const payload = {
    resolved_at: null,
    resolved_by_email: null,
    resolved_by_name: null,
    resolved_by_role: null,
  };
  return sb.from("cs_risks").update(payload).eq("id", id).select();
}

// ── WRITE — cs_current_focus insert/update/delete ────────────────────────────
async function insertCsCurrentFocus(row, updatedBy) {
  const sb = window.getSupabaseClient();
  const by = await _csUpdatedBy(updatedBy);
  const now = _now();
  const payload = {
    region: row.region,
    category: row.category,
    content: row.content,
    position: row.position,
    updated_by: by,
    updated_at: now,
  };
  if (row.id != null) payload.id = row.id;
  return sb.from("cs_current_focus").insert(payload).select();
}

async function updateCsCurrentFocus(id, patch, updatedBy) {
  const sb = window.getSupabaseClient();
  const by = await _csUpdatedBy(updatedBy);
  const payload = { ...patch, updated_by: by, updated_at: _now() };
  return sb.from("cs_current_focus").update(payload).eq("id", id).select();
}

async function deleteCsCurrentFocus(id) {
  const sb = window.getSupabaseClient();
  return sb.from("cs_current_focus").delete().eq("id", id);
}

// ── WRITE — cs_team_focus insert/update/delete ───────────────────────────────
async function insertCsTeamFocus(row, updatedBy) {
  const sb = window.getSupabaseClient();
  const by = await _csUpdatedBy(updatedBy);
  const now = _now();
  const payload = {
    person: row.person,
    focus: row.focus,
    updated_by: by,
    updated_at: now,
  };
  if (row.id != null) payload.id = row.id;
  return sb.from("cs_team_focus").insert(payload).select();
}

async function updateCsTeamFocus(id, patch, updatedBy) {
  const sb = window.getSupabaseClient();
  const by = await _csUpdatedBy(updatedBy);
  const payload = { ...patch, updated_by: by, updated_at: _now() };
  return sb.from("cs_team_focus").update(payload).eq("id", id).select();
}

async function deleteCsTeamFocus(id) {
  const sb = window.getSupabaseClient();
  return sb.from("cs_team_focus").delete().eq("id", id);
}

// ── EXPORT GLOBALS ────────────────────────────────────────────────────────────
Object.assign(window, {
  loadCsDashboard,
  CsSectionError,
  upsertCsTarget,
  insertCsPipelineItem, updateCsPipelineItem, deleteCsPipelineItem,
  insertCsRisk, updateCsRisk, deleteCsRisk, resolveCsRisk, reopenCsRisk,
  insertCsCurrentFocus, updateCsCurrentFocus, deleteCsCurrentFocus,
  insertCsTeamFocus, updateCsTeamFocus, deleteCsTeamFocus,
});
