-- Local development data only (applied by `supabase db reset`).

update public.company_settings set name = 'DEMO TRADERS', place = 'CHAVAKKAD';

insert into public.account_heads (code, name) values
  (1001, 'CASH SALES'),
  (1002, 'SHOP RENT'),
  (1003, 'ELECTRICITY'),
  (1004, 'SALARY'),
  (1005, 'SUPPLIER PAYMENTS');
