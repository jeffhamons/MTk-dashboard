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

test("rep Morning Brief renders above the two Home hero cards", () => {
  const html = read("index.html");
  const homeStart = html.indexOf("function HomeView");
  const homeEnd = html.indexOf("// ── App", homeStart);
  const home = html.slice(homeStart, homeEnd);
  assert.ok(home.indexOf("<TeamBriefsTodayPanel") >= 0);
  assert.ok(home.indexOf("<TeamBriefsTodayPanel") < home.indexOf('<div className="home__cards">'));
});

test("required acknowledgement is a prominent, explicit action band", () => {
  const source = read("src/team-briefs.jsx");
  assert.match(source, /className="tb-ack-callout"/);
  assert.match(source, /Acknowledgement required/);
  assert.match(source, /Confirm I've read this/);
  // RFC-164 Phase 5 replaced the "this does not mark the action complete"
  // disclaimer with an actual second button. The property under test is
  // unchanged — the band must still say that confirming isn't finishing — but
  // it now says it by pointing at the control that does finish it.
  assert.match(source, /Confirming is not the same as finishing/);
  assert.match(source, /\.tb-ack\{min-height:44px/);
});

test("active rep comment composer opens by default and identifies comments as shared", () => {
  const source = read("src/team-briefs.jsx");
  const cardStart = source.indexOf("function TeamBriefCard");
  const card = source.slice(cardStart, source.indexOf("function TeamBriefsTodayPanel", cardStart));

  assert.match(card, /React\.useState\(\(\) =>\s*!managerial[\s\S]{0,180}!readOnly[\s\S]{0,180}brief\.allow_comments/);
  assert.match(card, /Visible to everyone who received this brief/);
  assert.match(card, /this is not a private message/);
});

test("multi-email aliases acknowledge and report once per rep", () => {
  const source = read("src/team-briefs.jsx");
  assert.match(source, /function teamBriefAudienceByRep/);
  assert.match(source, /member\.rep_id[\s\S]*read\.rep_id === member\.rep_id/);
  assert.match(source, /teamBriefReadBy\(brief,\s*authedUser\)/);
  assert.match(source, /acknowledged\.length\}\/\{audience\.length\}/);
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
  // Issue #22 widened the selector to `p.component || p.componentGlobal` so a
  // page whose global had not been defined at APP_PAGES eval time still routes
  // (and renders a named diagnostic) instead of silently falling through to a
  // blank screen. Locate the branch by its stable prefix, not the full literal.
  const routeStart = html.indexOf('APP_PAGES.find(p => p.id === view &&');
  assert.notStrictEqual(routeStart, -1, "generic APP_PAGES route branch must exist");
  const route = html.slice(routeStart, routeStart + 2600);
  assert.match(route, /authedUser=\{effectiveUser\}/);
  assert.match(route, /activeTeam=\{activeTeam\}/);
  assert.match(route, /viewerScope=\{viewerScope\}/);
  assert.match(route, /regionPill=\{regionPill\}/);
});

test("rep Team Briefs separates Current and History while Today remains current-only", () => {
  const source = read("src/team-briefs.jsx");
  const todayStart = source.indexOf("function TeamBriefsTodayPanel");
  const pageStart = source.indexOf("function TeamBriefsManager");
  const today = source.slice(todayStart, pageStart);
  const page = source.slice(pageStart, source.indexOf("Object.assign(window", pageStart));

  // RFC-164 Phase 4 moved the Today panel's context read behind `useBriefSurface`,
  // which is what now declares the tier. The invariant is unchanged — Today must
  // never upgrade the provider to the archived superset — so assert it where it
  // actually lives rather than deleting it.
  const surfaceStart = source.indexOf("function useBriefSurface");
  assert.notStrictEqual(surfaceStart, -1, "useBriefSurface must exist");
  const surface = source.slice(surfaceStart, source.indexOf("function ", surfaceStart + 1));
  assert.match(today, /useBriefSurface\(\{[^}]*view[^}]*\}\)/);
  assert.doesNotMatch(today, /useTeamBriefs\(true\)/, "Today must not request archived rows");
  assert.match(surface, /useTeamBriefs\(false\)/);
  assert.match(page, /useTeamBriefs\(true\)/, "the rep page needs archived history from its own load");
  assert.match(page, /managerial \? "active" : "current"/);
  assert.match(page, />Current<\/button>/);
  assert.match(page, />History<\/button>/);
  assert.match(page, /teamBriefRepSection\(brief,\s*teamBriefReadBy\(brief, authedUser\),\s*now\)/);
});

