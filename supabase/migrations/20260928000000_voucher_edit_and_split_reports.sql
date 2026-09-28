-- 1. Admins can correct a posted voucher in place.
-- 2. The day book and ledger list every account of a voucher instead of 'As per details'.

-- ---------------------------------------------------------------------------
-- Shared posting steps, so an edit validates and writes lines exactly as a new voucher does
-- ---------------------------------------------------------------------------

-- Each line: one positive side, two decimals, a classified account and, for new postings,
-- an active ledger account; and the journal as a whole balances.
create or replace function public.check_journal_lines(p_kind text, p_lines jsonb) returns void
language plpgsql set search_path = '' as $$
declare line jsonb; dr numeric; cr numeric; total_dr numeric:=0; total_cr numeric:=0; ac integer;
begin
 for line in select value from jsonb_array_elements(p_lines) loop
   ac := (line->>'account')::integer;
   dr := coalesce((line->>'debit')::numeric,0); cr := coalesce((line->>'credit')::numeric,0);
   if dr<0 or cr<0 or (dr=0 and cr=0) or (dr>0 and cr>0)
      or dr<>round(dr,2) or cr<>round(cr,2) or dr>=1000000000000 or cr>=1000000000000 then
     raise exception 'Each line needs one positive debit or credit with at most two decimal places';
   end if;
   perform 1 from public.account_heads where code=ac and account_type is not null for share;
   if not found then raise exception 'Select a classified account for every line'; end if;
   -- A reversal must always be able to restore balance, even on an account that has
   -- since been retired, so this applies to new postings only.
   if p_kind not in ('reversal','year_closing') then
     perform 1 from public.account_heads where code=ac and is_active and not is_group for share;
     if not found then raise exception 'Entries cannot be posted to a retired or group account'; end if;
   end if;
   total_dr:=total_dr+dr; total_cr:=total_cr+cr;
 end loop;
 if total_dr<>total_cr then raise exception 'Total debits must equal total credits'; end if;
end $$;

-- Lines of a voucher carry its own reference, so the day book and ledger name it.
create or replace function public.insert_journal_lines(p_journal bigint, p_date date, p_narration text,
 p_voucher bigint, p_lines jsonb) returns void
language plpgsql set search_path = '' as $$
declare ref text;
begin
 select case v.voucher_type when 1 then 'R-' when 2 then 'P-' when 3 then 'C-' else 'V-' end||v.voucher_no
   into ref from public.vouchers v where v.id=p_voucher;
 insert into public.daybook(journal_id,head_code,tran_date,debit,credit,narration,is_auto,voucher_ref,line_no,reference_id)
 select p_journal,(x->>'account')::integer,p_date,coalesce((x->>'debit')::numeric,0),coalesce((x->>'credit')::numeric,0),
        coalesce(nullif(trim(x->>'description'),''),coalesce(trim(p_narration),'')),true,
        coalesce(ref,'J-'||p_journal),ord::smallint,nullif(x->>'reference_id','')::bigint
 from jsonb_array_elements(p_lines) with ordinality as t(x,ord);
end $$;

