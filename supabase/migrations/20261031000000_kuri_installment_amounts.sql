-- Custom per-ticket collection dues; lot payouts and existing receipts are preserved.
create table public.kuri_installment_amounts (
  scheme_id integer not null references public.kuri_schemes(id),
  installment_no smallint not null check(installment_no>=1),
  amount numeric(12,2) not null check(amount>0),
  notes text,
  updated_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key(scheme_id,installment_no)
);
create table public.kuri_installment_amount_history (
  id bigint generated always as identity primary key,
  scheme_id integer not null references public.kuri_schemes(id),
  installment_no smallint not null,
  previous_amount numeric(12,2) not null,
  new_amount numeric(12,2) not null,
  notes text,
  changed_by uuid not null default auth.uid() references auth.users(id),
  changed_at timestamptz not null default now()
);
create index kuri_installment_amount_history_scheme_idx
  on public.kuri_installment_amount_history(scheme_id,installment_no);
alter table public.kuri_installment_amounts enable row level security;
alter table public.kuri_installment_amount_history enable row level security;
revoke all on public.kuri_installment_amounts,public.kuri_installment_amount_history from public,anon,authenticated;
grant select on public.kuri_installment_amounts,public.kuri_installment_amount_history to authenticated;
create policy kuri_installment_amounts_read on public.kuri_installment_amounts
  for select to authenticated using((select public.app_role()) is not null);
create policy kuri_installment_amount_history_read on public.kuri_installment_amount_history
  for select to authenticated using((select public.app_role()) in ('admin','accountant'));

create function public.kuri_installment_due(p_scheme_id integer,p_installment_no integer)
returns numeric language sql stable set search_path='' as $$
  select coalesce(a.amount,s.installment_amount) from public.kuri_schemes s
  left join public.kuri_installment_amounts a on a.scheme_id=s.id and a.installment_no=p_installment_no
  where s.id=p_scheme_id and p_installment_no between 1 and s.num_installments
$$;

create function public.kuri_scheme_total_due(p_scheme_id integer)
returns numeric language sql stable set search_path='' as $$
  select sum(coalesce(a.amount,s.installment_amount))
  from public.kuri_schemes s cross join generate_series(1,s.num_installments) n
  left join public.kuri_installment_amounts a on a.scheme_id=s.id and a.installment_no=n
  where s.id=p_scheme_id
$$;

-- Future means after the latest installment reached by a live receipt or a lot draw.
create function public.kuri_installment_amount_schedule(p_scheme_id integer)
returns table(installment_no integer,base_amount numeric,amount_due numeric,is_custom boolean,
  can_edit boolean,notes text,updated_at timestamptz)
language sql stable set search_path='' as $$
  select n,s.installment_amount,coalesce(a.amount,s.installment_amount),a.scheme_id is not null,
    s.status in ('draft','active') and n>greatest(
      coalesce((select max(p.installment_no) from public.kuri_payments p where p.scheme_id=s.id and p.cancelled_at is null),0),
      coalesce((select max(l.installment_no) from public.kuri_lots l where l.scheme_id=s.id),0)),
    a.notes,a.updated_at
  from public.kuri_schemes s cross join generate_series(1,s.num_installments) n
  left join public.kuri_installment_amounts a on a.scheme_id=s.id and a.installment_no=n
  where s.id=p_scheme_id order by n
$$;

