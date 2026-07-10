// Historical Target Board — quarter-final assembly tests.
// Run: cd weekly-review-dashboard && node --test tests/quarter-finals.test.mjs
//
// attBuildQuarterFinal maps attainment_quarter_final rows (written by
// agents/sf_attainment_sync.py :: archive_quarter_finals) into the board
// shape. Key contract pinned on the Python side by
// test_quarter_final_rows_emit_every_key_the_frontend_reads.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(here, "..", "src", "attainment-data.jsx"), "utf8");

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: "attainment-data.jsx" });
const att = sandbox.window;

const Q2_ROWS = [
  { rep_id: "cammy", fy: 2026, quarter: 2, track: "newbiz",
    nb_won: 450000, nb_target: 600000, ren_renewed: null, ren_target: null, exp_won: null },
  { rep_id: "dwayne", fy: 2026, quarter: 2, track: "cs",
    nb_won: null, nb_target: null, ren_renewed: 240000, ren_target: 300000, exp_won: 50000 },
  { rep_id: "meri", fy: 2026, quarter: 1, track: "cs",   // Q1: no target that quarter
    nb_won: null, nb_target: null, ren_renewed: 0, ren_target: null, exp_won: 0 },
];

test("attBuildQuarterFinal maps NB rows to board shape with quarter-final pct", () => {
  const { nb, cs } = att.attBuildQuarterFinal(Q2_ROWS.filter(r => r.quarter === 2));
  assert.equal(nb.length, 1);
  const c = nb[0];
  assert.equal(c.id, "cammy");
  assert.equal(c.hist, true);
  assert.equal(c.pct.qtd, 94);                 // round(450000/600000*100)
  assert.equal(c.pct.mtd, null);               // no MTD/YTD in a quarter final
  assert.equal(c.pct.ytd, null);
  assert.equal(c.won.qtd, 450000);
  assert.equal(c.target.qtd, 600000);
  assert.equal(c.quotaQ, 600000);
  assert.equal(c.deals.length, 0);             // detail tables are current-quarter only
  assert.equal(cs.length, 1);
});

test("attBuildQuarterFinal maps CS rows: renewedQ + qTarget + expansion activity", () => {
  const { cs } = att.attBuildQuarterFinal(Q2_ROWS.filter(r => r.quarter === 2));
  const d = cs[0];
  assert.equal(d.id, "dwayne");
  assert.equal(d.hist, true);
  assert.equal(d.ren.qtd, 92);                 // round(240000/300000*100)
  assert.equal(d.ren.mtd, null);
  assert.equal(d.ren.ytd, null);
  assert.equal(d.qTarget, 300000);
  assert.equal(d.renewedQ, 240000);
  assert.equal(d.upsell, 50000);
  assert.equal(d.book.length, 0);
});

test("no-target quarter yields null pct, never a fake 0%", () => {
  const { cs } = att.attBuildQuarterFinal(Q2_ROWS.filter(r => r.quarter === 1));
  assert.equal(cs[0].ren.qtd, null);
  assert.equal(cs[0].qTarget, 0);
});

test("attBuildQuarterFinal never fabricates: empty rows → empty boards", () => {
  const empty = att.attBuildQuarterFinal([]);
  assert.equal(empty.nb.length, 0);
  assert.equal(empty.cs.length, 0);
  const fromNull = att.attBuildQuarterFinal(null);
  assert.equal(fromNull.nb.length, 0);
  assert.equal(fromNull.cs.length, 0);
});

test("attCsCompute reads renewedQ for historical reps (empty book)", () => {
  const hist = { qTarget: 300000, renewedQ: 240000, book: [] };
  const c = att.attCsCompute(hist);
  assert.equal(c.renewedSum, 240000);
  assert.equal(c.pct, 92);
  assert.equal(c.gap, 300000 - 240000);
});

test("attCsCompute still sums the book for live reps (no renewedQ)", () => {
  const live = { qTarget: 100000, book: [
    { amt: 40000, status: "renewed" }, { amt: 10000, status: "open" }] };
  const c = att.attCsCompute(live);
  assert.equal(c.renewedSum, 40000);
  assert.equal(c.openSum, 10000);
});

test("attQuarterFinalOptions: distinct quarters, sorted, current excluded", () => {
  // Array.from copies vm-realm arrays into this realm (deepEqual is
  // prototype-strict across vm boundaries).
  const opts = att.attQuarterFinalOptions(Q2_ROWS, 2026, 3);
  assert.deepEqual(Array.from(opts, o => o.key), ["2026-1", "2026-2"]);
  assert.deepEqual(Array.from(opts, o => o.label), ["Q1 2026", "Q2 2026"]);
  assert.deepEqual(Array.from(opts, o => `${o.fy}.${o.quarter}`), ["2026.1", "2026.2"]);
  // A row for the CURRENT quarter must never surface as a "past quarter".
  const withCurrent = Q2_ROWS.concat([{ rep_id: "x", fy: 2026, quarter: 3, track: "cs" }]);
  assert.deepEqual(Array.from(att.attQuarterFinalOptions(withCurrent, 2026, 3), o => o.key),
    ["2026-1", "2026-2"]);
  assert.equal(att.attQuarterFinalOptions([], 2026, 3).length, 0);
});
