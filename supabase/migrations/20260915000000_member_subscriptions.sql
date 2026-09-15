-- Membership subscriptions.
-- One fee for everyone per financial year (1 April - 31 March). A member owes every year from the
-- year they joined (all years when no join date) up to the year they left. Payments may be partial;
-- unpaid balances carry forward as arrears. Every payment creates a receipt voucher against the
-- subscription account head, so it flows into the day book, ledger and trial balance.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

alter table public.customers
  add column joined_on date,
  add column left_on   date,
  add constraint customers_left_after_joined
    check (left_on is null or joined_on is null or left_on >= joined_on);

alter table public.company_settings
  add column subscription_head_code integer references public.account_heads (code);

create table public.subscription_years (
  fy_start   smallint primary key check (fy_start between 2000 and 2100),  -- 2026 = 2026-27
  fee        numeric(12, 2) not null check (fee >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger subscription_years_touch before update on public.subscription_years
  for each row execute function public.touch_updated_at();

create table public.subscription_payments (
  id            bigint generated always as identity primary key,
  member_code   integer not null references public.customers (code),
  fy_start      smallint not null references public.subscription_years (fy_start),
  paid_on       date not null,
  amount        numeric(12, 2) not null check (amount > 0),
  voucher_id    bigint not null unique references public.vouchers (id),
  notes         text,
  cancelled_at  timestamptz,
  cancelled_by  uuid references auth.users (id),
  cancel_reason text,
  created_by    uuid default auth.uid() references auth.users (id),
  created_at    timestamptz not null default now()
);
create index subscription_payments_member_year_idx on public.subscription_payments (member_code, fy_start);
create index subscription_payments_year_idx on public.subscription_payments (fy_start);

-- Account head for subscription receipts: reuse one named MEMBERSHIP SUBSCRIPTION, or create it
-- with the next free user code (1001-8999).
do $$
declare
  v_code integer;
begin
  select code into v_code
    from public.account_heads
   where upper(name) = 'MEMBERSHIP SUBSCRIPTION'
   order by code
   limit 1;

  if v_code is null then
    select coalesce(max(code), 1000) + 1 into v_code
      from public.account_heads
     where code > 1000 and code < 9000;
    insert into public.account_heads (code, name) values (v_code, 'MEMBERSHIP SUBSCRIPTION');
  end if;

  update public.company_settings set subscription_head_code = v_code;
end
$$;

-- ---------------------------------------------------------------------------
-- Financial year helpers
-- ---------------------------------------------------------------------------

-- Financial year containing a date, named by its starting year: 2026-03-31 -> 2025, 2026-04-01 -> 2026.
create function public.fy_start_of(p_date date)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select (extract(year from p_date)::integer
          - case when extract(month from p_date) < 4 then 1 else 0 end)::smallint
$$;

-- 2026 -> '2026-27'
create function public.fy_label(p_fy_start integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select p_fy_start::text || '-' || lpad(((p_fy_start + 1) % 100)::text, 2, '0')
$$;

-- ---------------------------------------------------------------------------
-- Dues (security invoker: RLS applies)
-- ---------------------------------------------------------------------------

-- One row per member per financial year owed, up to p_up_to_fy. Years a member was not due for
-- still appear if they have an active payment, so no money goes missing from the totals.
create function public.subscription_ledger(p_up_to_fy integer, p_member_code integer default null)
returns table (
  member_code  integer,
  fy_start     smallint,
  fee          numeric,
  paid         numeric,
  balance      numeric,
  last_paid_on date
)
language sql
stable
set search_path = ''
as $$
  select c.code, y.fy_start, y.fee, coalesce(p.paid, 0), y.fee - coalesce(p.paid, 0), p.last_paid_on
    from public.customers c
   cross join public.subscription_years y
    left join lateral (
      select sum(sp.amount) as paid, max(sp.paid_on) as last_paid_on
        from public.subscription_payments sp
       where sp.member_code = c.code
         and sp.fy_start = y.fy_start
         and sp.cancelled_at is null
    ) p on true
   where y.fy_start <= p_up_to_fy
     and (p_member_code is null or c.code = p_member_code)
     and (
       ((c.joined_on is null or y.fy_start >= public.fy_start_of(c.joined_on))
        and (c.left_on is null or y.fy_start <= public.fy_start_of(c.left_on)))
       or p.paid is not null
     )
$$;

-- Every year for one member, including future years that already have a fee.
create function public.member_subscription_years(p_member_code integer)
returns table (
  fy_start     smallint,
  fee          numeric,
  paid         numeric,
  balance      numeric,
  last_paid_on date
)
language sql
stable
set search_path = ''
as $$
  select l.fy_start, l.fee, l.paid, l.balance, l.last_paid_on
    from public.subscription_ledger(2100, p_member_code) l
   order by l.fy_start
$$;

-- Per member for a financial year: that year's fee/paid/balance, arrears from earlier years,
-- and the total due. Members with nothing owed up to that year are left out.
create function public.rpt_subscription_status(p_fy integer)
returns table (
  member_code   integer,
  member_name   text,
  phone         text,
  due_this_year boolean,
  year_fee      numeric,
  year_paid     numeric,
  year_balance  numeric,
  arrears       numeric,
  total_due     numeric,
  last_paid_on  date
)
language sql
stable
set search_path = ''
as $$
  select c.code,
         c.name,
         c.phone,
         coalesce(bool_or(l.fy_start = p_fy), false),
         coalesce(sum(l.fee) filter (where l.fy_start = p_fy), 0),
         coalesce(sum(l.paid) filter (where l.fy_start = p_fy), 0),
         coalesce(sum(l.balance) filter (where l.fy_start = p_fy), 0),
         coalesce(sum(l.balance) filter (where l.fy_start < p_fy), 0),
         coalesce(sum(l.balance), 0),
         max(l.last_paid_on)
    from public.subscription_ledger(p_fy) l
    join public.customers c on c.code = l.member_code
   group by c.code, c.name, c.phone
   order by c.name, c.code
$$;

-- ---------------------------------------------------------------------------
-- Payments (clients never write subscription_payments directly)
-- ---------------------------------------------------------------------------

create function public.record_subscription_payment(
  p_member_code integer,
  p_fy_start    integer,
  p_amount      numeric,
  p_paid_on     date,
  p_notes       text default null
)
returns public.subscription_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member  public.customers;
  v_head    integer;
  v_balance numeric;
  v_voucher public.vouchers;
  v_row     public.subscription_payments;
begin
  if coalesce(public.app_role(), '') not in ('admin', 'accountant') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be greater than zero' using errcode = '22023';
  end if;
  if p_paid_on is null then
    raise exception 'payment date is required' using errcode = '22023';
  end if;

  -- Lock the member so two payments cannot both pass the balance check.
  select * into v_member from public.customers where code = p_member_code for update;
  if not found then
    raise exception 'member % not found', p_member_code using errcode = 'P0002';
  end if;

  select subscription_head_code into v_head from public.company_settings;
  if v_head is null then
    raise exception 'choose the subscription account head in Subscription Fees before recording payments'
      using errcode = '22023';
  end if;

  select l.balance into v_balance
    from public.subscription_ledger(p_fy_start, p_member_code) l
   where l.fy_start = p_fy_start;

  if v_balance is null then
    raise exception 'no subscription is due from member % for %', p_member_code, public.fy_label(p_fy_start)
      using errcode = '22023';
  end if;
  if p_amount > v_balance then
    raise exception 'amount % is more than the balance % for %', p_amount, v_balance, public.fy_label(p_fy_start)
      using errcode = '22023';
  end if;

  v_voucher := public.create_voucher(
    1,
    p_paid_on,
    v_head,
    format('Subscription %s - #%s %s', public.fy_label(p_fy_start), v_member.code, v_member.name),
    p_amount
  );

  insert into public.subscription_payments (member_code, fy_start, paid_on, amount, voucher_id, notes, created_by)
  values (p_member_code, p_fy_start, p_paid_on, p_amount, v_voucher.id, nullif(trim(p_notes), ''), auth.uid())
  returning * into v_row;

  return v_row;
end
$$;

create function public.cancel_subscription_payment(p_id bigint, p_reason text)
returns public.subscription_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.subscription_payments;
begin
  if coalesce(public.app_role(), '') <> 'admin' then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update public.subscription_payments
     set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = nullif(trim(p_reason), '')
   where id = p_id and cancelled_at is null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'payment % not found or already cancelled', p_id using errcode = 'P0002';
  end if;

  update public.vouchers
     set cancelled_at  = now(),
         cancelled_by  = auth.uid(),
         cancel_reason = coalesce(nullif(trim(p_reason), ''), 'subscription payment cancelled')
   where id = v_row.voucher_id and cancelled_at is null;

  return v_row;
end
$$;

-- Subscription receipts must be cancelled through cancel_subscription_payment, otherwise the
-- member would still show as paid while the receipt is gone from the accounts.
create or replace function public.cancel_voucher(p_id bigint, p_reason text)
returns public.vouchers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.vouchers;
begin
  if coalesce(public.app_role(), '') <> 'admin' then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.subscription_payments sp
     where sp.voucher_id = p_id and sp.cancelled_at is null
  ) then
    raise exception 'this receipt is a subscription payment; cancel it from the member''s subscription'
      using errcode = '22023';
  end if;

  update public.vouchers
     set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = nullif(trim(p_reason), '')
   where id = p_id and cancelled_at is null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'voucher % not found or already cancelled', p_id using errcode = 'P0002';
  end if;

  return v_row;
end
$$;

-- ---------------------------------------------------------------------------
-- Privileges and RLS
-- ---------------------------------------------------------------------------

revoke all on public.subscription_years, public.subscription_payments from anon;

revoke execute on function public.fy_start_of(date) from public, anon;
revoke execute on function public.fy_label(integer) from public, anon;
revoke execute on function public.subscription_ledger(integer, integer) from public, anon;
revoke execute on function public.member_subscription_years(integer) from public, anon;
revoke execute on function public.rpt_subscription_status(integer) from public, anon;
revoke execute on function public.record_subscription_payment(integer, integer, numeric, date, text) from public, anon;
revoke execute on function public.cancel_subscription_payment(bigint, text) from public, anon;

grant execute on function public.fy_start_of(date) to authenticated;
grant execute on function public.fy_label(integer) to authenticated;
grant execute on function public.subscription_ledger(integer, integer) to authenticated;
grant execute on function public.member_subscription_years(integer) to authenticated;
grant execute on function public.rpt_subscription_status(integer) to authenticated;
grant execute on function public.record_subscription_payment(integer, integer, numeric, date, text) to authenticated;
grant execute on function public.cancel_subscription_payment(bigint, text) to authenticated;

alter table public.subscription_years    enable row level security;
alter table public.subscription_payments enable row level security;

-- Fees: everyone reads, only admins set them. A year with payments cannot be deleted (foreign key).
create policy subscription_years_select on public.subscription_years
  for select to authenticated using ((select public.app_role()) is not null);
create policy subscription_years_insert on public.subscription_years
  for insert to authenticated with check ((select public.app_role()) = 'admin');
create policy subscription_years_update on public.subscription_years
  for update to authenticated
  using ((select public.app_role()) = 'admin')
  with check ((select public.app_role()) = 'admin');
create policy subscription_years_delete on public.subscription_years
  for delete to authenticated using ((select public.app_role()) = 'admin');

-- Payments: read only; written by record_subscription_payment / cancel_subscription_payment.
create policy subscription_payments_select on public.subscription_payments
  for select to authenticated using ((select public.app_role()) is not null);
