-- Unified voucher module: one engine for receipts, payments, contras and journals.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-00000000fc01','voucher-admin@test.local');
update profiles set role='admin' where user_id='00000000-0000-0000-0000-00000000fc01';
insert into account_heads(code,name,account_type,is_cash_bank) values
 (85001,'V cash','asset',true),(85002,'V bank','asset',true),
 (85003,'V membership fee','income',false),(85004,'V donation','income',false),
 (85005,'V late fee','income',false),(85006,'V electricity','expense',false),
 (85007,'V internet','expense',false),(85008,'V salary payable','liability',false),
 (85009,'V depreciation','expense',false);
insert into account_heads(code,name,account_type,is_cash_bank,is_group) values
 (85010,'V indirect expenses','expense',false,true);
insert into account_heads(code,name,account_type,is_cash_bank,is_active) values
 (85011,'V closed account','expense',false,false);
insert into customers(code,name) values(85001,'V member');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000fc01',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000fc01","role":"authenticated"}',true);
set local role authenticated;
set constraints all deferred;
select lives_ok($$select create_financial_year(2026)$$,'the posting year is open');

-- Receipt, simplified: many income heads, one cash debit the engine writes.
select lives_ok($$select post_voucher(1,'2026-09-16','RCPT/1',85001,'Annual dues',85001,
 '[{"account":85003,"amount":1000,"description":"Annual membership"},
   {"account":85004,"amount":300,"description":"Donation"},
   {"account":85005,"amount":200,"description":"Late payment"}]'::jsonb,true,
 '00000000-0000-0000-0000-0000000000a1')$$,'simplified receipt posts');
select is((select total_amount from vouchers where reference_no='RCPT/1'),1500::numeric,'receipt totals its heads');
select is((select count(*)::integer from daybook d join journals j on j.id=d.journal_id
 join vouchers v on v.id=j.voucher_id where v.reference_no='RCPT/1'),4,'one line per head plus cash');
select is((select sum(debit-credit) from daybook where head_code=85001),1500::numeric,'cash is debited with the total');
select is((select sum(credit-debit) from daybook where head_code=85003),1000::numeric,'membership fee is credited');
select is((select sum(credit-debit) from daybook where head_code=85004),300::numeric,'donation is credited');
select is((select narration from daybook where head_code=85005),'Late payment','line description is kept');
select is((select party_code from vouchers where reference_no='RCPT/1'),85001,'party is recorded on the header');
select is((select line_no from daybook where head_code=85003),2::smallint,'cash leads a receipt');

-- Retrying the same request returns the same voucher instead of a second one.
select lives_ok($$select post_voucher(1,'2026-09-16','RCPT/1',85001,'Annual dues',85001,
 '[{"account":85003,"amount":1000,"description":"Annual membership"},
   {"account":85004,"amount":300,"description":"Donation"},
   {"account":85005,"amount":200,"description":"Late payment"}]'::jsonb,true,
 '00000000-0000-0000-0000-0000000000a1')$$,'retry returns the first voucher');
select is((select count(*)::integer from vouchers where voucher_type=1),1,'retry does not post twice');
select throws_ok($$select post_voucher(1,'2026-09-16','RCPT/1',85001,'Annual dues',85001,
 '[{"account":85003,"amount":1100}]'::jsonb,true,'00000000-0000-0000-0000-0000000000a1')$$,
 'P0001','Request ID was already used','a changed retry is rejected');

-- Payment, simplified: many expense heads, one bank credit.
select lives_ok($$select post_voucher(2,'2026-09-16',null,null,'Monthly bills',85002,
 '[{"account":85006,"amount":4000},{"account":85007,"amount":1500}]'::jsonb,true,
 '00000000-0000-0000-0000-0000000000a2')$$,'simplified payment posts');
select is((select sum(credit-debit) from daybook where head_code=85002),5500::numeric,'bank is credited with the total');
select is((select sum(debit-credit) from daybook where head_code=85006),4000::numeric,'electricity is debited');
select is((select line_no from daybook where head_code=85002),3::smallint,'cash closes a payment');

-- Contra: cash and bank only.
select lives_ok($$select post_voucher(3,'2026-09-16',null,null,'Cash deposited',null,
 '[{"account":85002,"debit":500},{"account":85001,"credit":500}]'::jsonb,false,
 '00000000-0000-0000-0000-0000000000a3')$$,'contra transfers cash to bank');
select throws_ok($$select post_voucher(3,'2026-09-16',null,null,'bad contra',null,
 '[{"account":85002,"debit":100},{"account":85003,"credit":100}]'::jsonb,false,gen_random_uuid())$$,
 'P0001','A contra voucher moves money between cash and bank accounts only','contra rejects a non-cash head');

-- Journal: general adjustments, and no cash unless an admin allows it.
select lives_ok($$select post_voucher(4,'2026-09-16',null,null,'Salary accrual',null,
 '[{"account":85009,"debit":250,"description":"Depreciation"},{"account":85008,"credit":250}]'::jsonb,false,
 '00000000-0000-0000-0000-0000000000a4')$$,'journal posts an adjustment');