// There is no DOM harness in this repo, so this is a source assertion — but
// the property it guards was measured, not guessed. In headless Chrome the
// hero/strip handoff moved 470px of content under the reader until the slot
// held the vacated height, and reserving the FULL height instead pushed the
// re-entry threshold above the exit threshold (the strip's own flow height
// double-counting the observer's rootMargin). Subtracting the strip is what
// makes the document one length and the observed edge one document coordinate
// in both states. Drop the subtraction and the boundary goes bistable again.
test("the hero slot reserves the height it vacated, less the strip that replaced it", () => {
  const source = read("src/team-briefs.jsx");
  const slotStart = source.indexOf("function TeamBriefHeroSlot");
  assert.notStrictEqual(slotStart, -1, "TeamBriefHeroSlot must exist");
  const slot = source.slice(slotStart, source.indexOf("function TeamBriefsStrip", slotStart));

  assert.match(slot, /useLayoutEffect/, "the reservation must land before paint");
  assert.match(slot, /firstElementChild/, "measure the child, not the slot's own reservation");
  assert.match(slot, /minHeight/);
  assert.match(
    slot,
    /minHeight\s*=\s*`\$\{Math\.max\(0,[^}]*-\s*TEAM_BRIEF_STRIP_HEIGHT\)\}px`/,
    "the reserved height must subtract the strip, or exit and re-entry disagree",
  );
});

test("rep History search is case-insensitive, restores on an empty query, and groups newest calendar dates first", () => {
  const source = read("src/team-briefs.jsx");
  const pageStart = source.indexOf("function TeamBriefsManager");
  const page = source.slice(pageStart, source.indexOf("Object.assign(window", pageStart));
  const dateKeyStart = source.indexOf("function teamBriefHistoryDateKey");
  const dateKey = source.slice(dateKeyStart, source.indexOf("function teamBriefHistoryGroups", dateKeyStart));
  const groupsStart = source.indexOf("function teamBriefHistoryGroups");
  const groups = source.slice(groupsStart, source.indexOf("function useTeamBriefs", groupsStart));

  assert.match(page, /`\$\{brief\.title \|\| ""\}\\n\$\{brief\.body \|\| ""\}`\.toLowerCase\(\)\.includes\(normalizedHistoryQuery\)/);
  assert.match(page, /const normalizedHistoryQuery = historyQuery\.trim\(\)\.toLowerCase\(\)/);
  assert.match(page, /!normalizedHistoryQuery/, "an empty query must retain every History brief");
  assert.match(dateKey, /day:\s*"2-digit"/, "the history key must distinguish calendar days");
  assert.match(dateKey, /key:\s*`\$\{values\.year\}-\$\{values\.month\}-\$\{values\.day\}`/);
  assert.match(dateKey, /month:\s*"long",\s*day:\s*"numeric",\s*year:\s*"numeric"/, "the visible group label includes its day");
  assert.match(dateKey, /getDate\(\)/, "the fallback key also distinguishes calendar days");
  assert.match(groups, /String\(b\.publish_at \|\| ""\)\.localeCompare\(String\(a\.publish_at \|\| ""\)\)/, "History cards must be newest first");
  assert.match(groups, /a\.key\.localeCompare\(b\.key\)\s*\*\s*-1/, "History date groups must be newest first");
});

test("rep History cards are explicitly read-only and gate every mutation control", () => {
  const source = read("src/team-briefs.jsx");
  const cardStart = source.indexOf("function TeamBriefCard");
  const card = source.slice(cardStart, source.indexOf("function TeamBriefsTodayPanel", cardStart));
  const pageStart = source.indexOf("function TeamBriefsManager");
  const page = source.slice(pageStart, source.indexOf("Object.assign(window", pageStart));

  assert.match(card, /readOnly\s*=\s*false/);
  assert.match(card, /const historical\s*=\s*readOnly/);
  assert.match(card, /!managerial && !historical && active && brief\.require_ack/);
  assert.match(card, /!historical && active && brief\.allow_comments/);
  assert.match(card, /managerial && !historical && active/);
  assert.match(card, /managerial && !historical && !entry\.deleted_at/);
  assert.match(page, /readOnly=\{true\}/);
  assert.match(page, /No current Team Briefs\./);
  assert.match(page, /"No brief history yet"/);
  assert.match(page, /"No results found"/);
});

