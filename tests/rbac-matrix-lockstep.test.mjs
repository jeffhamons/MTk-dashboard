// RFC-151 RBAC matrix lockstep suite.
//
// Encodes the SQL truth-table (db/test-team-rbac-rls.sql) persona-level
// access expectations as DATA and asserts the client mirror helpers
// (canManageRep / canManageAny / isManagerialRole / teamsForUser /
// defaultTeamForUser in src/data-model.js) reproduce them exactly. If a
// future predicate change diverges from the matrix — on either the
// Postgres RLS side or the client side — a test fails here.
//
// Run: node --test weekly-review-dashboard/tests/rbac-matrix-lockstep.test.mjs

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

// ── Personas (mirror the SQL truth-table identities) ──────────────────────
// Jeff   — global manager (role=manager), bypasses all scope checks
// Cammy  — NA BD rep (role=rep, rep_id=cammy, team=newbiz)
// Dwayne — CS rep (role=rep, rep_id=dwayne, team=cs)
// Lara   — team_admin with scopes (cs,US)+(cs,EMEA)
const jeff   = { role: "manager",    rep_id: null };
const cammy  = { role: "rep",        rep_id: "cammy" };
const dwayne = { role: "rep",        rep_id: "dwayne" };
const lara   = { role: "team_admin", rep_id: null,
                 adminScopes: [{ team_id: "cs", region: "US" }, { team_id: "cs", region: "EMEA" }] };

// ── Derived rosters from the real exported REPS[] ─────────────────────────
// Building from REPS (not hardcoding all 17 ids) means the suite tracks
// roster changes — a new CS rep is automatically tested against Jeff (true),
// Lara (true), and Cammy/Dwayne (false).
const ALL_REP_IDS    = dm.REPS.map(r => r.id);
const CS_REP_IDS     = dm.REPS.filter(r => r.team === "cs").map(r => r.id);
const NEWBIZ_REP_IDS = dm.REPS.filter(r => r.team === "newbiz").map(r => r.id);

// ── MATRIX: persona-level access expectations from the SQL truth-table ────
// Each case: { persona, user, targetRep, expected, note }
// Derived from db/test-team-rbac-rls.sql scenarios 1–4 + 6.
const MATRIX = [];

// Scenario 1: Jeff (global manager) manages EVERY rep in the roster.
for (const repId of ALL_REP_IDS) {
  MATRIX.push({ persona: "Jeff", user: jeff, targetRep: repId, expected: true,
                note: "global manager bypass" });
}

// Scenario 2 + 6b: Cammy (NA BD rep) manages only herself. Owner-write model
// removes peer-marking — same-team peer farah is explicitly FALSE.
MATRIX.push({ persona: "Cammy", user: cammy, targetRep: "cammy", expected: true,
               note: "self-edit (owner-write)" });
for (const repId of ALL_REP_IDS) {
  if (repId === "cammy") continue;
  const namedNote = {
    farah:  "same-team peer — owner-write removes peer-marking",
    dwayne: "cross-team CS denied",
    meri:   "cross-team CS denied",
    laura:  "cross-team CS denied",
  }[repId];
  MATRIX.push({ persona: "Cammy", user: cammy, targetRep: repId, expected: false,
                note: namedNote || "non-self rep denied" });
}

// Scenario 3 + 6c: Dwayne (CS rep) manages only himself. Same-team peer meri
// is explicitly FALSE ($ isolation / owner-only detail).
MATRIX.push({ persona: "Dwayne", user: dwayne, targetRep: "dwayne", expected: true,
               note: "self-edit (owner-write)" });
for (const repId of ALL_REP_IDS) {
  if (repId === "dwayne") continue;
  const namedNote = {
    meri:  "same-team peer — $ isolation (owner-only detail)",
    cammy: "cross-team BD denied",
  }[repId];
  MATRIX.push({ persona: "Dwayne", user: dwayne, targetRep: repId, expected: false,
                note: namedNote || "non-self rep denied" });
}

// Scenario 4 + 6g: Lara (team_admin cs×US,EMEA only — not APAC per Jeff 2026-07-10)
// manages US CS (dwayne, meri) + EMEA CS five. APAC CS are out of scope.
const LARA_CS_REGIONS = new Set(["US", "EMEA"]);
for (const repId of CS_REP_IDS) {
  const rep = dm.repById(repId);
  const covered = LARA_CS_REGIONS.has(rep.region);
  MATRIX.push({ persona: "Lara", user: lara, targetRep: repId, expected: covered,
                note: covered
                  ? "covering team_admin scope"
                  : "APAC CS out of Lara's US+EMEA scopes" });
}
// Scenario 4 + 6h: Lara manages ZERO newbiz reps — THE hard constraint.
for (const repId of NEWBIZ_REP_IDS) {
  const namedNote = {
    cammy: "NA BD — THE hard constraint",
    farah: "NA BD — THE hard constraint",
  }[repId];
  MATRIX.push({ persona: "Lara", user: lara, targetRep: repId, expected: false,
                note: namedNote || "newbiz not in scope" });
}
// ── Matrix iteration: one test() per persona ──────────────────────────────
const personas = [...new Set(MATRIX.map(c => c.persona))];

