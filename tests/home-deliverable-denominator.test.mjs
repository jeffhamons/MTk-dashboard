// Home surface must use the week-aware deliverable set.
// Run: node --test tests/home-deliverable-denominator.test.mjs
//
// Regression guard for the w16 split-brain bug: RepView and TeamRollup derived
// their denominators from deliverablesForWeek()/activeDeliverablesFor(), but
// HomeView filtered the raw DELIVERABLES array. A rep who finished all three
// in-force deliverables therefore read "closed clean" on the rep surface and
// "3/5" on Home for the same week. Pins the denominator on both sides of the
// w11/w12 retirement boundary, and pins the three surfaces to one helper.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(read("src/data-model.js"), sandbox, { filename: "data-model.js" });
const dm = sandbox.window;

// HomeView lives in the index.html inline script; there is no module system, so
// slice its source the way team-briefs-integration.test.mjs does.
function homeViewSource() {
  const html = read("index.html");
  const start = html.indexOf("function HomeView");
  assert.ok(start >= 0, "HomeView found in index.html");
  // HomeView ends at the next top-level declaration in the inline script.
  const end = html.indexOf("\nfunction ", start + 1);
  assert.ok(end > start, "HomeView end boundary found");
  return html.slice(start, end);
}

test("denominator: w11 requires all five, w16 requires the three in force", () => {
  const don = dm.repById("don");
  assert.ok(don, "don is on the roster");
  // History must not shift: pre-retirement weeks still require all five.
  assert.equal(dm.activeDeliverablesFor(don, 11).length, 5, "w11 denominator = 5");
  assert.equal(dm.deliverablesForWeek(11).length, 5, "w11 in-force set = 5");
  // Post-retirement: outreach + commitments are gone.
  assert.equal(dm.activeDeliverablesFor(don, 16).length, 3, "w16 denominator = 3");
  assert.deepEqual(
    Array.from(dm.deliverablesForWeek(16)).map((d) => d.id).sort(),
    ["sf-hygiene", "standup", "wins"],
    "w16 in-force set = the three survivors",
  );
});

test("w16 resolves to absolute index 16, not its quarter-relative W6", () => {
  const w16 = dm.WEEKS.find((w) => w.id === "w16");
  assert.equal(w16.index, 16, "absolute index");
  assert.equal(w16.qIndex, 6, "quarter-relative index is a different number");
  // activeThrough is measured against the absolute index; guard the confusion.
  assert.equal(dm.deliverablesForWeek(w16.index).length, 3);
  assert.equal(dm.deliverablesForWeek(w16.qIndex).length, 5);
});

test("rep view, team rollup, and Home agree for every rep in w16 and w11", () => {
  for (const weekIndex of [11, 16]) {
    const expected = weekIndex === 11 ? 5 : 3;
    for (const rep of dm.REPS) {
      if (rep.name === "TBD") continue;
      if (!dm.repVisibleInWeek(rep, weekIndex)) continue;
      const skips = rep.skips || [];
      const repSurface = dm.activeDeliverablesFor(rep, weekIndex).length;
      // Rollup builds columns from the in-force set, then drops this rep's skips.
      const rollupSurface = dm
        .deliverablesForWeek(weekIndex)
        .filter((d) => !skips.includes(d.id)).length;
      assert.equal(repSurface, rollupSurface, `${rep.id} w${weekIndex}: surfaces agree`);
      assert.equal(
        repSurface,
        expected - skips.filter((id) => dm.deliverablesForWeek(weekIndex).some((d) => d.id === id)).length,
        `${rep.id} w${weekIndex}: denominator off the in-force set`,
      );
    }
  }
});

test("HomeView derives its deliverable sets from the week-aware helper", () => {
  const home = homeViewSource();
  assert.doesNotMatch(
    home,
    /DELIVERABLES\s*\.\s*filter/,
    "HomeView must not filter the raw DELIVERABLES array — it ignores activeThrough",
  );
  assert.match(home, /activeDeliverablesFor\s*\(/, "HomeView uses activeDeliverablesFor");
});

test("the global --deliv-count fallback is week-aware, not the raw roster length", () => {
  const html = read("index.html");
  assert.doesNotMatch(
    html,
    /setProperty\(\s*"--deliv-count",\s*DELIVERABLES\.length\s*\)/,
    "--deliv-count must track the week's in-force set, not DELIVERABLES.length",
  );
});

test("rep view and rollup keep sourcing their sets from the helpers", () => {
  assert.match(read("src/rep-view.jsx"), /activeDeliverablesFor\(rep, week\.index\)/);
  assert.match(read("src/team-rollup.jsx"), /deliverablesForWeek\(week\.index\)/);
});
