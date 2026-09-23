// Issue: the Salesforce sync (jeff-os agents/sf_attainment_sync.py, rep_amount /
// rep_currency) writes every attainment figure in the REP'S OWN currency —
// USD for a US rep, GBP for EMEA, AUD for APAC — not GBP for everyone. The
// board tagged every row GBP, so a US rep's $174,446 rendered "£174,446" and
// the GBP display toggle left it unconverted, inflating every region/team
// total that mixed US and EMEA reps.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(path.join(here, "..", "src", f), "utf8");

const sandbox = {
  window: {
    REPS: [
      { id: "dwayne", team: "cs", region: "US" },
      { id: "laura", team: "cs", region: "EMEA" },
      { id: "aaron", team: "cs", region: "APAC" },
      { id: "don", team: "newbiz", region: "US" },
      { id: "ghost", team: "newbiz", region: "US" },      // never synced
    ],
    REGIONS: [
      { id: "US", currency: "USD" },
      { id: "EMEA", currency: "GBP" },
      { id: "APAC", currency: "AUD" },
    ],
    deriveAttainmentPcts(row) {
      return row.track === "newbiz"
        ? { type: "newbiz", mtd: null, qtd: 0, ytd: null }
        : { type: "cs", mtd: null, qtd: 51, ytd: null };
    },
    convertAmount(amount, from, to) {
      const r = { GBP: 1, USD: 1.27, AUD: 1.92 };
      return (amount / r[from]) * r[to];
    },
  },
};
vm.createContext(sandbox);
vm.runInContext(read("attainment-data.jsx"), sandbox, { filename: "attainment-data.jsx" });
const att = sandbox.window;

const built = att.attBuildLive([
  { rep_id: "dwayne", track: "cs", ren_qtd_target: 341815, ren_qtd_renewed: 174446 },
  { rep_id: "laura", track: "cs", ren_qtd_renewed: 243719 },
  { rep_id: "aaron", track: "cs", ren_qtd_renewed: 203444 },
  { rep_id: "don", track: "newbiz", nb_qtd_won: 0, nb_qtd_target: 219375 },
], [], [
  { rep_id: "dwayne", account: "A", arr: 174446, status: "renewed", due_date: "2026-08-01" },
  { rep_id: "laura", account: "B", arr: 243719, status: "renewed", due_date: "2026-08-01" },
  { rep_id: "aaron", account: "C", arr: 203444, status: "renewed", due_date: "2026-08-01" },
], []);
const byId = Object.fromEntries([...built.cs, ...built.nb].map(r => [r.id, r]));

test("each live row is tagged with its rep's region currency", () => {
  assert.equal(byId.dwayne.currency, "USD");
  assert.equal(byId.don.currency, "USD");
  assert.equal(byId.laura.currency, "GBP");
  assert.equal(byId.aaron.currency, "AUD");
});

test("a never-synced rep's stub carries its region currency too", () => {
  assert.equal(built.missingNb.find(r => r.id === "ghost").currency, "USD");
});

test("a US rep's dollars render with $ and convert into GBP", () => {
  const c = att.attCsCompute(byId.dwayne);
  assert.equal(c.currency, "USD");
  assert.match(att.attFmtMoneyK(c.target, c.currency), /^\$/);
  const gbp = att.attConvert(341815, att.attRepCurrency(byId.dwayne), "GBP");
  assert.equal(Math.round(gbp), Math.round(341815 / 1.27));
});

test("unknown rep falls back to the GBP default", () => {
  assert.equal(att.attRepCurrency({ id: "nobody" }), "GBP");
});

// ── Team rollup: numerator pairs with denominator ────────────────────────────
const tbSrc = read("target-board.jsx");
const start = tbSrc.indexOf("function tbRepCurrency");
const end = tbSrc.indexOf("// RFC-151 (was RFC-144)");
vm.runInContext(tbSrc.slice(start, end) + "\nwindow.tbRollup = tbRollup;", sandbox);

test("team won total counts only reps that carry a target", () => {
  const roll = att.tbRollup(built.cs, "cs", "qtd", "USD", 0);
  // Only Dwayne has a target: the card must read "$174,446 of $341,815",
  // not "(everyone's renewals) of $341,815".
  assert.equal(Math.round(roll.target), 341815);
  assert.equal(Math.round(roll.won), 174446);
  assert.equal(roll.pct, 51);
  assert.equal(roll.noTarget, 2);
});

test("a rollup with no targets still reports total won", () => {
  const roll = att.tbRollup(built.cs.filter(r => r.id !== "dwayne"), "cs", "qtd", "GBP", 0);
  assert.equal(roll.target, null);
  assert.ok(roll.won > 243719, "untargeted reps still sum when nobody has a target");
});
