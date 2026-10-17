-- Link each Kuri scheme to an account head and post all Kuri transactions
-- (installment collections, bulk collections, payment cancellations, and lot payouts)
-- to that linked account head through the double-entry voucher posting engine.

-- ---------------------------------------------------------------------------
-- Schema changes
-- ---------------------------------------------------------------------------

alter table public.kuri_schemes
  add column head_code integer references public.account_heads (code);

alter table public.kuri_payments
  add column voucher_id bigint references public.vouchers (id);

alter table public.kuri_lots
  add column voucher_id bigint references public.vouchers (id);

create index kuri_payments_voucher_idx on public.kuri_payments (voucher_id) where voucher_id is not null;
create index kuri_lots_voucher_idx on public.kuri_lots (voucher_id) where voucher_id is not null;

-- ---------------------------------------------------------------------------
-- Internal validation helpers
-- ---------------------------------------------------------------------------

create function public.check_kuri_account_head(p_head_code integer)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_head_code is null then
    raise exception 'choose an account head for the kuri scheme' using errcode = '22023';
  end if;

  perform 1
     from public.account_heads
    where code = p_head_code
      and account_type is not null
      and is_active
      and not is_group
      and not is_cash_bank
      for share;

  if not found then
    raise exception 'select an active, classified non-cash ledger account for the kuri scheme'
      using errcode = '22023';
  end if;
end
$$;

create function public.resolve_kuri_cash_account(p_cash_account_code integer)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_code integer;
begin
  if p_cash_account_code is not null then
    return p_cash_account_code;
  end if;

  select code into v_code
    from public.account_heads
   where is_cash_bank
     and account_type = 'asset'
     and is_active
     and not is_group
   order by code
   limit 1;

  if v_code is null then
    raise exception 'Choose a cash/bank account' using errcode = '22023';
  end if;

  return v_code;
end
$$;

-- ---------------------------------------------------------------------------
-- Create scheme RPC (with linked account head)
-- ---------------------------------------------------------------------------

drop function if exists public.create_kuri_scheme(text, numeric, integer, numeric, date, text);

create function public.create_kuri_scheme(
  p_name               text,
  p_installment_amount numeric,
  p_num_members        integer default 25,
  p_max_deduction_pct  numeric default 20.40,
  p_start_date         date default null,
  p_notes              text default null,
  p_head_code          integer default null
)
returns public.kuri_schemes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.kuri_schemes;
begin
  if coalesce(public.app_role(), '') not in ('admin', 'accountant') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_installment_amount is null or p_installment_amount <= 0 then
    raise exception 'installment amount must be greater than zero' using errcode = '22023';
  end if;
  if p_num_members is null or p_num_members < 2 then
    raise exception 'number of members must be at least 2' using errcode = '22023';
  end if;
  if p_max_deduction_pct is null or p_max_deduction_pct <= 0 or p_max_deduction_pct >= 100 then
    raise exception 'deduction percentage must be between 0 and 100' using errcode = '22023';
  end if;

  perform public.check_kuri_account_head(p_head_code);

  insert into public.kuri_schemes (
    name, installment_amount, num_members, num_installments,
    max_deduction_pct, start_date, notes, head_code, created_by
  )
  values (
    trim(p_name), p_installment_amount, p_num_members, p_num_members + 1,
    p_max_deduction_pct, p_start_date, nullif(trim(p_notes), ''), p_head_code, auth.uid()
  )
  returning * into v_row;

  return v_row;
end
$$;

-- ---------------------------------------------------------------------------
-- Link or update account head on an existing scheme
-- ---------------------------------------------------------------------------

