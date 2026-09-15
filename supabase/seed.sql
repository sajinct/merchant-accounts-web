-- Local development data only (applied by `supabase db reset`).

update public.company_settings set name = 'DEMO TRADERS', place = 'CHAVAKKAD';

insert into public.account_heads (code, name, account_type) values
  (2001, 'CASH SALES', 'income'),
  (2002, 'SHOP RENT', 'expense'),
  (2003, 'ELECTRICITY', 'expense'),
  (2004, 'SALARY', 'expense'),
  (2005, 'SUPPLIER PAYABLES', 'liability')
on conflict(code) do nothing;
