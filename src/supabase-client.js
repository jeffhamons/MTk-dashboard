// ============================================================
// Supabase client + state adapter
// Matches the existing app shape:
//   • check key:  `${rep}|${weekId}|${del}`  (weekId is "w1".."w10")
//   • ask shape:  { text, at }
// Replaces localStorage with Supabase + realtime.
// ============================================================

// ----- CONFIG (paste from Supabase Settings → API) -----
const SUPABASE_URL  = "https://tvdizqryowracmtjdskv.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2ZGl6cXJ5b3dyYWNtdGpkc2t2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MzA2NjQsImV4cCI6MjA5MzUwNjY2NH0.rcKh98lwi21lqP0nBsKaeJQ8Z81J0mH2spT9KokXA0g";  // safe to embed
// -------------------------------------------------------

const SUPABASE_CONFIGURED = SUPABASE_ANON !== "__PASTE_ANON_KEY_HERE__" && SUPABASE_ANON.length > 20;
window.__SUPABASE_URL__  = SUPABASE_URL;
window.__SUPABASE_ANON__ = SUPABASE_ANON;

// Lazy client (only build if configured)
let _client = null;
function client() {
  if (!_client) {
    if (!window.supabase) throw new Error("Supabase UMD not loaded");
    _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
      realtime: { params: { eventsPerSecond: 5 } },
      auth: {
        // Bounded navigator.locks wrapper. Keeps cross-tab serialization of
        // token refreshes (so two tabs don't race and burn each other's
        // single-use refresh tokens — the symptom that was logging users out)
        // while guaranteeing the lock can never wedge: if it's held longer
        // than acquireTimeout, AbortSignal fires and we fall through to an
        // uncoordinated run rather than queueing forever behind a dead
        // Web Lock client (the deadlock we hit in prod).
        //
        // gotrue-js passes acquireTimeout = -1 to mean "no timeout, wait
        // forever." AbortSignal.timeout(-1) throws synchronously ("value
        // outside unsigned long long"), so only attach the signal for
        // positive timeouts. Without this guard every auth call rejects
        // before INITIAL_SESSION can fire and the app hangs on
        // "Checking sign-in status…".
        lock: async (name, acquireTimeout, fn) => {
          const opts = { mode: "exclusive" };
          if (acquireTimeout > 0) opts.signal = AbortSignal.timeout(acquireTimeout);
          try {
            return await navigator.locks.request(name, opts, fn);
          } catch (err) {
            if (err instanceof DOMException && (err.name === "AbortError" || err.name === "TimeoutError")) {
              return fn();
            }
            throw err;
          }
        },
        persistSession: true,
        autoRefreshToken: true,
        // Implicit flow: magic-link tokens land in the URL hash, so the user
        // can request the link on laptop and click it on phone (PKCE would
        // require the code_verifier from the laptop's localStorage).
        flowType: "implicit",
      },
    });
  }
  return _client;
}

// week_index column = numeric part of "w1" → 1
const weekIdToIdx  = (wid) => parseInt(String(wid).replace(/\D/g, ""), 10);
const idxToWeekId  = (idx) => `w${idx}`;
const checkKeyOf   = (rep, weekId, del) => `${rep}|${weekId}|${del}`;

