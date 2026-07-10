// Quarter-aware week model tests.
// Run: cd weekly-review-dashboard && node --test tests/quarters.test.mjs

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

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

test("WEEKS is 23 continuous weeks w1..w23", () => {
  assert.equal(dm.WEEKS.length, 23);
  for (let i = 0; i < 23; i++) {
    const w = dm.WEEKS[i];
    assert.equal(w.id, `w${i + 1}`);
    assert.equal(w.index, i + 1);
  }
});

test("Q2 dates unchanged: w1 = Apr 27 2026, w10 = Jun 29 2026", () => {
  assert.equal(ymd(dm.WEEKS[0].monday), "2026-04-27");
  assert.equal(ymd(dm.WEEKS[9].monday), "2026-06-29");
});

test("Q3 dates: w11 = Jul 6 2026, w23 = Sep 28 2026; Mondays consecutive", () => {
  assert.equal(ymd(dm.WEEKS[10].monday), "2026-07-06");
  assert.equal(ymd(dm.WEEKS[22].monday), "2026-09-28");
  for (let i = 1; i < dm.WEEKS.length; i++) {
    const prev = dm.WEEKS[i - 1].monday;
    const cur = dm.WEEKS[i].monday;
    const deltaMs = cur - prev;
    assert.equal(deltaMs, 7 * 24 * 60 * 60 * 1000, `gap between ${dm.WEEKS[i - 1].id} and ${dm.WEEKS[i].id}`);
  }
});

test("quarter and qIndex fields on each week", () => {
  for (let i = 0; i < 10; i++) {
    assert.equal(dm.WEEKS[i].quarter, "Q2");
    assert.equal(dm.WEEKS[i].qIndex, i + 1);
  }
  for (let i = 10; i < 23; i++) {
    assert.equal(dm.WEEKS[i].quarter, "Q3");
    assert.equal(dm.WEEKS[i].qIndex, i - 9); // w11 → 1 … w23 → 13
  }
});

test("weeksForQuarter returns ordered slices", () => {
  const q2 = dm.weeksForQuarter("Q2");
  const q3 = dm.weeksForQuarter("Q3");
  assert.equal(q2.length, 10);
  assert.equal(q3.length, 13);
  assert.equal(q2[0].id, "w1");
  assert.equal(q2[9].id, "w10");
  assert.equal(q3[0].id, "w11");
  assert.equal(q3[12].id, "w23");
  assert.equal(dm.weeksForQuarter("Q9").length, 0);
});

test("quarterForWeek is null-safe", () => {
  assert.equal(dm.quarterForWeek(null), null);
  assert.equal(dm.quarterForWeek({}), null);
  const q2 = dm.quarterForWeek(dm.WEEKS[0]);
  assert.equal(q2.id, "Q2");
  assert.equal(q2.label, "Q2 2026");
  const q3 = dm.quarterForWeek(dm.WEEKS[10]);
  assert.equal(q3.id, "Q3");
  assert.equal(q3.label, "Q3 2026");
});

test("currentQuarterId clamps before Q2 / after Q3 and picks mid-quarter correctly", () => {
  assert.equal(dm.currentQuarterId(new Date(2026, 6, 10)), "Q3"); // Jul 10
  assert.equal(dm.currentQuarterId(new Date(2026, 4, 15)), "Q2"); // May 15
  assert.equal(dm.currentQuarterId(new Date(2026, 10, 1)), "Q3"); // Nov 1 — past Q3
  assert.equal(dm.currentQuarterId(new Date(2026, 2, 1)), "Q2"); // Mar 1 — before Q2
});

test("currentWeekIndex for 2026-07-10 is w11 (array index 10)", () => {
  const idx = dm.currentWeekIndex(dm.WEEKS, new Date(2026, 6, 10));
  assert.equal(idx, 10);
  assert.equal(dm.WEEKS[idx].id, "w11");
});

test("buildQuarterEmail Q3 scopes weeks and names the quarter", () => {
  const rep = dm.REPS.find(r => r.id === "cammy");
  const state = { checks: {}, notes: {}, asks: {}, managerNotes: {} };
  const msg = dm.buildQuarterEmail(rep, state, "Q3");
  assert.ok(msg.subject.includes("Q3 2026") || msg.body.includes("Q3 2026"),
    "subject or body must name Q3 2026");
  assert.ok(!msg.body.includes("Apr 27"), "Q3 recap must not include Q2 week ranges");
  assert.ok(msg.body.includes("Jul 6") || msg.body.includes("Jul 6–") || msg.body.includes("Sep"),
    "Q3 recap should mention Q3 date ranges");
  // Q2-scoped recap must not leak Q3 dates
  const q2msg = dm.buildQuarterEmail(rep, state, "Q2");
  assert.ok(q2msg.body.includes("Apr 27") || q2msg.body.includes("Apr 27–"),
    "Q2 recap should still include Q2 weeks");
  assert.ok(!q2msg.body.includes("Sep 28"), "Q2 recap must not include late Q3 weeks");
});

test("buildQuarterEmail(rep, state, 'Q2') stays Q2-scoped even when today is in Q3", () => {
  // Contract for EmailButton sendQuarter: pass week.quarter so a manager
  // viewing a historical Q2 week after Jul 6 2026 still gets a Q2 recap.
  // TODAY is Jul 10 2026 (Q3); the explicit quarterId must override that default.
  assert.equal(dm.currentQuarterId(), "Q3", "precondition: default quarter is Q3");
  const rep = dm.REPS.find(r => r.id === "cammy");
  const state = { checks: {}, notes: {}, asks: {}, managerNotes: {} };
  const msg = dm.buildQuarterEmail(rep, state, "Q2");
  assert.ok(msg.subject.includes("Q2 2026") || msg.body.includes("Q2 2026"),
    "subject or body must name Q2 2026");
  assert.ok(msg.body.includes("Apr 27"), "Q2 recap must include a Q2 week range (Apr 27)");
  assert.ok(!msg.body.includes("Sep 28"), "Q2 recap must not include a Q3-only range (Sep 28)");
});

test("QUARTERS export shape", () => {
  assert.ok(Array.isArray(dm.QUARTERS));
  assert.equal(dm.QUARTERS.length, 2);
  assert.equal(dm.QUARTERS[0].id, "Q2");
  assert.equal(dm.QUARTERS[0].label, "Q2 2026");
  assert.equal(dm.QUARTERS[0].weekCount, 10);
  assert.equal(dm.QUARTERS[1].id, "Q3");
  assert.equal(dm.QUARTERS[1].label, "Q3 2026");
  assert.equal(dm.QUARTERS[1].weekCount, 13);
});
