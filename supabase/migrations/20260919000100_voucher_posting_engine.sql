-- The posting engine every voucher screen and every future collection module uses.

-- Internal writer: only called inside authorized RPCs. Lines carry an account, one
-- positive side, and optionally a description and a reference to the record that
-- produced them (a subscription payment, a bill, a collection).
create or replace function public.write_journal(p_date date,p_narration text,p_kind text,p_lines jsonb,
 p_request uuid,p_data jsonb,p_voucher bigint default null,p_reversal bigint default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare jid bigint; ref text; line jsonb; dr numeric; cr numeric; total_dr numeric:=0; total_cr numeric:=0; ac integer;
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
   -- A reversal must always be able to restore balance, even on an account that has
   -- since been retired, so this applies to new postings only.
   if p_kind not in ('reversal','year_closing') then
     perform 1 from public.account_heads where code=ac and is_active and not is_group for share;
     if not found then raise exception 'Entries cannot be posted to a retired or group account'; end if;
   end if;
   total_dr:=total_dr+dr; total_cr:=total_cr+cr;
 end loop;
 if total_dr<>total_cr then raise exception 'Total debits must equal total credits'; end if;
 insert into public.journals(entry_date,narration,kind,request_id,request_data,voucher_id,reversal_of)
 values(p_date,coalesce(trim(p_narration),''),p_kind,p_request,p_data,p_voucher,p_reversal) returning id into jid;
 -- Lines of a voucher carry its own reference, so the day book and ledger name it.
 select case v.voucher_type when 1 then 'R-' when 2 then 'P-' when 3 then 'C-' else 'V-' end||v.voucher_no
   into ref from public.vouchers v where v.id=p_voucher;
 insert into public.daybook(journal_id,head_code,tran_date,debit,credit,narration,is_auto,voucher_ref,line_no,reference_id)
 select jid,(x->>'account')::integer,p_date,coalesce((x->>'debit')::numeric,0),coalesce((x->>'credit')::numeric,0),
        coalesce(nullif(trim(x->>'description'),''),coalesce(trim(p_narration),'')),true,
        coalesce(ref,'J-'||jid),ord::smallint,nullif(x->>'reference_id','')::bigint
 from jsonb_array_elements(p_lines) with ordinality as t(x,ord);
 return jid;
end $$;

-- Simplified mode (receipts and payments): each line is an account head and a positive
-- `amount`; the engine writes the single cash/bank counterpart for the total, so the
-- user never types the cash side. Advanced mode passes explicit `debit`/`credit` per
-- line and the engine only checks them. Either way the debits and credits that reach
-- the ledger are calculated here, never taken on trust from the browser.
create function public.post_voucher(
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
declare v public.vouchers; data jsonb; lines jsonb; cash jsonb; total numeric; n integer; fy integer;
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

 -- What the voucher is worth, and the figure the header carries.
 select coalesce(sum(coalesce((x->>'debit')::numeric,0)),0) into total from jsonb_array_elements(lines) as t(x);
 if total<=0 then raise exception 'Enter an amount greater than zero'; end if;

 -- Rules that depend on the voucher type. write_journal enforces the rest: two lines
 -- or more, one positive side each, classified and postable accounts, debits = credits.
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
   raise exception 'A contra voucher moves money between cash and bank accounts only';
 end if;
 if p_type=4 and not coalesce((select journal_allows_cash from public.company_settings),false)
    and exists(select 1 from jsonb_array_elements(lines) as t(x)
      join public.account_heads h on h.code=(x->>'account')::integer where h.is_cash_bank) then
   raise exception 'Journal vouchers cannot use cash or bank accounts; use a receipt, payment or contra';
 end if;

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

-- Single-head receipt/payment, kept for subscription collection and any caller that
-- has only one account head. It goes through the same engine.
create or replace function public.create_voucher(p_type integer,p_date date,p_head_code integer,p_description text,
 p_amount numeric,p_cash_account_code integer,p_request_id uuid)
returns public.vouchers language plpgsql security definer set search_path = '' as $$ begin
 if p_type is null or p_type not in (1,2) or p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2)
    or p_date is null or p_request_id is null or p_head_code=p_cash_account_code then
   raise exception 'Invalid voucher details';
 end if;
 return public.post_voucher(p_type,p_date,null,null,p_description,p_cash_account_code,
   jsonb_build_array(jsonb_build_object('account',p_head_code,'amount',p_amount)),true,p_request_id);
end $$;

-- The number the next voucher of this type will take. A preview only: the number is
-- allocated inside post_voucher, under the counter row lock.
create function public.next_voucher_no(p_type integer) returns integer
language sql stable security definer set search_path = '' as $$
 select last_no+1 from public.voucher_counters where voucher_type=p_type
$$;

-- Subscription receipts now read their cash account back from the request the engine
-- stored, so the retry check no longer depends on a column on the voucher header.
create or replace function public.record_subscription_payment(
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
  select sp.* into v_row from public.subscription_payments sp
    join public.journals j on j.voucher_id=sp.voucher_id where j.request_id=p_request_id;
  if found then
    if v_row.member_code<>p_member_code or v_row.fy_start<>p_fy_start or v_row.amount<>p_amount
       or v_row.paid_on<>p_paid_on
       or coalesce(v_row.notes,'')<>coalesce(nullif(trim(p_notes),''),'') then
      raise exception 'Request ID was already used';
    end if;
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

revoke all on function public.write_journal(date,text,text,jsonb,uuid,jsonb,bigint,bigint)
  from public, anon, authenticated;
revoke all on function public.stamp_voucher_cancellation(), public.lock_account_classification()
  from public, anon, authenticated;
revoke all on function public.post_voucher(integer,date,text,integer,text,integer,jsonb,boolean,uuid),
  public.next_voucher_no(integer) from public, anon;
grant execute on function public.post_voucher(integer,date,text,integer,text,integer,jsonb,boolean,uuid),
  public.next_voucher_no(integer) to authenticated;