create or replace function public.write_journal(p_date date,p_narration text,p_kind text,p_lines jsonb,
 p_request uuid,p_data jsonb,p_voucher bigint default null,p_reversal bigint default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare jid bigint;
begin
 if p_date is null or p_request is null or jsonb_typeof(p_lines) is distinct from 'array'
    or jsonb_array_length(p_lines)<2 or jsonb_array_length(p_lines)>200 then
   raise exception 'Date, request ID and between 2 and 200 journal lines are required';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select id into jid from public.journals where request_id=p_request;
 if found then
   if (select request_data from public.journals where id=jid) is distinct from p_data then
     raise exception 'Request ID was already used for a different entry';
   end if;
   return jid;
 end if;
 perform public.check_journal_lines(p_kind,p_lines);
 insert into public.journals(entry_date,narration,kind,request_id,request_data,voucher_id,reversal_of)
 values(p_date,coalesce(trim(p_narration),''),p_kind,p_request,p_data,p_voucher,p_reversal) returning id into jid;
 perform public.insert_journal_lines(jid,p_date,p_narration,p_voucher,p_lines);
 return jid;
end $$;

-- Simplified mode (receipts and payments): each line is an account head and a positive
-- `amount`; the single cash/bank counterpart for the total is written here, so the user
-- never types the cash side. Advanced mode passes explicit `debit`/`credit` per line and
-- only the voucher-type rules are checked. Returns the debit/credit lines to post.
create or replace function public.voucher_postings(p_type integer, p_narration text, p_cash_account_code integer,
 p_lines jsonb, p_simplified boolean) returns jsonb
language plpgsql set search_path = '' as $$
declare lines jsonb; cash jsonb; total numeric;
begin
 if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines)=0 then
   raise exception 'Enter at least one transaction line';
 end if;
 if coalesce(p_simplified,false) and p_type in (1,2) then
   perform 1 from public.account_heads
    where code=p_cash_account_code and is_cash_bank and account_type='asset' and is_active and not is_group for share;
   if not found then raise exception 'Choose a cash/bank account'; end if;
   if exists(select 1 from jsonb_array_elements(p_lines) as t(x) where (x->>'account')::integer=p_cash_account_code) then
     raise exception 'The cash/bank side is added for you; use other accounts for the lines';
   end if;
   select coalesce(sum((x->>'amount')::numeric),0) into total from jsonb_array_elements(p_lines) as t(x);
   if total<=0 then raise exception 'Enter an amount greater than zero'; end if;
   select jsonb_agg(jsonb_build_object('account',(x->>'account')::integer,
     'debit',case when p_type=2 then (x->>'amount')::numeric else 0 end,
     'credit',case when p_type=1 then (x->>'amount')::numeric else 0 end,
     'description',x->>'description','reference_id',x->>'reference_id') order by ord)
     into lines from jsonb_array_elements(p_lines) with ordinality as t(x,ord);
   cash:=jsonb_build_object('account',p_cash_account_code,
     'debit',case when p_type=1 then total else 0 end,
     'credit',case when p_type=2 then total else 0 end,
     'description',nullif(trim(p_narration),''));
   -- A receipt reads Cash Dr first; a payment ends with Cash Cr.
   lines:=case when p_type=1 then jsonb_build_array(cash)||lines else lines||jsonb_build_array(cash) end;
 else
   lines:=p_lines;
 end if;

 select coalesce(sum(coalesce((x->>'debit')::numeric,0)),0) into total from jsonb_array_elements(lines) as t(x);
 if total<=0 then raise exception 'Enter an amount greater than zero'; end if;

 -- Rules that depend on the voucher type. check_journal_lines enforces the rest.
 if p_type=1 and not exists(select 1 from jsonb_array_elements(lines) as t(x)
      join public.account_heads h on h.code=(x->>'account')::integer
     where h.is_cash_bank and coalesce((x->>'debit')::numeric,0)>0) then
   raise exception 'A receipt must debit at least one cash or bank account';
 end if;
 if p_type=2 and not exists(select 1 from jsonb_array_elements(lines) as t(x)
      join public.account_heads h on h.code=(x->>'account')::integer
     where h.is_cash_bank and coalesce((x->>'credit')::numeric,0)>0) then
   raise exception 'A payment must credit at least one cash or bank account';
 end if;
 if p_type=3 and exists(select 1 from jsonb_array_elements(lines) as t(x)
      join public.account_heads h on h.code=(x->>'account')::integer where not h.is_cash_bank) then
   raise exception 'A transfer moves money between cash and bank accounts only';
 end if;
 if p_type=4 and not coalesce((select journal_allows_cash from public.company_settings),false)
    and exists(select 1 from jsonb_array_elements(lines) as t(x)
      join public.account_heads h on h.code=(x->>'account')::integer where h.is_cash_bank) then
   raise exception 'Journal vouchers cannot use cash or bank accounts; use a receipt, payment or transfer';
 end if;
 return lines;
end $$;