// ============================================================
// LOAD — initial fetch
// Returns { checks: {key: {at, markedBy?}}, asks: {key: {text, at}}, managerNotes: {key: {note, updated_by, updated_at}} }
// ============================================================
async function loadStateFromSupabase() {
  const sb = client();
  const out = { checks: {}, asks: {}, resolvedAsks: {}, managerNotes: {} };

  // Try manager_notes — may RLS-block for reps; that's expected.
  const [{ data: checks, error: ce }, { data: asks, error: ae }, { data: resolved, error: re }, { data: notes }] =
    await Promise.all([
      sb.from("checks").select("*"),
      sb.from("asks").select("*").is("resolved_at", null),
      // Resolved history: newest first, capped so the payload stays bounded.
      sb.from("asks").select("*")
        .not("resolved_at", "is", null)
        .order("resolved_at", { ascending: false })
        .limit(200),
      sb.from("manager_notes").select("*").then(r => r, () => ({ data: [] })),
    ]);

  if (ce) console.error("checks load error", ce);
  if (ae) console.error("asks load error", ae);
  if (re) console.error("resolved asks load error", re);

  for (const r of (checks || [])) {
    const wid = idxToWeekId(r.week_index);
    const k = checkKeyOf(r.rep_id, wid, r.deliverable_id);
    out.checks[k] = {
      at: r.checked_at,
      markedBy: r.marked_by_email
        ? { email: r.marked_by_email, name: r.marked_by_name, role: r.marked_by_role || "rep", at: r.checked_at }
        : undefined,
    };
  }
  for (const r of (asks || [])) {
    const wid = idxToWeekId(r.week_index);
    const ask = { text: r.body, at: r.created_at };
    if (r.response) {
      ask.response = {
        text: r.response,
        byEmail: r.response_by_email || null,
        byName: r.response_by_name || null,
        at: r.response_at || null,
      };
    }
    out.asks[checkKeyOf(r.rep_id, wid, r.deliverable_id)] = ask;
  }
  for (const r of (resolved || [])) {
    const wid = idxToWeekId(r.week_index);
    const entry = {
      text: r.body,
      raisedAt: r.created_at,
      resolvedAt: r.resolved_at,
      resolvedBy: r.resolved_by_email
        ? {
            email: r.resolved_by_email,
            name:  r.resolved_by_name || null,
            role:  r.resolved_by_role || "rep",
          }
        : null,
    };
    if (r.response) {
      entry.response = {
        text: r.response,
        byEmail: r.response_by_email || null,
        byName:  r.response_by_name  || null,
        at: r.response_at || null,
      };
    }
    out.resolvedAsks[checkKeyOf(r.rep_id, wid, r.deliverable_id)] = entry;
  }
  for (const r of (notes || [])) {
    const wid = idxToWeekId(r.week_index);
    out.managerNotes[checkKeyOf(r.rep_id, wid, r.deliverable_id)] = {
      note: r.note, updated_by: r.updated_by, updated_at: r.updated_at,
    };
  }
  return out;
}

// ============================================================
// WRITE — toggle a check (rep, weekId, delId, currentlyChecked, markedBy)
// markedBy = { email, name, role: 'rep'|'manager' }
// ============================================================
async function toggleCheckSupabase(rep, weekId, del, currentlyChecked, markedBy) {
  const sb = client();
  const week_index = weekIdToIdx(weekId);
  if (currentlyChecked) {
    const { error } = await sb.from("checks").delete()
      .match({ rep_id: rep, week_index, deliverable_id: del });
    if (error) console.error("uncheck error", error);
  } else {
    const row = {
      rep_id: rep, week_index, deliverable_id: del,
      checked_at: new Date().toISOString(),
    };
    if (markedBy) {
      row.marked_by_email = markedBy.email || null;
      row.marked_by_name  = markedBy.name  || null;
      row.marked_by_role  = markedBy.role  || "rep";
    }
    const { error } = await sb.from("checks").upsert(row, { onConflict: "rep_id,week_index,deliverable_id" });
    if (error) console.error("check error", error);
  }
}

// ============================================================
// WRITE — set / clear a manager note (manager only; RLS enforces)
// ============================================================
async function setManagerNoteSupabase(rep, weekId, del, note, updatedByEmail) {
  const sb = client();
  const week_index = weekIdToIdx(weekId);
  if (!note || !note.trim()) {
    const { error } = await sb.from("manager_notes").delete()
      .match({ rep_id: rep, week_id: weekId, del_id: del });
    if (error) console.error("mgr note clear error", error);
  } else {
    const { error } = await sb.from("manager_notes").upsert(
      { rep_id: rep, week_id: weekId, del_id: del, note: note.trim(), updated_by: updatedByEmail || null, updated_at: new Date().toISOString() },
      { onConflict: "rep_id,week_id,del_id" }
    );
    if (error) console.error("mgr note set error", error);
  }
}

