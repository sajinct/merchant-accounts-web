begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-00000000ab01','history-admin@test.local'),
 ('00000000-0000-0000-0000-00000000ab02','history-accountant@test.local'),
 ('00000000-0000-0000-0000-00000000ab03','history-viewer@test.local');
update profiles set role='admin' where user_id='00000000-0000-0000-0000-00000000ab01';
update profiles set role='accountant' where user_id='00000000-0000-0000-0000-00000000ab02';
update profiles set role='viewer' where user_id='00000000-0000-0000-0000-00000000ab03';
insert into customers(code,name,joined_on,joining_fee) values
 (86001,'Existing member','2010-04-01',null),
 (86002,'Joining fee override','1900-04-01',250),
 (86003,'Legacy linked member','2010-04-01',500),
 (86004,'Joining date unknown',null,null);
insert into subscription_years(fy_start,fee) values(2010,1000),(2011,1200)
 on conflict(fy_start) do update set fee=excluded.fee;
update company_settings set subscription_head_code=null;
insert into joining_fees(effective_from,fee,head_code) values('2010-04-01',500,null)
 on conflict(effective_from) do update set fee=500,head_code=null;
insert into joining_fees(effective_from,fee,head_code) values(current_date,600,null)
 on conflict(effective_from) do update set fee=600,head_code=null;
-- A closed accounting year must not prevent recording membership history.
insert into financial_years(start_year,closed_at) values(2010,now())
 on conflict(start_year) do update set closed_at=now();
create temporary table accounting_baseline as
select (select count(*) from vouchers) vouchers, (select count(*) from journals) journals,
       (select count(*) from daybook) lines, (select sum(last_no) from voucher_counters) numbers;
grant select on accounting_baseline to authenticated;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000ab02',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000ab02","role":"authenticated"}',true);
set local role authenticated;

select lives_ok($$select record_subscription_payment(86001,2010,400,'2010-06-01',' old receipt ','00000000-0000-0000-0000-000000000801')$$,
 'accountant records past subscription without accounts and in a closed accounting year');
select lives_ok($$select record_subscription_payment(86001,2010,400,'2010-06-01','old receipt','00000000-0000-0000-0000-000000000801')$$,
 'subscription retry returns original record');
select is((select count(*) from subscription_payments where member_code=86001),1::bigint,'retry does not duplicate history');
select ok((select voucher_id is null from subscription_payments where member_code=86001),'new subscription has no voucher link');
select is((select balance from member_subscription_years(86001) where fy_start=2010),600::numeric,'past payment reduces membership dues');
select throws_ok($$select record_subscription_payment(86001,2010,401,'2010-06-01','old receipt','00000000-0000-0000-0000-000000000801')$$,
 '22023','Request ID was already used for a different payment','changed subscription retry rejected');
select throws_ok($$select record_subscription_payment(86001,2011,400,'2010-06-01','old receipt','00000000-0000-0000-0000-000000000801')$$,
 '22023','Request ID was already used for a different payment','request cannot be reused for another year');
select throws_ok($$select record_subscription_payment(86001,2010,601,'2010-06-01',null,gen_random_uuid())$$,
 '22023',null,'subscription overpayment rejected');
select throws_ok($$select record_subscription_payment(86001,2009,1,'2009-06-01',null,gen_random_uuid())$$,
 '22023',null,'subscription needs an applicable fee year');

select lives_ok($$select record_joining_fee_payment(86001,200,'2010-04-01','old joining receipt','00000000-0000-0000-0000-000000000802')$$,
 'joining history uses schedule without account head');
select lives_ok($$select record_joining_fee_payment(86001,200,'2010-04-01','old joining receipt','00000000-0000-0000-0000-000000000802')$$,
 'joining payment retry returns original record');
select is((select count(*) from joining_fee_payments where member_code=86001),1::bigint,'joining retry does not duplicate history');
select ok((select voucher_id is null from joining_fee_payments where member_code=86001),'new joining payment has no voucher link');
select throws_ok($$select record_joining_fee_payment(86001,201,'2010-04-01','old joining receipt','00000000-0000-0000-0000-000000000802')$$,
 '22023','Request ID was already used for a different payment','changed joining retry rejected');
