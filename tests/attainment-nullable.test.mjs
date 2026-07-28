// Targets-math + durability audit regression tests (issues #13, #15, #16, #19,
// #21, #27). Run: node --test tests/attainment-nullable.test.mjs
//
// The through-line for all of these: a value the nightly Salesforce sync never
// wrote must stay DISTINCT from a value it wrote as zero. `Number(x) || 0`
// collapsed the two, so "not synced yet" and "target cleared, $0 to hit"
// rendered identically — and a rep with no per-rep quarterly target was shown a
// fabricated $0 target.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(here, "..", "src", "attainment-data.jsx"), "utf8");

// attainment-data.jsx reaches for two collaborators at call time, not eval
// time: window.deriveAttainmentPcts (data-model.js) and window.REPS (roster).
// Stub both so this file tests the nullable/currency contract in isolation.
const sandbox = {
  window: {
    REPS: [
      { id: "cammy", team: "newbiz", region: "US" },
      { id: "dwayne", team: "cs", region: "EMEA" },
      { id: "ghost", team: "cs", region: "APAC" },        // never synced
      { id: "hidden", team: "cs", region: "APAC", emit: false },
    ],
    deriveAttainmentPcts(row) {
      if (!row || !row.rep_id) return null;
      return row.track === "newbiz"
        ? { type: "newbiz", mtd: null, qtd: 50, ytd: null }
        : { type: "cs", mtd: null, qtd: 80, ytd: null };
    },
    // data-model.js owns the real GBP-based table; stub the one entry point
    // attConvert delegates to rather than loading the roster module here.
    FX_RATES: { GBP: 1, USD: 1.27, AUD: 1.92, ZAR: 23.5 },
    convertAmount(amount, from, to) {
      if (amount == null) return null;
      const r = sandbox.window.FX_RATES;
      if (!r[from] || !r[to]) return amount;
      return (amount / r[from]) * r[to];
    },
  },
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: "attainment-data.jsx" });
const att = sandbox.window;
const Q = att.ATT_QUARTER.quarter;

test("attNum keeps a real zero and nulls a never-populated column", () => {
  assert.equal(att.attNum(0), 0, "a synced zero is data, not absence");
  assert.equal(att.attNum(null), null);
  assert.equal(att.attNum(undefined), null);
  assert.equal(att.attNum(""), null);
  assert.equal(att.attNum("12500"), 12500);
  assert.equal(att.attNum("not a number"), null);
});

test("issue #16/#27: an unsynced won column stays null; a synced 0 stays 0", () => {
  const { nb } = att.attBuildLive([
    { rep_id: "cammy", track: "newbiz", nb_mtd_won: 0, nb_qtd_won: null,
      nb_mtd_target: 40000, nb_qtd_target: null, nb_annual_target: null,
      synced_at: "2026-07-28T02:00:00Z" },
  ], [], [], []);
  assert.equal(nb.length, 1);
  assert.equal(nb[0].won.mtd, 0, "a real synced zero must survive as 0");
  assert.equal(nb[0].won.qtd, null, "a null column must NOT become 0");
  assert.equal(nb[0].target.qtd, null);
  assert.equal(nb[0].quotaQ, null, "no quarterly target is null, not $0");
});

test("issue #13: a missing per-rep quarterly target is null, never a fabricated 0", () => {
  const { cs } = att.attBuildLive([
    { rep_id: "dwayne", track: "cs", ren_qtd_target: null, exp_qtd_won: null,
      synced_at: "2026-07-28T02:00:00Z" },
  ], [], [], []);
  assert.equal(cs.length, 1);
  assert.equal(cs[0].qTarget, null, "no snapshot target and no ramp row → null");
  assert.equal(cs[0].qTargetSource, null);
  assert.equal(cs[0].upsell, null, "unsynced expansion is '—', not $0 of activity");
});

test("issue #13: a REAL zero quarterly target does not fall through to the ramp", () => {
  const ramps = [{ rep_id: "dwayne", quarter: Q, target: 300000 }];
  const { cs } = att.attBuildLive([
    { rep_id: "dwayne", track: "cs", ren_qtd_target: 0, synced_at: "2026-07-28T02:00:00Z" },
  ], [], [], ramps);
  assert.equal(cs[0].qTarget, 0, "a deliberately zeroed target is authoritative");
  assert.equal(cs[0].qTargetSource, "snapshot",
    "the falsy-|| chain used to hand this rep someone's planned ramp figure");
});