// ============================================================
// WRITE — set / clear an ask.
//
// Clearing is a SOFT resolve, not a DELETE: we stamp resolved_at + who
// resolved it, so the row survives for the resolved-flags history view.
// Re-raising the same (rep, week, deliverable) reopens the existing row
// via the resolved_at: null in the upsert payload.
// ============================================================
async function setAskSupabase(rep, weekId, del, text, resolvedBy) {
  const sb = client();
  const week_index = weekIdToIdx(weekId);
  if (!text || !text.trim()) {
    // Soft-resolve. Only stamp resolved_* if the row is currently open;
    // a second click shouldn't overwrite an earlier resolution.
    const patch = {
      resolved_at: new Date().toISOString(),
      resolved_by_email: resolvedBy && resolvedBy.email || null,
      resolved_by_name:  resolvedBy && resolvedBy.name  || null,
      resolved_by_role:  resolvedBy && resolvedBy.role  || "rep",
    };
    const { error } = await sb.from("asks")
      .update(patch)
      .match({ rep_id: rep, week_index, deliverable_id: del })
      .is("resolved_at", null);
    if (error) console.error("ask resolve error", error);
  } else {
    const { error } = await sb.from("asks").upsert(
      {
        rep_id: rep, week_index, deliverable_id: del,
        body: text.trim(),
        resolved_at: null,
        resolved_by_email: null,
        resolved_by_name:  null,
        resolved_by_role:  null,
      },
      { onConflict: "rep_id,week_index,deliverable_id" }
    );
    if (error) console.error("ask set error", error);
  }
}

// ============================================================
// WRITE — reopen a previously resolved ask (manager action).
// Clears resolved_at + attribution; the row reappears in the open queue.
// ============================================================
async function reopenAskSupabase(rep, weekId, del) {
  const sb = client();
  const week_index = weekIdToIdx(weekId);
  const { error } = await sb.from("asks").update({
    resolved_at: null,
    resolved_by_email: null,
    resolved_by_name:  null,
    resolved_by_role:  null,
  }).match({ rep_id: rep, week_index, deliverable_id: del });
  if (error) console.error("ask reopen error", error);
}

// ============================================================
// WRITE — set / clear a manager response on an existing ask (manager only;
// RLS enforces). UPDATE-only (not upsert) — we never create asks on behalf
// of a rep here; the response lives on the row the rep already raised.
// ============================================================
async function setAskResponseSupabase(rep, weekId, del, responseText, markedBy) {
  const sb = client();
  const week_index = weekIdToIdx(weekId);
  const trimmed = (responseText || "").trim();
  const patch = trimmed
    ? {
        response: trimmed,
        response_by_email: markedBy && markedBy.email || null,
        response_by_name:  markedBy && markedBy.name  || null,
        response_at: new Date().toISOString(),
      }
    : { response: null, response_by_email: null, response_by_name: null, response_at: null };
  const { error } = await sb.from("asks").update(patch)
    .match({ rep_id: rep, week_index, deliverable_id: del });
  if (error) console.error("ask response set error", error);
}

// ============================================================
// REALTIME — fire callback when anything changes
// ============================================================
function subscribeRealtime(onChange) {
  const sb = client();
  const channel = sb.channel("weekly-review")
    .on("postgres_changes", { event: "*", schema: "public", table: "checks" },         () => onChange())
    .on("postgres_changes", { event: "*", schema: "public", table: "asks"   },         () => onChange())
    .on("postgres_changes", { event: "*", schema: "public", table: "manager_notes" },  () => onChange())
    .subscribe();
  return () => sb.removeChannel(channel);
}

