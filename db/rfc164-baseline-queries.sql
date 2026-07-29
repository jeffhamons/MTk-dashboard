-- ============================================================
-- RFC-164 · Phase 0.5 baseline — READ-ONLY. Nothing here writes.
--
-- Run all three in the Supabase SQL editor and paste the results back.
-- Phases 2 through 7 of RFC-164 are blocked until they return, because
-- the whole escalation ladder is a fix for a problem we have not yet
-- measured. Phase 0 has already shipped and does not depend on this.
--
-- Decision gate (RFC-164 §6 Phase 0.5):
--   World 1 — corpus is mostly morning_message / require_ack false:
--             Phase 0 already fixed the real defect. Re-measure in two
--             weeks before building the ladder.
--   World 2 — reps are not logging in: STOP. No rep-facing surface
--             addresses that; reopen D3.
--   World 3 — logging in but not acting: proceed to Phase 1+.
-- ============================================================

-- ---- 1. Volume and mix -------------------------------------
-- What is actually being published? If this is nearly all
-- morning_message, there is no acknowledgement problem to fix.

select brief_type, display_rule, require_ack, count(*)
from public.team_briefs
where publish_at > now() - interval '90 days'
group by 1, 2, 3 order by 4 desc;

-- ---- 2. Read rate per type ---------------------------------
-- delivered = frozen audience seats; read = receipts against them.

select b.brief_type,
       count(distinct am.brief_id || am.rep_id)                    as delivered,
       count(distinct r.brief_id || r.rep_id)                      as read,
       round(100.0 * count(distinct r.brief_id || r.rep_id)
             / nullif(count(distinct am.brief_id || am.rep_id), 0), 1) as read_pct
from public.team_briefs b
join public.team_brief_audience_members am on am.brief_id = b.id
left join public.team_brief_reads r on r.brief_id = am.brief_id and r.rep_id = am.rep_id
where b.publish_at > now() - interval '90 days'
group by 1;

-- ---- 3. Is anyone logging in at all? -----------------------
-- CAVEAT (RFC-164 §6): a last_sign_in_at can be a mail scanner following
-- a magic link rather than a human — this has already happened on this
-- dashboard. A low number here is decisive; a HIGH number is not, and
-- needs corroborating with an application-level signal before anyone
-- concludes reps are active.

select count(*) filter (where last_sign_in_at > now() - interval '30 days') as active_30d,
       count(*) as total
from auth.users u join public.users pu on pu.auth_id = u.id
where pu.role = 'rep';
