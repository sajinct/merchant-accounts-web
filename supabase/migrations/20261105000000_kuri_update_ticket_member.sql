-- Reassign an existing ticket without replacing its financial identity.
alter table public.kuri_members add column revision integer not null default 0;

create table public.kuri_member_history (
  id bigint generated always as identity primary key,
  -- Keep the ticket ID in the audit even if an unused draft ticket is removed.
  member_id integer not null,
  scheme_id integer not null references public.kuri_schemes(id),
  previous_details jsonb not null,
  new_details jsonb not null,
  changed_by uuid not null default auth.uid() references auth.users(id),
  changed_at timestamptz not null default now()
);
create index kuri_member_history_member_idx on public.kuri_member_history(member_id);
alter table public.kuri_member_history enable row level security;
revoke all on public.kuri_member_history from public,anon,authenticated;
grant select on public.kuri_member_history to authenticated;
create policy kuri_member_history_read on public.kuri_member_history
  for select to authenticated using((select public.app_role()) in ('admin','accountant'));

create function public.update_kuri_member(
  p_member_id integer, p_customer_code integer, p_expected_revision integer,
  p_holder_name text default null, p_holder_address text default null, p_holder_phone text default null
)
returns public.kuri_members language plpgsql security definer set search_path='' as $$
declare
  v_scheme_id integer;
  v_status text;
  v_before public.kuri_members;
  v_after public.kuri_members;
begin
  if coalesce(public.app_role(),'') not in ('admin','accountant') then
    raise exception 'not authorized' using errcode='42501';
  end if;
  select scheme_id into v_scheme_id from public.kuri_members where id=p_member_id;
  if not found then raise exception 'ticket not found' using errcode='P0002'; end if;
  -- Receipts and lot draws also lock the scheme first.
  select status into v_status from public.kuri_schemes where id=v_scheme_id for update;
  if v_status='completed' then
    raise exception 'completed schemes cannot be changed' using errcode='22023';
  end if;
  select * into v_before from public.kuri_members where id=p_member_id for update;
  if not found then raise exception 'ticket not found' using errcode='P0002'; end if;
  if p_expected_revision is distinct from v_before.revision then
    raise exception 'Ticket member changed. Reload the members before saving.' using errcode='22023';
  end if;
  if p_customer_code is null or not exists(select 1 from public.customers where code=p_customer_code) then
    raise exception 'member not found' using errcode='P0002';
  end if;
  if length(trim(coalesce(p_holder_name,'')))>100 or length(trim(coalesce(p_holder_address,'')))>250
    or length(trim(coalesce(p_holder_phone,'')))>30 then
    raise exception 'ticket holder details are too long' using errcode='22023';
  end if;
  update public.kuri_members set customer_code=p_customer_code,
    holder_name=nullif(trim(p_holder_name),''),holder_address=nullif(trim(p_holder_address),''),
    holder_phone=nullif(trim(p_holder_phone),''),revision=revision+1
    where id=p_member_id returning * into v_after;
  insert into public.kuri_member_history(member_id,scheme_id,previous_details,new_details)
    values(p_member_id,v_scheme_id,to_jsonb(v_before),to_jsonb(v_after));
  -- Existing vouchers retain the original recorded party and narration.
  return v_after;
end $$;
revoke execute on function public.update_kuri_member(integer,integer,integer,text,text,text) from public,anon;
grant execute on function public.update_kuri_member(integer,integer,integer,text,text,text) to authenticated;
