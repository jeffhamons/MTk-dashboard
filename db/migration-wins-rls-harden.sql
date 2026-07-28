-- ============================================================
-- Weekly Wins RLS Hardening — enforce rep-ownership for edits + deletes (F45 / #1224)
-- Run in Supabase → SQL Editor → New query → Run (idempotent).
-- APPLIED to project tvdizqryowracmtjdskv on 2026-05-29 (verified vs live schema).
-- 2026-05-29 follow-up: DELETE also hardened to rep-ownership (was the permissive
-- "anyone can delete wins"); applied to live + advisor-verified — public.wins now
-- has zero permissive-RLS lints.
-- ============================================================
-- Prevents a signed-in user from inserting/updating/deleting a wins row for a rep
-- that isn't theirs (the client-side canEdit gate in wins-form.jsx is the first
-- line; this is server-side defense-in-depth).
--
-- Linkage (verified against the live schema, NOT assumed):
--   - auth.uid() is a uuid; it maps to public.users via the **auth_id** column,
--     NOT users.id (which is a separate uuid PK — auth.uid() never equals it).
--   - public.users.rep_id is text and matches public.wins.rep_id (text).
--   - A manager (role='manager') may edit any row; their rep_id is NULL, so the
--     manager branch — not the ownership branch — is what grants them.
--   - An unmapped non-manager (rep_id NULL) is denied (NULL = rep_id → NULL).
--   - public.users RLS is "authenticated can read all", so the subqueries below
--     resolve for any signed-in user.
--
-- Read (SELECT) is intentionally left permissive ("anyone can read wins") — the
-- leaderboard is shared-visible. DELETE is now ownership-enforced below (mirrors
-- UPDATE): a manager or the owning rep may delete; cross-rep deletes are blocked.

-- Idempotent: drop the old permissive policies and any prior attempt's names.
drop policy if exists "anyone can insert wins" on public.wins;
drop policy if exists "anyone can update wins" on public.wins;
drop policy if exists "users can only edit own wins" on public.wins;
drop policy if exists "users insert own wins" on public.wins;
drop policy if exists "users update own wins" on public.wins;
drop policy if exists "anyone can delete wins" on public.wins;
drop policy if exists "users delete own wins" on public.wins;

-- ── SUPERSEDED 2026-07-28 (issue #11) ─────────────────────────────────────
-- The three policies this file used to create — "users insert own wins",
-- "users update own wins", "users delete own wins" — are no longer created.
-- The drop statements above are kept so this file remains a working cleanup
-- script for a database that still has them.
--
-- Two defects made these unsafe to leave resurrectable by an out-of-order
-- deploy:
--   1. No `TO` clause → the policies applied to PUBLIC, which includes the
--      `anon` role, not just `authenticated`.
--   2. They predate the reps registry, so they grant owner-write purely on
--      users.rep_id and never consult `reps.active`. Re-running this file
--      after db/migration-team-rbac-rls.sql would OR them alongside the
--      scoped policies and hand a DEACTIVATED rep their write access back
--      (issue #9) — permissive policies OR together, so the weaker one wins.
--
-- Replacement: db/migration-team-rbac-rls.sql creates
-- "owner manager or admin insert/update/delete wins", scoped to
-- `authenticated`, with the owner branch joined against `reps.active`, plus
-- a covering-team-admin branch this file never had. Apply that file (after
-- db/migration-team-rbac-schema.sql) instead. Per README "Schema and
-- Supabase authority", applying it to Supabase is a manual step.
