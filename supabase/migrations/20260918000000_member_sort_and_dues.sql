-- Member ordering, and the dues figure the dashboard shows.

-- ---------------------------------------------------------------------------
-- Case-insensitive member ordering
-- ---------------------------------------------------------------------------

-- Postgres orders text by the database collation. Under the C collation 'Zachary'
-- sorts before 'aaron', so a directory whose names mix cases reads as two lists
-- glued together; ICU and glibc locales fold case but disagree on punctuation and
-- spaces. A stored lowercase copy settles it for every caller, and the index on it
-- keeps paging the member list to a single scan instead of a sort of the whole table.
alter table public.customers
  add column name_sort text generated always as (lower(trim(name))) stored;

create index customers_name_sort_idx on public.customers (name_sort, code);

-- The dues report lists members by name as well.
create or replace function public.rpt_subscription_status(p_fy integer)
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
   group by c.code, c.name, c.phone, c.name_sort
   order by c.name_sort, c.code
$$;

-- ---------------------------------------------------------------------------
-- Dashboard dues
-- ---------------------------------------------------------------------------

-- The dashboard needs two numbers: what is owed, and by how many members. Asking
-- rpt_subscription_status for them means sending one row per member over the wire
-- and adding them up in the browser, which grows with the membership. This totals
-- them in the database instead and always returns a single row. The full per-member
-- report stays where it is used, on the Subscriptions page.
create function public.subscription_dues_summary(p_fy integer)
returns table (total numeric, members integer)
language sql
stable
set search_path = ''
as $$
  with owing as (
    select sum(l.balance) as due
      from public.subscription_ledger(p_fy) l
     group by l.member_code
    having sum(l.balance) > 0
  )
  select coalesce(sum(due), 0), count(*)::integer from owing
$$;

revoke execute on function public.subscription_dues_summary(integer) from public, anon;
grant execute on function public.subscription_dues_summary(integer) to authenticated;
