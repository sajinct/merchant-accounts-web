-- One receipt can clear several installments. Existing payments remain unchanged.
alter table public.kuri_payments add column receipt_id uuid;
create index kuri_payments_receipt_idx on public.kuri_payments(receipt_id)
  where receipt_id is not null;
comment on column public.kuri_payments.receipt_id is
  'Shared receipt request ID for oldest-first allocations. All allocations share one voucher.';

-- Ticket balances over the entire schedule, including future installments.
create function public.kuri_receipt_tickets(p_scheme_id integer)
returns table (
  member_id integer, ticket_no smallint, customer_code integer, customer_name text,
  holder_name text, holder_address text, phone text, amount_due numeric,
  amount_paid numeric, balance numeric, last_paid_on date,
  has_won_lot boolean, won_installment smallint
)
language sql stable set search_path = '' as $$
  select m.id, m.ticket_no, c.code, c.name, coalesce(m.holder_name,c.name),
    m.holder_address, coalesce(m.holder_phone,c.phone),
    s.installment_amount * s.num_installments, coalesce(p.paid,0),
    s.installment_amount * s.num_installments - coalesce(p.paid,0), p.last_paid,
    l.id is not null, l.installment_no
  from public.kuri_members m
  join public.kuri_schemes s on s.id=m.scheme_id
  join public.customers c on c.code=m.customer_code
  left join lateral (
    select sum(kp.amount) paid, max(kp.paid_on) last_paid from public.kuri_payments kp
    where kp.scheme_id=s.id and kp.member_id=m.id and kp.cancelled_at is null
  ) p on true
  left join public.kuri_lots l on l.scheme_id=s.id and l.winner_member_id=m.id
  where s.id=p_scheme_id order by m.ticket_no
$$;

