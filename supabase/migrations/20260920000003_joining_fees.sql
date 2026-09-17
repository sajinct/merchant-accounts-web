-- ---------------------------------------------------------------------------
-- Joining Fees
-- ---------------------------------------------------------------------------

alter table public.company_settings
  add column joining_fee numeric(12, 2) not null default 0 check (joining_fee >= 0),
  add column joining_fee_head_code integer references public.account_heads (code);

alter table public.customers
  add column joining_fee numeric(12, 2) not null default 0 check (joining_fee >= 0);

create table public.joining_fee_payments (
  id            bigint generated always as identity primary key,
  member_code   integer not null references public.customers (code) on delete restrict,
  paid_on       date not null,
  amount        numeric(12, 2) not null check (amount > 0),
  voucher_id    bigint not null references public.vouchers (id) on delete restrict,
  notes         text,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users (id),
  cancelled_at  timestamptz,
  cancelled_by  uuid references auth.users (id),
  cancel_reason text,
  check (cancelled_at is null or cancel_reason is not null)
);

create index joining_fee_payments_member_idx on public.joining_fee_payments (member_code);
create index joining_fee_payments_voucher_idx on public.joining_fee_payments (voucher_id);

revoke all on public.joining_fee_payments from anon;
alter table public.joining_fee_payments enable row level security;
create policy joining_fee_payments_select on public.joining_fee_payments
  for select to authenticated using ((select public.app_role()) is not null);

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

create function public.record_joining_fee_payment(
  p_member_code integer,
  p_amount      numeric,
  p_paid_on     date,
  p_notes       text default null
)
returns public.joining_fee_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member  public.customers;
  v_head    integer;
  v_paid    numeric;
  v_balance numeric;
  v_voucher public.vouchers;
  v_row     public.joining_fee_payments;
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

  select * into v_member from public.customers where code = p_member_code for update;
  if not found then
    raise exception 'member % not found', p_member_code using errcode = 'P0002';
  end if;

  select joining_fee_head_code into v_head from public.company_settings;
  if v_head is null then
    raise exception 'choose the joining fee account head in Membership Fees before recording payments' using errcode = '22023';
  end if;

  select coalesce(sum(amount), 0) into v_paid
    from public.joining_fee_payments
   where member_code = p_member_code and cancelled_at is null;

  v_balance := v_member.joining_fee - v_paid;
  if p_amount > v_balance then
    raise exception 'amount % is more than the joining fee balance %', p_amount, v_balance using errcode = '22023';
  end if;

  v_voucher := public.create_voucher(
    1,
    p_paid_on,
    v_head,
    format('Joining Fee - #%s %s', v_member.code, v_member.name),
    p_amount
  );

  insert into public.joining_fee_payments (member_code, paid_on, amount, voucher_id, notes, created_by)
  values (p_member_code, p_paid_on, p_amount, v_voucher.id, nullif(trim(p_notes), ''), auth.uid())
  returning * into v_row;

  return v_row;
end
$$;

create function public.cancel_joining_fee_payment(p_id bigint, p_reason text)
returns public.joining_fee_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.joining_fee_payments;
begin
  if coalesce(public.app_role(), '') <> 'admin' then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update public.joining_fee_payments
     set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = nullif(trim(p_reason), '')
   where id = p_id and cancelled_at is null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'payment % not found or already cancelled', p_id using errcode = 'P0002';
  end if;

  update public.vouchers
     set cancelled_at  = now(),
         cancelled_by  = auth.uid(),
         cancel_reason = coalesce(nullif(trim(p_reason), ''), 'joining fee payment cancelled')
   where id = v_row.voucher_id and cancelled_at is null;

  return v_row;
end
$$;

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

  if exists (
    select 1 from public.joining_fee_payments jp
     where jp.voucher_id = p_id and jp.cancelled_at is null
  ) then
    raise exception 'this receipt is a joining fee payment; cancel it from the member''s profile'
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

revoke execute on function public.record_joining_fee_payment(integer, numeric, date, text) from public, anon;
revoke execute on function public.cancel_joining_fee_payment(bigint, text) from public, anon;

grant execute on function public.record_joining_fee_payment(integer, numeric, date, text) to authenticated;
grant execute on function public.cancel_joining_fee_payment(bigint, text) to authenticated;
