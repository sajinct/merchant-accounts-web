-- ---------------------------------------------------------------------------
-- Joining fee schedule
-- ---------------------------------------------------------------------------
-- The joining fee is paid once, when a member joins. The amount changes by decision from time
-- to time, so it is kept as a dated schedule rather than a single setting: each row is the fee
-- and the account head in force from its effective date until the next row starts.
--
-- A member owes the rate in force on the day they joined, so adding a new rate never changes
-- what an existing member owes. customers.joining_fee stays as an optional per-member override
-- for waivers and special cases; null means "use the scheduled rate".

create table public.joining_fees (
  effective_from date primary key,
  fee            numeric(12, 2) not null check (fee >= 0),
  head_code      integer not null references public.account_heads (code),
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid default auth.uid() references auth.users (id)
);

create trigger joining_fees_touch before update on public.joining_fees
  for each row execute function public.touch_updated_at();

-- Carry the single current setting over as the opening rate, so nothing is lost. It starts from
-- the earliest joining date on record so that every existing member falls under it. Without an
-- account head there is nothing to post to and no row is worth seeding.
insert into public.joining_fees (effective_from, fee, head_code, note)
select coalesce((select min(joined_on) from public.customers), current_date),
       s.joining_fee,
       s.joining_fee_head_code,
       'Carried over from settings'
  from public.company_settings s
 where s.joining_fee_head_code is not null;

alter table public.company_settings
  drop column joining_fee,
  drop column joining_fee_head_code;

-- Never populated by the app, so every row is the 0 default rather than a real decision.
alter table public.customers
  alter column joining_fee drop not null,
  alter column joining_fee drop default;
update public.customers set joining_fee = null where joining_fee = 0;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

/** The joining fee row in force on a given date, or none if the schedule starts later. */
create function public.joining_fee_on(p_on date)
returns public.joining_fees
language sql
stable
security definer
set search_path = ''
as $$
  select *
    from public.joining_fees
   where effective_from <= coalesce(p_on, current_date)
   order by effective_from desc
   limit 1
$$;

/**
 * What one member owes as a joining fee: their own override when set, otherwise the scheduled
 * rate for the day they joined. Members with no joining date fall back to today's rate.
 */
create function public.member_joining_fee(p_member_code integer)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    c.joining_fee,
    (public.joining_fee_on(coalesce(c.joined_on, current_date))).fee,
    0
  )
    from public.customers c
   where c.code = p_member_code
$$;

-- Post against the head in force for the member, not a single global setting.
create or replace function public.record_joining_fee_payment(
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
  v_member   public.customers;
  v_schedule public.joining_fees;
  v_due      numeric;
  v_paid     numeric;
  v_balance  numeric;
  v_voucher  public.vouchers;
  v_row      public.joining_fee_payments;
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

  v_schedule := public.joining_fee_on(coalesce(v_member.joined_on, p_paid_on));
  if v_schedule.head_code is null then
    raise exception 'set a joining fee effective on or before % in Membership Fees before recording payments',
      to_char(coalesce(v_member.joined_on, p_paid_on), 'DD-MM-YYYY') using errcode = '22023';
  end if;

  v_due := coalesce(v_member.joining_fee, v_schedule.fee, 0);
  if v_due <= 0 then
    raise exception 'no joining fee is due for member %', p_member_code using errcode = '22023';
  end if;

  select coalesce(sum(amount), 0) into v_paid
    from public.joining_fee_payments
   where member_code = p_member_code and cancelled_at is null;

  v_balance := v_due - v_paid;
  if p_amount > v_balance then
    raise exception 'amount % is more than the joining fee balance %', p_amount, v_balance using errcode = '22023';
  end if;

  v_voucher := public.create_voucher(
    1,
    p_paid_on,
    v_schedule.head_code,
    format('Joining Fee - #%s %s', v_member.code, v_member.name),
    p_amount
  );

  insert into public.joining_fee_payments (member_code, paid_on, amount, voucher_id, notes, created_by)
  values (p_member_code, p_paid_on, p_amount, v_voucher.id, nullif(trim(p_notes), ''), auth.uid())
  returning * into v_row;

  return v_row;
end
$$;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

revoke all on public.joining_fees from anon;
alter table public.joining_fees enable row level security;

-- Everyone reads the schedule, only admins decide it. A rate stays editable: it is a decision,
-- not a posted entry, and recorded payments keep their own voucher amounts either way.
create policy joining_fees_select on public.joining_fees
  for select to authenticated using ((select public.app_role()) is not null);
create policy joining_fees_insert on public.joining_fees
  for insert to authenticated with check ((select public.app_role()) = 'admin');
create policy joining_fees_update on public.joining_fees
  for update to authenticated
  using ((select public.app_role()) = 'admin')
  with check ((select public.app_role()) = 'admin');
create policy joining_fees_delete on public.joining_fees
  for delete to authenticated using ((select public.app_role()) = 'admin');

revoke execute on function public.joining_fee_on(date) from public, anon;
revoke execute on function public.member_joining_fee(integer) from public, anon;

grant execute on function public.joining_fee_on(date) to authenticated;
grant execute on function public.member_joining_fee(integer) to authenticated;
