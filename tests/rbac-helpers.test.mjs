// RFC-151 Phase 3 — client-side RBAC helper tests.
// Run: node --test weekly-review-dashboard/tests/
//
// canManageRep/canManageAny are the CLIENT MIRROR of the Phase 2 RLS
// predicates (db/migration-team-rbac-rls.sql). Both must agree; RLS is the
// enforcement backstop if they drift. These tests pin the mirror to the
// same truth table the SQL matrix (db/test-team-rbac-rls.sql) proves
// server-side — including ratification R1: a team_admins scope grants
// nothing unless users.role is also 'team_admin'.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(here, "..", "src", "data-model.js"), "utf8");

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: "data-model.js" });
const dm = sandbox.window;

const manager = { role: "manager", rep_id: null };
const bdRep = { role: "rep", rep_id: "cammy" };
const csRep = { role: "rep", rep_id: "dwayne" };
const lara = { role: "team_admin", rep_id: null, adminScopes: [{ team_id: "cs", region: "US" }, { team_id: "cs", region: "EMEA" }] };

test("REPS[] entries all carry a team that exists in TEAMS", () => {
  assert.ok(Array.isArray(dm.TEAMS) && dm.TEAMS.length >= 2, "TEAMS missing");
  const teamIds = new Set(dm.TEAMS.map(t => t.id));
  assert.ok(teamIds.has("newbiz") && teamIds.has("cs"));
  for (const rep of dm.REPS) {
    assert.ok(teamIds.has(rep.team), `rep ${rep.id} has no valid team (got ${rep.team})`);
  }
  assert.equal(dm.REPS.find(r => r.id === "dwayne").team, "cs");
  assert.equal(dm.REPS.find(r => r.id === "meri").team, "cs");
  assert.equal(dm.REPS.find(r => r.id === "cammy").team, "newbiz");
  for (const t of dm.TEAMS) {
    assert.equal(typeof t.short, "string", `team ${t.id} needs workspace short label`);
    assert.equal(typeof t.eyebrow, "string", `team ${t.id} needs workspace eyebrow copy`);
  }
});

test("global manager manages every rep", () => {
  assert.equal(dm.canManageRep(manager, "cammy"), true);
  assert.equal(dm.canManageRep(manager, "dwayne"), true);
  assert.equal(dm.canManageRep(manager, "rory"), true);
});

test("plain rep manages only themself", () => {
  assert.equal(dm.canManageRep(bdRep, "cammy"), true, "self-edit applies");
  assert.equal(dm.canManageRep(bdRep, "farah"), false, "peer-marking removed");
  assert.equal(dm.canManageRep(bdRep, "dwayne"), false, "cross-team denied");
});

test("covering team_admin manages exactly her scoped reps", () => {
  assert.equal(dm.canManageRep(lara, "dwayne"), true);
  assert.equal(dm.canManageRep(lara, "meri"), true);
  assert.equal(dm.canManageRep(lara, "cammy"), false, "NA BD must stay invisible — THE hard constraint");
  assert.equal(dm.canManageRep(lara, "rory"), false, "newbiz EMEA not covered");
});

test("region is part of the scope: cs/EMEA-only admin does not cover US CS reps", () => {
  const emeaOnly = { role: "team_admin", rep_id: null, adminScopes: [{ team_id: "cs", region: "EMEA" }] };
  assert.equal(dm.canManageRep(emeaOnly, "dwayne"), false);
});

test("R1 mirror: adminScopes without role='team_admin' grant nothing", () => {
  const strayScopes = { role: "rep", rep_id: null, adminScopes: [{ team_id: "cs", region: "US" }] };
  assert.equal(dm.canManageRep(strayScopes, "dwayne"), false);
});

test("degenerate inputs fail closed", () => {
  assert.equal(dm.canManageRep(null, "cammy"), false);
  assert.equal(dm.canManageRep({ role: "team_admin", rep_id: null }, "dwayne"), false, "no scopes");
  assert.equal(dm.canManageRep(lara, "nonexistent-rep"), false, "unknown rep");
});

test("canManageAny: gates manager-parity UI", () => {
  assert.equal(dm.canManageAny(manager), true);
  assert.equal(dm.canManageAny(lara), true);
  assert.equal(dm.canManageAny(bdRep), false);
  assert.equal(dm.canManageAny(csRep), false);
  assert.equal(dm.canManageAny({ role: "team_admin", rep_id: null, adminScopes: [] }), false);
  assert.equal(dm.canManageAny(null), false);
});

test("isManagerialRole: attribution stamps for managers and team admins", () => {
  assert.equal(dm.isManagerialRole("manager"), true);
  assert.equal(dm.isManagerialRole("team_admin"), true);
  assert.equal(dm.isManagerialRole("rep"), false);
  assert.equal(dm.isManagerialRole(null), false);
  assert.equal(dm.isManagerialRole(undefined), false);
});

// ── Phase 4: workspace model ────────────────────────────────────────────────

test("teamsForUser: manager gets every team, admins their scopes, reps their own", () => {
  // Array.from: results are arrays from the vm realm — rebase them onto the
  // host realm's Array.prototype so strict deepEqual compares values only.
  const teams = u => Array.from(dm.teamsForUser(u));
  assert.deepEqual(teams(manager), ["newbiz", "cs"], "global manager sees ALL teams");
  assert.deepEqual(teams(lara), ["cs"], "scopes dedupe across regions");
  assert.deepEqual(teams(bdRep), ["newbiz"]);
  assert.deepEqual(teams(csRep), ["cs"]);
  assert.deepEqual(teams(null), []);
  assert.deepEqual(teams({ role: "team_admin", rep_id: null, adminScopes: [] }), []);
});

test("defaultTeamForUser: landing workspace per persona", () => {
  assert.equal(dm.defaultTeamForUser(manager), "newbiz", "Jeff lands where he lands today");
  assert.equal(dm.defaultTeamForUser(lara), "cs", "single-team admin lands directly in her section");
  assert.equal(dm.defaultTeamForUser(csRep), "cs");
  assert.equal(dm.defaultTeamForUser(bdRep), "newbiz");
  assert.equal(dm.defaultTeamForUser(null), "newbiz");
});

test("repsByRegion team filter scopes the grouping and stays back-compatible", () => {
  const wk = 10;
  const flat = m => Object.values(m).flat().map(r => r.id).sort();
  const all = flat(dm.repsByRegion(wk));
  const nb = flat(dm.repsByRegion(wk, "newbiz"));
  const cs = flat(dm.repsByRegion(wk, "cs"));
  assert.deepEqual(all, [...nb, ...cs].sort(), "no filter = union of both teams");
  assert.ok(cs.includes("dwayne") && cs.includes("meri"));
  for (const id of cs) assert.equal(dm.repById(id).team, "cs");
  for (const id of nb) assert.equal(dm.repById(id).team, "newbiz");
  assert.ok(!nb.includes("dwayne") && !nb.includes("meri"), "CS reps out of the BD workspace");
});
