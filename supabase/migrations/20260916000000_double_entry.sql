-- Fresh-start double-entry ledger. Run the explicitly authorized demo reset first.
do $$ begin
  if exists(select 1 from public.vouchers) or exists(select 1 from public.daybook) then
    raise exception 'Double-entry requires an empty demo ledger. Run scripts/reset-demo-ledger.sql first.';
  end if;
end $$;

alter table public.account_heads
  add column account_type text check(account_type in ('asset','liability','equity','income','expense')),
  add column is_cash_bank boolean not null default false,
  add constraint cash_bank_is_asset check(not is_cash_bank or account_type is not distinct from 'asset');
update public.account_heads set account_type = 'income'
 where code = (select subscription_head_code from public.company_settings);
-- Do not guess the classifications of other legacy account heads.
insert into public.account_heads(code,name,account_type,is_cash_bank)
select coalesce(max(code),1000)+1, 'Cash in hand', 'asset', true from public.account_heads;

create table public.journals (
  id bigint generated always as identity primary key,
  entry_date date not null,
  narration text not null,
  kind text not null check(kind in ('receipt','payment','journal','opening','reversal')),
  request_id uuid not null unique,
  request_data jsonb not null,
  voucher_id bigint unique references public.vouchers(id),
  reversal_of bigint unique references public.journals(id),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.daybook add column journal_id bigint not null references public.journals(id);
alter table public.daybook alter column tran_date set not null;
alter table public.daybook add constraint one_positive_side check(
  (debit > 0 and credit = 0) or (credit > 0 and debit = 0));
create index daybook_journal_idx on public.daybook(journal_id);
alter table public.vouchers add column cash_account_code integer not null references public.account_heads(code);

alter table public.journals enable row level security;
revoke all on public.journals from public, anon, authenticated;
grant select on public.journals to authenticated;
create policy journals_read on public.journals for select to authenticated
 using ((select public.app_role()) is not null);
revoke all on public.daybook,public.vouchers,public.subscription_payments from public,anon,authenticated;
grant select on public.daybook,public.vouchers,public.subscription_payments to authenticated;
drop policy daybook_insert on public.daybook;
drop policy daybook_update on public.daybook;
drop policy daybook_delete on public.daybook;

create function public.check_journal_balance() returns trigger
language plpgsql security definer set search_path = '' as $$
declare jid bigint; n integer; dr numeric; cr numeric;
begin
  if tg_table_name = 'journals' then jid := new.id;
  else jid := new.journal_id; end if;
  select count(*),coalesce(sum(debit),0),coalesce(sum(credit),0) into n,dr,cr
    from public.daybook where journal_id=jid;
  if n < 2 or dr <> cr then raise exception 'Journal must contain at least two lines and equal debits and credits'; end if;
  return null;
end $$;
create constraint trigger journals_balanced after insert on public.journals
 deferrable initially deferred for each row execute function public.check_journal_balance();
create constraint trigger journal_lines_balanced after insert on public.daybook
 deferrable initially deferred for each row execute function public.check_journal_balance();

create function public.immutable_accounting_entry() returns trigger
language plpgsql set search_path = '' as $$ begin
 raise exception 'Posted entries cannot be changed or deleted; create a reversal';
end $$;
create trigger journals_immutable before update or delete on public.journals
 for each row execute function public.immutable_accounting_entry();
create trigger journal_lines_immutable before update or delete on public.daybook
 for each row execute function public.immutable_accounting_entry();

create function public.lock_account_classification() returns trigger
language plpgsql set search_path = '' as $$ begin
 if (new.account_type is distinct from old.account_type or new.is_cash_bank <> old.is_cash_bank)
    and exists(select 1 from public.daybook where head_code=old.code) then
   raise exception 'Classification cannot change after an account has entries';
 end if;
 return new;
end $$;
create trigger account_classification_lock before update on public.account_heads
 for each row execute function public.lock_account_classification();

-- Internal writer: only called inside authorized RPCs. Decimal precision is checked before insert.
create function public.write_journal(p_date date,p_narration text,p_kind text,p_lines jsonb,
 p_request uuid,p_data jsonb,p_voucher bigint default null,p_reversal bigint default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare jid bigint; line jsonb; dr numeric; cr numeric; total_dr numeric:=0; total_cr numeric:=0; ac integer;
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
 for line in select value from jsonb_array_elements(p_lines) loop
   ac := (line->>'account')::integer;
   dr := coalesce((line->>'debit')::numeric,0); cr := coalesce((line->>'credit')::numeric,0);
   if dr<0 or cr<0 or (dr=0 and cr=0) or (dr>0 and cr>0)
      or dr<>round(dr,2) or cr<>round(cr,2) or dr>=1000000000000 or cr>=1000000000000 then
     raise exception 'Each line needs one positive debit or credit with at most two decimal places';
   end if;
   perform 1 from public.account_heads where code=ac and account_type is not null for share;
   if not found then raise exception 'Select a classified account for every line'; end if;
   total_dr:=total_dr+dr; total_cr:=total_cr+cr;
 end loop;
 if total_dr<>total_cr then raise exception 'Total debits must equal total credits'; end if;
 insert into public.journals(entry_date,narration,kind,request_id,request_data,voucher_id,reversal_of)
 values(p_date,coalesce(trim(p_narration),''),p_kind,p_request,p_data,p_voucher,p_reversal) returning id into jid;
 insert into public.daybook(journal_id,head_code,tran_date,debit,credit,narration,is_auto,voucher_ref)
 select jid,(x->>'account')::integer,p_date,coalesce((x->>'debit')::numeric,0),
 coalesce((x->>'credit')::numeric,0),coalesce(trim(p_narration),''),true,'J-'||jid
 from jsonb_array_elements(p_lines) x;
 return jid;
end $$;

create function public.create_journal(p_date date,p_narration text,p_lines jsonb,p_request_id uuid,p_opening boolean default false)
returns bigint language plpgsql security definer set search_path = '' as $$ begin
 if coalesce(public.app_role(),'') not in ('admin','accountant') then raise exception 'not authorized'; end if;
 if p_opening and public.app_role()<>'admin' then raise exception 'Only admins can enter opening balances'; end if;
 return public.write_journal(p_date,p_narration,case when p_opening then 'opening' else 'journal' end,
 p_lines,p_request_id,jsonb_build_object('date',p_date,'narration',p_narration,'lines',p_lines,'opening',p_opening));
end $$;

-- Keep the old signature as an explicit upgrade error for clients with cached old app files.
create or replace function public.create_voucher(p_type integer,p_date date,p_head_code integer,p_description text,p_amount numeric)
returns public.vouchers language plpgsql security definer set search_path = '' as $$ begin
 raise exception 'Please update the app. Double-entry vouchers require a cash/bank account.';
end $$;
create function public.create_voucher(p_type integer,p_date date,p_head_code integer,p_description text,
 p_amount numeric,p_cash_account_code integer,p_request_id uuid)
returns public.vouchers language plpgsql security definer set search_path = '' as $$
declare v public.vouchers; n integer; data jsonb; lines jsonb; jid bigint;
begin
 if coalesce(public.app_role(),'') not in ('admin','accountant') then raise exception 'not authorized'; end if;
 if p_type is null or p_type not in (1,2) or p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2)
    or p_date is null or p_request_id is null or p_head_code=p_cash_account_code then raise exception 'Invalid voucher details'; end if;
 data:=jsonb_build_object('type',p_type,'date',p_date,'head',p_head_code,'description',p_description,'amount',p_amount,'cash',p_cash_account_code);
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select v0.* into v from public.vouchers v0 join public.journals j on j.voucher_id=v0.id where j.request_id=p_request_id;
 if found then
   if (select request_data from public.journals where request_id=p_request_id) is distinct from data then raise exception 'Request ID was already used'; end if;
   return v;
 end if;
 perform 1 from public.account_heads where code=p_cash_account_code and is_cash_bank and account_type='asset' for share;
 if not found then raise exception 'Choose a cash/bank account'; end if;
 update public.voucher_counters set last_no=last_no+1 where voucher_type=p_type returning last_no into n;
 insert into public.vouchers(voucher_type,voucher_no,voucher_date,head_code,description,amount,cash_account_code)
 values(p_type,n,p_date,p_head_code,coalesce(p_description,''),p_amount,p_cash_account_code) returning * into v;
 lines:=jsonb_build_array(
 jsonb_build_object('account',p_head_code,'debit',case when p_type=2 then p_amount else 0 end,'credit',case when p_type=1 then p_amount else 0 end),
 jsonb_build_object('account',p_cash_account_code,'debit',case when p_type=1 then p_amount else 0 end,'credit',case when p_type=2 then p_amount else 0 end));
 jid:=public.write_journal(p_date,p_description,case when p_type=1 then 'receipt' else 'payment' end,lines,p_request_id,data,v.id);
 return v;
end $$;

create function public.reverse_journal(p_id bigint,p_date date,p_reason text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare j public.journals; lines jsonb;
begin
 if coalesce(public.app_role(),'')<>'admin' then raise exception 'not authorized'; end if;
 if nullif(trim(p_reason),'') is null then raise exception 'A reversal reason is required'; end if;
 select * into j from public.journals where id=p_id for update;
 if not found then raise exception 'Journal not found'; end if;
 if j.voucher_id is not null then raise exception 'Cancel this entry through its voucher or subscription'; end if;
 if j.reversal_of is not null or exists(select 1 from public.journals where reversal_of=p_id) then raise exception 'Journal already reversed or is a reversal'; end if;
 if p_date<j.entry_date then raise exception 'Reversal date cannot precede the journal'; end if;
 select jsonb_agg(jsonb_build_object('account',head_code,'debit',credit,'credit',debit)) into lines from public.daybook where journal_id=p_id;
 return public.write_journal(p_date,p_reason,'reversal',lines,gen_random_uuid(),jsonb_build_object('reversal',p_id),null,p_id);
end $$;

-- Existing cancellation RPCs update both subscription and voucher atomically.
-- This trigger adds a retained reversal on the original transaction date.
create function public.reverse_cancelled_voucher() returns trigger
language plpgsql security definer set search_path = '' as $$
declare jid bigint; lines jsonb;
begin
 if old.cancelled_at is null and new.cancelled_at is not null then
   if nullif(trim(new.cancel_reason),'') is null then raise exception 'Cancellation reason is required'; end if;
   select id into jid from public.journals where voucher_id=new.id;
   if jid is null then raise exception 'Voucher journal is missing'; end if;
   select jsonb_agg(jsonb_build_object('account',head_code,'debit',credit,'credit',debit)) into lines from public.daybook where journal_id=jid;
   perform public.write_journal(new.voucher_date,new.cancel_reason,'reversal',lines,gen_random_uuid(),jsonb_build_object('reversal',jid),null,jid);
 end if;
 return new;
end $$;
create trigger voucher_reversal after update on public.vouchers for each row execute function public.reverse_cancelled_voucher();

create or replace function public.post_daybook(p_from date,p_to date) returns integer
language plpgsql security definer set search_path = '' as $$ declare n integer; begin
 if coalesce(public.app_role(),'') not in ('admin','accountant') then raise exception 'not authorized'; end if;
 if p_from is null or p_to is null or p_from>p_to then raise exception 'Invalid date range'; end if;
 if exists(select 1 from public.journals j left join public.daybook d on d.journal_id=j.id
   where j.entry_date between p_from and p_to group by j.id having count(d.id)<2 or sum(d.debit)<>sum(d.credit)) then
   raise exception 'Unbalanced journal detected';
 end if;
 select count(*) into n from public.journals where entry_date between p_from and p_to;
 return n;
end $$;

revoke all on function public.write_journal(date,text,text,jsonb,uuid,jsonb,bigint,bigint) from public,anon,authenticated;
revoke all on function public.check_journal_balance(),public.immutable_accounting_entry(),public.lock_account_classification(),public.reverse_cancelled_voucher() from public,anon,authenticated;
revoke all on function public.create_journal(date,text,jsonb,uuid,boolean),public.reverse_journal(bigint,date,text),public.create_voucher(integer,date,integer,text,numeric,integer,uuid) from public,anon;
grant execute on function public.create_journal(date,text,jsonb,uuid,boolean),public.reverse_journal(bigint,date,text),public.create_voucher(integer,date,integer,text,numeric,integer,uuid) to authenticated;

create function public.record_subscription_payment(
  p_member_code integer,
  p_fy_start    integer,
  p_amount      numeric,
  p_paid_on     date,
  p_notes text, p_cash_account_code integer, p_request_id uuid
)
returns public.subscription_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member  public.customers;
  v_head    integer;
  v_balance numeric;
  v_voucher public.vouchers;
  v_row     public.subscription_payments;
begin
  if coalesce(public.app_role(), '') not in ('admin', 'accountant') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be greater than zero' using errcode = '22023';
  end if;
  if p_paid_on is null then
    raise exception 'payment date is required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  select sp.* into v_row from public.subscription_payments sp join public.journals j on j.voucher_id=sp.voucher_id where j.request_id=p_request_id;
  if found then
    if v_row.member_code<>p_member_code or v_row.fy_start<>p_fy_start or v_row.amount<>p_amount or v_row.paid_on<>p_paid_on
       or (select cash_account_code from public.vouchers where id=v_row.voucher_id)<>p_cash_account_code
       or coalesce(v_row.notes,'')<>coalesce(nullif(trim(p_notes),''),'') then raise exception 'Request ID was already used'; end if;
    return v_row;
  end if;
  -- Lock the member so two payments cannot both pass the balance check.
  select * into v_member from public.customers where code = p_member_code for update;
  if not found then
    raise exception 'member % not found', p_member_code using errcode = 'P0002';
  end if;

  select subscription_head_code into v_head from public.company_settings;
  if v_head is null then
    raise exception 'choose the subscription account head in Subscription Fees before recording payments'
      using errcode = '22023';
  end if;

  select l.balance into v_balance
    from public.subscription_ledger(p_fy_start, p_member_code) l
   where l.fy_start = p_fy_start;

  if v_balance is null then
    raise exception 'no subscription is due from member % for %', p_member_code, public.fy_label(p_fy_start)
      using errcode = '22023';
  end if;
  if p_amount > v_balance then
    raise exception 'amount % is more than the balance % for %', p_amount, v_balance, public.fy_label(p_fy_start)
      using errcode = '22023';
  end if;

  v_voucher := public.create_voucher(
    1,
    p_paid_on,
    v_head,
    format('Subscription %s - #%s %s', public.fy_label(p_fy_start), v_member.code, v_member.name),
    p_amount, p_cash_account_code, p_request_id
  );

  insert into public.subscription_payments (member_code, fy_start, paid_on, amount, voucher_id, notes, created_by)
  values (p_member_code, p_fy_start, p_paid_on, p_amount, v_voucher.id, nullif(trim(p_notes), ''), auth.uid())
  returning * into v_row;

  return v_row;
end
$$;


revoke all on function public.record_subscription_payment(integer,integer,numeric,date,text,integer,uuid) from public,anon;
grant execute on function public.record_subscription_payment(integer,integer,numeric,date,text,integer,uuid) to authenticated;

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
      from (select d0.*, h0.is_cash_bank from public.daybook d0 join public.account_heads h0 on h0.code=d0.head_code where h0.is_cash_bank) d
     where d.tran_date < p_from or d.tran_date is null
  )
  select 0::bigint, 'opening', p_from, null, null, null, 'OPENING BALANCE', 0::numeric, 0::numeric, o.amount
    from opening o
  union all
  select row_number() over w,
         'entry', d.tran_date, d.voucher_ref, d.head_code, h.name, d.narration, d.credit, d.debit,
         o.amount + sum(d.debit - d.credit) over (w rows between unbounded preceding and current row)
    from (select d0.*, h0.is_cash_bank from public.daybook d0 join public.account_heads h0 on h0.code=d0.head_code where h0.is_cash_bank) d
    join public.account_heads h on h.code = d.head_code
   cross join opening o
   where d.tran_date between p_from and p_to
  window w as (order by d.tran_date, d.id)
  order by 1
$$;


create or replace function public.rpt_day_closing(p_from date, p_to date, p_negative_only boolean default false)
returns table (
  tran_date       date,
  closing_balance numeric
)
language sql
stable
set search_path = ''
as $$
  with opening as (
    select coalesce(sum(d.debit - d.credit), 0) as amount
      from (select d0.*, h0.is_cash_bank from public.daybook d0 join public.account_heads h0 on h0.code=d0.head_code where h0.is_cash_bank) d
     where d.tran_date < p_from or d.tran_date is null
  ),
  days as (
    select d.tran_date, sum(d.debit - d.credit) as net
      from (select d0.*, h0.is_cash_bank from public.daybook d0 join public.account_heads h0 on h0.code=d0.head_code where h0.is_cash_bank) d
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
