// Issue: the Target Board's "These numbers are stale" banner judged staleness
// from the oldest attainment_snapshot row in the whole table, including reps the
// board hides (departed, activeThrough). Brenda left in June; her last row is
// from Jul 24, so the banner told every viewer not to trust figures that had all
// synced the night before. The window must come from the rows actually shown.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(path.join(here, "..", "src", f), "utf8");

const sandbox = { window: { REPS: [], REGIONS: [] } };
vm.createContext(sandbox);
vm.runInContext(read("attainment-data.jsx"), sandbox, { filename: "attainment-data.jsx" });
const att = sandbox.window;

test("sync window spans only the rows passed in", () => {
  const w = att.attSyncWindow([
    { id: "rory", syncedAt: "2026-09-23T04:09:44Z" },
    { id: "dwayne", syncedAt: "2026-09-23T04:09:40Z" },
  ]);
  assert.equal(w.newest, "2026-09-23T04:09:44Z");
  assert.equal(w.oldest, "2026-09-23T04:09:40Z");
});

test("a hidden rep's old row left out of the list cannot make the board stale", () => {
  const all = [
    { id: "rory", syncedAt: "2026-09-23T04:09:44Z" },
    { id: "brenda", syncedAt: "2026-07-24T12:30:07Z" },
  ];
  const shown = all.filter(r => r.id !== "brenda");
  assert.equal(att.attSyncWindow(shown).oldest, "2026-09-23T04:09:44Z");
});

test("rows without a sync time are ignored; no rows gives nulls", () => {
  assert.deepEqual({ ...att.attSyncWindow([{ id: "x", syncedAt: null }]) }, { newest: null, oldest: null });
  assert.deepEqual({ ...att.attSyncWindow([]) }, { newest: null, oldest: null });
});
