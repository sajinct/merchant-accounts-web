-- Financial statements: profit & loss, balance sheet and cash flow.
--
-- The three reports the desktop app never had. They read the same `daybook` lines as
-- the trial balance and group them by the classification double entry introduced
-- (asset, liability, equity, income, expense), so no new columns are needed and
-- nothing about a legacy account head has to be guessed.
--
-- Every function returns amounts that are positive in their natural direction --
-- income and expenses as positive figures, assets as debit balances, liabilities and
-- equity as credit balances, cash inflows and outflows in their own columns -- so a
-- caller never needs to know the credit-minus-debit convention the ledger uses.

-- Income and expense for a period, one row per account.
create function public.rpt_profit_and_loss(p_from date, p_to date)
returns table (
  section   text,      -- 'income' or 'expense'
  head_code integer,
  head_name text,
  amount    numeric
)
language sql
stable
set search_path = ''
as $$
  select h.account_type, h.code, h.name,
         sum(case when h.account_type = 'income' then d.credit - d.debit
                                                 else d.debit - d.credit end)
    from public.daybook d
    join public.journals j on j.id = d.journal_id
    left join public.journals original on original.id = j.reversal_of
    join public.account_heads h on h.code = d.head_code
   where h.account_type in ('income', 'expense')
     and d.tran_date between p_from and p_to
     -- Year-end closing transfers income and expense to equity on the last day of the
     -- year. Counting it, or the reversal a reopened year writes, would empty the
     -- statement for any period containing 31 March of a closed year.
     and j.kind <> 'year_closing'
     and coalesce(original.kind, '') <> 'year_closing'
   group by h.account_type, h.code, h.name
  having sum(case when h.account_type = 'income' then d.credit - d.debit
                                                 else d.debit - d.credit end) <> 0
   order by case h.account_type when 'income' then 1 else 2 end, h.name, h.code
$$;

-- Assets, liabilities and equity as on a date, with the result still to be closed.
create function public.rpt_balance_sheet(p_as_on date)
returns table (
  section   text,      -- 'asset', 'liability' or 'equity'
  row_kind  text,      -- 'account', or 'result' for the undistributed surplus
  head_code integer,   -- null on the result row
  head_name text,
  amount    numeric
)
language sql
stable
set search_path = ''
as $$
  with balances as (
    select h.account_type,
           h.code,
           h.name,
           sum(case when h.account_type = 'asset' then d.debit - d.credit
                                                  else d.credit - d.debit end) as amount
      from public.daybook d
      join public.account_heads h on h.code = d.head_code
     where d.tran_date <= p_as_on
     group by h.account_type, h.code, h.name
  ),
  -- Income and expense stay on their own accounts until the year is closed, so the
  -- sheet carries their net as one equity row. That is what makes it balance on any
  -- date: every journal has equal debits and credits, so assets = liabilities +
  -- equity + result. Closing entries are included here; for a closed year they
  -- reduce this row to zero and the same figure sits in retained earnings instead.
  result as (
    select coalesce(sum(b.amount), 0) as amount
      from balances b
     where b.account_type in ('income', 'expense')
  )
  select r.section, r.row_kind, r.head_code, r.head_name, r.amount
    from (
      select b.account_type as section, 'account'::text as row_kind,
             b.code as head_code, b.name as head_name, b.amount
        from balances b
       where b.account_type in ('asset', 'liability', 'equity')
         and b.amount <> 0
      union all
      select 'equity'::text, 'result'::text, null::integer,
             'Current period surplus / (deficit)'::text, x.amount
        from result x
       where x.amount <> 0
    ) r
   order by case r.section when 'asset' then 1 when 'liability' then 2 else 3 end,
            case r.row_kind when 'account' then 1 else 2 end,
            r.head_name, r.head_code
$$;

-- Cash flow for a period: the opening cash and bank balance, what moved it, and the
-- closing balance. Direct method -- each row is an account money was received from or
-- paid to, grouped by its classification, rather than a guess at operating,
-- investing and financing activities, which the chart of accounts does not record.
create function public.rpt_cash_flow(p_from date, p_to date)
returns table (
  seq       bigint,
  row_kind  text,      -- 'opening', 'flow' or 'closing'
  section   text,      -- the account's classification; null on the balance rows
  head_code integer,
  head_name text,
  inflow    numeric,
  outflow   numeric,
  balance   numeric    -- the opening and closing balance rows only
)
language sql
stable
set search_path = ''
as $$
  with cash as (
    select d.journal_id, d.tran_date, d.debit - d.credit as amount
      from public.daybook d
      join public.account_heads h on h.code = d.head_code
     where h.is_cash_bank
  ),
  opening as (
    select coalesce(sum(c.amount), 0) as amount from cash c where c.tran_date < p_from
  ),
  closing as (
    select coalesce(sum(c.amount), 0) as amount from cash c where c.tran_date <= p_to
  ),
  -- The journals that moved cash or bank money in the period. Every line of a journal
  -- carries the journal's date, so selecting the journal selects all of its lines.
  moved as (
    select distinct c.journal_id from cash c where c.tran_date between p_from and p_to
  ),
  -- The other side of those journals says where the money came from or went to, and
  -- its net is exactly the cash movement, so these rows decompose the movement
  -- without having to split anything. A contra has no other side and drops out, which
  -- is right: moving money between own accounts is not a cash flow.
  flows as (
    select h.account_type as section, h.code, h.name,
           sum(d.credit - d.debit) as amount        -- positive: cash came in
      from public.daybook d
      join moved m on m.journal_id = d.journal_id
      join public.account_heads h on h.code = d.head_code
     where not h.is_cash_bank
     group by h.account_type, h.code, h.name
    having sum(d.credit - d.debit) <> 0
  ),
  statement as (
    select 0 as part, 0::bigint as within, 'opening'::text as row_kind, null::text as section,
           null::integer as head_code, 'OPENING BALANCE'::text as head_name,
           0::numeric as inflow, 0::numeric as outflow, o.amount as balance
      from opening o
    union all
    select 1,
           row_number() over (order by case f.section when 'income'    then 1
                                                      when 'expense'   then 2
                                                      when 'asset'     then 3
                                                      when 'liability' then 4
                                                      else                  5 end,
                                       f.name, f.code),
           'flow', f.section, f.code, f.name,
           greatest(f.amount, 0), greatest(-f.amount, 0), 0::numeric
      from flows f
    union all
    select 2, 0::bigint, 'closing', null::text, null::integer, 'CLOSING BALANCE'::text,
           0::numeric, 0::numeric, c.amount
      from closing c
  )
  select row_number() over (order by s.part, s.within),
         s.row_kind, s.section, s.head_code, s.head_name, s.inflow, s.outflow, s.balance
    from statement s
   order by 1
$$;

revoke execute on function public.rpt_profit_and_loss(date, date) from public, anon;
revoke execute on function public.rpt_balance_sheet(date) from public, anon;
revoke execute on function public.rpt_cash_flow(date, date) from public, anon;

grant execute on function public.rpt_profit_and_loss(date, date) to authenticated;
grant execute on function public.rpt_balance_sheet(date) to authenticated;
grant execute on function public.rpt_cash_flow(date, date) to authenticated;
