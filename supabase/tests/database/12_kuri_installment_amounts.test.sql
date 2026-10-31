begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email) values('00000000-0000-0000-0000-00000000ad01','amount-admin@test.local');
update profiles set role='admin' where user_id='00000000-0000-0000-0000-00000000ad01';
insert into account_heads(code,name,account_type,is_cash_bank) values
 (89001,'Amount cash','asset',true),(89002,'Amount scheme','liability',false);
insert into customers(code,name) values(89001,'Amount ticket 1'),(89002,'Amount ticket 2');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000ad01',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000ad01","role":"authenticated"}',true);
set local role authenticated;
set constraints all deferred;
select create_financial_year(2026);
create temporary table fixture(scheme integer,member integer,other_member integer);
insert into fixture(scheme) select id from create_kuri_scheme('Custom collection test',4000,2,20.4,'2026-10-01',null,89002);
update fixture set member=(select id from add_kuri_member((select scheme from fixture),89001,1));
update fixture set other_member=(select id from add_kuri_member((select scheme from fixture),89002,2));

select is((select amount_due from kuri_installment_amount_schedule((select scheme from fixture)) where installment_no=2),4000::numeric,'schedule defaults to the base per-ticket amount');
select set_kuri_installment_amount((select scheme from fixture),2,4500,'Draft customization',4000);
select is(kuri_installment_due((select scheme from fixture),2),4500::numeric,'draft installment can be customized');
select is(kuri_scheme_total_due((select scheme from fixture)),12500::numeric,'full ticket dues include custom amount');
select is((select payout_amount from kuri_payout_schedule((select scheme from fixture)) where installment_no=2),6368::numeric,'collection customization leaves lot payouts unchanged');
select set_kuri_installment_amount((select scheme from fixture),2,null,'Restore default',4500);
select is(kuri_installment_due((select scheme from fixture),2),4000::numeric,'reset restores the base collection amount');
select is((select count(*) from kuri_installment_amounts where scheme_id=(select scheme from fixture)),0::bigint,'reset removes the override');
select is((select count(*) from kuri_installment_amount_history where scheme_id=(select scheme from fixture)),2::bigint,'changes and resets are audited');

select activate_kuri_scheme((select scheme from fixture));
select record_kuri_payment((select scheme from fixture),(select member from fixture),1,3800,'2026-10-02',null,
 '00000000-0000-0000-0000-00000000ad10',89001);
select throws_ok($$select set_kuri_installment_amount((select scheme from fixture),1,4500)$$,
 '22023','only future installments without receipts or lot draws can be changed','an installment already used by a receipt is locked');
select set_kuri_installment_amount((select scheme from fixture),2,3000,'Future amount adjusted',4000);
select is((select amount_due from kuri_member_ledger((select scheme from fixture),(select member from fixture)) where installment_no=2),3000::numeric,'member ledger uses the custom future amount');
select is((select amount_due from kuri_collection_status((select scheme from fixture),2) where member_id=(select member from fixture)),3000::numeric,'collection status uses the custom amount');
select is((select balance from kuri_defaulters((select scheme from fixture),2) where member_id=(select member from fixture)),3000::numeric,'defaulters use the custom amount');
select is((select amount_due from kuri_receipt_tickets((select scheme from fixture)) where member_id=(select member from fixture)),11000::numeric,'receipt ticket summary totals the custom schedule');
select throws_ok($$select set_kuri_installment_amount((select scheme from fixture),2,3500,null,4000)$$,
 '22023','Installment amount changed. Reload the schedule before saving.','a stale edit cannot overwrite another amount change');
select throws_ok($$select set_kuri_installment_amount((select scheme from fixture),2,0)$$,
 '22023','amount must be positive with at most two decimal places','zero amount is refused');
select throws_ok($$select set_kuri_installment_amount((select scheme from fixture),2,1.001)$$,
 '22023','amount must be positive with at most two decimal places','fractional paise are refused');
select throws_ok($$select set_kuri_installment_amount((select scheme from fixture),4,3000)$$,
 '22023','invalid installment number','out-of-range installments are refused');
select throws_ok($$select record_kuri_receipt((select scheme from fixture),(select member from fixture),4500,'2026-10-03',null,null,89001,'[{"installment_no":1,"amount":200},{"installment_no":2,"amount":4000},{"installment_no":3,"amount":300}]')$$,
 '22023','Ticket balances changed. Refresh balances and review the allocation before saving.','a preview made before a collection amount edit cannot be silently posted');

