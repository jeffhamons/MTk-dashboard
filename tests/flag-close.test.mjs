// Two-key flag-close suite.
//
// A flag closes only when BOTH the rep who raised it and the manager (or a
// covering team_admin) have marked it resolved, in either order. Covers:
//   1. AUTHORITY — who may sign which side (canCloseFlag / flagCloseSide).
//   2. THE RULE — when a signature completes the close, and who a
//      half-signed flag is waiting on (flagCloseCompletes /
//      flagCloseWaitingOn / flagNeedsBothKeys).
//   3. WRITE PATH — castFlagCloseVoteSupabase writes only its own side's
//      stamp columns, and only stamps resolved_at when the vote completes.
//      A close is always an UPDATE, never a DELETE — the row survives for
//      the Resolved log. Re-raising and reopening withdraw both signatures.
//
// The client mirrors the trigger in db/migration-two-key-flag-close.sql;
// keep the two in lockstep.
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

test("the global manager may sign the manager side on any rep", () => {
  for (const repId of dm.REPS.map(r => r.id)) {
    assert.equal(dm.canCloseFlag(jeff, repId), true, `jeff → ${repId}`);
  }
});

test("a rep cannot sign the manager side of their own flag", () => {
  // The escalation rule. canManageRep says true here (self-edit); canCloseFlag
  // must not — otherwise a rep's own signature would close their escalation.
  assert.equal(dm.canManageRep(cammy, "cammy"), true, "self-edit still holds elsewhere");
  assert.equal(dm.canCloseFlag(cammy, "cammy"), false);
  assert.equal(dm.canCloseFlag(dwayne, "dwayne"), false);
});

test("a rep cannot sign the manager side of anyone else's flag either", () => {
  for (const repId of dm.REPS.map(r => r.id)) {
    assert.equal(dm.canCloseFlag(cammy, repId), false, `cammy → ${repId}`);
    assert.equal(dm.canCloseFlag(dwayne, repId), false, `dwayne → ${repId}`);
  }
});