// ============================================================
// MIGRATE — push localStorage state up once
// ============================================================
async function migrateLocalToSupabase() {
  const LS_KEY = "weekly-review-state-v1";
  const MIGRATED_KEY = LS_KEY + ":migrated";
  if (localStorage.getItem(MIGRATED_KEY)) return { migrated: false, reason: "already-migrated" };
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) { localStorage.setItem(MIGRATED_KEY, new Date().toISOString()); return { migrated: false, reason: "no-local" }; }

  let local;
  try { local = JSON.parse(raw); } catch { return { migrated: false, reason: "parse-error" }; }
  if (!local || (!local.checks && !local.asks)) {
    localStorage.setItem(MIGRATED_KEY, new Date().toISOString());
    return { migrated: false, reason: "empty" };
  }

  const sb = client();
  const checkRows = [];
  for (const [k, ts] of Object.entries(local.checks || {})) {
    const [rep, wid, del] = k.split("|");
    if (!rep || !wid || !del) continue;
    checkRows.push({
      rep_id: rep,
      week_index: weekIdToIdx(wid),
      deliverable_id: del,
      checked_at: typeof ts === "string" ? ts : new Date().toISOString(),
    });
  }
  const askRows = [];
  for (const [k, val] of Object.entries(local.asks || {})) {
    const [rep, wid, del] = k.split("|");
    if (!rep || !wid || !del) continue;
    const text = typeof val === "string" ? val : (val && val.text);
    if (!text) continue;
    askRows.push({ rep_id: rep, week_index: weekIdToIdx(wid), deliverable_id: del, body: text });
  }

  if (checkRows.length) {
    await sb.from("checks").upsert(checkRows, { onConflict: "rep_id,week_index,deliverable_id", ignoreDuplicates: true });
  }
  if (askRows.length) {
    await sb.from("asks").upsert(askRows, { onConflict: "rep_id,week_index,deliverable_id", ignoreDuplicates: true });
  }

  localStorage.setItem(MIGRATED_KEY, new Date().toISOString());
  return { migrated: true, checks: checkRows.length, asks: askRows.length };
}

// ============================================================
// AUTH — magic link
// ============================================================
async function getSession() {
  const sb = client();
  const { data } = await sb.auth.getSession();
  return data.session || null;
}

async function getMyUser(sessionUser) {
  const sb = client();
  // Accept sessionUser from the caller to skip the sb.auth.getUser() network
  // round-trip when we already have the user from an onAuthStateChange event.
  const user = sessionUser || (await sb.auth.getUser()).data.user;
  if (!user) return null;
  const { data, error } = await sb.from("users").select("*").eq("auth_id", user.id).maybeSingle();
  if (error) console.error("getMyUser", error);
  return data ? { ...data, authEmail: user.email } : { auth_id: user.id, email: user.email, rep_id: null, role: "rep", authEmail: user.email };
}

async function sendMagicLink(email) {
  const sb = client();
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + window.location.pathname },
  });
  return { ok: !error, error: error && error.message };
}

// Verify the 6-digit OTP code from the magic-link email. Used when corporate
// link scanners (Microsoft Safe Links / Teams) consume the URL token before
// the human can click it — same token, just delivered to verifyOtp instead of
// /verify via the URL fragment.
async function verifyEmailOtp(email, code) {
  const sb = client();
  const { error } = await sb.auth.verifyOtp({
    email,
    token: String(code || "").trim(),
    type: "email",
  });
  return { ok: !error, error: error && error.message };
}

async function signOut() {
  const sb = client();
  // scope: 'local' — only sign out this device. Default 'global' invalidates
  // every device's session for this user, which surprises people who have
  // the app open on phone + laptop.
  await sb.auth.signOut({ scope: "local" });
  location.reload();
}

function onAuthChange(cb) {
  const sb = client();
  // Forward the event type. The gate needs to tell first sign-in
  // (INITIAL_SESSION / SIGNED_IN) apart from routine background maintenance
  // (TOKEN_REFRESHED / USER_UPDATED) so a refresh can't tear down a live session.
  const { data: { subscription } } = sb.auth.onAuthStateChange((evt, session) => cb(evt, session));
  return () => subscription.unsubscribe();
}

