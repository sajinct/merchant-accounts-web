-- Unified voucher module.
--
-- Receipt, Payment, Contra and Journal are one structure and one posting engine.
-- `vouchers` stops being a fixed head/cash pair and becomes the voucher header;
-- `daybook` is its detail table and keeps carrying the real debit/credit lines,
-- so a voucher can hold any number of accounting heads on either side.
--
--   vouchers (header)  ->  journals (posting, idempotency, immutability)
--                      ->  daybook  (details: account, debit, credit, description)

-- ---------------------------------------------------------------------------
-- Which accounts may be posted to
-- ---------------------------------------------------------------------------

-- A group (control) head organises the chart of accounts; entries belong on the
-- ledger accounts underneath it. Retiring an account keeps its history readable
-- while stopping new postings, which deleting it could not do.
alter table public.account_heads
  add column is_active boolean not null default true,
  add column is_group  boolean not null default false,
  add constraint group_heads_are_not_cash check (not (is_group and is_cash_bank));

-- Reclassifying a posted account was already refused; so is turning one into a group.
create or replace function public.lock_account_classification() returns trigger
language plpgsql set search_path = '' as $$ begin
 if (new.account_type is distinct from old.account_type or new.is_cash_bank <> old.is_cash_bank
     or (new.is_group and not old.is_group))
    and exists(select 1 from public.daybook where head_code=old.code) then
   raise exception 'Classification cannot change after an account has entries';
 end if;
 return new;
end $$;

-- Rule 9: what a plain journal may touch is configurable, and off by default so
-- cash movements go through Receipt, Payment or Contra where they are visible.
alter table public.company_settings
  add column journal_allows_cash boolean not null default false;

-- ---------------------------------------------------------------------------
-- Voucher numbering: one sequence per type
-- ---------------------------------------------------------------------------

alter table public.voucher_counters drop constraint voucher_counters_voucher_type_check;
alter table public.voucher_counters
  add constraint voucher_counters_voucher_type_check check (voucher_type between 1 and 4);
insert into public.voucher_counters (voucher_type) values (3), (4) on conflict do nothing;

-- ---------------------------------------------------------------------------
-- vouchers becomes the voucher header
-- ---------------------------------------------------------------------------

alter table public.vouchers drop constraint vouchers_voucher_type_check;
alter table public.vouchers
  add constraint vouchers_voucher_type_check check (voucher_type between 1 and 4);  -- 1 receipt 2 payment 3 contra 4 journal

alter table public.vouchers rename column description to narration;

alter table public.vouchers
  add column reference_no text,
  add column party_code   integer references public.customers (code),
  add column total_amount numeric(14, 2),
  add column fy_start     integer references public.financial_years (start_year),
  add column status       text not null default 'posted' check (status in ('posted', 'cancelled')),
  add column is_cancelled boolean generated always as (cancelled_at is not null) stored,
  add column modified_by  uuid references auth.users (id),
  add column modified_at  timestamptz;

update public.vouchers
   set total_amount = amount,
       fy_start     = public.fy_start_of(voucher_date),
       status       = case when cancelled_at is null then 'posted' else 'cancelled' end;

alter table public.vouchers
  alter column total_amount set not null,
  alter column fy_start set not null,
  add constraint vouchers_total_amount_check check (total_amount > 0);

-- The fixed "one head, one cash account, one amount" shape the details now replace.
drop index public.vouchers_head_date_idx;
alter table public.vouchers
  drop column head_code,
  drop column amount,
  drop column cash_account_code;

create index vouchers_fy_type_idx on public.vouchers (fy_start, voucher_type, voucher_no desc);
create index vouchers_party_idx on public.vouchers (party_code) where party_code is not null;

-- Cancellation is the only permitted change to a posted header, and it is stamped.
create function public.stamp_voucher_cancellation() returns trigger
language plpgsql set search_path = '' as $$ begin
 if old.cancelled_at is null and new.cancelled_at is not null then
   new.status := 'cancelled';
   new.modified_by := auth.uid();
   new.modified_at := now();
 end if;
 return new;
end $$;
create trigger vouchers_cancellation before update on public.vouchers
 for each row execute function public.stamp_voucher_cancellation();

-- ---------------------------------------------------------------------------
-- daybook becomes the voucher detail table
-- ---------------------------------------------------------------------------

-- `narration` is the per-line description; it falls back to the header narration.
alter table public.daybook
  add column line_no      smallint not null default 1 check (line_no > 0),
  add column reference_id bigint;

alter table public.journals drop constraint journals_kind_check;
alter table public.journals add constraint journals_kind_check
  check (kind in ('receipt', 'payment', 'contra', 'journal', 'opening', 'reversal', 'year_closing'));