create function public.set_kuri_scheme_account(
  p_scheme_id integer,
  p_head_code integer
)
returns public.kuri_schemes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.kuri_schemes;
begin
  if coalesce(public.app_role(), '') not in ('admin', 'accountant') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into v_row from public.kuri_schemes where id = p_scheme_id for update;
  if not found then
    raise exception 'scheme % not found', p_scheme_id using errcode = 'P0002';
  end if;

  perform public.check_kuri_account_head(p_head_code);

  if v_row.head_code is not null and v_row.head_code <> p_head_code and (
    exists (select 1 from public.kuri_payments where scheme_id = p_scheme_id and voucher_id is not null) or
    exists (select 1 from public.kuri_lots where scheme_id = p_scheme_id and voucher_id is not null)
  ) then
    raise exception 'cannot change the linked account after transactions have been posted'
      using errcode = '22023';
  end if;

  update public.kuri_schemes
     set head_code = p_head_code
   where id = p_scheme_id
  returning * into v_row;

  return v_row;
end
$$;

-- ---------------------------------------------------------------------------
-- Scheme detail & list (include head_code and head_name)
-- ---------------------------------------------------------------------------

drop function if exists public.kuri_scheme_detail(integer);

create function public.kuri_scheme_detail(p_scheme_id integer)
returns table (
  id                  integer,
  name                text,
  installment_amount  numeric,
  num_members         smallint,
  num_installments    smallint,
  max_deduction_pct   numeric,
  total_value         numeric,
  start_date          date,
  status              text,
  notes               text,
  head_code           integer,
  head_name           text,
  enrolled_count      bigint,
  lots_drawn          bigint,
  lots_paid_out       bigint,
  total_collected     numeric,
  total_paid_out      numeric,
  created_at          timestamptz
)
language sql
stable
set search_path = ''
as $$
  select
    s.id, s.name, s.installment_amount, s.num_members, s.num_installments,
    s.max_deduction_pct,
    s.num_members * s.installment_amount as total_value,
    s.start_date, s.status, s.notes,
    s.head_code,
    h.name as head_name,
    (select count(*) from public.kuri_members m where m.scheme_id = s.id),
    (select count(*) from public.kuri_lots l where l.scheme_id = s.id),
    (select count(*) from public.kuri_lots l where l.scheme_id = s.id and l.payout_status = 'paid'),
    coalesce((select sum(p.amount) from public.kuri_payments p where p.scheme_id = s.id and p.cancelled_at is null), 0),
    coalesce((select sum(l.payout_amount) from public.kuri_lots l where l.scheme_id = s.id and l.payout_status = 'paid'), 0),
    s.created_at
  from public.kuri_schemes s
  left join public.account_heads h on h.code = s.head_code
  where s.id = p_scheme_id
$$;

drop function if exists public.kuri_scheme_list();

create function public.kuri_scheme_list()
returns table (
  id                  integer,
  name                text,
  installment_amount  numeric,
  num_members         smallint,
  num_installments    smallint,
  total_value         numeric,
  start_date          date,
  status              text,
  head_code           integer,
  head_name           text,
  enrolled_count      bigint,
  lots_drawn          bigint,
  total_collected     numeric,
  created_at          timestamptz
)
language sql
stable
set search_path = ''
as $$
  select
    s.id, s.name, s.installment_amount, s.num_members, s.num_installments,
    s.num_members * s.installment_amount,
    s.start_date, s.status,
    s.head_code,
    h.name as head_name,
    (select count(*) from public.kuri_members m where m.scheme_id = s.id),
    (select count(*) from public.kuri_lots l where l.scheme_id = s.id),
    coalesce((select sum(p.amount) from public.kuri_payments p
               where p.scheme_id = s.id and p.cancelled_at is null), 0),
    s.created_at
  from public.kuri_schemes s
  left join public.account_heads h on h.code = s.head_code
  order by s.created_at desc
$$;