create temporary table receipt(result jsonb);
insert into receipt select record_kuri_receipt((select scheme from fixture),(select member from fixture),500,'2026-10-03',null,
 '00000000-0000-0000-0000-00000000ad11',89001,'[{"installment_no":1,"amount":200},{"installment_no":2,"amount":300}]');
select is((select balance from kuri_member_ledger((select scheme from fixture),(select member from fixture)) where installment_no=2),2700::numeric,'automatic receipt allocation uses the custom next-installment balance');
select is((select amount from kuri_payments where request_id='00000000-0000-0000-0000-00000000ad10'),3800::numeric,'past receipt amounts are preserved');
select throws_ok($$select set_kuri_installment_amount((select scheme from fixture),2,3200)$$,
 '22023','only future installments without receipts or lot draws can be changed','advance allocations lock the installment they reach');
select throws_ok($$select record_kuri_payment((select scheme from fixture),(select other_member from fixture),2,3000.01,'2026-10-03',null,null,89001)$$,
 '22023',null,'specific-installment receipts cannot exceed the custom amount');
select record_kuri_payment((select scheme from fixture),(select other_member from fixture),2,3000,'2026-10-03',null,
 '00000000-0000-0000-0000-00000000ad12',89001);
select set_kuri_installment_amount((select scheme from fixture),3,2500,'Last installment adjusted',4000);
select is(record_kuri_bulk_payment((select scheme from fixture),3,'2026-10-03',null,89001),2,'bulk collection records the customized amount for both tickets');
select is((select sum(amount) from kuri_payments where scheme_id=(select scheme from fixture) and installment_no=3),5000::numeric,'bulk receipts total 2 times 2500, not the base amount');
select is((select can_edit from kuri_installment_amount_schedule((select scheme from fixture)) where installment_no=3),false,'schedule reflects locked collected installments');

select record_kuri_receipt((select scheme from fixture),(select member from fixture),2700,'2026-10-03',null,
 '00000000-0000-0000-0000-00000000ad13',89001);
select record_kuri_receipt((select scheme from fixture),(select other_member from fixture),4000,'2026-10-03',null,
 '00000000-0000-0000-0000-00000000ad14',89001);
select draw_kuri_lot((select scheme from fixture),2,(select member from fixture));
select draw_kuri_lot((select scheme from fixture),3,(select other_member from fixture));
select mark_kuri_payout((select id from kuri_lots where scheme_id=(select scheme from fixture) and installment_no=2),'2026-10-03',89001);
select mark_kuri_payout((select id from kuri_lots where scheme_id=(select scheme from fixture) and installment_no=3),'2026-10-03',89001);
select is((select status from kuri_schemes where id=(select scheme from fixture)),'completed','completion uses customized total dues');
select throws_ok($$select set_kuri_installment_amount((select scheme from fixture),3,2600)$$,
 '22023','completed schemes cannot be changed','completed schemes are locked');

-- A drawn installment and earlier gaps are locked even without any collection.
insert into fixture(scheme) select id from create_kuri_scheme('Draw lock test',4000,2,20.4,null,null,89002);
update fixture set member=(select id from add_kuri_member((select max(scheme) from fixture),89001,1)) where scheme=(select max(scheme) from fixture);
select add_kuri_member((select max(scheme) from fixture),89002,2);
select activate_kuri_scheme((select max(scheme) from fixture));
select draw_kuri_lot((select max(scheme) from fixture),2,(select member from fixture order by scheme desc limit 1));
select throws_ok($$select set_kuri_installment_amount((select max(scheme) from fixture),1,4500)$$,
 '22023','only future installments without receipts or lot draws can be changed','past gaps before the last lot draw stay locked');
select lives_ok($$select set_kuri_installment_amount((select max(scheme) from fixture),3,4500)$$,'future installments remain editable after a draw');

reset role;
update public.profiles set role='viewer' where user_id='00000000-0000-0000-0000-00000000ad01';
set local role authenticated;
select throws_ok($$select set_kuri_installment_amount((select max(scheme) from fixture),3,4600)$$,
 '42501','not authorized','viewers cannot alter installment amounts');
select is(kuri_installment_due((select max(scheme) from fixture),3),4500::numeric,'viewers can still read scheduled collection amounts');
select finish();
rollback;
