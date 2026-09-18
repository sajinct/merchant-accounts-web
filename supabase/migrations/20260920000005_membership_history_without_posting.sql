-- Enter already-accounted membership payments without posting them a second time.
-- Existing voucher links are retained: cancelling an old linked payment must still
-- reverse its receipt. New payments never create a voucher, journal or day-book line.

alter table public.subscription_payments
  alter column voucher_id drop not null,
  add column request_id uuid;
alter table public.joining_fee_payments
  alter column voucher_id drop not null,
  add column request_id uuid;
alter table public.joining_fees alter column head_code drop not null;

-- Retain retry protection for requests made by the former accounting-linked app.
update public.subscription_payments p set request_id = j.request_id
  from public.journals j where j.voucher_id = p.voucher_id;
update public.joining_fee_payments p set request_id = j.request_id
  from public.journals j where j.voucher_id = p.voucher_id;
update public.subscription_payments set request_id = gen_random_uuid() where request_id is null;
update public.joining_fee_payments set request_id = gen_random_uuid() where request_id is null;
alter table public.subscription_payments
  alter column request_id set default gen_random_uuid(),
  alter column request_id set not null,
  add constraint subscription_payments_request_id_key unique (request_id);
alter table public.joining_fee_payments
  alter column request_id set default gen_random_uuid(),
  alter column request_id set not null,
  add constraint joining_fee_payments_request_id_key unique (request_id);

create function public.record_subscription_payment(
  p_member_code integer, p_fy_start integer, p_amount numeric, p_paid_on date,
  p_notes text, p_request_id uuid
)
returns public.subscription_payments
language plpgsql security definer set search_path = '' as $$
declare
  v_member public.customers;
  v_balance numeric;
  v_row public.subscription_payments;
begin
  if coalesce(public.app_role(), '') not in ('admin', 'accountant') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount >= 10000000000
     or p_amount <> round(p_amount, 2) then
    raise exception 'amount must be positive with at most two decimal places' using errcode = '22023';
  end if;
  if p_paid_on is null or not isfinite(p_paid_on) or p_request_id is null then
    raise exception 'payment date and request ID are required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into v_row from public.subscription_payments where request_id = p_request_id;
  if found then
    if v_row.member_code is distinct from p_member_code or v_row.fy_start is distinct from p_fy_start
       or v_row.amount is distinct from p_amount or v_row.paid_on is distinct from p_paid_on
       or v_row.notes is distinct from nullif(trim(p_notes), '') then
      raise exception 'Request ID was already used for a different payment' using errcode = '22023';
    end if;
    if v_row.cancelled_at is not null then
      raise exception 'This payment was cancelled; use a new request ID' using errcode = '22023';
    end if;
    return v_row;
  end if;

  -- Serialise different payments for a member so two requests cannot overpay.
  select * into v_member from public.customers where code = p_member_code for update;
  if not found then
    raise exception 'member % not found', p_member_code using errcode = 'P0002';
  end if;
  select l.balance into v_balance from public.subscription_ledger(p_fy_start, p_member_code) l
   where l.fy_start = p_fy_start;
  if v_balance is null then
    raise exception 'no subscription is due from member % for %', p_member_code, public.fy_label(p_fy_start)
      using errcode = '22023';
  end if;
  if p_amount > v_balance then
    raise exception 'amount % is more than the balance % for %', p_amount, v_balance, public.fy_label(p_fy_start)
      using errcode = '22023';
  end if;

  insert into public.subscription_payments(member_code, fy_start, paid_on, amount, notes, created_by, request_id)
  values (p_member_code, p_fy_start, p_paid_on, p_amount, nullif(trim(p_notes), ''), auth.uid(), p_request_id)
  returning * into v_row;
  return v_row;
end
$$;

create function public.record_joining_fee_payment(
  p_member_code integer, p_amount numeric, p_paid_on date, p_notes text, p_request_id uuid
)
returns public.joining_fee_payments
language plpgsql security definer set search_path = '' as $$
declare
  v_member public.customers;
  v_due numeric;
  v_paid numeric;
  v_row public.joining_fee_payments;
