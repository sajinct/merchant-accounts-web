begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-00000000de01','double-admin@test.local'),
 ('00000000-0000-0000-0000-00000000de02','double-viewer@test.local');
update profiles set role='admin' where user_id='00000000-0000-0000-0000-00000000de01';
update profiles set role='viewer' where user_id='00000000-0000-0000-0000-00000000de02';
insert into account_heads(code,name,account_type,is_cash_bank) values
 (81001,'Test cash','asset',true),(81002,'Test bank','asset',true),
 (81003,'Test income','income',false),(81004,'Test expense','expense',false),
 (81005,'Test capital','equity',false),(81006,'Unclassified',null,false);
insert into customers(code,name,joined_on) values(81001,'Test member','2026-04-01');
insert into subscription_years(fy_start,fee) values(2026,100) on conflict(fy_start) do update set fee=100;
update company_settings set subscription_head_code=81003;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000de01',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000de01","role":"authenticated"}',true);

set local role authenticated;
select lives_ok($$select create_voucher(1,'2026-09-15',81003,'receipt',100,81001,'00000000-0000-0000-0000-000000000001')$$,'receipt posts');
select is((select count(*)::integer from daybook where head_code in(81001,81003)),2,'receipt has two lines');
select is((select sum(debit-credit) from daybook where head_code=81001),100::numeric,'receipt debits cash');
select is((select sum(credit-debit) from daybook where head_code=81003),100::numeric,'receipt credits income');
select lives_ok($$select create_voucher(1,'2026-09-15',81003,'receipt',100,81001,'00000000-0000-0000-0000-000000000001')$$,'retry returns existing voucher');
select is((select count(*)::integer from journals),1,'retry does not duplicate journal');
select throws_ok($$select create_voucher(1,'2026-09-15',81003,'receipt',101,81001,'00000000-0000-0000-0000-000000000001')$$,'P0001','Request ID was already used','changed retry rejected');
select lives_ok($$select create_voucher(2,'2026-09-15',81004,'payment',30,81001,'00000000-0000-0000-0000-000000000002')$$,'payment posts');
select is((select sum(debit-credit) from daybook where head_code=81001),70::numeric,'payment credits cash');
select is((select sum(debit-credit) from daybook where head_code=81004),30::numeric,'payment debits expense');
select throws_ok($$select create_voucher(1,'2026-09-15',81006,'unclassified',10,81001,gen_random_uuid())$$,'P0001','Select a classified account for every line','unclassified account rejected');
select throws_ok($$select create_voucher(1,'2026-09-15',81003,'invalid cash',10,81004,gen_random_uuid())$$,'P0001','Choose a cash/bank account','noncash account rejected');
select throws_ok($$select create_voucher(1,'2026-09-15',81003,'precision',1.001,81001,gen_random_uuid())$$,'P0001','Invalid voucher details','excess precision rejected');
select throws_ok($$select create_journal('2026-09-15','unbalanced','[{"account":81001,"debit":10},{"account":81005,"credit":9}]',gen_random_uuid())$$,'P0001','Total debits must equal total credits','unbalanced journal rejected');
select lives_ok($$select create_journal('2026-09-15','transfer','[{"account":81002,"debit":20},{"account":81001,"credit":20}]','00000000-0000-0000-0000-000000000003')$$,'transfer posts');
select is((select sum(debit-credit) from daybook where head_code=81002),20::numeric,'transfer debits destination bank');
select is((select sum(debit-credit) from daybook where head_code=81001),50::numeric,'transfer credits source cash');
select is((select sum(debit)-sum(credit) from rpt_trial_balance('2026-09-15')),0::numeric,'trial balance balances');
select is((select closing_balance from rpt_day_closing('2026-09-15','2026-09-15')),70::numeric,'combined cash/bank closing is not zero');
select is((select balance from rpt_daybook('2026-09-15','2026-09-15') order by seq desc limit 1),70::numeric,'cash book closing agrees');
select is(post_daybook('2026-09-15','2026-09-15'),3,'verification counts journals');
select is(post_daybook('2026-09-15','2026-09-15'),3,'verification does not duplicate entries');
set local role postgres;
select throws_ok($$update daybook set debit=99 where head_code=81001$$,'P0001','Posted entries cannot be changed or deleted; create a reversal','posted lines immutable');
select throws_ok($$update account_heads set is_cash_bank=false where code=81001$$,'P0001','Classification cannot change after an account has entries','cash classification locked');
select lives_ok($$select cancel_voucher((select id from vouchers where description='payment'),'entered twice')$$,'cancellation creates reversal');
select is((select sum(debit-credit) from daybook where head_code=81004),0::numeric,'reversal clears expense');
select is((select count(*)::integer from journals where reversal_of is not null),1,'original is retained with reversal link');
select lives_ok($$select record_subscription_payment(81001,2026,40,'2026-09-15','test',81001,'00000000-0000-0000-0000-000000000004')$$,'subscription posts balanced receipt');
select lives_ok($$select record_subscription_payment(81001,2026,40,'2026-09-15','test',81001,'00000000-0000-0000-0000-000000000004')$$,'subscription retry is idempotent');
select is((select count(*)::integer from subscription_payments where member_code=81001),1,'one subscription payment');
select lives_ok($$select cancel_subscription_payment((select id from subscription_payments where member_code=81001),'test reversal')$$,'subscription cancellation reverses ledger');
select is((select sum(debit)-sum(credit) from rpt_trial_balance('2026-09-15')),0::numeric,'trial balance balances after reversals');
select lives_ok($$set constraints all immediate$$,'deferred database balance constraints pass');
set constraints all deferred;
select lives_ok($$select create_journal('2026-09-15','opening','[{"account":81001,"debit":500},{"account":81005,"credit":500}]','00000000-0000-0000-0000-000000000005',true)$$,'balanced opening entry posts');
select lives_ok($$select reverse_journal((select id from journals where request_id='00000000-0000-0000-0000-000000000005'),'2026-09-15','opening correction')$$,'journal reversal posts');
select throws_ok($$select reverse_journal((select id from journals where request_id='00000000-0000-0000-0000-000000000005'),'2026-09-15','again')$$,'P0001','Journal already reversed or is a reversal','duplicate reversal rejected');
select lives_ok($$set constraints all immediate$$,'opening and reversal pass commit checks');
select ok(not has_table_privilege('authenticated','daybook','TRUNCATE'),'clients cannot truncate the ledger');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000de02',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000de02","role":"authenticated"}',true);
select throws_ok($$select create_journal('2026-09-15','viewer','[{"account":81002,"debit":20},{"account":81001,"credit":20}]',gen_random_uuid())$$,'P0001','not authorized','viewer cannot post');
select ok(not has_table_privilege('authenticated','daybook','INSERT'),'clients cannot directly insert ledger lines');
select ok(not has_function_privilege('authenticated','public.write_journal(date,text,text,jsonb,uuid,jsonb,bigint,bigint)','EXECUTE'),'internal writer inaccessible');
select * from finish();
rollback;
