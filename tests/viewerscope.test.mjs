// RFC-152 — viewerScope + region taxonomy tests.
// Run: node --test weekly-review-dashboard/tests/viewerscope.test.mjs
//
// Pins Decision 1 (NA/EMEA/APAC taxonomy) and Decision 2 (viewerScope
// derivation + helpers). Load pattern matches rbac-helpers.test.mjs.

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
// Lara stays cs×US + cs×EMEA only (Jeff 2026-07-10 — do not add APAC).
const lara = {
  role: "team_admin",
  rep_id: null,
  adminScopes: [
    { team_id: "cs", region: "US" },
    { team_id: "cs", region: "EMEA" },
  ],
};
const singleAdmin = {
  role: "team_admin",
  rep_id: null,
  adminScopes: [{ team_id: "cs", region: "EMEA" }],
};
// APAC CS leads (Lunn / Lemon / Bridget McCarthy) — fixtures only; no emails.
const apacCsAdmin = {
  role: "team_admin",
  rep_id: null,
  adminScopes: [{ team_id: "cs", region: "APAC" }],
};
const bdRep = { role: "rep", rep_id: "cammy" };

// ── (1–5) viewerScopeForUser ────────────────────────────────────────────────

test("manager → all three regions, unlocked", () => {
  const scope = dm.viewerScopeForUser(manager);
  assert.deepEqual(Array.from(scope.regions), ["US", "EMEA", "APAC"]);
  assert.equal(scope.locked, false);
});

test("team_admin multi-region (Lara cs×US+EMEA) → two regions, unlocked", () => {
  const scope = dm.viewerScopeForUser(lara);
  assert.deepEqual(Array.from(scope.regions), ["US", "EMEA"]);
  assert.equal(scope.locked, false);
});

test("team_admin with one scope → one region, locked", () => {
  const scope = dm.viewerScopeForUser(singleAdmin);
  assert.deepEqual(Array.from(scope.regions), ["EMEA"]);
  assert.equal(scope.locked, true);
});

test("APAC-only cs team_admin (Lunn/Lemon/Bridget) → { regions: [APAC], locked: true }", () => {
  const scope = dm.viewerScopeForUser(apacCsAdmin);
  assert.deepEqual(Array.from(scope.regions), ["APAC"]);
  assert.equal(scope.locked, true);
});

test("rep → own region, locked", () => {
  const scope = dm.viewerScopeForUser(bdRep);
  assert.deepEqual(Array.from(scope.regions), ["US"]);
  assert.equal(scope.locked, true);
});

test("null user → empty regions, locked", () => {
  const scope = dm.viewerScopeForUser(null);
  assert.deepEqual(Array.from(scope.regions), []);
  assert.equal(scope.locked, true);
  const undef = dm.viewerScopeForUser(undefined);
  assert.deepEqual(Array.from(undef.regions), []);
  assert.equal(undef.locked, true);
});

// ── (6) regionsUnderScope ───────────────────────────────────────────────────

test("regionsUnderScope: valid pill narrows; invalid ignored; falsy scope → full ORDER", () => {
  const scope = { regions: ["US", "EMEA", "APAC"], locked: false };
  assert.deepEqual(Array.from(dm.regionsUnderScope(scope, "EMEA")), ["EMEA"]);
  assert.deepEqual(Array.from(dm.regionsUnderScope(scope, "US")), ["US"]);
  // Invalid / out-of-scope pill ignored → full scope.regions
  assert.deepEqual(Array.from(dm.regionsUnderScope(scope, "BOGUS")), ["US", "EMEA", "APAC"]);
  assert.deepEqual(Array.from(dm.regionsUnderScope(scope, null)), ["US", "EMEA", "APAC"]);
  // Falsy scope → unrestricted fallback
  assert.deepEqual(Array.from(dm.regionsUnderScope(null, "US")), Array.from(dm.REGION_ORDER));
  assert.deepEqual(Array.from(dm.regionsUnderScope(undefined, null)), Array.from(dm.REGION_ORDER));
  // Single-region scope cannot expand via pill
  const locked = { regions: ["EMEA"], locked: true };
  assert.deepEqual(Array.from(dm.regionsUnderScope(locked, "US")), ["EMEA"]);
  assert.deepEqual(Array.from(dm.regionsUnderScope(locked, "EMEA")), ["EMEA"]);
});

// ── (7) taxonomy ────────────────────────────────────────────────────────────

