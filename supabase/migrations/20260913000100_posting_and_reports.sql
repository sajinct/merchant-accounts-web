-- Merchant Accounts: day book posting and reports.
-- Replaces DayBookPosting.vb, DayClosing.vb, Ledger.vb (tab_ledger/temp_daily scratch tables)
-- and the GLDayBook / RPT_Ledger / GLTrial Crystal reports.
--
-- Amount convention (same as the VB app): receipts are credits, payments are debits,
-- and a balance is credit - debit. Day book rows with a null date count as opening balance.

-- ---------------------------------------------------------------------------
-- Posting
-- ---------------------------------------------------------------------------

-- Rebuild the automatic day book rows for a date range from non-cancelled vouchers.
-- Manual rows (is_auto = false) are left alone. Runs in one transaction; returns rows posted.
create function public.post_daybook(p_from date, p_to date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if coalesce(public.app_role(), '') not in ('admin', 'accountant') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'invalid date range' using errcode = '22023';
  end if;

  -- One posting at a time.
  perform pg_advisory_xact_lock(hashtext('public.post_daybook'));

  delete from public.daybook
   where is_auto and tran_date between p_from and p_to;

  insert into public.daybook (head_code, voucher_ref, tran_date, debit, credit, narration, is_auto)
  select v.head_code,
         case v.voucher_type when 1 then 'R-' else 'P-' end || v.voucher_no,
         v.voucher_date,
         case when v.voucher_type = 2 then v.amount else 0 end,
         case when v.voucher_type = 1 then v.amount else 0 end,
         v.description,
         true
    from public.vouchers v
   where v.cancelled_at is null
     and v.voucher_date between p_from and p_to
   order by v.voucher_date, v.voucher_type, v.voucher_no;

  get diagnostics v_count = row_count;
  return v_count;
end
$$;

-- Latest day book date; the posting screen starts from the day after.
create function public.daybook_last_date()
returns date
language sql
stable
set search_path = ''
as $$
  select max(d.tran_date) from public.daybook d
$$;

-- ---------------------------------------------------------------------------
-- Reports (security invoker: RLS on daybook / account_heads applies)
-- ---------------------------------------------------------------------------

-- Day book: an opening row, then every entry in the range with a running balance.
create function public.rpt_daybook(p_from date, p_to date)
returns table (
  seq         bigint,
  row_kind    text,
  tran_date   date,
  voucher_ref text,
  head_code   integer,
  head_name   text,
  narration   text,
  debit       numeric,
  credit      numeric,
  balance     numeric
)
language sql
stable
set search_path = ''
as $$
  with opening as (
    select coalesce(sum(d.credit - d.debit), 0) as amount
      from public.daybook d
     where d.tran_date < p_from or d.tran_date is null
  )
  select 0::bigint, 'opening', p_from, null, null, null, 'OPENING BALANCE', 0::numeric, 0::numeric, o.amount
    from opening o
  union all
  select row_number() over w,
         'entry', d.tran_date, d.voucher_ref, d.head_code, h.name, d.narration, d.debit, d.credit,
         o.amount + sum(d.credit - d.debit) over (w rows between unbounded preceding and current row)
    from public.daybook d
    join public.account_heads h on h.code = d.head_code
   cross join opening o
   where d.tran_date between p_from and p_to
  window w as (order by d.tran_date, d.id)
  order by 1
$$;

-- Ledger for one account (p_head_code) or all accounts (null): per account an opening
-- row (only when there is earlier activity), then entries with a running balance.
create function public.rpt_ledger(p_head_code integer, p_from date, p_to date)
returns table (
  seq         bigint,
  head_code   integer,
  head_name   text,
  row_kind    text,
  tran_date   date,
  voucher_ref text,
  narration   text,
  debit       numeric,
  credit      numeric,
  balance     numeric
)
language sql
stable
set search_path = ''
as $$
  with src as (
    select d.head_code, 0 as kind_order, null::bigint as id, 'opening'::text as row_kind,
           null::date as tran_date, null::text as voucher_ref, 'OPENING BALANCE'::text as narration,
           0::numeric as debit, 0::numeric as credit, sum(d.credit - d.debit) as amount
      from public.daybook d
     where (p_head_code is null or d.head_code = p_head_code)
       and (d.tran_date < p_from or d.tran_date is null)
     group by d.head_code
    union all
    select d.head_code, 1, d.id, 'entry', d.tran_date, d.voucher_ref, d.narration,
           d.debit, d.credit, d.credit - d.debit
      from public.daybook d
     where (p_head_code is null or d.head_code = p_head_code)
       and d.tran_date between p_from and p_to
  )
  select row_number() over (order by h.name, s.head_code, s.kind_order, s.tran_date, s.id),
         s.head_code, h.name, s.row_kind, s.tran_date, s.voucher_ref, s.narration, s.debit, s.credit,
         sum(s.amount) over (partition by s.head_code
                             order by s.kind_order, s.tran_date, s.id
                             rows between unbounded preceding and current row)
    from src s
    join public.account_heads h on h.code = s.head_code
   order by 1
$$;

-- Trial balance as on a date: net balance per account, shown in the debit or credit column.
create function public.rpt_trial_balance(p_as_on date)
returns table (
  head_code integer,
  head_name text,
  debit     numeric,
  credit    numeric
)
language sql
stable
set search_path = ''
as $$
  select h.code, h.name,
         case when t.net < 0 then -t.net else 0 end,
         case when t.net > 0 then t.net else 0 end
    from (
      select d.head_code, sum(d.credit - d.debit) as net
        from public.daybook d
       where d.tran_date <= p_as_on or d.tran_date is null
       group by d.head_code
    ) t
    join public.account_heads h on h.code = t.head_code
   where t.net <> 0
   order by h.name, h.code
$$;

-- Closing balance for each day that has entries; optionally only days that closed negative.
create function public.rpt_day_closing(p_from date, p_to date, p_negative_only boolean default false)
returns table (
  tran_date       date,
  closing_balance numeric
)
language sql
stable
set search_path = ''
as $$
  with opening as (
    select coalesce(sum(d.credit - d.debit), 0) as amount
      from public.daybook d
     where d.tran_date < p_from or d.tran_date is null
  ),
  days as (
    select d.tran_date, sum(d.credit - d.debit) as net
      from public.daybook d
     where d.tran_date between p_from and p_to
     group by d.tran_date
  ),
  running as (
    select x.tran_date,
           o.amount + sum(x.net) over (order by x.tran_date rows between unbounded preceding and current row) as balance
      from days x cross join opening o
  )
  select r.tran_date, r.balance
    from running r
   where not coalesce(p_negative_only, false) or r.balance < 0
   order by r.tran_date
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke execute on function public.post_daybook(date, date) from public, anon;
revoke execute on function public.daybook_last_date() from public, anon;
revoke execute on function public.rpt_daybook(date, date) from public, anon;
revoke execute on function public.rpt_ledger(integer, date, date) from public, anon;
revoke execute on function public.rpt_trial_balance(date) from public, anon;
revoke execute on function public.rpt_day_closing(date, date, boolean) from public, anon;

grant execute on function public.post_daybook(date, date) to authenticated;
grant execute on function public.daybook_last_date() to authenticated;
grant execute on function public.rpt_daybook(date, date) to authenticated;
grant execute on function public.rpt_ledger(integer, date, date) to authenticated;
grant execute on function public.rpt_trial_balance(date) to authenticated;
grant execute on function public.rpt_day_closing(date, date, boolean) to authenticated;