// Legacy honor-system rep picker (kept as fallback if auth disabled)
const REP_KEY = "weekly-review-rep-id";
function getCurrentRep()   { return localStorage.getItem(REP_KEY) || ""; }
function setCurrentRep(id) { id ? localStorage.setItem(REP_KEY, id) : localStorage.removeItem(REP_KEY); }

// ============================================================
// STANDUP — Tue/Thu intake. One row per (date, rep_id) with 4 prompt fields
// + parsed mentions[]. RLS: read all, write own row (manager writes any).
// ============================================================

// Load all entries for a given YYYY-MM-DD date. Returns { rep_id: row } map.
async function loadStandupForDate(dateStr) {
  const sb = client();
  const { data, error } = await sb.from("standup_entries").select("*").eq("date", dateStr);
  if (error) { console.error("loadStandupForDate", error); return {}; }
  const out = {};
  for (const r of (data || [])) out[r.rep_id] = r;
  return out;
}

// Save one field of one rep's standup row. Upserts on (date, rep_id).
// `mentions` is the full mentions array for the row across all 4 fields,
// computed by the caller from the merged text (so it stays consistent even
// when only one field is being edited).
async function saveStandupField(dateStr, repId, field, value, mentions, updatedByEmail) {
  const allowed = new Set(["what_moved", "pushing_next", "whats_slowing", "what_i_need"]);
  if (!allowed.has(field)) throw new Error("invalid standup field: " + field);
  const sb = client();
  const row = {
    date: dateStr,
    rep_id: repId,
    [field]: value || "",
    mentions: mentions || [],
    updated_at: new Date().toISOString(),
    updated_by: updatedByEmail || null,
  };
  const { error } = await sb.from("standup_entries").upsert(row, { onConflict: "date,rep_id" });
  if (error) console.error("saveStandupField", error);
}

