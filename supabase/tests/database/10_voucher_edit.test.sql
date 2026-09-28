-- Admin voucher edits, and the day book / ledger listing every account of a voucher.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-00000000ed01','edit-admin@test.local'),
 ('00000000-0000-0000-0000-00000000ed02','edit-accountant@test.local');
update profiles set role='admin' where user_id='00000000-0000-0000-0000-00000000ed01';
update profiles set role='accountant' where user_id='00000000-0000-0000-0000-00000000ed02';
insert into account_heads(code,name,account_type,is_cash_bank) values
 (87001,'E cash','asset',true),(87002,'E bank','asset',true),
 (87003,'E membership','income',false),(87004,'E donation','income',false),
 (87005,'E late fee','income',false),(87006,'E salary','expense',false),
 (87007,'E rent','expense',false),(87008,'E salary payable','liability',false),
 (87009,'E rent payable','liability',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000ed01',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000ed01","role":"authenticated"}',true);
set local role authenticated;
set constraints all deferred;
select lives_ok($$select create_financial_year(2026)$$,'the posting year is open');

-- One cash receipt for two income heads.
select lives_ok($$select post_voucher(1,'2026-09-20','EDIT/1',null,'Dues',87001,
 '[{"account":87003,"amount":1000,"description":"Membership"},
   {"account":87004,"amount":300,"description":"Donation"}]'::jsonb,true,
 '00000000-0000-0000-0000-0000000000e1')$$,'receipt posts');

-- Day book: one row per income head, each for its own amount.
select results_eq(
 $$select head_name, credit, narration from rpt_daybook('2026-09-20','2026-09-20')
    where voucher_ref=(select 'R-'||voucher_no from vouchers where reference_no='EDIT/1') order by seq$$,
 $$values ('E membership'::text,1000::numeric,'Membership'::text),('E donation',300,'Donation')$$,
 'day book lists every account of the receipt');
-- Ledger of the cash account: the same split.
select results_eq(
 $$select contra_name, debit from rpt_ledger(87001,'2026-09-20','2026-09-20')
    where row_kind='entry' order by seq$$,
 $$values ('E membership'::text,1000::numeric),('E donation',300)$$,
 'cash ledger lists every account of the receipt');
select is((select balance from rpt_ledger(87001,'2026-09-20','2026-09-20') order by seq desc limit 1),
 -1300::numeric,'the running balance ends at the voucher total');
-- Ledger of an income head: its single counterpart.
select is((select contra_name from rpt_ledger(87003,'2026-09-20','2026-09-20') where row_kind='entry'),
 'E cash','income ledger names the cash account');

-- Several against several cannot be paired, so every account is named on one row.
select lives_ok($$select post_voucher(4,'2026-09-20',null,null,'Accruals',null,
 '[{"account":87006,"debit":700},{"account":87007,"debit":300},
   {"account":87008,"credit":600},{"account":87009,"credit":400}]'::jsonb,false,
 '00000000-0000-0000-0000-0000000000e2')$$,'many-to-many journal posts');
select is((select contra_name from rpt_ledger(87006,'2026-09-20','2026-09-20') where row_kind='entry'),
 'E salary payable, E rent payable','many-to-many names every account');
select is((select debit from rpt_ledger(87006,'2026-09-20','2026-09-20') where row_kind='entry'),
 700::numeric,'many-to-many keeps the line amount');

-- Only admins edit.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000ed02',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000ed02","role":"authenticated"}',true);
select throws_ok($$select update_voucher((select id from vouchers where reference_no='EDIT/1'),'2026-09-20',
 'EDIT/1',null,'Dues',87001,'[{"account":87003,"amount":1}]'::jsonb,true)$$,
 '42501','not authorized','an accountant cannot edit a voucher');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000ed01',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000ed01","role":"authenticated"}',true);

-- Edit: new date, bank instead of cash, changed amounts and a new head.
select lives_ok($$select update_voucher((select voucher_id from journals where request_id='00000000-0000-0000-0000-0000000000e1'),'2026-09-21','EDIT/1A',null,'Dues corrected',87002,
 '[{"account":87003,"amount":1200,"description":"Membership"},{"account":87005,"amount":50}]'::jsonb,true)$$,
 'admin edits the receipt');
