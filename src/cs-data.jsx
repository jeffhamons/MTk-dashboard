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
let _csDashPromise = null;
function loadCsDashboard() {
  if (_csDashPromise) return _csDashPromise;
  // Unconfigured / preview: return empty shapes — never fabricate rows. A
  // signed-in user always falls through to live reads; an error or an empty
  // table yields [] and the dashboard renders empty, matching the
  // live-only principle loadAttainmentV2 applies in production.
  if (!window.SUPABASE_CONFIGURED || typeof window.getSupabaseClient !== "function") {
    _csDashPromise = Promise.resolve({
      targets: [], pipeline: [], risks: [],
      currentFocus: [], teamFocus: [], snapshots: [],
    });
    return _csDashPromise;
  }
  const sb = window.getSupabaseClient();
  _csDashPromise = Promise.all([
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
  ]).then(([t, p, r, cf, tf, s]) => ({
    targets: (t && t.data) || [],
    pipeline: (p && p.data) || [],
    risks: (r && r.data) || [],
    currentFocus: (cf && cf.data) || [],
    teamFocus: (tf && tf.data) || [],
    snapshots: _recentSnapshotMondays((s && s.data) || [], 12),
  })).catch((e) => {
    // A load failure renders an empty board; we never substitute sample data.
    console.warn("loadCsDashboard failed:", e && e.message);
    return { targets: [], pipeline: [], risks: [], currentFocus: [], teamFocus: [], snapshots: [] };
  });
  return _csDashPromise;
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
  upsertCsTarget,
  insertCsPipelineItem, updateCsPipelineItem, deleteCsPipelineItem,
  insertCsRisk, updateCsRisk, deleteCsRisk,
  insertCsCurrentFocus, updateCsCurrentFocus, deleteCsCurrentFocus,
  insertCsTeamFocus, updateCsTeamFocus, deleteCsTeamFocus,
});
