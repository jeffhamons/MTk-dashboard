// Rep-facing "Your open flags" panel on Home.
//
// The panel lives inline in HomeView (index.html), so this suite pins its
// wiring the same way tests/team-briefs-integration.test.mjs pins the brief
// surfaces: by asserting on the source. What it guards is the reason the
// panel exists — a rep must meet their own open flag, and the manager's reply
// to it, without first navigating to the week they raised it in.
//
// Run: node --test tests/home-my-flags.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const read = rel => readFileSync(path.join(root, rel), "utf8");

test("HomeView takes the deep-link callback and every call site passes it", () => {
  const html = read("index.html");
  assert.match(html, /function HomeView\(\{[^}]*onOpenMyFlag[^}]*\}\)/);
  // Both Home mounts (rep route and the fallback) must wire it, or the panel
  // renders a button that goes nowhere on one of them.
  const mounts = html.match(/<HomeView/g) || [];
  const wired  = html.match(/onOpenMyFlag=\{\(repId, weekId\) =>/g) || [];
  assert.ok(mounts.length > 0, "HomeView is mounted somewhere");
  assert.equal(wired.length, mounts.length);
});

test("the deep link jumps to the flag's own week before opening the rep view", () => {
  const html = read("index.html");
  // Week first, then view — reversed, the rep lands on the current week and
  // the flag they clicked is not on screen.
  assert.match(html, /onOpenMyFlag=\{\(repId, weekId\) => \{[\s\S]{0,200}?setWeekIdx\(idx\);[\s\S]{0,80}?setView\(repId\);/);
});

test("the panel is rep-only and skips onboarding access notes", () => {
  const html = read("index.html");
  const start = html.indexOf("const myFlags =");
  assert.ok(start > 0, "myFlags is derived in HomeView");
  const block = html.slice(start, start + 1200);
  // Managers have the Open Flags hero; this is the rep-side counterpart.
  assert.match(block, /!isManager && myRepId/);
  // Own flags only.
  assert.match(block, /repId === myRepId/);
  // Onboarding asks have no deliverable to open, so the row would deep-link
  // nowhere — the Flag Queue excludes them for the same reason.
  assert.match(block, /startsWith\("onboarding:"\)/);
});

test("the panel shows the manager's reply and whose signature is outstanding", () => {
  const html = read("index.html");
  const start = html.indexOf('className="myflags"');
  assert.ok(start > 0, "the panel renders");
  const block = html.slice(start, start + 2200);
  assert.match(block, /f\.ask\.response/, "the manager's reply is surfaced");
  assert.match(block, /waitingOn === "manager"/);
  assert.match(block, /waitingOn === "rep"/);
});

test("the panel carries its own styles", () => {
  const html = read("index.html");
  for (const cls of [".myflags {", ".myflag {", ".myflag__reply {", ".myflag__wait {"]) {
    assert.ok(html.includes(cls), `missing style ${cls}`);
  }
});