create function public.record_kuri_receipt(
  p_scheme_id integer, p_member_id integer, p_amount numeric, p_paid_on date,
  p_notes text default null, p_request_id uuid default null,
  p_cash_account_code integer default null, p_expected_allocations jsonb default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_scheme public.kuri_schemes;
  v_member public.kuri_members;
  v_existing public.kuri_payments;
  v_voucher public.vouchers;
  v_request uuid := coalesce(p_request_id,gen_random_uuid());
  v_allocations jsonb := '[]'::jsonb;
  v_remaining numeric := p_amount;
  v_total numeric;
  v_take numeric;
  v_row record;
  v_cash integer;
  v_holder text;
  v_narration text;
  v_first boolean := true;
begin
  if coalesce(public.app_role(),'') not in ('admin','accountant') then
    raise exception 'not authorized' using errcode='42501';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount >= 10000000000
     or p_amount <> round(p_amount,2) then
    raise exception 'amount must be positive with at most two decimal places' using errcode='22023';
  end if;
  if p_paid_on is null or not isfinite(p_paid_on) then
    raise exception 'payment date is required' using errcode='22023';
  end if;

  -- Same lock order as record_kuri_payment: request first, then ticket.
  perform pg_advisory_xact_lock(hashtextextended(v_request::text,0));
  select * into v_member from public.kuri_members
    where id=p_member_id and scheme_id=p_scheme_id for update;
  if not found then
    raise exception 'ticket is not enrolled in this scheme' using errcode='22023';
  end if;

  select * into v_existing from public.kuri_payments
    where receipt_id=v_request order by installment_no limit 1;
  if found then
    select sum(amount), jsonb_agg(jsonb_build_object('installment_no',installment_no,'amount',amount)
      order by installment_no) into v_total,v_allocations
      from public.kuri_payments where receipt_id=v_request;
    if v_existing.scheme_id is distinct from p_scheme_id
      or v_existing.member_id is distinct from p_member_id or v_total is distinct from p_amount
      or v_existing.paid_on is distinct from p_paid_on
      or v_existing.notes is distinct from nullif(trim(p_notes),'')
      or (p_cash_account_code is not null and p_cash_account_code is distinct from
        (select (request_data->>'cash')::integer from public.journals where request_id=v_request)) then
      raise exception 'Request ID was already used for a different receipt' using errcode='22023';
    end if;
    if exists(select 1 from public.kuri_payments where receipt_id=v_request and cancelled_at is not null) then
      raise exception 'This receipt was cancelled; use a new request ID' using errcode='22023';
    end if;
    return jsonb_build_object('receipt_id',v_request,'voucher_id',v_existing.voucher_id,
      'amount',v_total,'allocations',v_allocations);
  end if;
  if exists(select 1 from public.kuri_payments where request_id=v_request) then
    raise exception 'Request ID was already used for a different payment' using errcode='22023';
  end if;

  select * into v_scheme from public.kuri_schemes where id=p_scheme_id;
  if not found or v_scheme.status='draft' or v_scheme.head_code is null then
    raise exception 'activate the scheme and link its account before recording receipts' using errcode='22023';
  end if;

  -- Recalculate under the ticket lock; never trust the browser's balances.
  for v_row in
    select * from public.kuri_member_ledger(p_scheme_id,p_member_id)
      where balance>0 order by installment_no
  loop
    exit when v_remaining=0;
    v_take := least(v_remaining,v_row.balance);
    v_allocations := v_allocations || jsonb_build_array(jsonb_build_object(
      'installment_no',v_row.installment_no,'amount',v_take));
    v_remaining := v_remaining-v_take;
  end loop;
  if v_remaining>0 then
    raise exception 'receipt exceeds the remaining balance for this ticket' using errcode='22023';
  end if;
  if p_expected_allocations is not null and p_expected_allocations is distinct from v_allocations then
    raise exception 'Ticket balances changed. Refresh balances and review the allocation before saving.' using errcode='22023';
  end if;

  v_cash := public.resolve_kuri_cash_account(p_cash_account_code);
  select coalesce(nullif(trim(v_member.holder_name),''),c.name) into v_holder
    from public.customers c where c.code=v_member.customer_code;
  v_narration := format('Kuri %s - Ticket #%s (%s) - Installments %s%s',v_scheme.name,
    v_member.ticket_no,v_holder,
    (select string_agg(format('%s: %s',a->>'installment_no',a->>'amount'),', ')
      from jsonb_array_elements(v_allocations) a),
    case when nullif(trim(p_notes),'') is not null then ': '||trim(p_notes) else '' end);
  v_voucher := public.post_voucher(1,p_paid_on,format('KURI-%s-T%s',p_scheme_id,v_member.ticket_no),
    v_member.customer_code,v_narration,v_cash,
    jsonb_build_array(jsonb_build_object('account',v_scheme.head_code,'amount',p_amount,'description',v_narration)),
    true,v_request);
  for v_row in select * from jsonb_to_recordset(v_allocations) as a(installment_no integer,amount numeric)
  loop
    insert into public.kuri_payments(scheme_id,member_id,installment_no,amount,paid_on,notes,
      voucher_id,request_id,receipt_id,created_by)
    values(p_scheme_id,p_member_id,v_row.installment_no,v_row.amount,p_paid_on,nullif(trim(p_notes),''),
      v_voucher.id,case when v_first then v_request else gen_random_uuid() end,v_request,auth.uid());
    v_first := false;
  end loop;
  perform public.kuri_sync_scheme_status(p_scheme_id);
  return jsonb_build_object('receipt_id',v_request,'voucher_id',v_voucher.id,
    'amount',p_amount,'allocations',v_allocations);
end $$;

-- Cancelling any allocation reverses the complete receipt, including the voucher.
create or replace function public.cancel_kuri_payment(p_id bigint,p_reason text)
returns public.kuri_payments language plpgsql security definer set search_path = '' as $$
declare v_row public.kuri_payments; v_member integer;
begin
  if coalesce(public.app_role(),'') <> 'admin' then
    raise exception 'not authorized' using errcode='42501';
  end if;
  if nullif(trim(p_reason),'') is null then
    raise exception 'Cancellation reason is required' using errcode='22023';
  end if;
  select member_id into v_member from public.kuri_payments where id=p_id;
  perform 1 from public.kuri_members where id=v_member for update;
  select * into v_row from public.kuri_payments where id=p_id for update;
  if not found or v_row.cancelled_at is not null then
    raise exception 'payment % not found or already cancelled',p_id using errcode='P0002';
  end if;
  update public.kuri_payments set cancelled_at=now(),cancelled_by=auth.uid(),cancel_reason=trim(p_reason)
    where id=p_id or (v_row.receipt_id is not null and receipt_id=v_row.receipt_id);
  if v_row.voucher_id is not null then
    update public.vouchers set cancelled_at=now(),cancelled_by=auth.uid(),cancel_reason=trim(p_reason)
      where id=v_row.voucher_id and cancelled_at is null;
  end if;
  perform public.kuri_sync_scheme_status(v_row.scheme_id);
  select * into v_row from public.kuri_payments where id=p_id;
  return v_row;
end $$;

-- History shows one receipt with its split, rather than separate apparent receipts.
drop function public.kuri_payment_history(integer,integer);
create function public.kuri_payment_history(p_scheme_id integer,p_member_id integer)
returns table(id bigint,installment_no smallint,amount numeric,paid_on date,notes text,
  voucher_id bigint,cancelled_at timestamptz,cancel_reason text,created_at timestamptz,
  receipt_id uuid,allocations jsonb)
language sql stable set search_path = '' as $$
  select min(p.id),min(p.installment_no),sum(p.amount),min(p.paid_on),min(p.notes),
    min(p.voucher_id),min(p.cancelled_at),min(p.cancel_reason),min(p.created_at),p.receipt_id,
    jsonb_agg(jsonb_build_object('installment_no',p.installment_no,'amount',p.amount) order by p.installment_no)
  from public.kuri_payments p where p.scheme_id=p_scheme_id and p.member_id=p_member_id
  group by p.receipt_id,case when p.receipt_id is null then p.id end
  order by min(p.paid_on) desc,min(p.id) desc
$$;

revoke execute on function public.kuri_receipt_tickets(integer) from public,anon;
revoke execute on function public.record_kuri_receipt(integer,integer,numeric,date,text,uuid,integer,jsonb) from public,anon;
revoke execute on function public.kuri_payment_history(integer,integer) from public,anon;
grant execute on function public.kuri_receipt_tickets(integer) to authenticated;
grant execute on function public.record_kuri_receipt(integer,integer,numeric,date,text,uuid,integer,jsonb) to authenticated;
grant execute on function public.kuri_payment_history(integer,integer) to authenticated;
