-- Customize future payouts independently from per-ticket collection dues.
create table public.kuri_payout_amounts (
  scheme_id integer not null references public.kuri_schemes(id),
  installment_no smallint not null check(installment_no>=2),
  amount numeric(12,2) not null check(amount>0),
  notes text,
  updated_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key(scheme_id,installment_no)
);
create table public.kuri_payout_amount_history (
  id bigint generated always as identity primary key,
  scheme_id integer not null references public.kuri_schemes(id),
  installment_no smallint not null,
  previous_amount numeric(12,2) not null,
  new_amount numeric(12,2) not null,
  notes text,
  changed_by uuid not null default auth.uid() references auth.users(id),
  changed_at timestamptz not null default now()
);
create index kuri_payout_amount_history_scheme_idx on public.kuri_payout_amount_history(scheme_id,installment_no);
alter table public.kuri_payout_amounts enable row level security;
alter table public.kuri_payout_amount_history enable row level security;
revoke all on public.kuri_payout_amounts,public.kuri_payout_amount_history from public,anon,authenticated;
grant select on public.kuri_payout_amounts,public.kuri_payout_amount_history to authenticated;
create policy kuri_payout_amounts_read on public.kuri_payout_amounts
  for select to authenticated using((select public.app_role()) is not null);
create policy kuri_payout_amount_history_read on public.kuri_payout_amount_history
  for select to authenticated using((select public.app_role()) in ('admin','accountant'));

create function public.kuri_calculated_payout(p_scheme_id integer,p_installment_no integer)
returns numeric language sql stable set search_path='' as $$
  select round(
    (s.num_members*s.installment_amount)*(1-s.max_deduction_pct/100)
    +(p_installment_no-2)*((s.num_members*s.installment_amount)*s.max_deduction_pct/100/(s.num_members-1)),2)
  from public.kuri_schemes s where s.id=p_scheme_id and p_installment_no between 2 and s.num_installments
$$;

-- Keep the existing RPC's signature for cached clients and draw_kuri_lot.
-- Once drawn, the stored award is authoritative, including pending payouts.
create or replace function public.kuri_payout_schedule(p_scheme_id integer)
returns table(installment_no smallint,lot_number smallint,payout_amount numeric)
language sql stable set search_path='' as $$
  select n::smallint,(n-1)::smallint,coalesce(l.payout_amount,a.amount,public.kuri_calculated_payout(s.id,n))
  from public.kuri_schemes s cross join generate_series(2,s.num_installments) n
  left join public.kuri_payout_amounts a on a.scheme_id=s.id and a.installment_no=n
  left join public.kuri_lots l on l.scheme_id=s.id and l.installment_no=n
  where s.id=p_scheme_id order by n
$$;

create function public.kuri_payout_amount_schedule(p_scheme_id integer)
returns table(installment_no smallint,lot_number smallint,payout_amount numeric,
  calculated_amount numeric,is_custom boolean,can_edit boolean,notes text,updated_at timestamptz)
language sql stable set search_path='' as $$
  select p.installment_no,p.lot_number,p.payout_amount,
    public.kuri_calculated_payout(s.id,p.installment_no),a.scheme_id is not null,
    s.status in ('draft','active') and p.installment_no>
      coalesce((select max(l.installment_no) from public.kuri_lots l where l.scheme_id=s.id),0),
    a.notes,a.updated_at
  from public.kuri_payout_schedule(p_scheme_id) p
  join public.kuri_schemes s on s.id=p_scheme_id
  left join public.kuri_payout_amounts a on a.scheme_id=s.id and a.installment_no=p.installment_no
  order by p.installment_no
$$;

create function public.set_kuri_payout_amount(
  p_scheme_id integer,p_installment_no integer,p_amount numeric default null,
  p_notes text default null,p_expected_amount numeric default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.kuri_schemes; current_amount numeric; new_amount numeric; calculated numeric; drawn_through integer;
begin
  if coalesce(public.app_role(),'') not in ('admin','accountant') then
    raise exception 'not authorized' using errcode='42501';
  end if;
  -- draw_kuri_lot takes this same row lock before reading the schedule.
  select * into s from public.kuri_schemes where id=p_scheme_id for update;
  if not found then raise exception 'scheme not found' using errcode='P0002'; end if;
  if s.status not in ('draft','active') then
    raise exception 'completed schemes cannot be changed' using errcode='22023';
  end if;
  if p_installment_no is null or p_installment_no<2 or p_installment_no>s.num_installments then
    raise exception 'choose an installment with a lot payout' using errcode='22023';
  end if;
  if p_amount is not null and (p_amount<=0 or p_amount>=10000000000 or p_amount<>round(p_amount,2)) then
    raise exception 'amount must be positive with at most two decimal places' using errcode='22023';
  end if;
  select coalesce(max(installment_no),0) into drawn_through from public.kuri_lots where scheme_id=s.id;
  if p_installment_no<=drawn_through then
    raise exception 'only future payouts after the last lot draw can be changed' using errcode='22023';
  end if;
  select payout_amount into current_amount from public.kuri_payout_schedule(s.id) where installment_no=p_installment_no;
  if p_expected_amount is not null and p_expected_amount is distinct from current_amount then
    raise exception 'Payout amount changed. Reload the schedule before saving.' using errcode='22023';
  end if;
  calculated:=public.kuri_calculated_payout(s.id,p_installment_no);
  new_amount:=coalesce(p_amount,calculated);
  if new_amount=calculated then
    delete from public.kuri_payout_amounts where scheme_id=s.id and installment_no=p_installment_no;
  else
    insert into public.kuri_payout_amounts(scheme_id,installment_no,amount,notes,updated_by)
    values(s.id,p_installment_no,new_amount,nullif(trim(p_notes),''),auth.uid())
    on conflict(scheme_id,installment_no) do update set amount=excluded.amount,notes=excluded.notes,
      updated_by=auth.uid(),updated_at=now();
  end if;
  if current_amount is distinct from new_amount then
    insert into public.kuri_payout_amount_history(scheme_id,installment_no,previous_amount,new_amount,notes)
    values(s.id,p_installment_no,current_amount,new_amount,nullif(trim(p_notes),''));
  end if;
  return jsonb_build_object('installment_no',p_installment_no,'payout_amount',new_amount,'is_custom',new_amount<>calculated);
end $$;

revoke execute on function public.kuri_calculated_payout(integer,integer) from public,anon;
revoke execute on function public.kuri_payout_amount_schedule(integer) from public,anon;
revoke execute on function public.set_kuri_payout_amount(integer,integer,numeric,text,numeric) from public,anon;
grant execute on function public.kuri_calculated_payout(integer,integer) to authenticated;
grant execute on function public.kuri_payout_amount_schedule(integer) to authenticated;
grant execute on function public.set_kuri_payout_amount(integer,integer,numeric,text,numeric) to authenticated;
