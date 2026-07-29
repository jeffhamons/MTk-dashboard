-- ============================================================
-- Team Briefs · reachability audit — READ-ONLY. Nothing here writes.
--
-- Answers one question: which reps can a Team Brief actually reach?
--
-- `publish_team_brief` expands the audience with
--   `where u.role = 'rep' and u.auth_id is not null and r.active`
-- and raises only when the result is empty ENTIRELY. Any partial miss
-- publishes successfully and reports nothing, so an unreachable rep is
-- invisible from both ends: the manager sees a green publish, and the rep sees
-- "You're caught up on Team Briefs." Run query 1 before any broad publish.
--
-- ── Read the output correctly ───────────────────────────────
-- "Unreachable" here means "would not be seated by a publish today". It does
-- NOT mean "should have been seated". Being on the roster is not the same as
-- being a Team Briefs recipient: as of 2026-07-28 every CS rep outside the US
-- has no `public.users` row, and that is expected — they are rostered for the
-- weekly-review surfaces and are not brief recipients.
--
--   APAC/cs  aaron, angela, cindy, sarah, suzanne
--   EMEA/cs  alex, james, laura, owen, rowan
--
-- Treat `no dashboard account` rows as informational. The rows worth acting on
-- are the other two reasons — an account that exists but has the wrong role, or
-- one that was invited and never signed in. Those are also the only ones the
-- publish-time warning records.
--
-- Related: issue #4369, the `-- OPS: live public.reps needs the same upsert`
-- note at db/migration-team-rbac-rls.sql:619.
-- ============================================================

-- ---- 1. Who would not be seated by a publish, and why ------
-- `needs_attention` is the column to read. The remedy for a false there is
-- provisioning, not schema: an `allowed_emails` row, an invite, and a first
-- magic-link sign-in (the trigger creates the `public.users` row from the
-- allowlist on first sign-in) — but only for people who are meant to receive
-- briefs in the first place.

with account as (
  select r.rep_id,
         (select count(*) from public.users u where u.rep_id = r.rep_id) as rows_found,
         (select u.role from public.users u where u.rep_id = r.rep_id
           order by u.created_at limit 1)                                as role,
         (select bool_or(u.auth_id is not null) from public.users u
           where u.rep_id = r.rep_id)                                    as has_auth
  from public.reps r
)
select r.region, r.team_id, r.rep_id, r.name,
       case
         when a.rows_found = 0 then 'no dashboard account'
         when not a.has_auth then 'invited but never signed in'
         else 'account role is ' || coalesce(a.role, 'unset') || ', not rep'
       end as why_unreachable,
       -- The rows that represent something going wrong, as opposed to somebody
       -- simply not being a dashboard user.
       (a.rows_found > 0) as needs_attention,
       exists (select 1 from public.allowed_emails ae where ae.rep_id = r.rep_id)
         as on_allowlist
from public.reps r
join account a on a.rep_id = r.rep_id
where r.active
  and not exists (
    select 1 from public.users u
    where u.rep_id = r.rep_id and u.role = 'rep' and u.auth_id is not null
  )
order by (a.rows_found > 0) desc, r.region, r.team_id, r.rep_id;

-- ---- 2. Reachable headcount per audience target ------------
-- What each of the six canonical targets would actually reach today. Compare
-- against the roster you believe you are addressing before publishing. A large
-- `unreachable` on a team×region whose people are not dashboard users is
-- expected, not alarming — see the header.

with reachable as (
  select r.team_id, r.region, count(distinct r.rep_id) as reachable
  from public.reps r
  join public.users u
    on u.rep_id = r.rep_id and u.role = 'rep' and u.auth_id is not null
  where r.active
  group by r.team_id, r.region
),
seated as (
  select r.team_id, r.region, count(distinct r.rep_id) as on_roster
  from public.reps r where r.active group by r.team_id, r.region
)
select s.team_id, s.region,
       coalesce(x.reachable, 0) as reachable,
       s.on_roster,
       s.on_roster - coalesce(x.reachable, 0) as unreachable
from seated s
left join reachable x on x.team_id = s.team_id and x.region = s.region
order by s.team_id, s.region;

-- ---- 3. Roster drift check ---------------------------------
-- Expected once the 26-row upsert at db/migration-team-rbac-rls.sql:619 has
-- been applied (active/total): US 5/6 · EMEA 11/12 · APAC 8/8, 26 total.
-- A 'ZA' row or a missing APAC bucket means #4369 is still open live and the
-- roster the audience expands from is the older 17-row seed
-- (db/migration-team-rbac-schema.sql:77).

select region, count(*) filter (where active) as active, count(*) as total
from public.reps
group by region
order by region;

-- ---- 4. Reps with more than one login identity -------------
-- Intentional and supported: a rep whose corporate domain quarantines magic
-- links may hold a second, working address. Both identities are seated, and
-- both the acknowledgement denominator and the receipt are rep-grained, so
-- this does NOT inflate any number — `team_brief_reads` is keyed
-- `(brief_id, rep_id)` and `teamBriefAudienceByRep` in src/team-briefs.jsx
-- collapses seats by rep before counting.
--
-- Listed here so aliases are a known quantity rather than a surprise during
-- an audit. Do not "clean up" a row on the strength of this query alone; see
-- db/audit-mike-cawood-identities.sql.

select u.rep_id, count(*) as identities,
       pg_catalog.string_agg(u.email, ', ' order by u.created_at) as addresses
from public.users u
where u.role = 'rep' and u.auth_id is not null
group by u.rep_id
having count(*) > 1
order by u.rep_id;

-- ---- 5. What recent publishes actually dropped -------------
-- Requires db/migration-team-briefs-publish-skips.sql. Empty is good; empty
-- also means the migration may simply not be applied yet.

select b.publish_at, left(b.title, 40) as title,
       s.rep_id, s.name, s.region, s.team_id, s.reason
from public.team_brief_audience_skips s
join public.team_briefs b on b.id = s.brief_id
order by b.publish_at desc, s.region, s.rep_id;
