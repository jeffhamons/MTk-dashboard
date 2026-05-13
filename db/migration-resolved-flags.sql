-- ============================================================
-- Soft-resolve asks + attribution
--
-- Switches the "dismiss flag" path from DELETE to UPDATE
-- resolved_at = now(), and adds columns so we can show who
-- resolved each flag in the history view.
-- ============================================================

alter table asks
  add column if not exists resolved_by_email text,
  add column if not exists resolved_by_name  text,
  add column if not exists resolved_by_role  text;  -- 'rep' | 'manager'

-- Index for the history query (resolved rows, newest first).
create index if not exists asks_resolved_idx
  on asks (resolved_at desc)
  where resolved_at is not null;
