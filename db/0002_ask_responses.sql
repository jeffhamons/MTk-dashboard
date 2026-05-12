-- 0002_ask_responses.sql
-- Two-way flags: managers can reply to a rep's raised ask without leaving
-- the dashboard. The reply is stored on the same row as the ask itself and
-- is visible to both rep and manager. Clearing the ask (rep marks resolved)
-- also drops the response, which is the intended behavior — once the loop
-- is closed, the conversation goes with it.
--
-- Apply via Supabase Dashboard → SQL Editor.

alter table public.asks
  add column if not exists response          text,
  add column if not exists response_by_email text,
  add column if not exists response_by_name  text,
  add column if not exists response_at       timestamptz;

-- RLS — managers need UPDATE permission on any rep's ask row to write the
-- response. The existing rep-write policies should keep the body owned by
-- the rep; this policy adds manager-write for the response columns only.
--
-- Adjust the role lookup to match how your `users` table flags managers.
-- If you already have a `manager_only` predicate / helper function used by
-- the manager_notes policies, reuse it here.
--
-- Example (uncomment + adapt to match the existing schema):
--
--   create policy "asks: managers can write response"
--     on public.asks
--     for update
--     to authenticated
--     using (
--       exists (
--         select 1 from public.users u
--         where u.auth_id = auth.uid() and u.role = 'manager'
--       )
--     )
--     with check (
--       exists (
--         select 1 from public.users u
--         where u.auth_id = auth.uid() and u.role = 'manager'
--       )
--     );
