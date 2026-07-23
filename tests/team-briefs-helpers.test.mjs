import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(here, "..", "src", "data-model.js"), "utf8");
const sandbox = { window: {}, URLSearchParams };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "data-model.js" });
const dm = sandbox.window;

const jeff = { role: "manager", auth_id: "jeff" };
const bdAdmin = {
  role: "team_admin",
  auth_id: "bd-admin",
  adminScopes: [
    { team_id: "newbiz", region: "US" },
    { team_id: "newbiz", region: "EMEA" },
    { team_id: "newbiz", region: "APAC" },
  ],
};
const lara = {
  role: "team_admin",
  auth_id: "lara",
  adminScopes: [
    { team_id: "cs", region: "US" },
    { team_id: "cs", region: "EMEA" },
  ],
};

const audience = (mode, team = null, region = null) => ({
  audience_mode: mode,
  audience_team_id: team,
  audience_region: region,
});

test("publisher scope uses the full canonical target matrix", () => {
  for (const spec of [
    audience("sales_all"),
    audience("region", null, "EMEA"),
    audience("team", "cs"),
    audience("team_region", "newbiz", "APAC"),
  ]) {
    assert.equal(dm.canPublishTeamBrief(jeff, spec), true);
  }

  assert.equal(dm.canPublishTeamBrief(bdAdmin, audience("team", "newbiz")), true);
  assert.equal(dm.canPublishTeamBrief(bdAdmin, audience("team_region", "newbiz", "EMEA")), true);
  assert.equal(dm.canPublishTeamBrief(bdAdmin, audience("team_region", "cs", "EMEA")), false);
  assert.equal(dm.canPublishTeamBrief(bdAdmin, audience("region", null, "EMEA")), false);
  assert.equal(dm.canPublishTeamBrief(bdAdmin, audience("sales_all")), false);

  assert.equal(dm.canPublishTeamBrief(lara, audience("team_region", "cs", "US")), true);
  assert.equal(dm.canPublishTeamBrief(lara, audience("team_region", "cs", "EMEA")), true);
  assert.equal(dm.canPublishTeamBrief(lara, audience("team_region", "cs", "APAC")), false);
  assert.equal(dm.canPublishTeamBrief(lara, audience("team", "cs")), false);
  assert.equal(dm.canPublishTeamBrief(lara, audience("region", null, "EMEA")), false);
  assert.equal(dm.canPublishTeamBrief({ ...lara, role: "rep" }, audience("team_region", "cs", "US")), false);
  assert.equal(dm.canPublishTeamBrief({ role: "rep", rep_id: "cammy" }, audience("team_region", "newbiz", "US")), false);
});

test("audience expansion includes only active, seated rep identities", () => {
  const reps = [
    { rep_id: "cammy", team_id: "newbiz", region: "US", active: true },
    { rep_id: "farah", team_id: "newbiz", region: "US", active: false },
    { rep_id: "dwayne", team_id: "cs", region: "US", active: true },
    { rep_id: "laura", team_id: "cs", region: "EMEA", active: true },
  ];
  const users = [
    { auth_id: "a-cammy", rep_id: "cammy", role: "rep" },
    { auth_id: "a-farah", rep_id: "farah", role: "rep" },
    { auth_id: "a-dwayne", rep_id: "dwayne", role: "team_admin" },
    { auth_id: null, rep_id: "laura", role: "rep" },
    { auth_id: "a-jeff", rep_id: null, role: "manager" },
  ];

  const got = JSON.parse(JSON.stringify(
    dm.expandTeamBriefAudience(users, reps, audience("sales_all"))
  ));
  assert.deepEqual(got, [{
    auth_id: "a-cammy",
    rep_id: "cammy",
    team_id: "newbiz",
    region: "US",
  }]);
});

test("audience expansion keeps auth aliases while the rep denominator stays distinct", () => {
  const reps = [
    { rep_id: "mike", team_id: "newbiz", region: "EMEA", active: true },
  ];
  const users = [
    { auth_id: "mike-mindtools", rep_id: "mike", role: "rep" },
    { auth_id: "mike-kineo", rep_id: "mike", role: "rep" },
  ];

  const expanded = Array.from(
    dm.expandTeamBriefAudience(users, reps, audience("team_region", "newbiz", "EMEA")),
    row => ({ ...row })
  );

  assert.deepEqual(expanded, [
    {
      auth_id: "mike-mindtools",
      rep_id: "mike",
      team_id: "newbiz",
      region: "EMEA",
    },
    {
      auth_id: "mike-kineo",
      rep_id: "mike",
      team_id: "newbiz",
      region: "EMEA",
    },
  ]);
  assert.equal(expanded.length, 2, "each authenticated alias receives an access row");
  assert.equal(
    new Set(expanded.map(row => row.rep_id)).size,
    1,
    "read-receipt denominator counts the rep once"
  );
});