select throws_ok($$select record_joining_fee_payment(86001,301,'2010-04-01',null,gen_random_uuid())$$,
 '22023',null,'joining overpayment rejected');
select lives_ok($$select record_joining_fee_payment(86002,250,'1900-04-01',null,gen_random_uuid())$$,
 'per-member joining override works without a schedule or accounting year');
select lives_ok($$select record_joining_fee_payment(86004,600,'1900-04-01',null,gen_random_uuid())$$,
 'unknown joining date uses the same current fee as the displayed balance, regardless of payment date');

-- Cached signatures are record-only too, even if they still send a cash account.
select lives_ok($$select record_subscription_payment(86001,2010,100,'2010-07-01','cached',999999,'00000000-0000-0000-0000-000000000803')$$,
 'cached seven-argument subscription signature ignores obsolete account');
select lives_ok($$select record_subscription_payment(86001,2010,100,'2010-08-01','oldest client')$$,
 'cached five-argument subscription signature is record-only');
select lives_ok($$select record_joining_fee_payment(86001,100,'2010-04-01','old client')$$,
 'cached joining signature is record-only');

select throws_ok($$select record_subscription_payment(86001,2010,0,'2010-06-01',null,gen_random_uuid())$$,'22023',null,'zero rejected');
select throws_ok($$select record_joining_fee_payment(86001,-1,'2010-06-01',null,gen_random_uuid())$$,'22023',null,'negative amount rejected');
select throws_ok($$select record_subscription_payment(86001,2010,1.001,'2010-06-01',null,gen_random_uuid())$$,'22023',null,'subscription precision rejected');
select throws_ok($$select record_joining_fee_payment(86001,1.001,'2010-06-01',null,gen_random_uuid())$$,'22023',null,'joining precision rejected');
select throws_ok($$select record_subscription_payment(86001,2010,'NaN'::numeric,'2010-06-01',null,gen_random_uuid())$$,'22023',null,'NaN rejected');
select throws_ok($$select record_joining_fee_payment(86001,'Infinity'::numeric,'2010-06-01',null,gen_random_uuid())$$,'22023',null,'infinite amount rejected');
select throws_ok($$select record_subscription_payment(86001,2010,1,null,null,gen_random_uuid())$$,'22023',null,'missing date rejected');
select throws_ok($$select record_joining_fee_payment(86001,1,'infinity'::date,null,gen_random_uuid())$$,'22023',null,'nonfinite date rejected');
select throws_ok($$select record_joining_fee_payment(86001,1,'2010-06-01',null,null)$$,'22023',null,'missing request rejected');
select throws_ok($$select record_subscription_payment(86999,2010,1,'2010-06-01',null,gen_random_uuid())$$,'P0002',null,'missing member rejected');
select throws_ok($$select cancel_subscription_payment((select id from subscription_payments where request_id='00000000-0000-0000-0000-000000000801'),'mistake')$$,
 '42501','not authorized','accountant cannot cancel history');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000ab01',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000ab01","role":"authenticated"}',true);
select throws_ok($$select cancel_subscription_payment((select id from subscription_payments where request_id='00000000-0000-0000-0000-000000000801'),' ')$$,
 '22023','Cancellation reason is required','subscription cancellation needs audit reason');
select throws_ok($$select cancel_joining_fee_payment((select id from joining_fee_payments where request_id='00000000-0000-0000-0000-000000000802'),null)$$,
 '22023','Cancellation reason is required','joining cancellation needs audit reason');
select lives_ok($$select cancel_subscription_payment((select id from subscription_payments where request_id='00000000-0000-0000-0000-000000000801'),'wrong member')$$,
 'admin cancels historical subscription without reversing books');
select is((select balance from member_subscription_years(86001) where fy_start=2010),800::numeric,'history cancellation restores subscription balance');
select lives_ok($$select cancel_joining_fee_payment((select id from joining_fee_payments where request_id='00000000-0000-0000-0000-000000000802'),'wrong member')$$,
 'admin cancels historical joining payment');