-- ---------------------------------------------------------------------------
-- Record installment payment (posts Receipt voucher to scheme's head_code)
-- ---------------------------------------------------------------------------

drop function if exists public.record_kuri_payment(integer, integer, integer, numeric, date, text, uuid);

create function public.record_kuri_payment(
  p_scheme_id         integer,
  p_member_id         integer,
  p_installment_no    integer,
  p_amount            numeric,
  p_paid_on           date,
  p_notes             text default null,
  p_request_id        uuid default null,
  p_cash_account_code integer default null
)
returns public.kuri_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scheme        public.kuri_schemes;
  v_member        public.kuri_members;
  v_customer_name text;
  v_holder        text;
  v_req_id        uuid;
  v_cash_code     integer;
  v_already       numeric;
  v_narration     text;
  v_voucher       public.vouchers;
  v_row           public.kuri_payments;
begin
  if coalesce(public.app_role(), '') not in ('admin', 'accountant') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount >= 10000000000
     or p_amount <> round(p_amount, 2) then
    raise exception 'amount must be positive with at most two decimal places' using errcode = '22023';
  end if;
  if p_paid_on is null or not isfinite(p_paid_on) then
    raise exception 'payment date is required' using errcode = '22023';
  end if;

  v_req_id := coalesce(p_request_id, gen_random_uuid());

  -- Idempotency check
  perform pg_advisory_xact_lock(hashtextextended(v_req_id::text, 0));
  select * into v_row from public.kuri_payments where request_id = v_req_id;
  if found then
    if v_row.scheme_id is distinct from p_scheme_id or v_row.member_id is distinct from p_member_id
       or v_row.installment_no is distinct from p_installment_no or v_row.amount is distinct from p_amount
       or v_row.paid_on is distinct from p_paid_on
       or v_row.notes is distinct from nullif(trim(p_notes), '') then
      raise exception 'Request ID was already used for a different payment' using errcode = '22023';
    end if;
    if v_row.cancelled_at is not null then
      raise exception 'This payment was cancelled; use a new request ID' using errcode = '22023';
    end if;
    return v_row;
  end if;

  -- Validate scheme
  select * into v_scheme from public.kuri_schemes where id = p_scheme_id;
  if not found then
    raise exception 'scheme % not found', p_scheme_id using errcode = 'P0002';
  end if;
  if v_scheme.status = 'draft' then
    raise exception 'activate the scheme before recording payments' using errcode = '22023';
  end if;
  if v_scheme.head_code is null then
    raise exception 'link an account head to this kuri scheme before recording payments'
      using errcode = '22023';
  end if;

  if p_installment_no < 1 or p_installment_no > v_scheme.num_installments then
    raise exception 'installment number must be between 1 and %', v_scheme.num_installments
      using errcode = '22023';
  end if;

  -- Lock member row for concurrency
  select * into v_member from public.kuri_members
   where id = p_member_id and scheme_id = p_scheme_id for update;
  if not found then
    raise exception 'member % is not enrolled in scheme %', p_member_id, p_scheme_id
      using errcode = 'P0002';
  end if;

  select name into v_customer_name from public.customers where code = v_member.customer_code;
  v_holder := coalesce(nullif(trim(v_member.holder_name), ''), v_customer_name, '#' || v_member.customer_code);

  -- Sum existing active payments for this member+installment
  select coalesce(sum(pp.amount), 0) into v_already
    from public.kuri_payments pp
   where pp.scheme_id = p_scheme_id and pp.member_id = p_member_id
     and pp.installment_no = p_installment_no and pp.cancelled_at is null;

  if v_already + p_amount > v_scheme.installment_amount + 0.001 then
    raise exception 'total payments (% + %) would exceed installment amount %',
      v_already, p_amount, v_scheme.installment_amount
      using errcode = '22023';
  end if;

  v_cash_code := public.resolve_kuri_cash_account(p_cash_account_code);
  v_narration := format(
    'Kuri %s - Inst #%s - Ticket #%s (%s)%s',
    v_scheme.name,
    p_installment_no,
    v_member.ticket_no,
    v_holder,
    case when nullif(trim(p_notes), '') is not null then ': ' || trim(p_notes) else '' end
  );

  v_voucher := public.post_voucher(
    1,
    p_paid_on,
    format('KURI-%s-I%s-T%s', v_scheme.id, p_installment_no, v_member.ticket_no),
    v_member.customer_code,
    v_narration,
    v_cash_code,
    jsonb_build_array(
      jsonb_build_object(
        'account', v_scheme.head_code,
        'amount', p_amount,
        'description', v_narration
      )
    ),
    true,
    v_req_id
  );

  insert into public.kuri_payments (
    scheme_id, member_id, installment_no, amount, paid_on, notes, voucher_id, request_id, created_by
  )
  values (
    p_scheme_id, p_member_id, p_installment_no, p_amount, p_paid_on,
    nullif(trim(p_notes), ''), v_voucher.id, v_req_id, auth.uid()
  )
  returning * into v_row;

  perform public.kuri_sync_scheme_status(p_scheme_id);

  return v_row;
end
$$;

-- ---------------------------------------------------------------------------
-- Bulk record full payment for all unpaid members of an installment
-- ---------------------------------------------------------------------------

drop function if exists public.record_kuri_bulk_payment(integer, integer, date, text);

create function public.record_kuri_bulk_payment(
  p_scheme_id         integer,
  p_installment_no    integer,
  p_paid_on           date,
  p_notes             text default null,
  p_cash_account_code integer default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scheme    public.kuri_schemes;
  v_member    record;
  v_already   numeric;
  v_remaining numeric;
  v_cash_code integer;
  v_narration text;
  v_req_id    uuid;
  v_voucher   public.vouchers;
  v_count     integer := 0;
begin
  if coalesce(public.app_role(), '') not in ('admin', 'accountant') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_paid_on is null or not isfinite(p_paid_on) then
    raise exception 'payment date is required' using errcode = '22023';
  end if;

  select * into v_scheme from public.kuri_schemes where id = p_scheme_id for update;
  if not found then
    raise exception 'scheme % not found', p_scheme_id using errcode = 'P0002';
  end if;
  if v_scheme.status = 'draft' then
    raise exception 'activate the scheme before recording payments' using errcode = '22023';
  end if;
  if v_scheme.head_code is null then
    raise exception 'link an account head to this kuri scheme before recording payments'
      using errcode = '22023';
  end if;

  if p_installment_no < 1 or p_installment_no > v_scheme.num_installments then
    raise exception 'installment number must be between 1 and %', v_scheme.num_installments
      using errcode = '22023';
  end if;

  v_cash_code := public.resolve_kuri_cash_account(p_cash_account_code);

  for v_member in
    select m.id, m.ticket_no, m.customer_code,
           coalesce(nullif(trim(m.holder_name), ''), c.name, '#' || m.customer_code) as holder
      from public.kuri_members m
      join public.customers c on c.code = m.customer_code
     where m.scheme_id = p_scheme_id
     order by m.ticket_no
  loop
    select coalesce(sum(pp.amount), 0) into v_already
      from public.kuri_payments pp
     where pp.scheme_id = p_scheme_id and pp.member_id = v_member.id
       and pp.installment_no = p_installment_no and pp.cancelled_at is null;

    v_remaining := round(v_scheme.installment_amount - v_already, 2);

    if v_remaining > 0.001 then
      v_req_id := gen_random_uuid();
      v_narration := format(
        'Kuri %s - Inst #%s - Ticket #%s (%s)%s',
        v_scheme.name,
        p_installment_no,
        v_member.ticket_no,
        v_member.holder,
        case when nullif(trim(p_notes), '') is not null then ': ' || trim(p_notes) else '' end
      );

      v_voucher := public.post_voucher(
        1,
        p_paid_on,
        format('KURI-%s-I%s-T%s', v_scheme.id, p_installment_no, v_member.ticket_no),
        v_member.customer_code,
        v_narration,
        v_cash_code,
        jsonb_build_array(
          jsonb_build_object(
            'account', v_scheme.head_code,
            'amount', v_remaining,
            'description', v_narration
          )
        ),
        true,
        v_req_id
      );

      insert into public.kuri_payments (
        scheme_id, member_id, installment_no, amount, paid_on, notes, voucher_id, request_id, created_by
      )
      values (
        p_scheme_id, v_member.id, p_installment_no, v_remaining, p_paid_on,
        nullif(trim(p_notes), ''), v_voucher.id, v_req_id, auth.uid()
      );
      v_count := v_count + 1;
    end if;
  end loop;

  perform public.kuri_sync_scheme_status(p_scheme_id);

  return v_count;
end
$$;

-- ---------------------------------------------------------------------------
-- Cancel payment (also cancels the linked receipt voucher)
-- ---------------------------------------------------------------------------

create or replace function public.cancel_kuri_payment(p_id bigint, p_reason text)
returns public.kuri_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.kuri_payments;
begin
  if coalesce(public.app_role(), '') <> 'admin' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'Cancellation reason is required' using errcode = '22023';
  end if;

  update public.kuri_payments
     set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = trim(p_reason)
   where id = p_id and cancelled_at is null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'payment % not found or already cancelled', p_id using errcode = 'P0002';
  end if;

  if v_row.voucher_id is not null then
    update public.vouchers
       set cancelled_at  = now(),
           cancelled_by  = auth.uid(),
           cancel_reason = trim(p_reason)
     where id = v_row.voucher_id and cancelled_at is null;
  end if;

  perform public.kuri_sync_scheme_status(v_row.scheme_id);

  return v_row;
end
$$;

-- ---------------------------------------------------------------------------
-- Mark payout as completed (posts Payment voucher to scheme's head_code)
-- ---------------------------------------------------------------------------

drop function if exists public.mark_kuri_payout(integer, date);

create function public.mark_kuri_payout(
  p_lot_id            integer,
  p_payout_date       date default current_date,
  p_cash_account_code integer default null,
  p_notes             text default null
)
returns public.kuri_lots
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lot           public.kuri_lots;
  v_scheme        public.kuri_schemes;
  v_member        public.kuri_members;
  v_customer_name text;
  v_holder        text;
  v_date          date;
  v_cash_code     integer;
  v_narration     text;
  v_voucher       public.vouchers;
  v_row           public.kuri_lots;
begin
  if coalesce(public.app_role(), '') not in ('admin', 'accountant') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into v_lot from public.kuri_lots where id = p_lot_id and payout_status = 'pending' for update;
  if not found then
    raise exception 'lot % not found or already paid out', p_lot_id using errcode = 'P0002';
  end if;

  select * into v_scheme from public.kuri_schemes where id = v_lot.scheme_id;
  if v_scheme.head_code is null then
    raise exception 'link an account head to this kuri scheme before recording payouts'
      using errcode = '22023';
  end if;

  select * into v_member from public.kuri_members where id = v_lot.winner_member_id;
  select name into v_customer_name from public.customers where code = v_member.customer_code;
  v_holder := coalesce(nullif(trim(v_member.holder_name), ''), v_customer_name, '#' || v_member.customer_code);

  v_date := coalesce(p_payout_date, current_date);
  v_cash_code := public.resolve_kuri_cash_account(p_cash_account_code);
  v_narration := format(
    'Kuri %s - Lot Payout Inst #%s - Ticket #%s (%s)%s',
    v_scheme.name,
    v_lot.installment_no,
    v_member.ticket_no,
    v_holder,
    case when nullif(trim(p_notes), '') is not null then ': ' || trim(p_notes) else '' end
  );

  v_voucher := public.post_voucher(
    2,
    v_date,
    format('KURI-%s-LOT-I%s-T%s', v_scheme.id, v_lot.installment_no, v_member.ticket_no),
    v_member.customer_code,
    v_narration,
    v_cash_code,
    jsonb_build_array(
      jsonb_build_object(
        'account', v_scheme.head_code,
        'amount', v_lot.payout_amount,
        'description', v_narration
      )
    ),
    true,
    gen_random_uuid()
  );

  update public.kuri_lots
     set payout_status = 'paid',
         payout_date   = v_date,
         voucher_id    = v_voucher.id
   where id = p_lot_id
  returning * into v_row;

  perform public.kuri_sync_scheme_status(v_row.scheme_id);

  return v_row;
end
$$;

-- ---------------------------------------------------------------------------
-- Payment history (include voucher_id)
-- ---------------------------------------------------------------------------

drop function if exists public.kuri_payment_history(integer, integer);

create function public.kuri_payment_history(p_scheme_id integer, p_member_id integer)
returns table (
  id              bigint,
  installment_no  smallint,
  amount          numeric,
  paid_on         date,
  notes           text,
  voucher_id      bigint,
  cancelled_at    timestamptz,
  cancel_reason   text,
  created_at      timestamptz
)
language sql
stable
set search_path = ''
as $$
  select p.id, p.installment_no, p.amount, p.paid_on, p.notes,
         p.voucher_id, p.cancelled_at, p.cancel_reason, p.created_at
    from public.kuri_payments p
   where p.scheme_id = p_scheme_id and p.member_id = p_member_id
   order by p.paid_on desc, p.id desc
$$;

-- ---------------------------------------------------------------------------
-- Protect Kuri-generated vouchers from direct voucher register cancellation/edit
-- ---------------------------------------------------------------------------

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

  if exists (
    select 1 from public.kuri_payments kp
     where kp.voucher_id = p_id and kp.cancelled_at is null
  ) then
    raise exception 'this receipt is a kuri installment payment; cancel it from the kuri member ledger'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from public.kuri_lots kl
     where kl.voucher_id = p_id and kl.payout_status = 'paid'
  ) then
    raise exception 'this payment is a kuri lot payout and cannot be cancelled from the voucher register'
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

create or replace function public.update_voucher(
  p_id                bigint,
  p_date              date,
  p_reference_no      text,
  p_party_code        integer,
  p_narration         text,
  p_cash_account_code integer,
  p_lines             jsonb,
  p_simplified        boolean
)
returns public.vouchers language plpgsql security definer set search_path = '' as $$
declare v public.vouchers; j public.journals; lines jsonb; total numeric; fy integer; closed timestamptz;
begin
 if coalesce(public.app_role(),'')<>'admin' then
   raise exception 'not authorized' using errcode = '42501';
 end if;
 if p_date is null then raise exception 'A voucher date is required'; end if;

 select * into v from public.vouchers where id=p_id for update;
 if not found then raise exception 'Voucher not found'; end if;
 if v.cancelled_at is not null then raise exception 'A cancelled voucher cannot be edited'; end if;
 if exists(select 1 from public.subscription_payments where voucher_id=p_id) then
   raise exception 'This receipt is a subscription payment; change it from the member''s subscription';
 end if;
 if exists(select 1 from public.joining_fee_payments where voucher_id=p_id) then
   raise exception 'This receipt is a joining fee payment; change it from the member''s profile';
 end if;
 if exists(select 1 from public.kuri_payments where voucher_id=p_id) then
   raise exception 'This receipt is a kuri installment payment; manage it from the kuri member ledger';
 end if;
 if exists(select 1 from public.kuri_lots where voucher_id=p_id) then
   raise exception 'This payment is a kuri lot payout and cannot be edited from the voucher register';
 end if;
 select * into j from public.journals where voucher_id=p_id for update;
 if not found then raise exception 'Voucher journal is missing'; end if;

 select closed_at into closed from public.financial_years where start_year=v.fy_start for share;
 if closed is not null then raise exception 'Financial year % is closed',public.fy_label(v.fy_start); end if;
 fy:=public.fy_start_of(p_date);
 select closed_at into closed from public.financial_years where start_year=fy for share;
 if not found then raise exception 'Create financial year % before posting',public.fy_label(fy); end if;
 if closed is not null then raise exception 'Financial year % is closed',public.fy_label(fy); end if;

 lines:=public.voucher_postings(v.voucher_type,p_narration,p_cash_account_code,p_lines,p_simplified);
 if jsonb_array_length(lines)<2 or jsonb_array_length(lines)>200 then
   raise exception 'A voucher needs between 2 and 200 lines';
 end if;
 perform public.check_journal_lines(j.kind,lines);
 select sum(coalesce((x->>'debit')::numeric,0)) into total from jsonb_array_elements(lines) as t(x);

 insert into public.voucher_revisions(voucher_id,previous)
 select v.id, jsonb_build_object('voucher',to_jsonb(v),'lines',
   jsonb_agg(jsonb_build_object('line_no',d.line_no,'account',d.head_code,'debit',d.debit,
     'credit',d.credit,'description',d.narration,'reference_id',d.reference_id) order by d.line_no))
   from public.daybook d where d.journal_id=j.id;

 perform set_config('app.editing_journal',j.id::text,true);
 delete from public.daybook where journal_id=j.id;
 update public.journals set entry_date=p_date,narration=coalesce(trim(p_narration),'') where id=j.id;
 perform public.insert_journal_lines(j.id,p_date,p_narration,v.id,lines);
 perform set_config('app.editing_journal','',true);

 update public.vouchers
    set voucher_date=p_date, narration=coalesce(trim(p_narration),''), total_amount=total,
        reference_no=nullif(trim(p_reference_no),''), party_code=p_party_code, fy_start=fy,
        modified_by=auth.uid(), modified_at=now()
  where id=p_id
 returning * into v;
 return v;
end $$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on function public.check_kuri_account_head(integer),
  public.resolve_kuri_cash_account(integer) from public, anon, authenticated;

revoke execute on function public.create_kuri_scheme(text, numeric, integer, numeric, date, text, integer) from public, anon;
revoke execute on function public.set_kuri_scheme_account(integer, integer) from public, anon;
revoke execute on function public.kuri_scheme_detail(integer) from public, anon;
revoke execute on function public.kuri_scheme_list() from public, anon;
revoke execute on function public.record_kuri_payment(integer, integer, integer, numeric, date, text, uuid, integer) from public, anon;
revoke execute on function public.record_kuri_bulk_payment(integer, integer, date, text, integer) from public, anon;
revoke execute on function public.cancel_kuri_payment(bigint, text) from public, anon;
revoke execute on function public.mark_kuri_payout(integer, date, integer, text) from public, anon;
revoke execute on function public.kuri_payment_history(integer, integer) from public, anon;
revoke all on function public.update_voucher(bigint,date,text,integer,text,integer,jsonb,boolean) from public, anon;

grant execute on function public.create_kuri_scheme(text, numeric, integer, numeric, date, text, integer) to authenticated;
grant execute on function public.set_kuri_scheme_account(integer, integer) to authenticated;
grant execute on function public.kuri_scheme_detail(integer) to authenticated;
grant execute on function public.kuri_scheme_list() to authenticated;
grant execute on function public.record_kuri_payment(integer, integer, integer, numeric, date, text, uuid, integer) to authenticated;
grant execute on function public.record_kuri_bulk_payment(integer, integer, date, text, integer) to authenticated;
grant execute on function public.cancel_kuri_payment(bigint, text) to authenticated;
grant execute on function public.mark_kuri_payout(integer, date, integer, text) to authenticated;
grant execute on function public.kuri_payment_history(integer, integer) to authenticated;
grant execute on function public.update_voucher(bigint,date,text,integer,text,integer,jsonb,boolean) to authenticated;