test("issue #13: the per-rep ramp row fills in only when the snapshot has no target", () => {
  const ramps = [{ rep_id: "dwayne", quarter: Q, target: 300000 }];
  const { cs } = att.attBuildLive([
    { rep_id: "dwayne", track: "cs", ren_qtd_target: null, synced_at: "2026-07-28T02:00:00Z" },
  ], [], [], ramps);
  assert.equal(cs[0].qTarget, 300000);
  assert.equal(cs[0].qTargetSource, "ramp");
});

test("issue #19: roster reps with no snapshot row come back as explicit missing stubs", () => {
  const { cs, missingCs, missingNb } = att.attBuildLive([
    { rep_id: "dwayne", track: "cs", ren_qtd_target: 300000, synced_at: "2026-07-28T02:00:00Z" },
  ], [], [], []);
  assert.equal(cs.length, 1);
  // Arrays cross a node:vm realm boundary here, so compare joined ids rather
  // than deepEqual (a sandbox Array is never reference-equal to a host Array).
  assert.equal(missingNb.map(r => r.id).join(","), "cammy");
  assert.equal(missingCs.map(r => r.id).join(","), "ghost", "emit:false reps stay hidden");
  const ghost = missingCs[0];
  assert.equal(ghost.missing, true);
  assert.equal(ghost.qTarget, null);
  assert.equal(ghost.syncedAt, null);
  assert.equal(ghost.ren.qtd, null, "a never-synced rep is not at 0% attainment");
});

test("issue #21: attBuildLive carries synced_at per row and as a board-wide window", () => {
  const { nb, cs, sync } = att.attBuildLive([
    { rep_id: "cammy", track: "newbiz", synced_at: "2026-07-26T02:00:00Z" },
    { rep_id: "dwayne", track: "cs", synced_at: "2026-07-28T02:00:00Z" },
  ], [], [], []);
  assert.equal(nb[0].syncedAt, "2026-07-26T02:00:00Z");
  assert.equal(cs[0].syncedAt, "2026-07-28T02:00:00Z");
  assert.equal(sync.newest, "2026-07-28T02:00:00Z");
  assert.equal(sync.oldest, "2026-07-26T02:00:00Z",
    "the oldest row is what decides whether the board is stale");
});

test("issue #21: attSyncState grades absent / fresh / stale rather than returning prose", () => {
  const now = Date.parse("2026-07-28T12:00:00Z");
  const never = att.attSyncState(null, now);
  assert.equal(never.known, false, "an absent timestamp is not a fresh one");
  assert.equal(never.stale, true, "unknown age fails closed as stale");
  assert.equal(never.ago, "never synced");

  const fresh = att.attSyncState("2026-07-28T06:00:00Z", now);
  assert.equal(fresh.known, true);
  assert.equal(fresh.stale, false);
  assert.equal(Math.round(fresh.hours), 6);

  const stale = att.attSyncState("2026-07-25T06:00:00Z", now);
  assert.equal(stale.stale, true);
  assert.ok(stale.hours > att.ATT_STALE_HOURS);
  assert.equal(stale.ago, "3 days ago");
});

test("issue #17: attConvert moves GBP-authored figures into the display currency", () => {
  assert.equal(att.ATT_SOURCE_CURRENCY, "GBP",
    "attainment_snapshot and cs_quarterly_targets carry no currency column");
  assert.equal(att.attConvert(100, "GBP", "GBP"), 100);
  assert.equal(Math.round(att.attConvert(100, "GBP", "USD")), 127);
  assert.equal(att.attConvert(null, "GBP", "USD"), null, "a missing amount stays missing");
});

test("issue #15: a null percentage is not a low percentage", () => {
  assert.equal(att.attPctText(null), "—");
  assert.equal(att.attBarWidth(null), 0);
  assert.equal(att.attPctText(0), "0%", "a real 0% still reads as 0%");
  // `null < 100` is true in JS — the guard must be an explicit null check, or a
  // rep with no target renders in the red "under 60%" band.
  assert.equal(att.attPctColor(null), "var(--ink-50)");
  assert.notEqual(att.attPctColor(null), att.attPctColor(0));
});

test("issue #16: money formatters distinguish missing from zero", () => {
  assert.equal(att.attFmtMoney(null, "GBP"), "—");
  assert.notEqual(att.attFmtMoney(0, "GBP"), "—");
  assert.equal(att.attFmtK(null), "—");
  assert.equal(att.attFmtK(0), "$0");
  // A missing timestamp renders nothing at all — never a fabricated epoch date.
  assert.equal(att.attFmtDateTime(null), "");
  assert.equal(att.attFmtDateTime(""), "");
});
