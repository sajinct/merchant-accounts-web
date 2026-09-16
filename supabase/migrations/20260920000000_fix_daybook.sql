-- Paste this into the Supabase SQL Editor to fix the Day Book report:

create or replace function public.rpt_daybook(p_from date, p_to date)
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
  with cash_lines as (
    select d.*
      from public.daybook d
      join public.account_heads h on h.code = d.head_code
     where h.is_cash_bank
  ),
  opening as (
    select coalesce(sum(d.debit - d.credit), 0) as amount
      from cash_lines d
     where d.tran_date < p_from or d.tran_date is null
  ),
  entries as (
    select 
      d.id,
      d.tran_date,
      d.voucher_ref,
      d.narration,
      d.debit as cash_debit,
      d.credit as cash_credit,
      d.journal_id
    from cash_lines d
    where d.tran_date between p_from and p_to
  ),
  -- Find opposing accounts for each cash line
  enriched_entries as (
    select
      e.*,
      (
        select opp.head_code
        from public.daybook opp
        where opp.journal_id = e.journal_id
          and opp.id <> e.id
        order by opp.id
        limit 1
      ) as opposing_head_code,
      (
        select count(*)
        from public.daybook opp
        where opp.journal_id = e.journal_id
          and opp.id <> e.id
      ) as opposing_count
    from entries e
  ),
  final_entries as (
    select
      e.id,
      e.tran_date,
      e.voucher_ref,
      case when e.opposing_count > 1 then null else e.opposing_head_code end as head_code,
      case when e.opposing_count > 1 then 'As per details' else h.name end as head_name,
      e.narration,
      e.cash_debit,
      e.cash_credit
    from enriched_entries e
    left join public.account_heads h on h.code = e.opposing_head_code
  )
  select 0::bigint, 'opening', p_from, null, null, null, 'OPENING BALANCE', 0::numeric, 0::numeric, o.amount
    from opening o
  union all
  select row_number() over w,
         'entry', f.tran_date, f.voucher_ref, f.head_code, f.head_name, f.narration, 
         f.cash_credit,
         f.cash_debit,
         o.amount + sum(f.cash_debit - f.cash_credit) over (w rows between unbounded preceding and current row)
    from final_entries f
   cross join opening o
  window w as (order by f.tran_date, f.id)
  order by 1
$$;