for (const persona of personas) {
  const cases = MATRIX.filter(c => c.persona === persona);
  test(`${persona}: canManageRep matches SQL truth-table (${cases.length} cases)`, () => {
    assert.ok(cases.length > 0, `no matrix cases for ${persona}`);
    for (const c of cases) {
      const msg = `${c.persona}\u2192${c.targetRep} expect=${c.expected} \u2014 ${c.note}`;
      assert.equal(dm.canManageRep(c.user, c.targetRep), c.expected, msg);
    }
  });
}

// ── R1 role-tie: Lara's exact scopes but role='rep' manages nothing but self
// Mirrors SQL R1 guard (scenario 4 tail): flipping users.role off 'team_admin'
// while keeping the team_admins rows must revoke all covering access.
test("R1 role-tie: Lara's scopes with role='rep' manage nothing but self", () => {
  const laraR1 = { ...lara, role: "rep" };
  // lara has rep_id: null → manages NOTHING at all (adminScopes are inert)
  for (const repId of CS_REP_IDS) {
    assert.equal(dm.canManageRep(laraR1, repId), false,
      `R1: role flipped to 'rep' but still manages CS rep ${repId}`);
  }
  for (const repId of NEWBIZ_REP_IDS) {
    assert.equal(dm.canManageRep(laraR1, repId), false,
      `R1: ${repId} must be denied`);
  }
  // "but themself": if the R1 user HAD a rep_id, self-edit still works —
  // the adminScopes grant nothing, but owner-write is independent.
  const laraR1WithRep = { ...lara, role: "rep", rep_id: "dwayne" };
  assert.equal(dm.canManageRep(laraR1WithRep, "dwayne"), true,
    "R1: self-edit still applies when role='rep'");
  assert.equal(dm.canManageRep(laraR1WithRep, "meri"), false,
    "R1: same-team peer still denied despite inert scopes");
});

// ── Named CS reps are present in the derived roster ───────────────────────
test("derived CS roster includes NA + EMEA + APAC CS (12 total)", () => {
  const emeaCs = ["laura", "owen", "james", "rowan", "alex"];
  for (const id of emeaCs) {
    assert.ok(CS_REP_IDS.includes(id),
      `${id} missing from derived CS roster — rep renamed or removed?`);
  }
  assert.ok(CS_REP_IDS.includes("dwayne") && CS_REP_IDS.includes("meri"),
    "NA CS pair (dwayne, meri) missing from derived CS roster");
  const apacCs = ["angela", "sarah", "aaron", "suzanne", "cindy"];
  for (const id of apacCs) {
    assert.ok(CS_REP_IDS.includes(id),
      `${id} missing from derived CS roster — APAC CS not landed?`);
  }
  assert.equal(CS_REP_IDS.length, 12, "expected 12 CS reps (2 NA + 5 EMEA + 5 APAC)");
});

// ── Workspace lockstep: teamsForUser ──────────────────────────────────────
test("teamsForUser: Lara\u2192['cs'], Jeff\u2192all teams, Cammy\u2192['newbiz']", () => {
  // Array.from: results are arrays from the vm realm — rebase them onto the
  // host realm's Array.prototype so strict deepEqual compares values only.
  const teams = u => Array.from(dm.teamsForUser(u));
  assert.deepEqual(teams(lara), ["cs"], "Lara's scopes dedupe to cs only");
  assert.deepEqual(teams(jeff), ["newbiz", "cs"], "Jeff gets every team");
  assert.deepEqual(teams(cammy), ["newbiz"], "Cammy gets her own team");
  assert.deepEqual(teams(dwayne), ["cs"], "Dwayne gets his own team");
});

// ── Workspace lockstep: defaultTeamForUser ────────────────────────────────
test("defaultTeamForUser: Lara lands in 'cs', Jeff in 'newbiz', Cammy in 'newbiz'", () => {
  assert.equal(dm.defaultTeamForUser(lara), "cs",
    "single-team admin lands directly in her section");
  assert.equal(dm.defaultTeamForUser(jeff), "newbiz",
    "Jeff lands where he lands today (first team in TEAMS order)");
  assert.equal(dm.defaultTeamForUser(cammy), "newbiz");
  assert.equal(dm.defaultTeamForUser(dwayne), "cs");
});

// ── canManageAny parity: gates manager-parity UI ──────────────────────────
test("canManageAny: Jeff and Lara can manage; Cammy and Dwayne cannot", () => {
  assert.equal(dm.canManageAny(jeff), true, "global manager");
  assert.equal(dm.canManageAny(lara), true, "team_admin with scopes");
  assert.equal(dm.canManageAny(cammy), false, "plain rep");
  assert.equal(dm.canManageAny(dwayne), false, "plain rep");
  assert.equal(dm.canManageAny({ ...lara, role: "rep" }), false,
    "R1: scopes with role='rep' must not gate manager UI");
  assert.equal(dm.canManageAny(null), false, "null user fails closed");
});
