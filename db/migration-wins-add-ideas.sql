-- ============================================================
-- Weekly Wins — "Don-ate an Idea" section (issue #6505)
-- Adds a fifth JSONB column to the existing `wins` table for
-- optional improvement ideas, sparked by Don Hazelwood's ask for
-- a low-friction, non-blocker-framed way to flag "we could do
-- X better" thoughts. No RLS change needed: policies on `wins`
-- are row-scoped (rep_id/team), not column-scoped, so the
-- existing team-read / owner-write policies already cover it.
-- Run in Supabase → SQL Editor → New query → Run
-- ============================================================

alter table wins
  add column if not exists ideas jsonb not null default '[]'::jsonb; -- [{idea, fix}]