create or replace function public.post_voucher(
  p_type              integer,
  p_date              date,
  p_reference_no      text,
  p_party_code        integer,
  p_narration         text,
  p_cash_account_code integer,
  p_lines             jsonb,
  p_simplified        boolean,
  p_request_id        uuid
)
returns public.vouchers language plpgsql security definer set search_path = '' as $$
declare v public.vouchers; data jsonb; lines jsonb; total numeric; n integer; fy integer;
begin
 if coalesce(public.app_role(),'') not in ('admin','accountant') then
   raise exception 'not authorized' using errcode = '42501';
 end if;
 if p_type is null or p_type not in (1,2,3,4) then raise exception 'Choose a voucher type'; end if;
 if p_date is null or p_request_id is null then raise exception 'A voucher date and request ID are required'; end if;
 if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines)=0 then
   raise exception 'Enter at least one transaction line';
 end if;

 data:=jsonb_build_object('type',p_type,'date',p_date,'reference',nullif(trim(p_reference_no),''),
   'party',p_party_code,'narration',p_narration,'cash',p_cash_account_code,
   'lines',p_lines,'simplified',coalesce(p_simplified,false));

 -- A retried save returns the voucher the first attempt wrote instead of a second one.
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select v0.* into v from public.vouchers v0 join public.journals j on j.voucher_id=v0.id
  where j.request_id=p_request_id;
 if found then
   if (select request_data from public.journals where request_id=p_request_id) is distinct from data then
     raise exception 'Request ID was already used';
   end if;
   return v;
 end if;

 lines:=public.voucher_postings(p_type,p_narration,p_cash_account_code,p_lines,p_simplified);
 select sum(coalesce((x->>'debit')::numeric,0)) into total from jsonb_array_elements(lines) as t(x);

 -- Checked here because the header references the year before the journal trigger runs.
 fy:=public.fy_start_of(p_date);
 perform 1 from public.financial_years where start_year=fy for share;
 if not found then raise exception 'Create financial year % before posting',public.fy_label(fy); end if;

 update public.voucher_counters set last_no=last_no+1 where voucher_type=p_type returning last_no into n;
 insert into public.vouchers(voucher_type,voucher_no,voucher_date,narration,total_amount,
   reference_no,party_code,fy_start,created_by)
 values(p_type,n,p_date,coalesce(trim(p_narration),''),total,nullif(trim(p_reference_no),''),
   p_party_code,fy,auth.uid())
 returning * into v;
 perform public.write_journal(p_date,p_narration,
   case p_type when 1 then 'receipt' when 2 then 'payment' when 3 then 'contra' else 'journal' end,
   lines,p_request_id,data,v.id);
 return v;
end $$;

-- ---------------------------------------------------------------------------
-- Editing a posted voucher
-- ---------------------------------------------------------------------------

-- What a voucher looked like before each edit.
create table if not exists public.voucher_revisions (
  id         bigint generated always as identity primary key,
  voucher_id bigint not null references public.vouchers(id),
  revised_at timestamptz not null default now(),
  revised_by uuid not null default auth.uid() references auth.users(id),
  previous   jsonb not null
);
create index if not exists voucher_revisions_voucher_idx on public.voucher_revisions(voucher_id);
alter table public.voucher_revisions enable row level security;
revoke all on public.voucher_revisions from public, anon, authenticated;
grant select on public.voucher_revisions to authenticated;
drop policy if exists voucher_revisions_read on public.voucher_revisions;
create policy voucher_revisions_read on public.voucher_revisions for select to authenticated
 using ((select public.app_role()) is not null);

-- Posted entries stay immutable, except the one journal update_voucher is rewriting in
-- this transaction. The setting is transaction-local and clients cannot set it.
create or replace function public.immutable_accounting_entry() returns trigger
language plpgsql set search_path = '' as $$
declare target text;
begin
 if tg_table_name = 'journals' then target := old.id::text; else target := old.journal_id::text; end if;
 if current_setting('app.editing_journal', true) = target then
   return case when tg_op = 'DELETE' then old else new end;
 end if;
 raise exception 'Posted entries cannot be changed or deleted; create a reversal';
end $$;

-- Replaces a voucher's date, header details and lines, keeping its type and number. The
-- previous version goes to voucher_revisions. Both the old and the new date must fall in
-- an open financial year, so closed books never change.
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

revoke all on function public.check_journal_lines(text,jsonb),
  public.insert_journal_lines(bigint,date,text,bigint,jsonb),
  public.voucher_postings(integer,text,integer,jsonb,boolean) from public, anon, authenticated;
