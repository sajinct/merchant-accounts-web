-- Allow each Kuri ticket (kuri_members row) to optionally store its own ticket-holder
-- name, address and phone while remaining linked to a member (customers.code).
-- When holder_* fields are null, the linked member's own name, address and phone are used.

alter table public.kuri_members
  add column holder_name text check (holder_name is null or length(trim(holder_name)) > 0),
  add column holder_address text,
  add column holder_phone text;

-- ---------------------------------------------------------------------------
-- Add member (ticket) with optional custom ticket-holder details
-- ---------------------------------------------------------------------------

drop function if exists public.add_kuri_member(integer, integer, integer, text);

create function public.add_kuri_member(
  p_scheme_id      integer,
  p_customer_code  integer,
  p_ticket_no      integer,
  p_notes          text default null,
  p_holder_name    text default null,
  p_holder_address text default null,
  p_holder_phone   text default null
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
  insert into public.kuri_members (
    scheme_id, customer_code, ticket_no, notes,
    holder_name, holder_address, holder_phone, created_by
  )
  values (
    p_scheme_id,
    p_customer_code,
    p_ticket_no,
    nullif(trim(p_notes), ''),
    nullif(trim(p_holder_name), ''),
    nullif(trim(p_holder_address), ''),
    nullif(trim(p_holder_phone), ''),
    auth.uid()
  )
  returning * into v_row;

  return v_row;
end
$$;

-- ---------------------------------------------------------------------------
-- Collection status for an installment (includes ticket-holder details)
-- ---------------------------------------------------------------------------

drop function if exists public.kuri_collection_status(integer, integer);

create function public.kuri_collection_status(p_scheme_id integer, p_installment_no integer)
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
-- Defaulters: members who have not fully paid for a given installment
-- ---------------------------------------------------------------------------

drop function if exists public.kuri_defaulters(integer, integer);

create function public.kuri_defaulters(p_scheme_id integer, p_installment_no integer)
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
-- Privileges
-- ---------------------------------------------------------------------------

revoke execute on function public.add_kuri_member(integer, integer, integer, text, text, text, text) from public, anon;
revoke execute on function public.kuri_collection_status(integer, integer) from public, anon;
revoke execute on function public.kuri_defaulters(integer, integer) from public, anon;

grant execute on function public.add_kuri_member(integer, integer, integer, text, text, text, text) to authenticated;
grant execute on function public.kuri_collection_status(integer, integer) to authenticated;
grant execute on function public.kuri_defaulters(integer, integer) to authenticated;