// Subscribe to all changes on a single date. Callback fires with the new row
// any time someone else updates an entry for that day.
function subscribeStandupChanges(dateStr, onRow) {
  const sb = client();
  const channel = sb.channel(`standup-${dateStr}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "standup_entries", filter: `date=eq.${dateStr}` },
      (payload) => { if (payload.new) onRow(payload.new); }
    )
    .subscribe();
  return () => sb.removeChannel(channel);
}

// ── WINS ─────────────────────────────────────────────────────────────────────
// weekIndex is a plain integer (Apr 27 2026 = 1). NOT a "w1" string.

async function loadWins(weekIndex, repId) {
  const sb = client();
  const { data, error } = await sb
    .from("wins").select("*")
    .eq("rep_id", repId).eq("week_index", weekIndex).maybeSingle();
  if (error) { console.error("loadWins", error); return null; }
  if (!data) return null;
  return {
    worked_on:  data.worked_on  || [],
    invisible:  data.invisible  || [],
    big_win:    data.big_win    || { win: "", why: "" },
    hype:       data.hype       || [],
    updated_at: data.updated_at || null,
    updated_by: data.updated_by || null,
  };
}

async function loadAllWinsForWeek(weekIndex) {
  const sb = client();
  const { data, error } = await sb.from("wins").select("*").eq("week_index", weekIndex);
  if (error) { console.error("loadAllWinsForWeek", error); return {}; }
  const out = {};
  for (const row of (data || [])) {
    out[row.rep_id] = {
      worked_on: row.worked_on || [], invisible: row.invisible || [],
      big_win: row.big_win || { win:"", why:"" }, hype: row.hype || [],
      updated_at: row.updated_at || null, updated_by: row.updated_by || null,
    };
  }
  return out;
}

async function saveWins(weekIndex, repId, formData, updatedByEmail) {
  const sb = client();
  const { error } = await sb.from("wins").upsert(
    {
      rep_id: repId, week_index: weekIndex,
      worked_on: formData.worked_on || [], invisible: formData.invisible || [],
      big_win: formData.big_win || {}, hype: formData.hype || [],
      updated_at: new Date().toISOString(), updated_by: updatedByEmail || null,
    },
    { onConflict: "rep_id,week_index" }
  );
  if (error) { console.error("saveWins", error); throw error; }
}

function subscribeWinsChanges(weekIndex, onRow) {
  const sb = client();
  const channel = sb.channel(`wins-wi${weekIndex}`)
    .on("postgres_changes",
      { event: "*", schema: "public", table: "wins", filter: `week_index=eq.${weekIndex}` },
      (payload) => { if (payload.new) onRow(payload.new); })
    .subscribe();
  return () => sb.removeChannel(channel);
}

// ============================================================
// ATTAINMENT — load latest snapshot per rep
// Returns array of rows, one per rep, sorted by rep_id.
// ============================================================
async function loadAttainment() {
  const sb = client();
  const { data, error } = await sb
    .from("attainment_snapshot")
    .select("*")
    .order("rep_id", { ascending: true })
    .order("synced_at", { ascending: false });

  if (error) { console.error("loadAttainment", error); return []; }

  const seen = new Set();
  const latest = [];
  for (const row of (data || [])) {
    if (!seen.has(row.rep_id)) {
      seen.add(row.rep_id);
      latest.push(row);
    }
  }
  return latest;
}

// ============================================================
// ATTAINMENT — derive % values from raw snapshot row
// Returns { type: "newbiz" | "cs", mtd, qtd, ytd, ... } or null.
// CS branch falls back to renewal-only when expansion target is
// missing, so a half-populated row doesn't poison the blend.
// ============================================================
function deriveAttainmentPcts(row) {
  if (!row) return null;

  if (row.nb_annual_target) {
    const target = row.nb_annual_target;
    const mtdTarget = target / 12;
    const qtdTarget = target / 4;
    return {
      type: "newbiz",
      mtd: Math.round((row.nb_mtd_won / mtdTarget) * 100),
      qtd: Math.round((row.nb_qtd_won / qtdTarget) * 100),
      ytd: Math.round((row.nb_ytd_won / target)    * 100),
    };
  }

  const renMtd = Math.round(row.ren_mtd_pct || 0);
  const renQtd = Math.round(row.ren_qtd_pct || 0);
  const renYtd = Math.round(row.ren_ytd_pct || 0);

  const hasExp = row.exp_annual_target && row.exp_annual_target > 0;
  const expMtd = hasExp ? Math.round((row.exp_mtd_won / (row.exp_annual_target / 12)) * 100) : 0;
  const expQtd = hasExp ? Math.round((row.exp_qtd_won / (row.exp_annual_target / 4))  * 100) : 0;
  const expYtd = hasExp ? Math.round((row.exp_ytd_won /  row.exp_annual_target)       * 100) : 0;

  const wRen = hasExp ? 0.7 : 1.0;
  const wExp = hasExp ? 0.3 : 0.0;

  return {
    type: "cs",
    mtd: Math.round(renMtd * wRen + expMtd * wExp),
    qtd: Math.round(renQtd * wRen + expQtd * wExp),
    ytd: Math.round(renYtd * wRen + expYtd * wExp),
    ren_mtd: renMtd, ren_qtd: renQtd, ren_ytd: renYtd,
    exp_mtd: expMtd, exp_qtd: expQtd, exp_ytd: expYtd,
  };
}

// ============================================================
// EXPORT GLOBALS
// ============================================================
Object.assign(window, {
  getSupabaseClient: client,
  SUPABASE_CONFIGURED,
  loadStateFromSupabase,
  toggleCheckSupabase,
  setAskSupabase,
  reopenAskSupabase,
  setAskResponseSupabase,
  setManagerNoteSupabase,
  subscribeRealtime,
  migrateLocalToSupabase,
  getCurrentRep,
  setCurrentRep,
  getSession,
  getMyUser,
  sendMagicLink,
  verifyEmailOtp,
  signOut,
  onAuthChange,
  loadStandupForDate,
  saveStandupField,
  subscribeStandupChanges,
  loadWins,
  loadAllWinsForWeek,
  saveWins,
  subscribeWinsChanges,
  loadAttainment,
  deriveAttainmentPcts,
});
