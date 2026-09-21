-- Kuri (Chit Fund) management module.
-- A predefined-payout chit fund where N members (default 25) pay a fixed installment across
-- N+1 months. Installment 1 is collection-only (no lot). Installments 2 through N+1 each
-- have a lot draw where one member wins a predefined payout amount.
--
-- Key business rules:
--   - A member can hold MULTIPLE tickets in the same kuri.
--   - A member can participate in MULTIPLE kuris simultaneously.
--   - Partial payments are supported (daily/weekly/monthly collections accumulate).
--   - Lot draw is manual entry only (organizer draws offline, records winner in app).
--   - No accounting integration; final payout amount is posted to a selected account head.
--
-- Formula:
--   total_value       = num_members × installment_amount
--   first_lot_payout  = total_value × (1 - max_deduction_pct / 100)
--   increment         = (total_value × max_deduction_pct / 100) / (num_members - 1)
--   payout(lot_n)     = first_lot_payout + (lot_n - 1) × increment
--     where lot_n = 1 (installment 2) .. num_members (installment N+1)

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.kuri_schemes (
  id                  integer generated always as identity primary key,
  name                text not null check (length(trim(name)) > 0),
  installment_amount  numeric(12, 2) not null check (installment_amount > 0),
  num_members         smallint not null default 25 check (num_members >= 2),
  num_installments    smallint not null default 26 check (num_installments >= 3),
  max_deduction_pct   numeric(5, 2) not null default 20.40 check (max_deduction_pct > 0 and max_deduction_pct < 100),
  start_date          date,
  status              text not null default 'draft' check (status in ('draft', 'active', 'completed')),
  notes               text,
  created_by          uuid default auth.uid() references auth.users (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- num_installments must be num_members + 1 (first installment has no lot)
  constraint kuri_schemes_installments_match check (num_installments = num_members + 1)
);

create trigger kuri_schemes_touch before update on public.kuri_schemes
  for each row execute function public.touch_updated_at();

-- Each row is one ticket. A single customer may hold multiple tickets in the same scheme
-- (no unique on scheme_id+customer_code). Ticket numbers must be unique within a scheme.
create table public.kuri_members (
  id              integer generated always as identity primary key,
  scheme_id       integer not null references public.kuri_schemes (id),
  customer_code   integer not null references public.customers (code),
  ticket_no       smallint not null check (ticket_no > 0),
  notes           text,
  created_by      uuid default auth.uid() references auth.users (id),
  created_at      timestamptz not null default now(),
  unique (scheme_id, ticket_no)
);

create index kuri_members_scheme_idx on public.kuri_members (scheme_id);
create index kuri_members_customer_idx on public.kuri_members (customer_code);

create table public.kuri_lots (
  id                integer generated always as identity primary key,
  scheme_id         integer not null references public.kuri_schemes (id),
  installment_no    smallint not null check (installment_no >= 2),
  winner_member_id  integer not null references public.kuri_members (id),
  payout_amount     numeric(12, 2) not null check (payout_amount > 0),
  payout_date       date,
  payout_status     text not null default 'pending' check (payout_status in ('pending', 'paid')),
  drawn_by          uuid default auth.uid() references auth.users (id),
  drawn_at          timestamptz not null default now(),
  unique (scheme_id, installment_no),
  unique (scheme_id, winner_member_id)
);

create index kuri_lots_scheme_idx on public.kuri_lots (scheme_id);

-- Payments allow partial collection: multiple payments per member per installment are allowed.
-- Daily/weekly/monthly collections accumulate toward the installment amount.
create table public.kuri_payments (
  id              bigint generated always as identity primary key,
  scheme_id       integer not null references public.kuri_schemes (id),
  member_id       integer not null references public.kuri_members (id),
  installment_no  smallint not null check (installment_no >= 1),
  amount          numeric(12, 2) not null check (amount > 0),
  paid_on         date not null,
  notes           text,
  request_id      uuid not null default gen_random_uuid() unique,
  cancelled_at    timestamptz,
  cancelled_by    uuid references auth.users (id),
  cancel_reason   text,
  created_by      uuid default auth.uid() references auth.users (id),
  created_at      timestamptz not null default now()
);

-- No unique index on (scheme_id, member_id, installment_no): multiple partial payments allowed.
create index kuri_payments_scheme_member_idx on public.kuri_payments (scheme_id, member_id);
create index kuri_payments_scheme_inst_idx on public.kuri_payments (scheme_id, installment_no);

-- ---------------------------------------------------------------------------
-- Payout schedule calculator
-- ---------------------------------------------------------------------------

-- Returns the predefined payout schedule for a scheme. One row per lot (installments 2..N+1).
create function public.kuri_payout_schedule(p_scheme_id integer)
returns table (
  installment_no  smallint,
  lot_number      smallint,
  payout_amount   numeric
)
language sql
stable
set search_path = ''
as $$
  select
    (n + 1)::smallint as installment_no,
    n::smallint as lot_number,
    round(
      (s.num_members * s.installment_amount) * (1 - s.max_deduction_pct / 100)
      + (n - 1) * (
          (s.num_members * s.installment_amount) * (s.max_deduction_pct / 100)
          / (s.num_members - 1)
        ),
      2
    ) as payout_amount
  from public.kuri_schemes s,
       generate_series(1, s.num_members) n
  where s.id = p_scheme_id
  order by n
$$;

-- ---------------------------------------------------------------------------
-- Scheme detail
-- ---------------------------------------------------------------------------

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
    (select count(*) from public.kuri_members m where m.scheme_id = s.id),
    (select count(*) from public.kuri_lots l where l.scheme_id = s.id),
    (select count(*) from public.kuri_lots l where l.scheme_id = s.id and l.payout_status = 'paid'),
    coalesce((select sum(p.amount) from public.kuri_payments p where p.scheme_id = s.id and p.cancelled_at is null), 0),
    coalesce((select sum(l.payout_amount) from public.kuri_lots l where l.scheme_id = s.id and l.payout_status = 'paid'), 0),
    s.created_at
  from public.kuri_schemes s
  where s.id = p_scheme_id
$$;

-- ---------------------------------------------------------------------------
-- Collection status for an installment
-- ---------------------------------------------------------------------------

-- Returns payment status of every enrolled member for a given installment.
-- Sums up all partial payments per member.
create function public.kuri_collection_status(p_scheme_id integer, p_installment_no integer)
returns table (
  member_id       integer,
  ticket_no       smallint,
  customer_code   integer,
  customer_name   text,
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
    c.phone,
    s.installment_amount,
    coalesce(p.total_paid, 0),
    s.installment_amount - coalesce(p.total_paid, 0),
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

-- ---------------------------------------------------------------------------
-- Member ledger within a scheme
-- ---------------------------------------------------------------------------

create function public.kuri_member_ledger(p_scheme_id integer, p_member_id integer)
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
    s.installment_amount,
    coalesce(p.total_paid, 0),
    s.installment_amount - coalesce(p.total_paid, 0),
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

-- ---------------------------------------------------------------------------
-- Create scheme RPC
-- ---------------------------------------------------------------------------

create function public.create_kuri_scheme(
  p_name              text,
  p_installment_amount numeric,
  p_num_members       integer default 25,
  p_max_deduction_pct numeric default 20.40,
  p_start_date        date default null,
  p_notes             text default null
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

  insert into public.kuri_schemes (name, installment_amount, num_members, num_installments, max_deduction_pct, start_date, notes, created_by)
  values (trim(p_name), p_installment_amount, p_num_members, p_num_members + 1, p_max_deduction_pct, p_start_date, nullif(trim(p_notes), ''), auth.uid())
  returning * into v_row;

  return v_row;
end
$$;

-- ---------------------------------------------------------------------------
-- Activate scheme
-- ---------------------------------------------------------------------------

create function public.activate_kuri_scheme(p_scheme_id integer)
returns public.kuri_schemes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.kuri_schemes;
  v_enrolled integer;
begin
  if coalesce(public.app_role(), '') not in ('admin', 'accountant') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into v_row from public.kuri_schemes where id = p_scheme_id for update;
  if not found then
    raise exception 'scheme % not found', p_scheme_id using errcode = 'P0002';
  end if;
  if v_row.status <> 'draft' then
    raise exception 'only draft schemes can be activated' using errcode = '22023';
  end if;

  select count(*) into v_enrolled from public.kuri_members where scheme_id = p_scheme_id;
  if v_enrolled <> v_row.num_members then
    raise exception 'scheme requires % members (tickets) but only % are enrolled', v_row.num_members, v_enrolled
      using errcode = '22023';
  end if;

  update public.kuri_schemes set status = 'active' where id = p_scheme_id returning * into v_row;
  return v_row;
end
$$;

-- ---------------------------------------------------------------------------
-- Add member (ticket)
-- ---------------------------------------------------------------------------

create function public.add_kuri_member(
  p_scheme_id     integer,
  p_customer_code integer,
  p_ticket_no     integer,
  p_notes         text default null
)
returns public.kuri_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scheme  public.kuri_schemes;
  v_count   integer;
  v_row     public.kuri_members;
begin
  if coalesce(public.app_role(), '') not in ('admin', 'accountant') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into v_scheme from public.kuri_schemes where id = p_scheme_id for update;
  if not found then
    raise exception 'scheme % not found', p_scheme_id using errcode = 'P0002';
  end if;
  if v_scheme.status = 'completed' then
    raise exception 'cannot add members to a completed scheme' using errcode = '22023';
  end if;

  if not exists (select 1 from public.customers where code = p_customer_code) then
    raise exception 'customer % not found', p_customer_code using errcode = 'P0002';
  end if;

  if p_ticket_no < 1 or p_ticket_no > v_scheme.num_members then
    raise exception 'ticket number must be between 1 and %', v_scheme.num_members using errcode = '22023';
  end if;

  select count(*) into v_count from public.kuri_members where scheme_id = p_scheme_id;
  if v_count >= v_scheme.num_members then
    raise exception 'scheme already has the maximum % tickets', v_scheme.num_members using errcode = '22023';
  end if;

  -- Note: same customer can hold multiple tickets (no unique on scheme_id+customer_code).
  -- Only ticket_no is unique within a scheme.
  insert into public.kuri_members (scheme_id, customer_code, ticket_no, notes, created_by)
  values (p_scheme_id, p_customer_code, p_ticket_no, nullif(trim(p_notes), ''), auth.uid())
  returning * into v_row;

  return v_row;
end
$$;

-- ---------------------------------------------------------------------------
-- Remove member (ticket)
-- ---------------------------------------------------------------------------

create function public.remove_kuri_member(p_member_id integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member  public.kuri_members;
  v_scheme  public.kuri_schemes;
begin
  if coalesce(public.app_role(), '') <> 'admin' then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into v_member from public.kuri_members where id = p_member_id;
  if not found then
    raise exception 'member % not found', p_member_id using errcode = 'P0002';
  end if;

  select * into v_scheme from public.kuri_schemes where id = v_member.scheme_id;
  if v_scheme.status <> 'draft' then
    raise exception 'members can only be removed from draft schemes' using errcode = '22023';
  end if;

  -- Any payment row, cancelled or not, keeps a foreign key on this member.
  if exists (select 1 from public.kuri_payments where member_id = p_member_id) then
    raise exception 'cannot remove a ticket that has payments recorded against it' using errcode = '22023';
  end if;
  if exists (select 1 from public.kuri_lots where winner_member_id = p_member_id) then
    raise exception 'cannot remove member who has won a lot' using errcode = '22023';
  end if;

  delete from public.kuri_members where id = p_member_id;
end
$$;

-- ---------------------------------------------------------------------------
-- Scheme status sync
-- ---------------------------------------------------------------------------

-- A scheme is finished only once every lot is drawn, every payout is settled and every
-- installment is fully collected. Called after any change that can move those numbers, so
-- the status also reopens when a payment is cancelled. Draft schemes are left alone.
-- Internal only: no grant to authenticated, so it runs solely inside the RPCs below.
create function public.kuri_sync_scheme_status(p_scheme_id integer)
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

  v_due := v_tickets * v_scheme.num_installments * v_scheme.installment_amount;
  v_finished := v_lots = v_scheme.num_members and v_unpaid = 0 and v_collected >= v_due - 0.001;

  if v_finished and v_scheme.status <> 'completed' then
    update public.kuri_schemes set status = 'completed' where id = p_scheme_id;
  elsif not v_finished and v_scheme.status = 'completed' then
    update public.kuri_schemes set status = 'active' where id = p_scheme_id;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Draw lot (manual entry only)
-- ---------------------------------------------------------------------------

create function public.draw_kuri_lot(
  p_scheme_id       integer,
  p_installment_no  integer,
  p_winner_member_id integer
)
returns public.kuri_lots
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scheme  public.kuri_schemes;
  v_member  public.kuri_members;
  v_payout  numeric;
  v_row     public.kuri_lots;
begin
  if coalesce(public.app_role(), '') not in ('admin', 'accountant') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into v_scheme from public.kuri_schemes where id = p_scheme_id for update;
  if not found then
    raise exception 'scheme % not found', p_scheme_id using errcode = 'P0002';
  end if;
  if v_scheme.status <> 'active' then
    raise exception 'lots can only be drawn for active schemes' using errcode = '22023';
  end if;

  if p_installment_no < 2 or p_installment_no > v_scheme.num_installments then
    raise exception 'installment number must be between 2 and %', v_scheme.num_installments
      using errcode = '22023';
  end if;

  select * into v_member from public.kuri_members where id = p_winner_member_id and scheme_id = p_scheme_id;
  if not found then
    raise exception 'member % is not enrolled in scheme %', p_winner_member_id, p_scheme_id
      using errcode = 'P0002';
  end if;

  if exists (select 1 from public.kuri_lots where scheme_id = p_scheme_id and installment_no = p_installment_no) then
    raise exception 'lot has already been drawn for installment %', p_installment_no
      using errcode = '23505';
  end if;

  if exists (select 1 from public.kuri_lots where scheme_id = p_scheme_id and winner_member_id = p_winner_member_id) then
    raise exception 'this ticket has already won a lot in this scheme'
      using errcode = '23505';
  end if;

  select ps.payout_amount into v_payout
    from public.kuri_payout_schedule(p_scheme_id) ps
   where ps.installment_no = p_installment_no;

  if v_payout is null then
    raise exception 'could not calculate payout for installment %', p_installment_no
      using errcode = '22023';
  end if;

  insert into public.kuri_lots (scheme_id, installment_no, winner_member_id, payout_amount, drawn_by)
  values (p_scheme_id, p_installment_no, p_winner_member_id, v_payout, auth.uid())
  returning * into v_row;

  perform public.kuri_sync_scheme_status(p_scheme_id);

  return v_row;
end
$$;

-- ---------------------------------------------------------------------------
-- Record installment payment (supports partial payments)
-- ---------------------------------------------------------------------------

create function public.record_kuri_payment(
  p_scheme_id      integer,
  p_member_id      integer,
  p_installment_no integer,
  p_amount         numeric,
  p_paid_on        date,
  p_notes          text default null,
  p_request_id     uuid default null
)
returns public.kuri_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scheme    public.kuri_schemes;
  v_member    public.kuri_members;
  v_req_id    uuid;
  v_already   numeric;
  v_row       public.kuri_payments;
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

  -- Sum existing active payments for this member+installment
  select coalesce(sum(pp.amount), 0) into v_already
    from public.kuri_payments pp
   where pp.scheme_id = p_scheme_id and pp.member_id = p_member_id
     and pp.installment_no = p_installment_no and pp.cancelled_at is null;

  -- Check total does not exceed installment amount
  if v_already + p_amount > v_scheme.installment_amount + 0.001 then
    raise exception 'total payments (% + %) would exceed installment amount %',
      v_already, p_amount, v_scheme.installment_amount
      using errcode = '22023';
  end if;

  insert into public.kuri_payments (scheme_id, member_id, installment_no, amount, paid_on, notes, request_id, created_by)
  values (p_scheme_id, p_member_id, p_installment_no, p_amount, p_paid_on, nullif(trim(p_notes), ''), v_req_id, auth.uid())
  returning * into v_row;

  perform public.kuri_sync_scheme_status(p_scheme_id);

  return v_row;
end
$$;

-- ---------------------------------------------------------------------------
-- Bulk record full payment for all unpaid members of an installment
-- ---------------------------------------------------------------------------

create function public.record_kuri_bulk_payment(
  p_scheme_id      integer,
  p_installment_no integer,
  p_paid_on        date,
  p_notes          text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scheme  public.kuri_schemes;
  v_member  record;
  v_already numeric;
  v_remaining numeric;
  v_count   integer := 0;
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

  if p_installment_no < 1 or p_installment_no > v_scheme.num_installments then
    raise exception 'installment number must be between 1 and %', v_scheme.num_installments
      using errcode = '22023';
  end if;

  for v_member in
    select m.id from public.kuri_members m
     where m.scheme_id = p_scheme_id
     order by m.ticket_no
  loop
    -- Sum existing payments for this member+installment
    select coalesce(sum(pp.amount), 0) into v_already
      from public.kuri_payments pp
     where pp.scheme_id = p_scheme_id and pp.member_id = v_member.id
       and pp.installment_no = p_installment_no and pp.cancelled_at is null;

    v_remaining := v_scheme.installment_amount - v_already;

    if v_remaining > 0.001 then
      insert into public.kuri_payments (scheme_id, member_id, installment_no, amount, paid_on, notes, created_by)
      values (p_scheme_id, v_member.id, p_installment_no, round(v_remaining, 2), p_paid_on, nullif(trim(p_notes), ''), auth.uid());
      v_count := v_count + 1;
    end if;
  end loop;

  perform public.kuri_sync_scheme_status(p_scheme_id);

  return v_count;
end
$$;

-- ---------------------------------------------------------------------------
-- Cancel payment
-- ---------------------------------------------------------------------------

create function public.cancel_kuri_payment(p_id bigint, p_reason text)
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

  perform public.kuri_sync_scheme_status(v_row.scheme_id);

  return v_row;
end
$$;

-- ---------------------------------------------------------------------------
-- Mark payout as completed
-- ---------------------------------------------------------------------------

create function public.mark_kuri_payout(p_lot_id integer, p_payout_date date default current_date)
returns public.kuri_lots
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.kuri_lots;
begin
  if coalesce(public.app_role(), '') not in ('admin', 'accountant') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update public.kuri_lots
     set payout_status = 'paid', payout_date = p_payout_date
   where id = p_lot_id and payout_status = 'pending'
  returning * into v_row;

  if v_row.id is null then
    raise exception 'lot % not found or already paid out', p_lot_id using errcode = 'P0002';
  end if;

  perform public.kuri_sync_scheme_status(v_row.scheme_id);

  return v_row;
end
$$;

-- ---------------------------------------------------------------------------
-- Scheme list with summary stats
-- ---------------------------------------------------------------------------

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
    (select count(*) from public.kuri_members m where m.scheme_id = s.id),
    (select count(*) from public.kuri_lots l where l.scheme_id = s.id),
    coalesce((select sum(p.amount) from public.kuri_payments p
               where p.scheme_id = s.id and p.cancelled_at is null), 0),
    s.created_at
  from public.kuri_schemes s
  order by s.created_at desc
$$;

-- ---------------------------------------------------------------------------
-- Defaulters: members who have not fully paid for a given installment
-- ---------------------------------------------------------------------------

create function public.kuri_defaulters(p_scheme_id integer, p_installment_no integer)
returns table (
  member_id       integer,
  ticket_no       smallint,
  customer_code   integer,
  customer_name   text,
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
    m.id, m.ticket_no, c.code, c.name, c.phone,
    s.installment_amount,
    coalesce(p.total_paid, 0),
    s.installment_amount - coalesce(p.total_paid, 0)
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
    and s.installment_amount - coalesce(p.total_paid, 0) > 0.001
  order by m.ticket_no
$$;

-- ---------------------------------------------------------------------------
-- Payment history for a member in a scheme
-- ---------------------------------------------------------------------------

create function public.kuri_payment_history(p_scheme_id integer, p_member_id integer)
returns table (
  id              bigint,
  installment_no  smallint,
  amount          numeric,
  paid_on         date,
  notes           text,
  cancelled_at    timestamptz,
  cancel_reason   text,
  created_at      timestamptz
)
language sql
stable
set search_path = ''
as $$
  select p.id, p.installment_no, p.amount, p.paid_on, p.notes,
         p.cancelled_at, p.cancel_reason, p.created_at
    from public.kuri_payments p
   where p.scheme_id = p_scheme_id and p.member_id = p_member_id
   order by p.paid_on desc, p.id desc
$$;

-- ---------------------------------------------------------------------------
-- Privileges and RLS
-- ---------------------------------------------------------------------------

revoke all on public.kuri_schemes, public.kuri_members, public.kuri_lots, public.kuri_payments from anon;

revoke execute on function public.kuri_payout_schedule(integer) from public, anon;
revoke execute on function public.kuri_scheme_detail(integer) from public, anon;
revoke execute on function public.kuri_collection_status(integer, integer) from public, anon;
revoke execute on function public.kuri_member_ledger(integer, integer) from public, anon;
revoke execute on function public.kuri_payment_history(integer, integer) from public, anon;
revoke execute on function public.create_kuri_scheme(text, numeric, integer, numeric, date, text) from public, anon;
revoke execute on function public.activate_kuri_scheme(integer) from public, anon;
revoke execute on function public.add_kuri_member(integer, integer, integer, text) from public, anon;
revoke execute on function public.remove_kuri_member(integer) from public, anon;
revoke execute on function public.draw_kuri_lot(integer, integer, integer) from public, anon;
revoke execute on function public.record_kuri_payment(integer, integer, integer, numeric, date, text, uuid) from public, anon;
revoke execute on function public.record_kuri_bulk_payment(integer, integer, date, text) from public, anon;
revoke execute on function public.cancel_kuri_payment(bigint, text) from public, anon;
revoke execute on function public.mark_kuri_payout(integer, date) from public, anon;
revoke execute on function public.kuri_scheme_list() from public, anon;
-- Internal helper: callable only by the owner, i.e. from the security definer RPCs above.
revoke execute on function public.kuri_sync_scheme_status(integer) from public, anon, authenticated;
revoke execute on function public.kuri_defaulters(integer, integer) from public, anon;

grant execute on function public.kuri_payout_schedule(integer) to authenticated;
grant execute on function public.kuri_scheme_detail(integer) to authenticated;
grant execute on function public.kuri_collection_status(integer, integer) to authenticated;
grant execute on function public.kuri_member_ledger(integer, integer) to authenticated;
grant execute on function public.kuri_payment_history(integer, integer) to authenticated;
grant execute on function public.create_kuri_scheme(text, numeric, integer, numeric, date, text) to authenticated;
grant execute on function public.activate_kuri_scheme(integer) to authenticated;
grant execute on function public.add_kuri_member(integer, integer, integer, text) to authenticated;
grant execute on function public.remove_kuri_member(integer) to authenticated;
grant execute on function public.draw_kuri_lot(integer, integer, integer) to authenticated;
grant execute on function public.record_kuri_payment(integer, integer, integer, numeric, date, text, uuid) to authenticated;
grant execute on function public.record_kuri_bulk_payment(integer, integer, date, text) to authenticated;
grant execute on function public.cancel_kuri_payment(bigint, text) to authenticated;
grant execute on function public.mark_kuri_payout(integer, date) to authenticated;
grant execute on function public.kuri_scheme_list() to authenticated;
grant execute on function public.kuri_defaulters(integer, integer) to authenticated;

alter table public.kuri_schemes  enable row level security;
alter table public.kuri_members  enable row level security;
alter table public.kuri_lots     enable row level security;
alter table public.kuri_payments enable row level security;

-- Schemes: all authenticated can read
create policy kuri_schemes_select on public.kuri_schemes
  for select to authenticated using ((select public.app_role()) is not null);

-- Members: all authenticated can read; written by RPCs
create policy kuri_members_select on public.kuri_members
  for select to authenticated using ((select public.app_role()) is not null);

-- Lots: all authenticated can read; written by RPCs
create policy kuri_lots_select on public.kuri_lots
  for select to authenticated using ((select public.app_role()) is not null);

-- Payments: all authenticated can read; written by RPCs
create policy kuri_payments_select on public.kuri_payments
  for select to authenticated using ((select public.app_role()) is not null);
