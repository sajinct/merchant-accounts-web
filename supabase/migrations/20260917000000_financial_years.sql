create table public.financial_years (
  start_year integer primary key check(start_year between 1900 and 9998),
  starts_on date generated always as (make_date(start_year,4,1)) stored,
  ends_on date generated always as (make_date(start_year+1,3,31)) stored,
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  closing_journal_id bigint references public.journals(id),
  equity_account_code integer references public.account_heads(code)
);
insert into public.financial_years(start_year)
select distinct public.fy_start_of(entry_date) from public.journals
union select public.fy_start_of((now() at time zone 'Asia/Kolkata')::date);
alter table public.financial_years enable row level security;
revoke all on public.financial_years from public,anon,authenticated;
grant select on public.financial_years to authenticated;
create policy financial_years_read on public.financial_years for select to authenticated
using ((select public.app_role()) is not null);

-- Every writer, including reversals/subscriptions, passes this same lock.
create function public.require_open_financial_year() returns trigger
language plpgsql security definer set search_path = '' as $$
declare fy public.financial_years;
begin
 select * into fy from public.financial_years where start_year=public.fy_start_of(new.entry_date) for share;
 if not found then raise exception 'Create financial year % before posting',public.fy_label(public.fy_start_of(new.entry_date)); end if;
 if fy.closed_at is not null then raise exception 'Financial year % is closed',public.fy_label(fy.start_year); end if;
 return new;
end $$;
create trigger journal_financial_year before insert on public.journals
for each row execute function public.require_open_financial_year();

create function public.create_financial_year(p_start_year integer) returns void
language plpgsql security definer set search_path = '' as $$ begin
 if coalesce(public.app_role(),'')<>'admin' then raise exception 'not authorized'; end if;
 perform pg_advisory_xact_lock(hashtext('financial_year_close'));
 if exists(select 1 from public.financial_years where start_year>=p_start_year and closed_at is not null)
    and not exists(select 1 from public.financial_years where start_year=p_start_year) then
   raise exception 'Cannot create a financial year before a closed year';
 end if;
 insert into public.financial_years(start_year) values(p_start_year) on conflict do nothing;
end $$;

alter table public.journals drop constraint journals_kind_check;
alter table public.journals add constraint journals_kind_check
check(kind in ('receipt','payment','journal','opening','reversal','year_closing'));

create function public.close_financial_year(p_start_year integer,p_equity_account_code integer)
returns bigint language plpgsql security definer set search_path = '' as $$
declare fy public.financial_years; lines jsonb; net numeric; jid bigint;
begin
 if coalesce(public.app_role(),'')<>'admin' then raise exception 'not authorized'; end if;
 perform pg_advisory_xact_lock(hashtext('financial_year_close'));
 select * into fy from public.financial_years where start_year=p_start_year for update;
 if not found then raise exception 'Financial year not found'; end if;
 if fy.closed_at is not null then return fy.closing_journal_id; end if;
 if (now() at time zone 'Asia/Kolkata')::date < fy.ends_on then raise exception 'The financial year has not ended yet'; end if;
 if exists(select 1 from public.financial_years where start_year<p_start_year and closed_at is null) then
   raise exception 'Close earlier financial years first';
 end if;
 -- Cannot back-close once the following year has been closed.
 if exists(select 1 from public.financial_years where start_year>p_start_year and closed_at is not null) then
   raise exception 'A later financial year is already closed';
 end if;
 perform 1 from public.account_heads where code=p_equity_account_code and account_type='equity' for share;
 if not found then raise exception 'Select an equity account for retained earnings'; end if;
 if exists(select 1 from public.journals j left join public.daybook d on d.journal_id=j.id
   where j.entry_date between fy.starts_on and fy.ends_on group by j.id
   having count(d.id)<2 or sum(d.debit)<>sum(d.credit)) then raise exception 'Unbalanced journal detected'; end if;
 select jsonb_agg(jsonb_build_object('account',head_code,'debit',greatest(amount,0),'credit',greatest(-amount,0))),sum(amount)
 into lines,net from (
   select d.head_code,sum(d.credit-d.debit) amount from public.daybook d
   join public.account_heads h on h.code=d.head_code
   where h.account_type in ('income','expense') and d.tran_date<=fy.ends_on
   group by d.head_code having sum(d.credit-d.debit)<>0
 ) balances;
 if lines is not null then
   if net<>0 then lines:=lines||jsonb_build_array(jsonb_build_object('account',p_equity_account_code,'debit',greatest(-net,0),'credit',greatest(net,0))); end if;
   jid:=public.write_journal(fy.ends_on,'Year closing '||public.fy_label(p_start_year),'year_closing',lines,gen_random_uuid(),jsonb_build_object('financial_year_close',p_start_year));
 end if;
 update public.financial_years set closed_at=now(),closed_by=auth.uid(),closing_journal_id=jid,equity_account_code=p_equity_account_code where start_year=p_start_year;
 insert into public.financial_years(start_year) values(p_start_year+1) on conflict do nothing;
 return jid;
