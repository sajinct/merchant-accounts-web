create or replace function public.lock_account_classification() returns trigger
language plpgsql set search_path = '' as $$ begin
 if (new.is_group and not old.is_group)
    and exists(select 1 from public.daybook where head_code=old.code) then
   raise exception 'An account with entries cannot be turned into a group';
 end if;
 return new;
end $$;
