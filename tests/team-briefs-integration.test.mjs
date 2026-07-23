import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const read = rel => readFileSync(path.join(root, rel), "utf8");

test("Team Briefs script loads once between components and manager registry", () => {
  const html = read("index.html");
  const components = html.indexOf('src="src/components.jsx"');
  const briefs = html.indexOf('src="src/team-briefs.jsx"');
  const manager = html.indexOf('src="src/manager.jsx"');
  assert.ok(components >= 0 && briefs > components && manager > briefs);
  assert.equal(html.match(/src="src\/team-briefs\.jsx"/g)?.length, 1);
});

test("route id and page registry use team-briefs without a manager prefix", () => {
  const manager = read("src/manager.jsx");
  const html = read("index.html");
  assert.match(manager, /id:\s*"team-briefs"/);
  assert.match(manager, /component:\s*window\.TeamBriefsManager/);
  assert.doesNotMatch(manager, /manager:team-briefs/);
  assert.match(html, /"team-briefs"/);
});

test("manager and rep surfaces are window-attached and wired through HomeView", () => {
  const source = read("src/team-briefs.jsx");
  const html = read("index.html");
  assert.match(source, /window\.TeamBriefsManager|Object\.assign\(window,[\s\S]*TeamBriefsManager/);
  assert.match(source, /window\.TeamBriefsTodayPanel|Object\.assign\(window,[\s\S]*TeamBriefsTodayPanel/);
  assert.match(html, /<TeamBriefsTodayPanel/);
  assert.match(html, /authedUser=\{authedUser\}/);
  assert.match(html, /onOpen=\{\(\) => setView\("team-briefs"\)\}/);
});

test("Team Briefs owns a separate load and realtime cycle", () => {
  const source = read("src/supabase-client.js");
  const sharedLoadStart = source.indexOf("async function loadStateFromSupabase");
  const sharedLoadEnd = source.indexOf("async function toggleCheckSupabase", sharedLoadStart);
  const sharedRealtimeStart = source.indexOf("function subscribeRealtime");
  const sharedRealtimeEnd = source.indexOf("async function migrateLocalToSupabase", sharedRealtimeStart);
  assert.doesNotMatch(source.slice(sharedLoadStart, sharedLoadEnd), /team_brief/);
  assert.doesNotMatch(source.slice(sharedRealtimeStart, sharedRealtimeEnd), /team_brief/);
  for (const name of [
    "loadTeamBriefs",
    "publishTeamBrief",
    "acknowledgeTeamBrief",
    "addTeamBriefComment",
    "archiveTeamBrief",
    "softDeleteTeamBriefComment",
    "subscribeTeamBriefs",
  ]) {
    assert.match(source, new RegExp(`\\b${name}\\b`));
  }
});

test("generic component routing threads identity and scope props", () => {
  const html = read("index.html");
  const routeStart = html.indexOf('APP_PAGES.find(p => p.id === view && p.component)');
  const route = html.slice(routeStart, routeStart + 1200);
  assert.match(route, /authedUser=\{effectiveUser\}/);
  assert.match(route, /activeTeam=\{activeTeam\}/);
  assert.match(route, /viewerScope=\{viewerScope\}/);
  assert.match(route, /regionPill=\{regionPill\}/);
});