end $$;

-- Closing journals must not be reversed outside this coordinated reopen flow.
create or replace function public.reverse_journal(p_id bigint,p_date date,p_reason text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare j public.journals; lines jsonb;
begin
 if coalesce(public.app_role(),'')<>'admin' then raise exception 'not authorized'; end if;
 if nullif(trim(p_reason),'') is null then raise exception 'A reversal reason is required'; end if;
 select * into j from public.journals where id=p_id for update;
 if not found then raise exception 'Journal not found'; end if;
 if j.kind='year_closing' then raise exception 'Reopen the financial year to reverse its closing entry'; end if;
 if j.voucher_id is not null then raise exception 'Cancel this entry through its voucher or subscription'; end if;
 if j.reversal_of is not null or exists(select 1 from public.journals where reversal_of=p_id) then raise exception 'Journal already reversed or is a reversal'; end if;
 if p_date<j.entry_date then raise exception 'Reversal date cannot precede the journal'; end if;
 select jsonb_agg(jsonb_build_object('account',head_code,'debit',credit,'credit',debit)) into lines from public.daybook where journal_id=p_id;
 return public.write_journal(p_date,p_reason,'reversal',lines,gen_random_uuid(),jsonb_build_object('reversal',p_id),null,p_id);
end $$;

create table public.financial_year_reopen_log (
 id bigint generated always as identity primary key,
 start_year integer not null references public.financial_years(start_year),
 reason text not null, created_at timestamptz not null default now(),
 created_by uuid not null references auth.users(id), reversal_journal_id bigint references public.journals(id)
);
alter table public.financial_year_reopen_log enable row level security;
revoke all on public.financial_year_reopen_log from public,anon,authenticated;
grant select on public.financial_year_reopen_log to authenticated;
create policy financial_year_reopen_read on public.financial_year_reopen_log for select to authenticated using((select public.app_role())='admin');
create function public.reopen_financial_year(p_start_year integer,p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare fy public.financial_years; lines jsonb; jid bigint;
begin
 if coalesce(public.app_role(),'')<>'admin' then raise exception 'not authorized'; end if;
 if nullif(trim(p_reason),'') is null then raise exception 'A reopening reason is required'; end if;
 perform pg_advisory_xact_lock(hashtext('financial_year_close'));
 select * into fy from public.financial_years where start_year=p_start_year for update;
 if not found then raise exception 'Financial year not found'; end if;
 if fy.closed_at is null then return; end if;
 if exists(select 1 from public.financial_years where start_year>p_start_year and closed_at is not null) then raise exception 'Reopen later closed years first'; end if;
 update public.financial_years set closed_at=null,closed_by=null,closing_journal_id=null,equity_account_code=null where start_year=p_start_year;
 if fy.closing_journal_id is not null then
   select jsonb_agg(jsonb_build_object('account',head_code,'debit',credit,'credit',debit)) into lines from public.daybook where journal_id=fy.closing_journal_id;
   jid:=public.write_journal(fy.ends_on,'Reopen '||public.fy_label(p_start_year)||': '||trim(p_reason),'reversal',lines,gen_random_uuid(),jsonb_build_object('reopen_year',p_start_year),null,fy.closing_journal_id);
 end if;
 insert into public.financial_year_reopen_log(start_year,reason,created_by,reversal_journal_id) values(p_start_year,trim(p_reason),auth.uid(),jid);
end $$;
revoke all on function public.require_open_financial_year() from public,anon,authenticated;
revoke all on function public.create_financial_year(integer),public.close_financial_year(integer,integer),public.reopen_financial_year(integer,text) from public,anon;
grant execute on function public.create_financial_year(integer),public.close_financial_year(integer,integer),public.reopen_financial_year(integer,text) to authenticated;

create function public.financial_year_summary(p_start_year integer)
returns table(income numeric,expense numeric,net_result numeric)
language sql stable set search_path='' as $$
 with totals as (
 select coalesce(sum(case when h.account_type='income' then d.credit-d.debit else 0 end),0) income,
 coalesce(sum(case when h.account_type='expense' then d.debit-d.credit else 0 end),0) expense
 from public.daybook d join public.journals j on j.id=d.journal_id join public.account_heads h on h.code=d.head_code
 left join public.journals original on original.id=j.reversal_of
 where d.tran_date between make_date(p_start_year,4,1) and make_date(p_start_year+1,3,31)
 and j.kind<>'year_closing' and coalesce(original.kind,'')<>'year_closing'
 ) select income,expense,income-expense from totals;
$$;
revoke all on function public.financial_year_summary(integer) from public,anon;
grant execute on function public.financial_year_summary(integer) to authenticated;
