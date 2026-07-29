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

test("rep Current and History classification is a complete visibility partition", () => {
  const now = "2026-07-23T14:00:00Z";
  const base = {
    status: "published",
    publish_at: "2026-07-23T12:00:00Z",
    archived_at: null,
    expires_at: null,
    brief_type: "morning_message",
    display_rule: "manual_clear",
  };
  const cases = [
    ["an expired brief", { ...base, expires_at: "2026-07-23T13:59:59Z" }, false, "history"],
    ["an acknowledged until-acknowledged brief", { ...base, display_rule: "until_acknowledged" }, true, "history"],
    ["an acknowledged overdue manual-clear action", {
      ...base,
      brief_type: "action_required",
      due_at: "2026-07-22T22:00:00Z",
    }, true, "current"],
    ["an archived brief", { ...base, status: "archived", archived_at: "2026-07-23T13:00:00Z" }, false, "history"],
    ["a visible unacknowledged brief", base, false, "current"],
  ];

  for (const [label, brief, acknowledged, expected] of cases) {
    const section = dm.teamBriefRepSection(brief, acknowledged, now);
    assert.equal(section, expected, label);
    assert.ok(["current", "history"].includes(section), `${label} has exactly one section`);
    assert.equal(
      section === "current",
      dm.teamBriefIsVisible(brief, acknowledged, now),
      `${label} derives Current directly from visibility`
    );
  }
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

// ── RFC-164 Phase 2: rung / surface / outstanding / catch-up ────────────────

const nowFixed = "2026-07-23T14:00:00Z";
const askBase = {
  id: "b1",
  status: "published",
  publish_at: "2026-07-20T12:00:00Z",
  archived_at: null,
  expires_at: null,
  timezone: "America/Chicago",
  brief_type: "action_required",
  display_rule: "manual_clear",
  require_ack: true,
};

test("teamBriefRung reaches each of 0, 1, 2, and 3", () => {
  // Rung 0: done
  assert.equal(
    dm.teamBriefRung(
      { ...askBase, due_at: "2026-07-30T22:00:00Z" },
      { read_at: "2026-07-21T10:00:00Z", done_at: "2026-07-22T10:00:00Z" },
      nowFixed
    ),
    0
  );
  // Rung 1: outstanding ask, far from due
  assert.equal(
    dm.teamBriefRung(
      { ...askBase, due_at: "2026-07-30T22:00:00Z" },
      null,
      nowFixed
    ),
    1
  );
  // Rung 2: due within RUNG_WARN_DAYS (due in 2 local days from July 23 → July 25)
  assert.equal(
    dm.teamBriefRung(
      { ...askBase, due_at: "2026-07-25T22:00:00Z" },
      null,
      nowFixed
    ),
    2
  );
  // Rung 3: overdue, never read, within STALE_DAYS
  assert.equal(
    dm.teamBriefRung(
      { ...askBase, due_at: "2026-07-20T22:00:00Z" },
      null,
      nowFixed
    ),
    3
  );
});

test("teamBriefRung overdue-and-read is rung 2 not 3", () => {
  assert.equal(
    dm.teamBriefRung(
      { ...askBase, due_at: "2026-07-20T22:00:00Z" },
      { read_at: "2026-07-21T10:00:00Z", done_at: null },
      nowFixed
    ),
    2
  );
  assert.notEqual(
    dm.teamBriefRung(
      { ...askBase, due_at: "2026-07-20T22:00:00Z" },
      { read_at: "2026-07-21T10:00:00Z", done_at: null },
      nowFixed
    ),
    3
  );
});

test("teamBriefRung decays from 3 to 2 past TEAM_BRIEF_STALE_DAYS", () => {
  // due 2026-07-09, now 2026-07-23 → 14 local days past due in Chicago (inclusive → still 3)
  const dueAtBoundary = "2026-07-09T22:00:00Z";
  const nowAtStale = "2026-07-23T14:00:00Z";
  assert.equal(dm.TEAM_BRIEF_STALE_DAYS, 14);
  assert.equal(
    dm.teamBriefRung({ ...askBase, due_at: dueAtBoundary }, null, nowAtStale),
    3,
    "exactly STALE_DAYS past due is still rung 3"
  );
  // one day later → 15 days past → decay to 2
  assert.equal(
    dm.teamBriefRung(
      { ...askBase, due_at: dueAtBoundary },
      null,
      "2026-07-24T14:00:00Z"
    ),
    2,
    "one day past STALE_DAYS decays to rung 2"
  );
});

test("teamBriefRung with null due_at stays at rung 1", () => {
  assert.equal(
    dm.teamBriefRung({ ...askBase, due_at: null }, null, nowFixed),
    1
  );
  // Must not treat null as epoch-overdue and escalate
  assert.notEqual(
    dm.teamBriefRung({ ...askBase, due_at: null }, null, nowFixed),
    2
  );
  assert.notEqual(
    dm.teamBriefRung({ ...askBase, due_at: null }, null, nowFixed),
    3
  );
  // Read but not done, no due — still rung 1
  assert.equal(
    dm.teamBriefRung(
      { ...askBase, due_at: null },
      { read_at: "2026-07-21T10:00:00Z", done_at: null },
      nowFixed
    ),
    1
  );
});

test("teamBriefRung informational never escalates past rung 1", () => {
  // Unread informational with past due date — still 1, not 2 or 3
  assert.equal(
    dm.teamBriefRung(
      {
        ...askBase,
        require_ack: false,
        brief_type: "morning_message",
        due_at: "2026-07-20T22:00:00Z",
      },
      null,
      nowFixed
    ),
    1
  );
  // Read informational → 0
  assert.equal(
    dm.teamBriefRung(
      {
        ...askBase,
        require_ack: false,
        brief_type: "fyi",
        due_at: "2026-07-20T22:00:00Z",
      },
      { read_at: "2026-07-21T10:00:00Z", done_at: null },
      nowFixed
    ),
    0
  );
});

test("teamBriefRung day-math anchors on brief.timezone", () => {
  // Instant where Chicago is still July 23 evening and Sydney is already July 24.
  // due local day July 26 in both zones → Chicago daysUntil=3 (rung 1),
  // Sydney daysUntil=2 (rung 2 / within RUNG_WARN_DAYS).
  const nowTz = "2026-07-24T02:00:00Z";
  const due = "2026-07-26T12:00:00Z";
  const chicago = dm.teamBriefRung(
    { ...askBase, due_at: due, timezone: "America/Chicago" },
    null,
    nowTz
  );
  const sydney = dm.teamBriefRung(
    { ...askBase, due_at: due, timezone: "Australia/Sydney" },
    null,
    nowTz
  );
  assert.notEqual(
    chicago,
    sydney,
    "identical briefs with different timezones must yield different rungs when local calendar days diverge"
  );
  assert.equal(chicago, 1);
  assert.equal(sydney, 2);
});

test("briefSurfaceShape branches and non-home regression", () => {
  assert.equal(
    dm.briefSurfaceShape({
      view: "home",
      heroMounted: true,
      heroOnScreen: true,
      outstandingCount: 0,
    }),
    null
  );
  assert.equal(
    dm.briefSurfaceShape({
      view: "home",
      heroMounted: false,
      heroOnScreen: true,
      outstandingCount: 2,
    }),
    "strip"
  );
  assert.equal(
    dm.briefSurfaceShape({
      view: "home",
      heroMounted: true,
      heroOnScreen: true,
      outstandingCount: 2,
    }),
    "hero"
  );
  assert.equal(
    dm.briefSurfaceShape({
      view: "home",
      heroMounted: true,
      heroOnScreen: false,
      outstandingCount: 2,
    }),
    "strip"
  );
  // Regression: non-home must return strip even when heroOnScreen is true
  assert.equal(
    dm.briefSurfaceShape({
      view: "team",
      heroMounted: true,
      heroOnScreen: true,
      outstandingCount: 3,
    }),
    "strip"
  );
});

test("teamBriefCatchup caps at CATCHUP_LIMIT newest-first with olderCount", () => {
  assert.equal(dm.TEAM_BRIEF_CATCHUP_LIMIT, 10);
  const briefs = [];
  for (let i = 0; i < 15; i++) {
    briefs.push({
      ...askBase,
      id: `c${i}`,
      // older publish first in array; catch-up must re-sort newest first
      publish_at: `2026-07-${String(i + 1).padStart(2, "0")}T12:00:00Z`,
      due_at: "2026-07-30T22:00:00Z",
      require_ack: true,
    });
  }
  const { items, olderCount } = dm.teamBriefCatchup(briefs, {}, nowFixed);
  assert.equal(items.length, dm.TEAM_BRIEF_CATCHUP_LIMIT);
  assert.equal(olderCount, 5);
  // Newest first by publish_at
  for (let i = 0; i < items.length - 1; i++) {
    assert.ok(
      new Date(items[i].publish_at).getTime()
        >= new Date(items[i + 1].publish_at).getTime(),
      "catch-up items ordered publish_at desc"
    );
  }
  assert.equal(items[0].id, "c14");
  assert.equal(items[9].id, "c5");
});

test("teamBriefOutstanding filters done, read informational, and keeps read asks", () => {
  const doneAsk = {
    ...askBase,
    id: "done",
    due_at: "2026-07-30T22:00:00Z",
    publish_at: "2026-07-22T12:00:00Z",
  };
  const readInfo = {
    ...askBase,
    id: "info",
    require_ack: false,
    brief_type: "fyi",
    due_at: null,
    publish_at: "2026-07-21T12:00:00Z",
  };
  const readAsk = {
    ...askBase,
    id: "read-ask",
    due_at: "2026-07-30T22:00:00Z",
    publish_at: "2026-07-20T12:00:00Z",
  };
  const unreadAsk = {
    ...askBase,
    id: "unread",
    due_at: "2026-07-20T22:00:00Z", // overdue → rung 3
    publish_at: "2026-07-19T12:00:00Z",
  };
  const receipts = {
    done: { read_at: "2026-07-21T10:00:00Z", done_at: "2026-07-22T10:00:00Z" },
    info: { read_at: "2026-07-21T10:00:00Z", done_at: null },
    "read-ask": { read_at: "2026-07-21T10:00:00Z", done_at: null },
    // unread has no receipt
  };
  const got = dm.teamBriefOutstanding(
    [doneAsk, readInfo, readAsk, unreadAsk],
    receipts,
    nowFixed
  );
  const ids = got.map(b => b.id);
  assert.ok(!ids.includes("done"), "excludes done briefs");
  assert.ok(!ids.includes("info"), "excludes read informational briefs");
  assert.ok(ids.includes("read-ask"), "includes read-but-not-done asks");
  assert.ok(ids.includes("unread"), "includes unread outstanding asks");
  // Sort: rung desc first (unread=3 before read-ask=1)
  assert.equal(got[0].id, "unread");
  assert.ok(ids.indexOf("read-ask") > ids.indexOf("unread"));
});

// §4.3 says the rung ordering replaces teamBriefSort for rep-facing surfaces
// and that two orderings must not coexist. The comparator is exported so the
// Current tab on the full page can sort identically to the hero without a
// second copy of the tie-break chain — this test pins that it IS the one used.
test("teamBriefRungOrder is the ordering teamBriefOutstanding sorts by", () => {
  const rung3 = {
    ...askBase, id: "r3",
    due_at: "2026-07-20T22:00:00Z",       // overdue, unread → 3
    publish_at: "2026-07-10T12:00:00Z",
  };
  const rung2Soon = {
    ...askBase, id: "r2",
    due_at: "2026-07-24T22:00:00Z",       // within WARN_DAYS → 2
    publish_at: "2026-07-11T12:00:00Z",
  };
  const rung1Far = {
    ...askBase, id: "r1-far",
    due_at: "2026-08-30T22:00:00Z",
    publish_at: "2026-07-12T12:00:00Z",
  };
  const rung1NoDue = {
    ...askBase, id: "r1-nodue",
    due_at: null,                          // no due date sorts after any dated peer
    publish_at: "2026-07-13T12:00:00Z",
  };
  const rung1NoDueOlder = {
    ...askBase, id: "r1-nodue-old",
    due_at: null,
    publish_at: "2026-07-09T12:00:00Z",    // same rung, same due → newer first
  };
  const briefs = [rung1NoDueOlder, rung1NoDue, rung1Far, rung2Soon, rung3];

  const direct = briefs.slice().sort(dm.teamBriefRungOrder({}, nowFixed)).map(b => b.id);
  assert.deepEqual(direct, ["r3", "r2", "r1-far", "r1-nodue", "r1-nodue-old"]);

  const viaOutstanding = dm.teamBriefOutstanding(briefs, {}, nowFixed).map(b => b.id);
  assert.deepEqual(viaOutstanding, direct,
    "teamBriefOutstanding must sort through the exported comparator");

  // A null/absent receipts map must not throw — the Current tab passes a map
  // built from whatever `brief.reads` happened to load.
  assert.doesNotThrow(() => briefs.slice().sort(dm.teamBriefRungOrder(null, nowFixed)));
});

// Catch-up is deliberately NOT visibility-filtered: an expired brief the rep
// never answered is exactly what the sweep exists to surface. If either
// collection function starts routing through teamBriefIsVisible, this goes red.
test("teamBriefCatchup includes briefs that have already expired", () => {
  const expired = {
    ...askBase,
    id: "expired",
    due_at: "2026-07-25T22:00:00Z",
    expires_at: "2026-07-22T00:00:00Z",
  };
  const { items } = dm.teamBriefCatchup([expired], {}, nowFixed);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "expired");
});