begin
  if coalesce(public.app_role(), '') not in ('admin', 'accountant') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount >= 10000000000
     or p_amount <> round(p_amount, 2) then
    raise exception 'amount must be positive with at most two decimal places' using errcode = '22023';
  end if;
  if p_paid_on is null or not isfinite(p_paid_on) or p_request_id is null then
    raise exception 'payment date and request ID are required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into v_row from public.joining_fee_payments where request_id = p_request_id;
  if found then
    if v_row.member_code is distinct from p_member_code or v_row.amount is distinct from p_amount
       or v_row.paid_on is distinct from p_paid_on or v_row.notes is distinct from nullif(trim(p_notes), '') then
      raise exception 'Request ID was already used for a different payment' using errcode = '22023';
    end if;
    if v_row.cancelled_at is not null then
      raise exception 'This payment was cancelled; use a new request ID' using errcode = '22023';
    end if;
    return v_row;
  end if;

  select * into v_member from public.customers where code = p_member_code for update;
  if not found then
    raise exception 'member % not found', p_member_code using errcode = 'P0002';
  end if;
  v_due := public.member_joining_fee(p_member_code);
  if v_due <= 0 then
    raise exception 'no joining fee is due for member %', p_member_code using errcode = '22023';
  end if;
  select coalesce(sum(amount), 0) into v_paid from public.joining_fee_payments
   where member_code = p_member_code and cancelled_at is null;
  if p_amount > v_due - v_paid then
    raise exception 'amount % is more than the joining fee balance %', p_amount, v_due - v_paid
      using errcode = '22023';
  end if;

  insert into public.joining_fee_payments(member_code, paid_on, amount, notes, created_by, request_id)
  values (p_member_code, p_paid_on, p_amount, nullif(trim(p_notes), ''), auth.uid(), p_request_id)
  returning * into v_row;
  return v_row;
end
$$;

-- Cached clients are also safe: none of the old signatures can post accounting.
create or replace function public.record_subscription_payment(
  p_member_code integer, p_fy_start integer, p_amount numeric, p_paid_on date, p_notes text default null
)
returns public.subscription_payments
language sql security definer set search_path = '' as $$
  select public.record_subscription_payment(p_member_code, p_fy_start, p_amount, p_paid_on, p_notes, gen_random_uuid())
$$;
create or replace function public.record_subscription_payment(
  p_member_code integer, p_fy_start integer, p_amount numeric, p_paid_on date,
  p_notes text, p_cash_account_code integer, p_request_id uuid
)
returns public.subscription_payments
language sql security definer set search_path = '' as $$
  select public.record_subscription_payment(p_member_code, p_fy_start, p_amount, p_paid_on, p_notes, p_request_id)
$$;
create or replace function public.record_joining_fee_payment(
  p_member_code integer, p_amount numeric, p_paid_on date, p_notes text default null
)
returns public.joining_fee_payments
language sql security definer set search_path = '' as $$
  select public.record_joining_fee_payment(p_member_code, p_amount, p_paid_on, p_notes, gen_random_uuid())
$$;

create or replace function public.cancel_subscription_payment(p_id bigint, p_reason text)
returns public.subscription_payments
language plpgsql security definer set search_path = '' as $$
declare v_row public.subscription_payments;
begin
  if coalesce(public.app_role(), '') <> 'admin' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'Cancellation reason is required' using errcode = '22023';
  end if;
  update public.subscription_payments
     set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = trim(p_reason)
   where id = p_id and cancelled_at is null returning * into v_row;
  if v_row.id is null then
    raise exception 'payment % not found or already cancelled', p_id using errcode = 'P0002';
  end if;
  if v_row.voucher_id is not null then
    update public.vouchers set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = trim(p_reason)
     where id = v_row.voucher_id and cancelled_at is null;
  end if;
  return v_row;
end
$$;

create or replace function public.cancel_joining_fee_payment(p_id bigint, p_reason text)
returns public.joining_fee_payments
language plpgsql security definer set search_path = '' as $$
declare v_row public.joining_fee_payments;
begin
  if coalesce(public.app_role(), '') <> 'admin' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'Cancellation reason is required' using errcode = '22023';
  end if;
  update public.joining_fee_payments
     set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = trim(p_reason)
   where id = p_id and cancelled_at is null returning * into v_row;
  if v_row.id is null then
    raise exception 'payment % not found or already cancelled', p_id using errcode = 'P0002';
  end if;
  if v_row.voucher_id is not null then
    update public.vouchers set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = trim(p_reason)
     where id = v_row.voucher_id and cancelled_at is null;
  end if;
  return v_row;
end
$$;

revoke all on function public.record_subscription_payment(integer, integer, numeric, date, text, uuid),
  public.record_joining_fee_payment(integer, numeric, date, text, uuid) from public, anon;
grant execute on function public.record_subscription_payment(integer, integer, numeric, date, text, uuid),
  public.record_joining_fee_payment(integer, numeric, date, text, uuid) to authenticated;