select throws_ok($$select post_voucher(4,'2026-09-16',null,null,'cash journal',null,
 '[{"account":85001,"debit":10},{"account":85008,"credit":10}]'::jsonb,false,gen_random_uuid())$$,
 'P0001','Journal vouchers cannot use cash or bank accounts; use a receipt, payment or contra',
 'journal refuses cash by default');
update company_settings set journal_allows_cash=true;
select lives_ok($$select post_voucher(4,'2026-09-16',null,null,'allowed cash journal',null,
 '[{"account":85001,"debit":10},{"account":85008,"credit":10}]'::jsonb,false,
 '00000000-0000-0000-0000-0000000000a5')$$,'journal accepts cash once enabled');

-- Validation
select throws_ok($$select post_voucher(4,'2026-09-16',null,null,'unbalanced',null,
 '[{"account":85009,"debit":100},{"account":85008,"credit":90}]'::jsonb,false,gen_random_uuid())$$,
 'P0001','Total debits must equal total credits','unbalanced entry rejected');
select throws_ok($$select post_voucher(4,'2026-09-16',null,null,'single line',null,
 '[{"account":85009,"debit":100}]'::jsonb,false,gen_random_uuid())$$,
 'P0001','Date, request ID and between 2 and 200 journal lines are required','one line rejected');
select throws_ok($$select post_voucher(1,'2026-09-16',null,null,'zero',85001,
 '[{"account":85003,"amount":0}]'::jsonb,true,gen_random_uuid())$$,
 'P0001','Enter an amount greater than zero','zero amount rejected');
select throws_ok($$select post_voucher(1,'2026-09-16',null,null,'cash twice',85001,
 '[{"account":85001,"amount":10}]'::jsonb,true,gen_random_uuid())$$,
 'P0001','The cash/bank side is added for you; use other accounts for the lines','cash head rejected in simplified mode');
select throws_ok($$select post_voucher(2,'2026-09-16',null,null,'not cash',85003,
 '[{"account":85006,"amount":10}]'::jsonb,true,gen_random_uuid())$$,
 'P0001','Choose a cash/bank account','income account rejected as the cash side');
select throws_ok($$select post_voucher(4,'2026-09-16',null,null,'group head',null,
 '[{"account":85010,"debit":10},{"account":85008,"credit":10}]'::jsonb,false,gen_random_uuid())$$,
 'P0001','Entries cannot be posted to a retired or group account','group account rejected');
select throws_ok($$select post_voucher(4,'2026-09-16',null,null,'retired head',null,
 '[{"account":85011,"debit":10},{"account":85008,"credit":10}]'::jsonb,false,gen_random_uuid())$$,
 'P0001','Entries cannot be posted to a retired or group account','retired account rejected');
select throws_ok($$select post_voucher(1,'2020-09-16',null,null,'closed period',85001,
 '[{"account":85003,"amount":10}]'::jsonb,true,gen_random_uuid())$$,
 'P0001','Create financial year 2020-21 before posting','date outside an open year rejected');
select throws_ok($$select post_voucher(1,'2026-09-16',null,null,'advanced receipt without cash',null,
 '[{"account":85003,"debit":10},{"account":85004,"credit":10}]'::jsonb,false,gen_random_uuid())$$,
 'P0001','A receipt must debit at least one cash or bank account','receipt without a cash debit rejected');

-- Numbering is one sequence per type.
select is((select voucher_no from vouchers where reference_no='RCPT/1'),1,'receipts number from one');
select is((select voucher_no from vouchers where voucher_type=3),1,'contras have their own sequence');
select is(next_voucher_no(1),2,'the next receipt number is shown before saving');

-- Cancellation keeps the voucher and reverses it.
select lives_ok($$select cancel_voucher((select id from vouchers where reference_no='RCPT/1'),'entered twice')$$,
 'receipt cancelled');
select is((select status from vouchers where reference_no='RCPT/1'),'cancelled','header is marked cancelled');
select ok((select is_cancelled from vouchers where reference_no='RCPT/1'),'cancelled flag follows the timestamp');
select is((select count(*)::integer from vouchers where reference_no='RCPT/1'),1,'the voucher is retained');
select is((select sum(credit-debit) from daybook where head_code=85003),0::numeric,'reversal clears the income head');
-- Retiring an account stops new entries but must never trap an existing voucher.
update account_heads set is_active=false where code=85009;
select lives_ok($$select cancel_voucher((select v.id from vouchers v join journals j on j.voucher_id=v.id
 where j.request_id='00000000-0000-0000-0000-0000000000a4'),'accrued twice')$$,
 'a voucher on a retired account can still be cancelled');
select is((select sum(debit-credit) from daybook where head_code=85009),0::numeric,'its reversal clears the account');

select lives_ok($$set constraints all immediate$$,'every voucher passes the balance checks at commit');
select is((select sum(debit)-sum(credit) from rpt_trial_balance('2026-09-16')),0::numeric,'trial balance balances');

select * from finish();
rollback;
