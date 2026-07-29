-- ============================================================
-- Mike Cawood's two login identities — audit and decision aid.
--
-- READ-ONLY above the line marked OPTIONAL. Nothing runs by being committed.
--
-- ── Recommendation: change nothing. ─────────────────────────
--
-- Live state, 2026-07-28 — two `public.users` rows, both role='rep', both
-- with an auth_id, both seated in both published briefs:
--
--   eecdbb30-8bb5-4828-bbd9-f44ba2bd1200  michael.cawood@mindtools-kineo.com  2026-07-22 14:25
--   8fdb77fd-2b2e-4112-b878-22cfda5f19de  m.cawood@mindtools.com              2026-07-23 13:30
--
-- The kineo.com address is the corporate domain that quarantines magic links;
-- the mindtools.com address was provisioned a day later as the working bypass.
-- (The 2026-07-23 13:38 sign-in on the kineo identity is the Microsoft link
-- scanner following the link, not a human. The human sign-in is 14:56 on the
-- mindtools.com identity.)
--
-- This was flagged as causing an inflated denominator and a split read
-- receipt. Neither holds. Both were designed for, and the code does dedupe:
--
--   * Receipts are rep-grained, not auth-grained. `team_brief_reads` is
--     `primary key (brief_id, rep_id)` (db/migration-team-briefs.sql:160).
--     Acknowledging from EITHER identity writes the same single row, so he
--     cannot sit in "haven't read" because he used the other address. The FK
--     `(brief_id, auth_id, rep_id)` exists precisely to prove the
--     acknowledging alias belongs to that rep.
--   * The denominator is rep-grained. `teamBriefAudienceByRep`
--     (src/team-briefs.jsx:214) collapses seats by `rep_id` and collects the
--     alias auth_ids, and every counter in the Phase 7 manager card reads
--     `audienceState.audience`, which is that collapsed list. The raw
--     `team_brief_audience_members` row count is 4 for him across 2 briefs;
--     nothing user-facing counts raw rows.
--
-- README says the same thing as intended behaviour: "Multiple authenticated
-- email identities may intentionally map to the same rep_id... Acknowledging
-- from either identity acknowledges the brief for that rep."
--
-- So the duplicate is the mechanism working, not a defect. Removing the
-- mindtools.com row would take away the only identity whose magic links
-- actually arrive, and lock him out.
--
-- Queries 1-3 confirm all of the above against live data. Run them before
-- deciding anything.
-- ============================================================

-- ---- 1. The two identities, and what each has actually done ----

select u.auth_id, u.email, u.role, u.rep_id,
       au.created_at, au.last_sign_in_at,
       (select count(*) from public.team_brief_audience_members am
         where am.auth_id = u.auth_id)                       as seats,
       (select count(*) from public.team_brief_reads r
         where r.auth_id = u.auth_id)                        as receipts_recorded
from public.users u
left join auth.users au on au.id = u.auth_id
where u.rep_id = 'mike'
order by au.created_at;

-- ---- 2. Proof the receipt is one per rep, not one per alias ----
-- `identities_seated` may be 2. `receipts` can never exceed 1 per brief,
-- because of the primary key. If any row shows receipts > 1, the premise of
-- this file is wrong and the schema is not what it claims — stop and re-read.

select b.id, left(b.title, 40) as title,
       count(distinct am.auth_id) as identities_seated,
       count(distinct am.rep_id)  as reps_seated,
       count(distinct r.rep_id)   as receipts
from public.team_briefs b
join public.team_brief_audience_members am
  on am.brief_id = b.id and am.rep_id = 'mike'
left join public.team_brief_reads r
  on r.brief_id = b.id and r.rep_id = 'mike'
group by b.id, b.title
order by b.id;

-- ---- 3. Proof the denominator is unaffected --------------------
-- `audience_rows` counts raw seats and will exceed `distinct_reps` by exactly
-- the number of extra aliases. Every user-facing counter uses the second
-- number. This query exists to show the gap is real in the table and absent
-- from the product.

select b.id, left(b.title, 40) as title,
       count(*)                    as audience_rows,
       count(distinct am.rep_id)   as distinct_reps,
       count(*) - count(distinct am.rep_id) as alias_surplus
from public.team_briefs b
join public.team_brief_audience_members am on am.brief_id = b.id
group by b.id, b.title
order by b.id;

-- ════════════════════════════════════════════════════════════
-- OPTIONAL — only if Jeff decides to consolidate anyway
-- ════════════════════════════════════════════════════════════
--
-- Reasons to consolidate that are NOT about Team Briefs: one address in the
-- roster and in reports, or a policy that a person holds one dashboard login.
-- Those are legitimate; the Team Briefs numbers are not a reason.
--
-- Rules if you do:
--   * NEVER delete from `auth.users`. That destroys the login, and the
--     `team_brief_audience_members` FK cascade would take his frozen audience
--     rows and any receipt hanging off them with it.
--   * Keep `m.cawood@mindtools.com` (8fdb77fd…) as canonical. It is the
--     identity whose magic links are not quarantined. Retiring it in favour of
--     the kineo.com address locks him out of the dashboard entirely.
--   * Demoting the surplus `public.users` row is reversible and enough: it
--     drops out of future audience expansion, because publish filters
--     `u.role = 'rep'`. Already-frozen seats stay, which is correct — they are
--     the historical access record, and the dedupe means they cost nothing.
--
-- Verify first (expect one row, the kineo.com identity):
--
--   select auth_id, email, role from public.users
--   where rep_id = 'mike' and auth_id <> '8fdb77fd-2b2e-4112-b878-22cfda5f19de';
--
-- Then, if and only if that returned what you expected:
--
--   update public.users
--   set role = 'inactive_alias'
--   where rep_id = 'mike'
--     and auth_id = 'eecdbb30-8bb5-4828-bbd9-f44ba2bd1200';
--
-- NOTE: 'inactive_alias' will fail `users_role_check`, which allows only
-- 'rep' | 'manager' | 'team_admin' (db/migration-team-rbac-schema.sql:34).
-- That is intentional — there is no "retired identity" role in this schema.
-- Adding one is a schema decision with its own blast radius across every RLS
-- policy that tests `u.role`, and it is not something to slip into a cleanup.
-- Widen the constraint deliberately, or leave both rows as 'rep' and accept
-- the alias, which is what the system was built to do.
--
-- To reverse a demotion:
--   update public.users set role = 'rep'
--   where auth_id = 'eecdbb30-8bb5-4828-bbd9-f44ba2bd1200';
