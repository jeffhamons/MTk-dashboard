// RFC-152 follow-up — pure URL-state helper tests.
// Run: node --test weekly-review-dashboard/tests/url-state.test.mjs
//
// Pins parseUrlState / serializeUrlState for App deep-links. Load pattern
// matches viewerscope.test.mjs; sandbox includes URLSearchParams (used only
// inside the helpers, not at module load).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(here, "..", "src", "data-model.js"), "utf8");

// URLSearchParams is referenced only inside helper functions; pass Node's
// global into the sandbox so runInContext resolves it at call time.
const sandbox = { window: {}, URLSearchParams };
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: "data-model.js" });
const dm = sandbox.window;

// vm-realm plain objects fail host deepEqual (same realm issue as Array.from
// rebasement in viewerscope.test.mjs). Copy onto the host realm.
function hostState(s) {
  return { view: s.view, week: s.week, region: s.region, rep: s.rep };
}

// ── parseUrlState ───────────────────────────────────────────────────────────

test("parseUrlState: valid full query → all four fields", () => {
  const got = hostState(dm.parseUrlState("?view=team&week=w1&region=US&rep=cammy"));
  assert.deepEqual(got, {
    view: "team",
    week: "w1",
    region: "US",
    rep: "cammy",
  });
});

test("parseUrlState: leading '?' optional (tolerance)", () => {
  const withQ = hostState(dm.parseUrlState("?view=team&week=w2&region=EMEA&rep=laura"));
  const without = hostState(dm.parseUrlState("view=team&week=w2&region=EMEA&rep=laura"));
  assert.deepEqual(withQ, without);
  assert.equal(withQ.view, "team");
  assert.equal(withQ.week, "w2");
  assert.equal(withQ.region, "EMEA");
  assert.equal(withQ.rep, "laura");
});

test("parseUrlState: missing params → all nulls", () => {
  assert.deepEqual(hostState(dm.parseUrlState("")), {
    view: null,
    week: null,
    region: null,
    rep: null,
  });
  assert.deepEqual(hostState(dm.parseUrlState("?demo=true&date=2026-07-10")), {
    view: null,
    week: null,
    region: null,
    rep: null,
  });
  assert.deepEqual(hostState(dm.parseUrlState(null)), {
    view: null,
    week: null,
    region: null,
    rep: null,
  });
});

test("parseUrlState: invalid week id w999 → null (regex ok, not in WEEKS)", () => {
  const got = dm.parseUrlState("?week=w999&view=team");
  assert.equal(got.week, null);
  assert.equal(got.view, "team");
});

test("parseUrlState: invalid region ZA → null", () => {
  const got = dm.parseUrlState("?region=ZA&view=team");
  assert.equal(got.region, null);
  assert.equal(got.view, "team");
});

test("parseUrlState: unknown rep → null", () => {
  const got = dm.parseUrlState("?rep=not-a-real-rep&view=team");
  assert.equal(got.rep, null);
  assert.equal(got.view, "team");
});

test("parseUrlState: uppercase view fails pattern → null", () => {
  const got = dm.parseUrlState("?view=Team&week=w1");
  assert.equal(got.view, null);
  assert.equal(got.week, "w1");
});

test("parseUrlState: each invalid field independently nulls", () => {
  // week without w-prefix
  assert.equal(dm.parseUrlState("?week=1").week, null);
  assert.equal(dm.parseUrlState("?week=W1").week, null);
  // region case-sensitive
  assert.equal(dm.parseUrlState("?region=us").region, null);
  // view with underscore / leading digit
  assert.equal(dm.parseUrlState("?view=team_view").view, null);
  assert.equal(dm.parseUrlState("?view=1team").view, null);
});

test("parseUrlState: unknown params ignored", () => {
  const got = hostState(
    dm.parseUrlState(
      "?demo=true&date=2026-07-10&view=standup&week=w3&region=APAC&rep=angela&extra=1"
    )
  );
  assert.deepEqual(got, {
    view: "standup",
    week: "w3",
    region: "APAC",
    rep: "angela",
  });
});

// ── serializeUrlState ───────────────────────────────────────────────────────

test("serializeUrlState: sets managed params", () => {
  const qs = dm.serializeUrlState(
    { view: "team", week: "w1", region: "US", rep: "cammy" },
    ""
  );
  assert.equal(qs, "?view=team&week=w1&region=US&rep=cammy");
});

test("serializeUrlState: null/undefined members remove params", () => {
  const current = "?view=team&week=w1&region=US&rep=cammy";
  const qs = dm.serializeUrlState(
    { view: "team", week: null, region: undefined, rep: null },
    current
  );
  assert.equal(qs, "?view=team");
});

test("serializeUrlState: empty state + empty current → empty string", () => {
  assert.equal(
    dm.serializeUrlState(
      { view: null, week: null, region: null, rep: null },
      ""
    ),
    ""
  );
});

test("serializeUrlState: PRESERVES demo=true and date=2026-07-10", () => {
  const current = "?demo=true&date=2026-07-10";
  const qs = dm.serializeUrlState(
    { view: "standup", week: "w5", region: "EMEA", rep: "laura" },
    current
  );
  assert.ok(qs.includes("demo=true"), "demo=true must survive");
  assert.ok(qs.includes("date=2026-07-10"), "date= must survive");
  assert.ok(qs.includes("view=standup"));
  assert.ok(qs.includes("week=w5"));
  assert.ok(qs.includes("region=EMEA"));
  assert.ok(qs.includes("rep=laura"));
  // preserved params first (original order), then managed view/week/region/rep
  assert.equal(
    qs,
    "?demo=true&date=2026-07-10&view=standup&week=w5&region=EMEA&rep=laura"
  );
});

test("serializeUrlState: preserves other params when clearing managed", () => {
  const qs = dm.serializeUrlState(
    { view: null, week: null, region: null, rep: null },
    "?demo=true&date=2026-07-10&view=team&week=w1"
  );
  assert.equal(qs, "?demo=true&date=2026-07-10");
});

test("serializeUrlState: managed param order is view,week,region,rep", () => {
  // Even if state object key order differs, output order is fixed
  const qs = dm.serializeUrlState(
    { rep: "cammy", region: "US", week: "w1", view: "team" },
    ""
  );
  assert.equal(qs, "?view=team&week=w1&region=US&rep=cammy");
});

// ── round-trip ──────────────────────────────────────────────────────────────

test("round-trip: parse(serialize(x)) === x for valid x", () => {
  const x = { view: "team", week: "w1", region: "US", rep: "cammy" };
  const qs = dm.serializeUrlState(x, "");
  assert.deepEqual(hostState(dm.parseUrlState(qs)), x);

  const y = { view: "standup", week: "w10", region: "APAC", rep: "angela" };
  assert.deepEqual(hostState(dm.parseUrlState(dm.serializeUrlState(y, "?demo=true"))), y);

  const z = { view: null, week: "w3", region: null, rep: "don" };
  assert.deepEqual(hostState(dm.parseUrlState(dm.serializeUrlState(z, ""))), z);
});

test("round-trip preserves non-managed params across parse-unrelated serialize", () => {
  const state = { view: "team", week: "w2", region: "EMEA", rep: "rory" };
  const qs1 = dm.serializeUrlState(state, "?demo=true&date=2026-07-10");
  const parsed = hostState(dm.parseUrlState(qs1));
  assert.deepEqual(parsed, state);
  const qs2 = dm.serializeUrlState(parsed, qs1);
  assert.equal(qs2, qs1);
});
