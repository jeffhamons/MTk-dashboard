-- ============================================================
-- Soft-dismiss cs_risks + attribution (issue #28)
--
-- cs_risks currently has no dismiss path other than a hard DELETE
-- (window.deleteCsRisk -> `delete from cs_risks`). This mirrors the
-- soft-resolve contract already established for `asks`
-- (see migration-resolved-flags.sql): add resolved_at + attribution
-- columns so a "dismiss" can be an UPDATE (resolved_at = now()) instead
-- of a permanent delete, and the row can be reopened by clearing
-- resolved_at.
--
-- MANUAL FOLLOW-UP REQUIRED: this file does not apply itself. Per this
-- repo's README, db/*.sql migrations do not reach live Supabase
-- automatically -- Jeff must run this against the live project by hand
-- (Supabase SQL editor or `supabase db push`) before the soft-dismiss
-- UI path in cs-risks-focus.jsx / cs-data.jsx will actually persist.
-- ============================================================

alter table public.cs_risks
  add column if not exists resolved_at      timestamptz,
  add column if not exists resolved_by_email text,
  add column if not exists resolved_by_name  text,
  add column if not exists resolved_by_role  text;  -- 'rep' | 'manager'

-- Index for a future resolved-risks history view (resolved rows, newest first).
create index if not exists cs_risks_resolved_idx
  on public.cs_risks (resolved_at desc)
  where resolved_at is not null;
