begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email) values('00000000-0000-0000-0000-00000000ac01','allocation-admin@test.local');
update profiles set role='admin' where user_id='00000000-0000-0000-0000-00000000ac01';
insert into account_heads(code,name,account_type,is_cash_bank) values
 (88001,'Allocation cash','asset',true),(88002,'Allocation scheme','liability',false),
 (88003,'Allocation bank','asset',true);
insert into customers(code,name) values(88001,'Allocation ticket 1'),(88002,'Allocation ticket 2');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000ac01',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000ac01","role":"authenticated"}',true);
set local role authenticated;
set constraints all deferred;
select create_financial_year(2026);
create temporary table fixture(scheme integer,member integer,other_member integer);
insert into fixture(scheme) select id from create_kuri_scheme('Allocation test',4000,2,20.4,'2026-10-01',null,88002);
update fixture set member=(select id from add_kuri_member((select scheme from fixture),88001,1));
update fixture set other_member=(select id from add_kuri_member((select scheme from fixture),88002,2));
select activate_kuri_scheme((select scheme from fixture));
select record_kuri_payment((select scheme from fixture),(select member from fixture),1,3800,'2026-10-02',null,
 '00000000-0000-0000-0000-00000000ac10',88001);

create temporary table receipt(result jsonb);
insert into receipt select record_kuri_receipt((select scheme from fixture),(select member from fixture),500,'2026-10-03',null,
 '00000000-0000-0000-0000-00000000ac11',88001,
 '[{"installment_no":1,"amount":200},{"installment_no":2,"amount":300}]');
select is((select result->'allocations' from receipt),
 '[{"installment_no":1,"amount":200},{"installment_no":2,"amount":300}]'::jsonb,'500 splits into 200 arrears and 300 next installment');
select is((select amount_paid from kuri_member_ledger((select scheme from fixture),(select member from fixture)) where installment_no=1),4000::numeric,'previous installment is fully paid');
select is((select balance from kuri_member_ledger((select scheme from fixture),(select member from fixture)) where installment_no=2),3700::numeric,'next installment has 3700 remaining');
select is((select count(distinct voucher_id) from kuri_payments where receipt_id='00000000-0000-0000-0000-00000000ac11'),1::bigint,'allocations share exactly one receipt voucher');
select is((select total_amount from vouchers where id=(select (result->>'voucher_id')::bigint from receipt)),500::numeric,'the accounting receipt is 500');
select is((select sum(debit) from daybook where journal_id in(select id from journals where voucher_id=(select (result->>'voucher_id')::bigint from receipt))),500::numeric,'cash is debited only once for 500');
select is((select amount from kuri_payment_history((select scheme from fixture),(select member from fixture)) where receipt_id='00000000-0000-0000-0000-00000000ac11'),500::numeric,'history shows one combined receipt');

select record_kuri_receipt((select scheme from fixture),(select member from fixture),500,'2026-10-03',null,
 '00000000-0000-0000-0000-00000000ac11',88001,
 '[{"installment_no":1,"amount":200},{"installment_no":2,"amount":300}]');
select is((select count(*) from kuri_payments where receipt_id='00000000-0000-0000-0000-00000000ac11'),2::bigint,'retry adds no allocation or voucher');
select record_kuri_receipt((select scheme from fixture),(select member from fixture),500,'2026-10-03',null,
 '00000000-0000-0000-0000-00000000ac11',88001,'[{"installment_no":2,"amount":500}]');
select is((select count(*) from kuri_payments where receipt_id='00000000-0000-0000-0000-00000000ac11'),2::bigint,'refreshing preview after a lost response cannot duplicate the same receipt');
select throws_ok($$select record_kuri_receipt((select scheme from fixture),(select member from fixture),500,'2026-10-03',null,'00000000-0000-0000-0000-00000000ac11',88003)$$,
 '22023','Request ID was already used for a different receipt','retry cannot change bank account');