create function public.set_kuri_installment_amount(
  p_scheme_id integer,p_installment_no integer,p_amount numeric default null,
  p_notes text default null,p_expected_amount numeric default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.kuri_schemes; current_amount numeric; new_amount numeric; used_through integer;
begin
  if coalesce(public.app_role(),'') not in ('admin','accountant') then
    raise exception 'not authorized' using errcode='42501';
  end if;
  select * into s from public.kuri_schemes where id=p_scheme_id for update;
  if not found then raise exception 'scheme not found' using errcode='P0002'; end if;
  if s.status not in ('draft','active') then
    raise exception 'completed schemes cannot be changed' using errcode='22023';
  end if;
  if p_installment_no is null or p_installment_no<1 or p_installment_no>s.num_installments then
    raise exception 'invalid installment number' using errcode='22023';
  end if;
  if p_amount is not null and (p_amount<=0 or p_amount>=10000000000 or p_amount<>round(p_amount,2)) then
    raise exception 'amount must be positive with at most two decimal places' using errcode='22023';
  end if;
  select greatest(
    coalesce((select max(installment_no) from public.kuri_payments where scheme_id=s.id and cancelled_at is null),0),
    coalesce((select max(installment_no) from public.kuri_lots where scheme_id=s.id),0)) into used_through;
  if p_installment_no<=used_through then
    raise exception 'only future installments without receipts or lot draws can be changed' using errcode='22023';
  end if;
  current_amount:=public.kuri_installment_due(s.id,p_installment_no);
  if p_expected_amount is not null and p_expected_amount is distinct from current_amount then
    raise exception 'Installment amount changed. Reload the schedule before saving.' using errcode='22023';
  end if;
  new_amount:=coalesce(p_amount,s.installment_amount);
  if new_amount=s.installment_amount then
    delete from public.kuri_installment_amounts where scheme_id=s.id and installment_no=p_installment_no;
  else
    insert into public.kuri_installment_amounts(scheme_id,installment_no,amount,notes,updated_by)
    values(s.id,p_installment_no,new_amount,nullif(trim(p_notes),''),auth.uid())
    on conflict(scheme_id,installment_no) do update set amount=excluded.amount,notes=excluded.notes,
      updated_by=auth.uid(),updated_at=now();
  end if;
  if current_amount is distinct from new_amount then
    insert into public.kuri_installment_amount_history(scheme_id,installment_no,previous_amount,new_amount,notes)
    values(s.id,p_installment_no,current_amount,new_amount,nullif(trim(p_notes),''));
  end if;
  return jsonb_build_object('installment_no',p_installment_no,'amount_due',new_amount,'is_custom',new_amount<>s.installment_amount);
end $$;


create or replace function public.kuri_member_ledger(p_scheme_id integer, p_member_id integer)
returns table (
  installment_no   smallint,
  amount_due       numeric,
  amount_paid      numeric,
  balance          numeric,
  last_paid_on     date
)
language sql
stable
set search_path = ''
as $$
  select
    inst.no::smallint,
    public.kuri_installment_due(s.id,inst.no),
    coalesce(p.total_paid, 0),
    public.kuri_installment_due(s.id,inst.no) - coalesce(p.total_paid, 0),
    p.last_paid
  from public.kuri_schemes s
  join public.kuri_members mem on mem.id = p_member_id and mem.scheme_id = s.id
  cross join generate_series(1, s.num_installments) inst(no)
  left join lateral (
    select sum(pp.amount) as total_paid, max(pp.paid_on) as last_paid
      from public.kuri_payments pp
     where pp.scheme_id = s.id
       and pp.member_id = p_member_id
       and pp.installment_no = inst.no
       and pp.cancelled_at is null
  ) p on true
  where s.id = p_scheme_id
  order by inst.no
$$;

create or replace function public.kuri_collection_status(p_scheme_id integer, p_installment_no integer)
returns table (
  member_id       integer,
  ticket_no       smallint,
  customer_code   integer,
  customer_name   text,
  holder_name     text,
  holder_address  text,
  phone           text,
  amount_due      numeric,
  amount_paid     numeric,
  balance         numeric,
  last_paid_on    date,
  has_won_lot     boolean,
  won_installment smallint
)
language sql
stable
set search_path = ''
as $$
  select
    m.id,
    m.ticket_no,
    c.code,
    c.name,
    coalesce(m.holder_name, c.name),
    coalesce(
      m.holder_address,
      nullif(
        concat_ws(
          ', ',
          nullif(trim(c.addr1), ''),
          nullif(trim(c.addr2), ''),
          nullif(trim(c.addr3), ''),
          nullif(trim(c.addr4), '')
        ),
        ''
      )
    ),
    coalesce(m.holder_phone, c.phone),
    public.kuri_installment_due(s.id,p_installment_no),
    coalesce(p.total_paid, 0),
    public.kuri_installment_due(s.id,p_installment_no) - coalesce(p.total_paid, 0),
    p.last_paid,
    l.id is not null,
    l.installment_no
  from public.kuri_members m
  join public.kuri_schemes s on s.id = m.scheme_id
  join public.customers c on c.code = m.customer_code
  left join lateral (
    select sum(pp.amount) as total_paid, max(pp.paid_on) as last_paid
      from public.kuri_payments pp
     where pp.scheme_id = m.scheme_id
       and pp.member_id = m.id
       and pp.installment_no = p_installment_no
       and pp.cancelled_at is null
  ) p on true
  left join public.kuri_lots l on l.scheme_id = m.scheme_id
    and l.winner_member_id = m.id
  where m.scheme_id = p_scheme_id
  order by m.ticket_no
$$;

create or replace function public.kuri_defaulters(p_scheme_id integer, p_installment_no integer)
returns table (
  member_id       integer,
  ticket_no       smallint,
  customer_code   integer,
  customer_name   text,
  holder_name     text,
  holder_address  text,
  phone           text,
  amount_due      numeric,
  amount_paid     numeric,
  balance         numeric
)
language sql
stable
set search_path = ''
as $$
  select
    m.id,
    m.ticket_no,
    c.code,
    c.name,
    coalesce(m.holder_name, c.name),
    coalesce(
      m.holder_address,
      nullif(
        concat_ws(
          ', ',
          nullif(trim(c.addr1), ''),
          nullif(trim(c.addr2), ''),
          nullif(trim(c.addr3), ''),
          nullif(trim(c.addr4), '')
        ),
        ''
      )
    ),
    coalesce(m.holder_phone, c.phone),
    public.kuri_installment_due(s.id,p_installment_no),
    coalesce(p.total_paid, 0),
    public.kuri_installment_due(s.id,p_installment_no) - coalesce(p.total_paid, 0)
  from public.kuri_members m
  join public.kuri_schemes s on s.id = m.scheme_id
  join public.customers c on c.code = m.customer_code
  left join lateral (
    select sum(pp.amount) as total_paid
      from public.kuri_payments pp
     where pp.scheme_id = p_scheme_id and pp.member_id = m.id
       and pp.installment_no = p_installment_no and pp.cancelled_at is null
  ) p on true
  where m.scheme_id = p_scheme_id
    and public.kuri_installment_due(s.id,p_installment_no) - coalesce(p.total_paid, 0) > 0.001
  order by m.ticket_no
$$;

create or replace function public.kuri_receipt_tickets(p_scheme_id integer)
returns table (
  member_id integer, ticket_no smallint, customer_code integer, customer_name text,
  holder_name text, holder_address text, phone text, amount_due numeric,
  amount_paid numeric, balance numeric, last_paid_on date,
  has_won_lot boolean, won_installment smallint
)
language sql stable set search_path = '' as $$
  select m.id, m.ticket_no, c.code, c.name, coalesce(m.holder_name,c.name),
    m.holder_address, coalesce(m.holder_phone,c.phone),
    public.kuri_scheme_total_due(s.id), coalesce(p.paid,0),
    public.kuri_scheme_total_due(s.id) - coalesce(p.paid,0), p.last_paid,
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

create or replace function public.kuri_sync_scheme_status(p_scheme_id integer)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_scheme     public.kuri_schemes;
  v_tickets    integer;
  v_lots       integer;
  v_unpaid     integer;
  v_collected  numeric;
  v_due        numeric;
  v_finished   boolean;
begin
  select * into v_scheme from public.kuri_schemes where id = p_scheme_id;
  if not found or v_scheme.status = 'draft' then
    return;
  end if;

  select count(*) into v_tickets from public.kuri_members where scheme_id = p_scheme_id;
  select count(*), count(*) filter (where payout_status <> 'paid')
    into v_lots, v_unpaid
    from public.kuri_lots where scheme_id = p_scheme_id;
  select coalesce(sum(amount), 0) into v_collected
    from public.kuri_payments where scheme_id = p_scheme_id and cancelled_at is null;

  v_due := v_tickets * public.kuri_scheme_total_due(p_scheme_id);
  v_finished := v_lots = v_scheme.num_members and v_unpaid = 0 and v_collected >= v_due - 0.001;

  if v_finished and v_scheme.status <> 'completed' then
    update public.kuri_schemes set status = 'completed' where id = p_scheme_id;
  elsif not v_finished and v_scheme.status = 'completed' then
    update public.kuri_schemes set status = 'active' where id = p_scheme_id;
  end if;
end
$$;

create or replace function public.record_kuri_payment(
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

  if v_already + p_amount > public.kuri_installment_due(p_scheme_id,p_installment_no) + 0.001 then
    raise exception 'total payments (% + %) would exceed installment amount %',
      v_already, p_amount, public.kuri_installment_due(p_scheme_id,p_installment_no)
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

create or replace function public.record_kuri_bulk_payment(
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

    v_remaining := round(public.kuri_installment_due(p_scheme_id,p_installment_no) - v_already, 2);

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

create or replace function public.record_kuri_receipt(
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
  -- Same scheme-first lock order as schedule edits, bulk receipts and lot draws.
  perform 1 from public.kuri_schemes where id=p_scheme_id for update;
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
  perform 1 from public.kuri_schemes where id=(select scheme_id from public.kuri_payments where id=p_id) for update;
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

revoke execute on function public.kuri_installment_due(integer,integer) from public,anon;
revoke execute on function public.kuri_scheme_total_due(integer) from public,anon;
revoke execute on function public.kuri_installment_amount_schedule(integer) from public,anon;
revoke execute on function public.set_kuri_installment_amount(integer,integer,numeric,text,numeric) from public,anon;
grant execute on function public.kuri_installment_due(integer,integer) to authenticated;
grant execute on function public.kuri_scheme_total_due(integer) to authenticated;
grant execute on function public.kuri_installment_amount_schedule(integer) to authenticated;
grant execute on function public.set_kuri_installment_amount(integer,integer,numeric,text,numeric) to authenticated;
