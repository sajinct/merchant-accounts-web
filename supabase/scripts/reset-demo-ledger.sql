-- User-authorized fresh start: demo financial entries only. Retains users,
-- company settings, account heads, member details and annual fee configuration.
-- Run BEFORE the double-entry migration; never run against real financial data.
begin;
delete from public.subscription_payments;
delete from public.daybook;
delete from public.vouchers;
update public.voucher_counters set last_no=0;
commit;