select is((select voucher_no+1 from vouchers where id=(select voucher_id from journals where request_id='00000000-0000-0000-0000-0000000000e1')),
 next_voucher_no(1),'the voucher keeps its number');
select is((select total_amount from vouchers where id=(select voucher_id from journals where request_id='00000000-0000-0000-0000-0000000000e1')),1250::numeric,'header total follows the lines');
select is((select voucher_date from vouchers where id=(select voucher_id from journals where request_id='00000000-0000-0000-0000-0000000000e1')),'2026-09-21'::date,'header date changes');
select is((select reference_no from vouchers where id=(select voucher_id from journals where request_id='00000000-0000-0000-0000-0000000000e1')),'EDIT/1A','reference changes');
select ok((select modified_at is not null from vouchers where id=(select voucher_id from journals where request_id='00000000-0000-0000-0000-0000000000e1')),'the edit is stamped');
select is((select entry_date from journals where voucher_id=(select voucher_id from journals where request_id='00000000-0000-0000-0000-0000000000e1')),'2026-09-21'::date,'journal date changes');
select is((select count(*)::integer from daybook d join journals j on j.id=d.journal_id
 where j.voucher_id=(select voucher_id from journals where request_id='00000000-0000-0000-0000-0000000000e1') and d.tran_date='2026-09-21'),3,'lines are rewritten on the new date');
select is((select coalesce(sum(debit-credit),0) from daybook where head_code=87001),0::numeric,'cash no longer carries the receipt');
select is((select sum(debit-credit) from daybook where head_code=87002),1250::numeric,'bank carries the new total');
select is((select sum(credit-debit) from daybook where head_code=87004),null::numeric,'the removed head has no lines');
select is((select narration from daybook where head_code=87005),'Dues corrected','a blank description takes the narration');
select is((select count(distinct voucher_ref)::integer from daybook d join journals j on j.id=d.journal_id
 where j.voucher_id=(select voucher_id from journals where request_id='00000000-0000-0000-0000-0000000000e1')),1,'lines keep the voucher reference');
select is((select (previous->'voucher'->>'total_amount')::numeric from voucher_revisions
 where voucher_id=(select voucher_id from journals where request_id='00000000-0000-0000-0000-0000000000e1')),1300::numeric,'the previous version is kept');
select is((select jsonb_array_length(previous->'lines') from voucher_revisions
 where voucher_id=(select voucher_id from journals where request_id='00000000-0000-0000-0000-0000000000e1')),3,'with its previous lines');

-- Edits still follow the voucher rules.
select throws_ok($$select update_voucher((select voucher_id from journals where request_id='00000000-0000-0000-0000-0000000000e1'),'2026-09-21',null,null,'x',87002,
 '[{"account":87002,"amount":10}]'::jsonb,true)$$,
 'P0001','The cash/bank side is added for you; use other accounts for the lines','edit rejects the cash head as a line');
select throws_ok($$select update_voucher((select voucher_id from journals where request_id='00000000-0000-0000-0000-0000000000e1'),'2020-09-21',null,null,'x',87002,
 '[{"account":87003,"amount":10}]'::jsonb,true)$$,
 'P0001','Create financial year 2020-21 before posting','edit rejects a date outside an open year');

-- Posted lines stay immutable outside an edit.
set local role postgres;
select throws_ok($$delete from daybook where head_code=87003$$,
 'P0001','Posted entries cannot be changed or deleted; create a reversal','direct deletes are still refused');
set local role authenticated;

-- A cancelled voucher is history and cannot be edited.
select lives_ok($$select cancel_voucher((select voucher_id from journals where request_id='00000000-0000-0000-0000-0000000000e1'),'entered in error')$$,'receipt cancelled');
select throws_ok($$select update_voucher((select voucher_id from journals where request_id='00000000-0000-0000-0000-0000000000e1'),'2026-09-21',null,null,'x',87002,
 '[{"account":87003,"amount":10}]'::jsonb,true)$$,
 'P0001','A cancelled voucher cannot be edited','cancelled voucher refused');

select lives_ok($$set constraints all immediate$$,'every journal passes the balance checks at commit');

select * from finish();
rollback;
