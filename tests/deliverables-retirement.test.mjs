// Deliverable retirement — week-aware deliverable set tests.
// Run: node --test weekly-review-dashboard/tests/deliverables-retirement.test.mjs
//
// Pins the activeThrough retirement of Tier A Outreach (outreach) + Weekly
// Tracker (commitments) from w12 (2026-07-13) onward, and the guarantee that
// history is intact: weeks <= 11 carry the same deliverable set as before.
// Load pattern matches viewerscope.test.mjs.

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

// Array.from rebases the vm-realm array onto the host realm so deepEqual
// against host-realm literals works (same footgun as viewerscope.test.mjs).
const ids = (arr) => Array.from(arr).map((d) => d.id);
const newbizRep = dm.REPS.find((r) => r.team === "newbiz" && !(r.skips || []).length);
const csRep = dm.REPS.find((r) => (r.skips || []).includes("outreach"));

test("deliverablesForWeek: w11 keeps all 5, w12 drops outreach + commitments", () => {
  const w11 = ids(dm.deliverablesForWeek(11));
  const w12 = ids(dm.deliverablesForWeek(12));
  assert.equal(w11.length, 5, "w11 in-force = 5");
  assert.ok(w11.includes("outreach") && w11.includes("commitments"), "w11 still has both");
  assert.deepEqual(w12.sort(), ["sf-hygiene", "standup", "wins"], "w12 = 3, both retired");
});

test("deliverablesForWeek: earlier weeks unaffected (w1, w10 keep all 5)", () => {
  assert.equal(dm.deliverablesForWeek(1).length, 5);
  assert.equal(dm.deliverablesForWeek(10).length, 5);
});

test("history intact: a rep's w11 set is byte-identical to the pre-retirement logic", () => {
  // Pre-change logic was: DELIVERABLES minus per-rep skips (no week awareness).
  const preChange = (rep) => ids(dm.DELIVERABLES.filter((d) => !(rep.skips || []).includes(d.id)));
  assert.deepEqual(ids(dm.activeDeliverablesFor(newbizRep, 11)), preChange(newbizRep),
    "newbiz w11 unchanged");
  assert.deepEqual(ids(dm.activeDeliverablesFor(csRep, 11)), preChange(csRep),
    "CS w11 unchanged");
});

test("activeDeliverablesFor: newbiz drops 2 at w12; CS unchanged (already skipped)", () => {
  assert.equal(dm.activeDeliverablesFor(newbizRep, 11).length, 5, "newbiz 5 @ w11");
  assert.equal(dm.activeDeliverablesFor(newbizRep, 12).length, 3, "newbiz 3 @ w12");
  // CS reps already skip outreach + commitments, so retirement is a no-op for them.
  assert.equal(dm.activeDeliverablesFor(csRep, 11).length, 3, "CS 3 @ w11");
  assert.equal(dm.activeDeliverablesFor(csRep, 12).length, 3, "CS 3 @ w12");
});

test("retirement cutover remains effective from w12 onward", () => {
  // currentWeekIndex() is 0-based; +1 gives the 1-based week index.
  const currentWeekIndex1Based = dm.currentWeekIndex() + 1;
  assert.ok(currentWeekIndex1Based >= 12, "today is at or after the w12 cutover");
  // The retired deliverables must be present in the LAST fully-required week
  // (w11) and absent in every current/future week.
  assert.ok(ids(dm.deliverablesForWeek(11)).includes("outreach"));
  assert.ok(!ids(dm.deliverablesForWeek(currentWeekIndex1Based)).includes("outreach"));
});
