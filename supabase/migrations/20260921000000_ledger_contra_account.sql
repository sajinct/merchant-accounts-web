-- General ledger: name the account on the other side of each entry.
--
-- A ledger line only says how much moved on this account; the useful part is which account it
-- moved against. Every daybook row carries its journal_id, so the opposing line of the same
-- journal gives that account. Where a journal splits across more than one opposing account there
-- is no single name to show, so the row reads 'As per details' -- the same wording and rule the
-- Day Book report already uses.
--
-- The return type gains two columns, which create or replace cannot do, so the function is
-- dropped and recreated. Dropping discards its privileges, hence the revoke/grant at the end.

drop function if exists public.rpt_ledger(integer, date, date);

create function public.rpt_ledger(p_head_code integer, p_from date, p_to date)
returns table (
  seq         bigint,
  head_code   integer,
  head_name   text,
  row_kind    text,
  tran_date   date,
  voucher_ref text,
  contra_code integer,
  contra_name text,
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
           null::date as tran_date, null::text as voucher_ref,
           null::integer as contra_code, null::text as contra_name,
           'OPENING BALANCE'::text as narration,
           0::numeric as debit, 0::numeric as credit, sum(d.credit - d.debit) as amount
      from public.daybook d
     where (p_head_code is null or d.head_code = p_head_code)
       and (d.tran_date < p_from or d.tran_date is null)
     group by d.head_code
    union all
    select d.head_code, 1, d.id, 'entry', d.tran_date, d.voucher_ref,
           opp.code,
           case when opp.split then 'As per details' else c.name end,
           d.narration, d.debit, d.credit, d.credit - d.debit
      from public.daybook d
      left join lateral (
        select count(*) > 1 as split,
               case when count(*) = 1 then min(o.head_code) end as code
          from public.daybook o
         where o.journal_id = d.journal_id
           and o.id <> d.id
      ) opp on true
      left join public.account_heads c on c.code = opp.code
     where (p_head_code is null or d.head_code = p_head_code)
       and d.tran_date between p_from and p_to
  )
  select row_number() over (order by h.name, s.head_code, s.kind_order, s.tran_date, s.id),
         s.head_code, h.name, s.row_kind, s.tran_date, s.voucher_ref,
         s.contra_code, s.contra_name, s.narration, s.debit, s.credit,
         sum(s.amount) over (partition by s.head_code
                             order by s.kind_order, s.tran_date, s.id
                             rows between unbounded preceding and current row)
    from src s
    join public.account_heads h on h.code = s.head_code
   order by 1
$$;

revoke execute on function public.rpt_ledger(integer, date, date) from public, anon;
grant execute on function public.rpt_ledger(integer, date, date) to authenticated;