test("taxonomy: REGION_ORDER, APAC entry, no ZA region, paul/mike EMEA, ZAR kept", () => {
  assert.deepEqual(Array.from(dm.REGION_ORDER), ["US", "EMEA", "APAC"]);

  const apac = dm.REGIONS.find(r => r.id === "APAC");
  assert.ok(apac, "APAC region entry required");
  assert.equal(apac.currency, "AUD");
  assert.equal(apac.timezone, "Australia/Sydney");
  assert.equal(apac.badge, "A$");
  assert.equal(apac.label, "APAC");
  assert.equal(apac.color, "#0d9488");

  assert.equal(dm.REGIONS.find(r => r.id === "ZA"), undefined, "no region with id ZA");
  assert.ok(!dm.REGION_ORDER.includes("ZA"));

  const paul = dm.REPS.find(r => r.id === "paul");
  const mike = dm.REPS.find(r => r.id === "mike");
  assert.equal(paul.region, "EMEA");
  assert.equal(mike.region, "EMEA");

  assert.ok(dm.FX_RATES.ZAR != null, "FX_RATES still has ZAR");
  assert.equal(typeof dm.FX_RATES.ZAR, "number");
});

// ── (8) repsUnderScope ──────────────────────────────────────────────────────

test("repsUnderScope respects team + region + week visibility", () => {
  const wk = 10;
  const full = { regions: ["US", "EMEA", "APAC"], locked: false };

  // US + newbiz at week 10: active US newbiz reps only (brenda activeThrough:5)
  const usNb = dm.repsUnderScope(wk, "newbiz", full, "US").map(r => r.id).sort();
  assert.ok(usNb.includes("cammy"), "cammy is live US newbiz");
  assert.ok(usNb.includes("farah"));
  assert.ok(usNb.includes("don"));
  assert.ok(!usNb.includes("brenda"), "brenda hidden after activeThrough week 5");
  assert.ok(!usNb.includes("dwayne"), "CS rep out of newbiz filter");
  assert.ok(!usNb.includes("laura"), "EMEA out of US pill");
  for (const id of usNb) {
    const rep = dm.repById(id);
    assert.equal(rep.team, "newbiz");
    assert.equal(rep.region, "US");
  }

  // EMEA + cs: EMEA CS five, no BD, no US
  const emeaCs = dm.repsUnderScope(wk, "cs", full, "EMEA").map(r => r.id).sort();
  assert.ok(emeaCs.includes("laura") && emeaCs.includes("owen"));
  assert.ok(!emeaCs.includes("dwayne"), "US CS out of EMEA pill");
  assert.ok(!emeaCs.includes("rory"), "EMEA BD out of cs team filter");
  for (const id of emeaCs) {
    const rep = dm.repById(id);
    assert.equal(rep.team, "cs");
    assert.equal(rep.region, "EMEA");
  }

  // All pill (null) + cs = US + EMEA + APAC CS
  const allCs = dm.repsUnderScope(wk, "cs", full, null).map(r => r.id).sort();
  assert.ok(allCs.includes("dwayne") && allCs.includes("meri"));
  assert.ok(allCs.includes("laura"));
  assert.ok(allCs.includes("angela") && allCs.includes("cindy"));
  assert.ok(!allCs.includes("cammy"), "BD out of cs team");

  // Locked EMEA-only scope ignores US pill
  const emeaOnly = { regions: ["EMEA"], locked: true };
  const locked = dm.repsUnderScope(wk, "cs", emeaOnly, "US").map(r => r.id);
  assert.ok(locked.includes("laura"));
  assert.ok(!locked.includes("dwayne"));
});

test("repsUnderScope: APAC CS five + APAC BD three; stuart (EMEA newbiz) appears in EMEA/full only", () => {
  const wk = dm.currentWeekIndex();
  const apacCsScope = dm.viewerScopeForUser(apacCsAdmin);
  assert.deepEqual(Array.from(apacCsScope.regions), ["APAC"]);
  assert.equal(apacCsScope.locked, true);

  // Array.from: vm-realm arrays must be rebased onto the host realm for deepEqual.
  const apacCs = Array.from(dm.repsUnderScope(wk, "cs", apacCsScope, null).map(r => r.id)).sort();
  assert.deepEqual(apacCs, ["aaron", "angela", "cindy", "sarah", "suzanne"]);

  const full = { regions: ["US", "EMEA", "APAC"], locked: false };
  const apacBd = Array.from(dm.repsUnderScope(wk, "newbiz", full, "APAC").map(r => r.id)).sort();
  assert.deepEqual(apacBd, ["andrew", "annum", "dourlay"]);

  // stuart activated 2026-07-12 (EMEA newbiz, 7/13 start) — now appears under
  // EMEA newbiz + full scope, but never under APAC (he's EMEA) or CS (newbiz).
  const emeaBd = Array.from(dm.repsUnderScope(wk, "newbiz", full, "EMEA").map(r => r.id));
  assert.ok(emeaBd.includes("rory") && emeaBd.includes("paul"), "activated EMEA BD visible");
  assert.ok(emeaBd.includes("stuart"), "stuart now activated in EMEA newbiz");
  assert.ok(!apacCs.includes("stuart"));
  assert.ok(!apacBd.includes("stuart"), "stuart is EMEA, not APAC");
  const allVisible = Array.from(dm.repsUnderScope(wk, null, full, null).map(r => r.id));
  assert.ok(allVisible.includes("stuart"), "stuart now appears in full scope");
});
// ── helpers: short labels + due labels ──────────────────────────────────────