test("manager Active, Archived, and composer behavior remains manager-only", () => {
  const source = read("src/team-briefs.jsx");
  const pageStart = source.indexOf("function TeamBriefsManager");
  const page = source.slice(pageStart, source.indexOf("Object.assign(window", pageStart));

  assert.match(page, /managerial \? \(\s*<div className="tb-tabs">[\s\S]{0,700}>Active<\/button>[\s\S]{0,700}>Archived<\/button>/);
  assert.match(page, /managerial && tab === "active" && \(/);
  assert.match(page, /<h2>Publish a brief<\/h2>/);
  assert.match(page, /tab === "archived" \? brief\.status === "archived" : brief\.status === "published"/);
});

test("history authorization is frozen-audience RLS, not a client roster or audience filter", () => {
  const sql = read("db/migration-team-briefs.sql");
  const client = read("src/supabase-client.js");
  const policyStart = sql.indexOf('create policy "audience or manager reads team briefs"');
  const policy = sql.slice(policyStart, sql.indexOf('drop policy if exists "self or manager reads team brief audience"', policyStart));
  const loadStart = client.indexOf("async function loadTeamBriefs");
  const load = client.slice(loadStart, client.indexOf("async function publishTeamBrief", loadStart));

  assert.match(policy, /current_user_is_team_brief_member\(id\)/);
  assert.match(policy, /current_user_can_manage_team_brief\(id\)/);
  assert.match(sql, /from public\.team_brief_audience_members am[\s\S]{0,180}am\.auth_id = \(select auth\.uid\(\)\)/);
  assert.doesNotMatch(load, /audience_(team_id|region)|\.in\([^)]*(team|region)|roster|REPS/);
  assert.match(load, /includeArchived[\s\S]{0,240}query = query\.eq\("status", "published"\)/);
});

// ── RFC-164 Phase 5 — two-step acknowledgement ──────────────────────────────

test("completeTeamBrief must not inherit the ack wrapper's no-data guard", () => {
  const source = read("src/supabase-client.js");
  const start = source.indexOf("async function completeTeamBrief");
  assert.notStrictEqual(start, -1, "completeTeamBrief must exist");
  const fn = source.slice(start, source.indexOf("\n}", start) + 2);

  assert.match(fn, /rpc\("complete_team_brief",\s*\{/);
  assert.match(fn, /p_brief_id/);
  assert.match(fn, /teamBriefFailure\("completion"/);
  // The sibling wrapper throws when the RPC hands back no timestamp, which is
  // right for acknowledge_team_brief and fatal here: complete_team_brief
  // returns VOID, so `data` is null on every SUCCESS. Copying that guard would
  // make each completion report as an error while the row was already written.
  assert.doesNotMatch(fn, /if \(!data\)/);
  const sql = read("db/migration-team-briefs-redesign.sql");
  assert.match(
    sql,
    /create or replace function public\.complete_team_brief\(p_brief_id uuid\)\s*\nreturns void/,
    "if the RPC ever returns a value, revisit the missing guard above",
  );
  assert.match(source, /^\s*completeTeamBrief,$/m, "must be exported on window");
});

test("the strip can mark done, but only a brief the rep has already read", () => {
  const source = read("src/team-briefs.jsx");
  const start = source.indexOf("function TeamBriefsStrip");
  assert.notStrictEqual(start, -1, "TeamBriefsStrip must exist");
  const strip = source.slice(start, source.indexOf("function TeamBriefCard", start));

  // §6 exit criterion: "a rep can read then later mark done from the strip alone".
  assert.match(strip, /window\.completeTeamBrief\(/);
  // ...but the strip renders a title, not the ask. Offering "done" on a brief
  // the rep never opened would let the loudest signal in the product be cleared
  // by someone who never saw what it was about.
  assert.match(
    strip,
    /receipt\.read_at\s*&&\s*!receipt\.done_at/,
    "the strip's done affordance must be gated on read_at",
  );

  // The strip mounts and unmounts on every scroll handoff. State declared
  // after the shape bail-out would be a conditional hook and would throw on
  // the first crossing, which is a runtime failure no source grep would catch
  // later.
  const hookAt = strip.indexOf("React.useState");
  const bailAt = strip.indexOf('if (shape !== "strip") return null');
  assert.ok(
    hookAt >= 0 && bailAt >= 0 && hookAt < bailAt,
    `hooks must precede the shape bail-out (useState at ${hookAt}, bail at ${bailAt})`,
  );
});

test("the done tint keys off done_at, not read_at", () => {
  const source = read("src/team-briefs.jsx");
  assert.match(source, /\.tb-ack-callout\[data-done="1"\]\{border-color:var\(--done-light\)/);
  // A read-but-not-done brief is still an open ask and still holds its rung.
  // Painting it finished-green is precisely the collapse D6 exists to end.
  assert.doesNotMatch(
    source,
    /\.tb-ack-callout\[data-read="1"\]\{/,
    "read must not paint the callout as done",
  );
  assert.match(source, /data-done=\{done \? "1" : "0"\}/);
});
