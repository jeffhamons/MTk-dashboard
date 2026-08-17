// Manager flag-close suite.
//
// Covers the two halves of "the manager can close an open flag":
//   1. AUTHORITY — window.canCloseFlag (src/data-model.js) decides who may
//      close. It is canManageRep minus the self-edit branch: a flag is an
//      escalation, so the rep who raised it must not be able to clear it.
//   2. WRITE PATH — window.setAskSupabase (src/supabase-client.js) with empty
//      text must SOFT-close: an UPDATE stamping resolved_at + resolved_by_*
//      on the still-open row. Never a DELETE — the row survives for the
//      Resolved log.
//
// Run: node --test tests/flag-close.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const dmSandbox = { window: {} };
vm.createContext(dmSandbox);
vm.runInContext(readFileSync(path.join(here, "..", "src", "data-model.js"), "utf8"),
  dmSandbox, { filename: "data-model.js" });
const dm = dmSandbox.window;

// ── Personas (same identities as the RFC-151 RBAC matrix suite) ───────────
const jeff   = { role: "manager",    rep_id: null };
const cammy  = { role: "rep",        rep_id: "cammy" };   // NA BD rep
const dwayne = { role: "rep",        rep_id: "dwayne" };  // CS rep
const lara   = { role: "team_admin", rep_id: null,
                 adminScopes: [{ team_id: "cs", region: "US" }, { team_id: "cs", region: "EMEA" }] };

const CS_REP_IDS     = dm.REPS.filter(r => r.team === "cs").map(r => r.id);
const NEWBIZ_REP_IDS = dm.REPS.filter(r => r.team === "newbiz").map(r => r.id);

test("the global manager can close a flag on any rep", () => {
  for (const repId of dm.REPS.map(r => r.id)) {
    assert.equal(dm.canCloseFlag(jeff, repId), true, `jeff → ${repId}`);
  }
});

test("a rep cannot close the flag they raised", () => {
  // The escalation rule. canManageRep says true here (self-edit); canCloseFlag
  // must not — otherwise a rep can silently clear their own escalation.
  assert.equal(dm.canManageRep(cammy, "cammy"), true, "self-edit still holds elsewhere");
  assert.equal(dm.canCloseFlag(cammy, "cammy"), false);
  assert.equal(dm.canCloseFlag(dwayne, "dwayne"), false);
});

test("a rep cannot close anyone else's flag either", () => {
  for (const repId of dm.REPS.map(r => r.id)) {
    assert.equal(dm.canCloseFlag(cammy, repId), false, `cammy → ${repId}`);
    assert.equal(dm.canCloseFlag(dwayne, repId), false, `dwayne → ${repId}`);
  }
});

test("a team_admin closes only inside their team+region scope", () => {
  // Mirrors the asks UPDATE policy in db/migration-team-rbac-rls.sql, which
  // already grants team_admin the write — no schema change needed.
  for (const repId of CS_REP_IDS) {
    const rep = dm.repById(repId);
    const inScope = lara.adminScopes.some(s => s.team_id === rep.team && s.region === rep.region);
    assert.equal(dm.canCloseFlag(lara, repId), inScope, `lara → ${repId} (${rep.region})`);
  }
  for (const repId of NEWBIZ_REP_IDS) {
    assert.equal(dm.canCloseFlag(lara, repId), false, `lara → ${repId} (out of team)`);
  }
});

test("no user, an unknown rep, or scopes without the role close nothing", () => {
  assert.equal(dm.canCloseFlag(null, "cammy"), false);
  assert.equal(dm.canCloseFlag(lara, "not-a-rep"), false);
  // adminScopes grant nothing unless role is actually team_admin (ratification R1).
  assert.equal(dm.canCloseFlag({ role: "rep", rep_id: "x", adminScopes: lara.adminScopes }, "dwayne"), false);
});

// ── Write path ────────────────────────────────────────────────────────────
// Minimal Supabase stub recording the call chain setAskSupabase builds.
function loadSupabaseClient() {
  const calls = [];
  const chain = (table, op) => {
    const rec = { table, op, payload: undefined, match: undefined, isNull: [], opts: undefined };
    calls.push(rec);
    const self = {
      update: (p) => { rec.payload = p; return self; },
      upsert: (p, o) => { rec.payload = p; rec.opts = o; return self; },
      match: (m) => { rec.match = m; return self; },
      is: (col, val) => { rec.isNull.push([col, val]); return self; },
      then: (res) => res({ error: null }),
    };
    return self;
  };
  const sandbox = {
    window: {
      supabase: {
        createClient: () => ({
          from: (table) => ({
            update: (p) => chain(table, "update").update(p),
            upsert: (p, o) => chain(table, "upsert").upsert(p, o),
            delete: () => chain(table, "delete"),
            select: () => chain(table, "select"),
          }),
        }),
      },
    },
    console,
    navigator: { locks: { request: (n, o, fn) => fn() } },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    document: { addEventListener: () => {} },
    AbortSignal,
    URLSearchParams,
    setTimeout, clearTimeout, setInterval, clearInterval,
  };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(path.join(here, "..", "src", "supabase-client.js"), "utf8"),
    sandbox, { filename: "supabase-client.js" });
  return { sb: sandbox.window, calls };
}

test("closing a flag soft-resolves the row with attribution — never deletes it", async () => {
  const { sb, calls } = loadSupabaseClient();
  await sb.setAskSupabase("cammy", "w16", "standup", "", {
    email: "jeff@example.com", name: "jeff", role: "manager",
  });

  assert.equal(calls.length, 1);
  const c = calls[0];
  assert.equal(c.table, "asks");
  assert.equal(c.op, "update", "a close must be an UPDATE, not a DELETE");
  assert.equal(typeof c.payload.resolved_at, "string");
  assert.equal(c.payload.resolved_by_email, "jeff@example.com");
  assert.equal(c.payload.resolved_by_name, "jeff");
  assert.equal(c.payload.resolved_by_role, "manager");
  // The body is untouched — the flag text survives for the Resolved log.
  assert.equal("body" in c.payload, false);
  assert.deepEqual({ ...c.match }, { rep_id: "cammy", week_index: 16, deliverable_id: "standup" });
  // Only an open row is stamped, so a second close can't overwrite the first.
  assert.deepEqual(c.isNull, [["resolved_at", null]]);
});

test("raising the same flag again reopens the row", () => {
  const { sb, calls } = loadSupabaseClient();
  sb.setAskSupabase("cammy", "w16", "standup", "Need pricing sign-off", null);
  const c = calls[0];
  assert.equal(c.op, "upsert");
  assert.equal(c.payload.body, "Need pricing sign-off");
  assert.equal(c.payload.resolved_at, null);
  assert.equal(c.payload.resolved_by_email, null);
});