select is((select sum(amount) from joining_fee_payments where member_code=86001 and cancelled_at is null),100::numeric,'joining cancellation removes amount from paid total');
select throws_ok($$select record_subscription_payment(86001,2010,400,'2010-06-01','old receipt','00000000-0000-0000-0000-000000000801')$$,
 '22023','This payment was cancelled; use a new request ID','cancelled subscription retry cannot silently succeed');
select throws_ok($$select record_joining_fee_payment(86001,200,'2010-04-01','old joining receipt','00000000-0000-0000-0000-000000000802')$$,
 '22023','This payment was cancelled; use a new request ID','cancelled joining retry cannot silently succeed');
select is((select count(*) from vouchers),(select vouchers from accounting_baseline),'recording and cancelling history creates no vouchers');
select is((select count(*) from journals),(select journals from accounting_baseline),'recording and cancelling history creates no journals');
select is((select count(*) from daybook),(select lines from accounting_baseline),'recording and cancelling history creates no daybook lines');
set local role postgres;
select is((select sum(last_no) from voucher_counters),(select numbers from accounting_baseline),'history consumes no voucher numbers');

-- Keep cancellation of receipts posted by previous app versions consistent with accounts.
insert into account_heads(code,name,account_type,is_cash_bank) values
 (86101,'History test cash','asset',true),(86102,'History test income','income',false);
insert into financial_years(start_year) values(2012) on conflict(start_year) do update set closed_at=null;
insert into subscription_payments(member_code,fy_start,amount,paid_on,voucher_id)
select 86003,2010,50,'2012-06-01',
 (create_voucher(1,'2012-06-01',86102,'legacy subscription receipt',50,86101,gen_random_uuid())).id;
insert into joining_fee_payments(member_code,amount,paid_on,voucher_id)
select 86003,75,'2012-06-01',
 (create_voucher(1,'2012-06-01',86102,'legacy joining receipt',75,86101,gen_random_uuid())).id;
set local role authenticated;
select throws_ok($$select cancel_voucher((select voucher_id from subscription_payments where member_code=86003),'wrong route')$$,
 '22023',null,'linked subscription must be cancelled from membership');
select throws_ok($$select cancel_voucher((select voucher_id from joining_fee_payments where member_code=86003),'wrong route')$$,
 '22023',null,'linked joining receipt must be cancelled from membership');
select lives_ok($$select cancel_subscription_payment((select id from subscription_payments where member_code=86003),'legacy correction')$$,
 'legacy subscription cancellation retains its accounting reversal');
select lives_ok($$select cancel_joining_fee_payment((select id from joining_fee_payments where member_code=86003),'legacy correction')$$,
 'legacy joining cancellation retains its accounting reversal');
select is((select sum(debit-credit) from daybook where head_code=86101),0::numeric,'legacy receipts are fully reversed');
select is((select count(*) from vouchers where narration like 'legacy % receipt' and cancelled_at is not null),2::bigint,'legacy vouchers retain cancellation audit');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000ab03',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000ab03","role":"authenticated"}',true);
select throws_ok($$select record_subscription_payment(86001,2010,1,'2010-06-01',null,gen_random_uuid())$$,'42501','not authorized','viewer cannot record subscription history');
select throws_ok($$select record_joining_fee_payment(86001,1,'2010-06-01',null,gen_random_uuid())$$,'42501','not authorized','viewer cannot record joining history');
select ok(not has_function_privilege('anon','public.record_subscription_payment(integer,integer,numeric,date,text,uuid)','EXECUTE'),'anonymous users cannot call subscription history RPC');
select ok(not has_function_privilege('anon','public.record_joining_fee_payment(integer,numeric,date,text,uuid)','EXECUTE'),'anonymous users cannot call joining history RPC');
select throws_ok($$insert into subscription_payments(member_code,fy_start,amount,paid_on) values(86001,2010,1,'2010-06-01')$$,'42501',null,'clients cannot bypass subscription RPC');
select throws_ok($$insert into joining_fee_payments(member_code,amount,paid_on) values(86001,1,'2010-06-01')$$,'42501',null,'clients cannot bypass joining RPC');
select lives_ok($$set constraints all immediate$$,'legacy reversal journals remain balanced');
select * from finish();
rollback;