revoke all on function public.update_voucher(bigint,date,text,integer,text,integer,jsonb,boolean) from public, anon;
grant execute on function public.update_voucher(bigint,date,text,integer,text,integer,jsonb,boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Every account of a voucher in the day book and ledger
-- ---------------------------------------------------------------------------

-- Each daybook line paired with the account(s) it moved against:
--  * one line on the other side: that account, for the full amount;
--  * this line alone against several: one row per account, each for its own amount
--    (a receipt into cash for three income heads reads as three rows);
--  * several against several: the amounts cannot be paired, so one row naming them all.
create or replace view public.daybook_counterparts with (security_invoker = true) as
select d.id as line_id, d.journal_id, d.head_code, d.tran_date, d.voucher_ref,
       p.part_no, p.contra_code, p.contra_name, p.narration, p.debit, p.credit
  from public.daybook d
 cross join lateral (
   select count(*) filter (where (o.debit > 0) <> (d.debit > 0)) as opposite,
          count(*) filter (where (o.debit > 0) = (d.debit > 0)) as same
     from public.daybook o
    where o.journal_id = d.journal_id
 ) n
 cross join lateral (
   select 1::bigint as part_no, a.code as contra_code, a.names as contra_name,
          d.narration, d.debit, d.credit
     from (select case when count(*) = 1 then min(o.head_code) end as code,
                  string_agg(h.name, ', ' order by o.line_no, o.id) as names
             from public.daybook o
             join public.account_heads h on h.code = o.head_code
            where o.journal_id = d.journal_id and (o.debit > 0) <> (d.debit > 0)) a
    where not (n.opposite > 1 and n.same = 1)
   union all
   select row_number() over (order by o.line_no, o.id), o.head_code, h.name, o.narration,
          case when d.debit > 0 then o.credit else 0 end,
          case when d.credit > 0 then o.debit else 0 end
     from public.daybook o
     join public.account_heads h on h.code = o.head_code
    where o.journal_id = d.journal_id and (o.debit > 0) <> (d.debit > 0)
      and n.opposite > 1 and n.same = 1
 ) p;

revoke all on public.daybook_counterparts from public, anon;
grant select on public.daybook_counterparts to authenticated;

-- Day book: cash and bank lines, named by the account the money came from or went to.
-- `credit` is money in (receipt) and `debit` money out (payment), as before.
-- A transfer between two cash/bank accounts (a contra) is two rows of this combined book,
-- so each row names its own account: Cash -> Bank reads Bank receipt, Cash payment.
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
  with opening as (
    select coalesce(sum(d.debit - d.credit), 0) as amount
      from public.daybook d
      join public.account_heads h on h.code = d.head_code
     where h.is_cash_bank and (d.tran_date < p_from or d.tran_date is null)
  ),
  entries as (
    select c.line_id, c.part_no, c.tran_date, c.voucher_ref, c.narration, c.debit, c.credit,
           case when ch.is_cash_bank then c.head_code else c.contra_code end as label_code,
           case when ch.is_cash_bank then h.name else c.contra_name end as label_name
      from public.daybook_counterparts c
      join public.account_heads h on h.code = c.head_code
      left join public.account_heads ch on ch.code = c.contra_code
     where h.is_cash_bank and c.tran_date between p_from and p_to
  )
  select 0::bigint, 'opening', p_from, null, null, null, 'OPENING BALANCE', 0::numeric, 0::numeric, o.amount
    from opening o
  union all
  select row_number() over w,
         'entry', e.tran_date, e.voucher_ref, e.label_code, e.label_name, e.narration,
         e.credit, e.debit,
         o.amount + sum(e.debit - e.credit) over (w rows between unbounded preceding and current row)
    from entries e
   cross join opening o
  window w as (order by e.tran_date, e.line_id, e.part_no)
  order by 1
$$;

create or replace function public.rpt_ledger(p_head_code integer, p_from date, p_to date)
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
    select d.head_code, 0 as kind_order, null::bigint as id, 0::bigint as part_no, 'opening'::text as row_kind,
           null::date as tran_date, null::text as voucher_ref,
           null::integer as contra_code, null::text as contra_name,
           'OPENING BALANCE'::text as narration,
           0::numeric as debit, 0::numeric as credit, sum(d.credit - d.debit) as amount
      from public.daybook d
     where (p_head_code is null or d.head_code = p_head_code)
       and (d.tran_date < p_from or d.tran_date is null)
     group by d.head_code
    union all
    select c.head_code, 1, c.line_id, c.part_no, 'entry', c.tran_date, c.voucher_ref,
           c.contra_code, c.contra_name, c.narration, c.debit, c.credit, c.credit - c.debit
      from public.daybook_counterparts c
     where (p_head_code is null or c.head_code = p_head_code)
       and c.tran_date between p_from and p_to
  )
  select row_number() over (order by h.name, s.head_code, s.kind_order, s.tran_date, s.id, s.part_no),
         s.head_code, h.name, s.row_kind, s.tran_date, s.voucher_ref,
         s.contra_code, s.contra_name, s.narration, s.debit, s.credit,
         sum(s.amount) over (partition by s.head_code
                             order by s.kind_order, s.tran_date, s.id, s.part_no
                             rows between unbounded preceding and current row)
    from src s
    join public.account_heads h on h.code = s.head_code
   order by 1
$$;