test("a team_admin signs the manager side only inside their team+region scope", () => {
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

test("no user, an unknown rep, or scopes without the role sign nothing", () => {
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


// ── Which side does a viewer sign? ────────────────────────────────────────
test("your signature side is decided by who you are", () => {
  assert.equal(dm.flagCloseSide(jeff, "cammy"), "manager");
  assert.equal(dm.flagCloseSide(lara, "dwayne"), "manager");   // in-scope admin
  assert.equal(dm.flagCloseSide(lara, "cammy"), null);         // out of scope
  assert.equal(dm.flagCloseSide(cammy, "cammy"), "rep");       // the rep who raised it
  assert.equal(dm.flagCloseSide(cammy, "dwayne"), null);       // a peer signs nothing
  assert.equal(dm.flagCloseSide(null, "cammy"), null);
});

// ── The rule ──────────────────────────────────────────────────────────────
test("onboarding access notes stay one-signature; everything else takes two", () => {
  assert.equal(dm.flagNeedsBothKeys("standup"), true);
  assert.equal(dm.flagNeedsBothKeys("weekly-wins"), true);
  assert.equal(dm.flagNeedsBothKeys("onboarding:salesforce"), false);
  assert.equal(dm.flagNeedsBothKeys(""), true);
});

test("one signature does not close a flag — the second one does", () => {
  const unsigned  = { text: "Need pricing sign-off", closeVotes: {} };
  const repSigned = { text: "Need pricing sign-off", closeVotes: { rep: { at: "t1" } } };
  const mgrSigned = { text: "Need pricing sign-off", closeVotes: { manager: { at: "t1" } } };

  // First signature, either order: not done.
  assert.equal(dm.flagCloseCompletes(unsigned, "standup", "rep"), false);
  assert.equal(dm.flagCloseCompletes(unsigned, "standup", "manager"), false);
  // Second signature, either order: done.
  assert.equal(dm.flagCloseCompletes(repSigned, "standup", "manager"), true);
  assert.equal(dm.flagCloseCompletes(mgrSigned, "standup", "rep"), true);
  // Re-signing your own side does not close it — the other side is still out.
  assert.equal(dm.flagCloseCompletes(repSigned, "standup", "rep"), false);
  assert.equal(dm.flagCloseCompletes(mgrSigned, "standup", "manager"), false);
  // Exempt flags close on the first signature.
  assert.equal(dm.flagCloseCompletes(unsigned, "onboarding:vpn", "rep"), true);
});

test("a half-signed flag reports who it is waiting on", () => {
  assert.equal(dm.flagCloseWaitingOn({ closeVotes: {} }, "standup"), null);
  assert.equal(dm.flagCloseWaitingOn({ closeVotes: { rep: { at: "t" } } }, "standup"), "manager");
  assert.equal(dm.flagCloseWaitingOn({ closeVotes: { manager: { at: "t" } } }, "standup"), "rep");
  assert.equal(dm.flagCloseWaitingOn({ closeVotes: { rep: { at: "t" } } }, "onboarding:vpn"), null);
  assert.equal(dm.flagCloseWaitingOn(undefined, "standup"), null);
});

// ── Write path ────────────────────────────────────────────────────────────
test("a first signature stamps only its own side and leaves the flag open", async () => {
  const { sb, calls } = loadSupabaseClient();
  await sb.castFlagCloseVoteSupabase("cammy", "w16", "standup", "manager",
    { email: "jeff@example.com", name: "jeff", role: "manager" }, false);

  assert.equal(calls.length, 1, "no completing write when the other side hasn't signed");
  const c = calls[0];
  assert.equal(c.table, "asks");
  assert.equal(c.op, "update", "a close must be an UPDATE, not a DELETE");
  assert.equal(typeof c.payload.mgr_closed_at, "string");
  assert.equal(c.payload.mgr_closed_by_email, "jeff@example.com");
  assert.equal(c.payload.mgr_closed_by_role, "manager");
  // The manager never writes the rep's side, and the flag is not resolved yet.
  assert.equal("rep_closed_at" in c.payload, false);
  assert.equal("resolved_at" in c.payload, false);
  assert.deepEqual({ ...c.match }, { rep_id: "cammy", week_index: 16, deliverable_id: "standup" });
  assert.deepEqual(c.isNull, [["resolved_at", null]]);
});

test("a rep's signature writes only the rep columns", async () => {
  const { sb, calls } = loadSupabaseClient();
  await sb.castFlagCloseVoteSupabase("cammy", "w16", "standup", "rep",
    { email: "cammy@example.com", name: "cammy", role: "rep" }, false);

  const c = calls[0];
  assert.equal(typeof c.payload.rep_closed_at, "string");
  assert.equal(c.payload.rep_closed_by_email, "cammy@example.com");
  assert.equal("mgr_closed_at" in c.payload, false, "a rep never signs the manager side");
  assert.equal("resolved_at" in c.payload, false);
});

test("the completing signature soft-resolves the row — never deletes it", async () => {
  const { sb, calls } = loadSupabaseClient();
  await sb.castFlagCloseVoteSupabase("cammy", "w16", "standup", "manager",
    { email: "jeff@example.com", name: "jeff", role: "manager" }, true);

  assert.equal(calls.length, 2, "sign, then close");
  const [vote, close] = calls;
  assert.equal(typeof vote.payload.mgr_closed_at, "string");
  assert.equal(close.op, "update");
  assert.equal(typeof close.payload.resolved_at, "string");
  assert.equal(close.payload.resolved_by_email, "jeff@example.com");
  assert.equal(close.payload.resolved_by_role, "manager");
  // The body is untouched — the flag text survives for the Resolved log.
  assert.equal("body" in close.payload, false);
  assert.deepEqual(close.isNull, [["resolved_at", null]]);
});

test("raising the same flag again reopens it and withdraws both signatures", () => {
  const { sb, calls } = loadSupabaseClient();
  sb.setAskSupabase("cammy", "w16", "standup", "Need pricing sign-off", null);
  const c = calls[0];
  assert.equal(c.op, "upsert");
  assert.equal(c.payload.body, "Need pricing sign-off");
  assert.equal(c.payload.resolved_at, null);
  assert.equal(c.payload.rep_closed_at, null);
  assert.equal(c.payload.mgr_closed_at, null);
});

test("reopening a closed flag withdraws both signatures", () => {
  const { sb, calls } = loadSupabaseClient();
  sb.reopenAskSupabase("cammy", "w16", "standup");
  const c = calls[0];
  assert.equal(c.op, "update");
  assert.equal(c.payload.resolved_at, null);
  assert.equal(c.payload.rep_closed_at, null);
  assert.equal(c.payload.mgr_closed_at, null);
  assert.equal(c.payload.mgr_closed_by_role, null);
});
