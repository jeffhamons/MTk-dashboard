-- migration-deal-book-final-opportunity-key.sql
-- RFC-158 A7 fix: cs_deal_book_final's unique key was not deal-unique.
-- A rep can close two DISTINCT deals for the same account, same kind, same
-- close_date in one quarter (prod 2026-07-13: Trillium Health had two Q2
-- renewals; 7 such collisions total). The nightly archive UPSERT then aborts
-- (SQLSTATE 21000, "ON CONFLICT DO UPDATE command cannot affect row a second
-- time"). Add `opportunity` (SF deal identity) and widen the unique key the
-- sync's on_conflict targets. Idempotent; no data loss (nightly-rebuilt).

alter table if exists public.cs_deal_book_final
  add column if not exists opportunity text;

do $$
begin
  if exists (select 1 from pg_constraint
             where conrelid = 'public.cs_deal_book_final'::regclass
               and conname = 'cs_deal_book_final_rep_id_fy_quarter_kind_account_close_dat_key') then
    alter table public.cs_deal_book_final
      drop constraint cs_deal_book_final_rep_id_fy_quarter_kind_account_close_dat_key;
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.cs_deal_book_final'::regclass
                   and conname = 'cs_deal_book_final_deal_key') then
    alter table public.cs_deal_book_final
      add constraint cs_deal_book_final_deal_key
      unique (rep_id, fy, quarter, kind, account, close_date, opportunity);
  end if;
end $$;
