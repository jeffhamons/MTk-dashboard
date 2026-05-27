-- ============================================================
-- Weekly Wins table — one row per (rep, week)
-- Stores all four form sections as JSONB columns.
-- Run in Supabase → SQL Editor → New query → Run
-- ============================================================

create table if not exists wins (
  id          bigserial primary key,
  rep_id      text not null,          -- 'cammy', 'farah', etc.
  week_index  int  not null,          -- numeric part of 'w1'..'w10'
  worked_on   jsonb not null default '[]'::jsonb,  -- [{task, why}]
  invisible   jsonb not null default '[]'::jsonb,  -- [{task, context}]
  big_win     jsonb not null default '{}'::jsonb,  -- {win, why}
  hype        jsonb not null default '[]'::jsonb,  -- [{source, quote}]
  updated_at  timestamptz not null default now(),
  updated_by  text,                   -- email of last editor
  unique (rep_id, week_index)
);

create index if not exists wins_rep_week_idx on wins (rep_id, week_index);

-- ── Row Level Security (same trust model as checks/asks) ──────────────────
alter table wins enable row level security;

create policy "anyone can read wins"   on wins for select using (true);
create policy "anyone can insert wins" on wins for insert with check (true);
create policy "anyone can update wins" on wins for update using (true) with check (true);
create policy "anyone can delete wins" on wins for delete using (true);

-- ── Realtime ─────────────────────────────────────────────────────────────
alter publication supabase_realtime add table wins;