test("audience expansion rejects duplicate auth identities", () => {
  const reps = [
    { rep_id: "mike", team_id: "newbiz", region: "EMEA", active: true },
  ];
  const users = [
    { auth_id: "same-auth", rep_id: "mike", role: "rep" },
    { auth_id: "same-auth", rep_id: "mike", role: "rep" },
  ];

  assert.throws(
    () => dm.expandTeamBriefAudience(
      users,
      reps,
      audience("team_region", "newbiz", "EMEA")
    ),
    /Duplicate Team Brief audience auth identity/
  );
});

test("materialized audience snapshots stay frozen when roster seating changes", () => {
  const reps = [
    { rep_id: "cammy", team_id: "newbiz", region: "US", active: true },
    { rep_id: "farah", team_id: "newbiz", region: "US", active: true },
  ];
  const users = [{ auth_id: "a-cammy", rep_id: "cammy", role: "rep" }];
  const spec = audience("team_region", "newbiz", "US");

  const publishedSnapshot = Array.from(dm.expandTeamBriefAudience(users, reps, spec), row => ({ ...row }));
  users.push({ auth_id: "a-farah", rep_id: "farah", role: "rep" });
  const laterExpansion = Array.from(dm.expandTeamBriefAudience(users, reps, spec));

  assert.deepEqual(publishedSnapshot.map(row => row.rep_id), ["cammy"]);
  assert.deepEqual(laterExpansion.map(row => row.rep_id), ["cammy", "farah"]);
  assert.deepEqual(publishedSnapshot.map(row => row.rep_id), ["cammy"], "stored rows do not re-expand");
});

test("regional timezone conversion stores concrete instants", () => {
  assert.equal(
    dm.zonedLocalDateTimeToIso("2026-07-24T17:00", "America/Chicago"),
    "2026-07-24T22:00:00.000Z"
  );
  assert.equal(
    dm.zonedLocalDateTimeToIso("2026-07-24T17:00", "Europe/London"),
    "2026-07-24T16:00:00.000Z"
  );
  assert.equal(
    dm.teamBriefTimezoneForAudience(audience("team_region", "cs", "APAC")),
    "Australia/Sydney"
  );
});

test("urgency is region-calendar aware and acknowledged action stays visible by default", () => {
  const now = "2026-07-23T14:00:00Z";
  const base = {
    status: "published",
    publish_at: "2026-07-23T12:00:00Z",
    archived_at: null,
    expires_at: null,
    timezone: "America/Chicago",
    brief_type: "action_required",
    display_rule: "manual_clear",
  };

  assert.equal(dm.teamBriefUrgency({ ...base, due_at: "2026-07-23T22:00:00Z" }, now), "today");
  assert.equal(dm.teamBriefUrgency({ ...base, due_at: "2026-07-24T22:00:00Z" }, now), "tomorrow");
  assert.equal(dm.teamBriefUrgency({ ...base, due_at: "2026-07-22T22:00:00Z" }, now), "overdue");
  assert.equal(dm.teamBriefIsVisible(base, true, now), true);
  assert.equal(dm.teamBriefIsVisible({ ...base, display_rule: "until_acknowledged" }, true, now), false);
});

test("comments are trimmed, nonempty, and length bounded", () => {
  assert.deepEqual(
    { ...dm.normalizeTeamBriefComment("  Follow-up detail  ") },
    { ok: true, value: "Follow-up detail", error: null }
  );
  assert.equal(dm.normalizeTeamBriefComment(" \n ").ok, false);
  assert.equal(dm.normalizeTeamBriefComment("x".repeat(dm.TEAM_BRIEF_COMMENT_MAX_LENGTH)).ok, true);
  assert.equal(dm.normalizeTeamBriefComment("x".repeat(dm.TEAM_BRIEF_COMMENT_MAX_LENGTH + 1)).ok, false);
});

test("team-briefs is a valid deep-link route id", () => {
  assert.equal(dm.parseUrlState("?view=team-briefs").view, "team-briefs");
  assert.equal(dm.parseUrlState("?view=manager:team-briefs").view, null);
});
