-- Allow a waived collection installment while retaining positive receipt and payout amounts.
alter table public.kuri_installment_amounts drop constraint kuri_installment_amounts_amount_check;
alter table public.kuri_installment_amounts add constraint kuri_installment_amounts_amount_check check(amount>=0);

create or replace function public.set_kuri_installment_amount(
  p_scheme_id integer,p_installment_no integer,p_amount numeric default null,
  p_notes text default null,p_expected_amount numeric default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.kuri_schemes; current_amount numeric; new_amount numeric; used_through integer;
begin
  if coalesce(public.app_role(),'') not in ('admin','accountant') then
    raise exception 'not authorized' using errcode='42501';
  end if;
  select * into s from public.kuri_schemes where id=p_scheme_id for update;
  if not found then raise exception 'scheme not found' using errcode='P0002'; end if;
  if s.status not in ('draft','active') then
    raise exception 'completed schemes cannot be changed' using errcode='22023';
  end if;
  if p_installment_no is null or p_installment_no<1 or p_installment_no>s.num_installments then
    raise exception 'invalid installment number' using errcode='22023';
  end if;
  if p_amount is not null and (p_amount<0 or p_amount>=10000000000 or p_amount<>round(p_amount,2)) then
    raise exception 'amount must be zero or positive with at most two decimal places' using errcode='22023';
  end if;
  select greatest(
    coalesce((select max(installment_no) from public.kuri_payments where scheme_id=s.id and cancelled_at is null),0),
    coalesce((select max(installment_no) from public.kuri_lots where scheme_id=s.id),0)) into used_through;
  if p_installment_no<=used_through then
    raise exception 'only future installments without receipts or lot draws can be changed' using errcode='22023';
  end if;
  current_amount:=public.kuri_installment_due(s.id,p_installment_no);
  if p_expected_amount is not null and p_expected_amount is distinct from current_amount then
    raise exception 'Installment amount changed. Reload the schedule before saving.' using errcode='22023';
  end if;
  new_amount:=coalesce(p_amount,s.installment_amount);
  if new_amount=s.installment_amount then
    delete from public.kuri_installment_amounts where scheme_id=s.id and installment_no=p_installment_no;
  else
    insert into public.kuri_installment_amounts(scheme_id,installment_no,amount,notes,updated_by)
    values(s.id,p_installment_no,new_amount,nullif(trim(p_notes),''),auth.uid())
    on conflict(scheme_id,installment_no) do update set amount=excluded.amount,notes=excluded.notes,
      updated_by=auth.uid(),updated_at=now();
  end if;
  if current_amount is distinct from new_amount then
    insert into public.kuri_installment_amount_history(scheme_id,installment_no,previous_amount,new_amount,notes)
    values(s.id,p_installment_no,current_amount,new_amount,nullif(trim(p_notes),''));
  end if;
  return jsonb_build_object('installment_no',p_installment_no,'amount_due',new_amount,'is_custom',new_amount<>s.installment_amount);
end $$;
