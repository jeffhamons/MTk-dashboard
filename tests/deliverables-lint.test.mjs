// Lint: no surface may enumerate DELIVERABLES directly.
// Run: node --test tests/deliverables-lint.test.mjs
//
// The w16 split-brain bug (Home showed "3 of 5" for a rep the rep view and the
// rollup both showed closed clean) happened because HomeView built its
// deliverable set with DELIVERABLES.filter(...), which cannot see activeThrough.
// The per-surface regression tests pin the surfaces that existed when the bug
// was found; this rule pins every surface added afterwards.
//
// The rule: outside src/data-model.js, the only legal use of DELIVERABLES is
// `DELIVERABLES.find(...)` — resolving one deliverable's metadata by id, which
// must stay retirement-agnostic so historical asks on retired deliverables keep
// rendering in the flag queue. Anything that walks the array (filter/map/length/
// forEach/for..of/spread) is a denominator or a column set, and must go through
// deliverablesForWeek(weekIndex) or activeDeliverablesFor(rep, weekIndex).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

// data-model.js owns DELIVERABLES and the week-aware helpers built on it.
const OWNER = "src/data-model.js";

function scannedFiles() {
  const src = readdirSync(path.join(root, "src"))
    .filter((f) => f.endsWith(".js") || f.endsWith(".jsx"))
    .map((f) => path.posix.join("src", f))
    .filter((rel) => rel !== OWNER);
  return ["index.html", ...src];
}

// Every DELIVERABLES token that is not part of a string literal. The negative
// lookbehind skips quoted mentions such as the index.html script-order manifest.
const TOKEN = /(?<!["'`])\bDELIVERABLES\b/g;
const ALLOWED_AFTER = /^\s*\.\s*find\s*\(/;

function violations(rel) {
  const text = readFileSync(path.join(root, rel), "utf8");
  const out = [];
  for (const m of text.matchAll(TOKEN)) {
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 24);
    if (ALLOWED_AFTER.test(after)) continue;
    const line = text.slice(0, m.index).split("\n").length;
    const snippet = text.split("\n")[line - 1].trim();
    out.push(`${rel}:${line}: ${snippet}`);
  }
  return out;
}

test("no surface enumerates DELIVERABLES directly", () => {
  const found = scannedFiles().flatMap(violations);
  assert.deepEqual(
    found,
    [],
    "Use deliverablesForWeek(weekIndex) for a shared column set, or " +
      "activeDeliverablesFor(rep, weekIndex) for one rep's own count. " +
      "Filtering the raw array ignores activeThrough and silently rewrites " +
      "attainment for every week past a retirement. Offenders:\n" +
      found.join("\n"),
  );
});

test("the lint actually catches the shape of the original bug", () => {
  // Guards the rule itself: a rule that matches nothing would pass silently.
  const bug = 'const rDels = DELIVERABLES.filter(d => !rSkips.includes(d.id));';
  assert.equal([...bug.matchAll(TOKEN)].length, 1, "token matches a real use");
  assert.ok(
    !ALLOWED_AFTER.test(bug.slice(bug.indexOf("DELIVERABLES") + 12, bug.indexOf("DELIVERABLES") + 36)),
    ".filter is not allowed",
  );
  // ...and that the deliberate metadata-lookup exemption still passes.
  const ok = 'const del = DELIVERABLES.find(d => d.id === delId);';
  assert.ok(ALLOWED_AFTER.test(ok.slice(ok.indexOf("DELIVERABLES") + 12, ok.indexOf("DELIVERABLES") + 36)));
  // ...and that a quoted mention is not a use.
  assert.equal([...'["REPS", "DELIVERABLES"]'.matchAll(TOKEN)].length, 0, "string literals ignored");
});

test("the week-aware helpers are what surfaces actually call", () => {
  const read = (rel) => readFileSync(path.join(root, rel), "utf8");
  assert.match(read("src/rep-view.jsx"), /activeDeliverablesFor\(/);
  assert.match(read("src/team-rollup.jsx"), /deliverablesForWeek\(/);
  assert.match(read("index.html"), /activeDeliverablesFor\(/);
  assert.match(read("index.html"), /deliverablesForWeek\(/);
});