test("regionShortLabel maps US→NA; others pass through", () => {
  assert.equal(dm.regionShortLabel("US"), "NA");
  assert.equal(dm.regionShortLabel("EMEA"), "EMEA");
  assert.equal(dm.regionShortLabel("APAC"), "APAC");
});

test("zoneAbbrev / dueLabelForRegion produce localized due copy", () => {
  // Use a fixed date in summer so US is CDT-ish and UK is BST-ish; values
  // may vary by ICU data but must be non-empty short zone names.
  const jul = new Date("2026-07-10T12:00:00Z");
  const us = dm.zoneAbbrev("US", jul);
  const emea = dm.zoneAbbrev("EMEA", jul);
  const apac = dm.zoneAbbrev("APAC", jul);
  assert.equal(typeof us, "string");
  assert.ok(us.length >= 2);
  assert.equal(typeof emea, "string");
  assert.ok(emea.length >= 2);
  assert.equal(typeof apac, "string");
  assert.ok(apac.length >= 2);
  assert.equal(dm.zoneAbbrev("NOPE"), "CT");
  assert.equal(dm.dueLabelForRegion("US"), `Due Friday 5 PM ${dm.zoneAbbrev("US")}`);
  assert.match(dm.dueLabelForRegion("EMEA"), /^Due Friday 5 PM /);
});

// ── dueInstantForRegion (region-true Friday 5 PM → UTC) ──────────────────────

test("dueInstantForRegion: July 2026 Friday maps to correct UTC instants per region", () => {
  // Friday 2026-07-10. Summer offsets: CDT=UTC-5, BST=UTC+1, AEST=UTC+10.
  // Note: Date objects come from the vm realm — compare via getTime, not instanceof.
  const y = 2026, m = 6, d = 10;
  const week = { friday: new Date(y, m, d) };

  const us = dm.dueInstantForRegion(week, "US");
  assert.equal(typeof us.getTime, "function");
  assert.equal(us.getTime(), Date.UTC(y, m, d, 22, 0, 0), "US CDT 5 PM → 22:00 UTC");

  const emea = dm.dueInstantForRegion(week, "EMEA");
  assert.equal(emea.getTime(), Date.UTC(y, m, d, 16, 0, 0), "EMEA BST 5 PM → 16:00 UTC");

  const apac = dm.dueInstantForRegion(week, "APAC");
  assert.equal(apac.getTime(), Date.UTC(y, m, d, 7, 0, 0), "APAC AEST 5 PM → 07:00 UTC");
});

test("dueInstantForRegion: unknown region falls back to browser-local 5 PM", () => {
  const y = 2026, m = 6, d = 10;
  const week = { friday: new Date(y, m, d) };
  const got = dm.dueInstantForRegion(week, "NOPE");
  const expected = new Date(week.friday);
  expected.setHours(17, 0, 0, 0);
  assert.equal(got.getTime(), expected.getTime());
});

// ── RFC-152 Test Plan item 3 — load-bearing product invariant ───────────────

test("manager filtered to R equals region-R rep view (parity)", () => {
  // Manager with all regions + pill=R must yield the same rep id-set as a
  // rep-style locked scope of {regions:[R]} with no pill. For every region
  // and both workspaces (newbiz / cs).
  const weekIdx = dm.currentWeekIndex();
  const mgrScope = { regions: Array.from(dm.REGION_ORDER), locked: false };
  for (const R of dm.REGION_ORDER) {
    for (const T of ["newbiz", "cs"]) {
      const repScope = { regions: [R], locked: true };
      const mgrIds = Array.from(
        dm.repsUnderScope(weekIdx, T, mgrScope, R).map(r => r.id)
      ).sort();
      const repIds = Array.from(
        dm.repsUnderScope(weekIdx, T, repScope, null).map(r => r.id)
      ).sort();
      assert.deepEqual(
        mgrIds,
        repIds,
        `parity fail: region=${R} team=${T}`
      );
    }
  }
});