select throws_ok($$select record_kuri_receipt((select scheme from fixture),(select member from fixture),8000,'2026-10-03')$$,
 '22023','receipt exceeds the remaining balance for this ticket','overpayment is refused');
select throws_ok($$select record_kuri_receipt((select scheme from fixture),(select member from fixture),1.001,'2026-10-03')$$,
 '22023','amount must be positive with at most two decimal places','fractions of a paise are refused');
select throws_ok($$select record_kuri_receipt((select scheme from fixture),(select member from fixture),500,'2026-10-03',null,null,88001,'[{"installment_no":1,"amount":500}]')$$,
 '22023','Ticket balances changed. Refresh balances and review the allocation before saving.','stale preview cannot silently change allocation');
select is((select count(*) from vouchers where reference_no like 'KURI-'||(select scheme from fixture)::text||'-%'),2::bigint,'failed requests create no accounting receipts');

-- An error in accounting must roll back every allocation too.
select throws_ok($$select record_kuri_receipt((select scheme from fixture),(select member from fixture),100,'2026-10-03',null,'00000000-0000-0000-0000-00000000ac12',88002)$$,
 'P0001',null,'invalid cash account rolls back the receipt');
select is((select count(*) from kuri_payments where receipt_id='00000000-0000-0000-0000-00000000ac12'),0::bigint,'posting failure leaves no allocations');

-- Cancel from the second allocation, as even an older client may do.
select cancel_kuri_payment((select max(id) from kuri_payments where receipt_id='00000000-0000-0000-0000-00000000ac11'),'Test cancellation');
select is((select count(*) from kuri_payments where receipt_id='00000000-0000-0000-0000-00000000ac11' and cancelled_at is not null),2::bigint,'cancelling one allocation cancels the whole receipt');
select is((select balance from kuri_member_ledger((select scheme from fixture),(select member from fixture)) where installment_no=1),200::numeric,'cancellation restores previous installment balance');
select is((select balance from kuri_member_ledger((select scheme from fixture),(select member from fixture)) where installment_no=2),4000::numeric,'cancellation restores next installment balance');
select ok((select cancelled_at is not null from vouchers where id=(select (result->>'voucher_id')::bigint from receipt)),'linked accounting voucher is cancelled');
select is((select sum(debit-credit) from daybook where head_code=88001),3800::numeric,'accounting reversal leaves only the original 3800 receipt');
select throws_ok($$select record_kuri_receipt((select scheme from fixture),(select member from fixture),500,'2026-10-03',null,'00000000-0000-0000-0000-00000000ac11',88001)$$,
 '22023','This receipt was cancelled; use a new request ID','cancelled receipt cannot be replayed');

-- Ticket 2 has never paid: a receipt may cover whole and partial future installments.
select record_kuri_receipt((select scheme from fixture),(select other_member from fixture),8000.10,'2026-10-03',null,
 '00000000-0000-0000-0000-00000000ac13',88001);
select is((select balance from kuri_member_ledger((select scheme from fixture),(select other_member from fixture)) where installment_no=3),3999.90::numeric,'advance receipt spans three installments exactly');
select is((select balance from kuri_receipt_tickets((select scheme from fixture)) where member_id=(select other_member from fixture)),3999.90::numeric,'ticket list includes future installment balance');

reset role;
update public.profiles set role='viewer' where user_id='00000000-0000-0000-0000-00000000ac01';
set local role authenticated;
select throws_ok($$select record_kuri_receipt((select scheme from fixture),(select member from fixture),100,'2026-10-03')$$,
 '42501','not authorized','viewers cannot record receipts');
select throws_ok($$select cancel_kuri_payment((select min(id) from kuri_payments where receipt_id='00000000-0000-0000-0000-00000000ac13'),'Forbidden')$$,
 '42501','not authorized','viewers cannot cancel receipts');
select finish();
rollback;
