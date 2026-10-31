begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email) values('00000000-0000-0000-0000-00000000ae01','payout-admin@test.local');
update profiles set role='admin' where user_id='00000000-0000-0000-0000-00000000ae01';
insert into account_heads(code,name,account_type,is_cash_bank) values
 (89101,'Payout cash','asset',true),(89102,'Payout scheme','liability',false);
insert into customers(code,name) values(89101,'Payout ticket 1'),(89102,'Payout ticket 2');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000ae01',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000ae01","role":"authenticated"}',true);
set local role authenticated;
set constraints all deferred;
select create_financial_year(2026);
create temporary table fixture(scheme integer,member integer,other_member integer);
insert into fixture(scheme) select id from create_kuri_scheme('Custom payout test',4000,2,20.4,'2026-10-01',null,89102);
update fixture set member=(select id from add_kuri_member((select scheme from fixture),89101,1));
update fixture set other_member=(select id from add_kuri_member((select scheme from fixture),89102,2));
select is(kuri_calculated_payout((select scheme from fixture),2),6368::numeric,'base first payout is calculated correctly');
select is(kuri_calculated_payout((select scheme from fixture),3),8000::numeric,'base last payout is calculated correctly');
select set_kuri_payout_amount((select scheme from fixture),2,7000,'Draft customization',6368);
select is((select payout_amount from kuri_payout_schedule((select scheme from fixture)) where installment_no=2),7000::numeric,'existing schedule RPC uses the custom payout');
select is((select is_custom from kuri_payout_amount_schedule((select scheme from fixture)) where installment_no=2),true,'metadata identifies custom payout');
select is(kuri_installment_due((select scheme from fixture),2),4000::numeric,'payout override leaves collection dues unchanged');
select set_kuri_payout_amount((select scheme from fixture),2,null,'Reset',7000);
select is((select payout_amount from kuri_payout_schedule((select scheme from fixture)) where installment_no=2),6368::numeric,'reset restores calculated payout');
select is((select count(*) from kuri_payout_amounts),0::bigint,'reset removes payout override');
select is((select count(*) from kuri_payout_amount_history),2::bigint,'changes and resets are audited');
select activate_kuri_scheme((select scheme from fixture));
select set_kuri_installment_amount((select scheme from fixture),3,4500,null,4000);
select is(kuri_calculated_payout((select scheme from fixture),3),8000::numeric,'collection override does not recalculate payouts');
select set_kuri_payout_amount((select scheme from fixture),2,7100,'Active customization',6368);
select throws_ok($$select set_kuri_payout_amount((select scheme from fixture),2,7200,null,6368)$$,
 '22023','Payout amount changed. Reload the schedule before saving.','stale payout changes are rejected');
select throws_ok($$select set_kuri_payout_amount((select scheme from fixture),1,7000)$$,
 '22023','choose an installment with a lot payout','collection-only installment has no payout');
select throws_ok($$select set_kuri_payout_amount((select scheme from fixture),4,7000)$$,
 '22023','choose an installment with a lot payout','out-of-range payout is rejected');
select throws_ok($$select set_kuri_payout_amount((select scheme from fixture),2,0)$$,
 '22023','amount must be positive with at most two decimal places','zero payout is rejected');
select throws_ok($$select set_kuri_payout_amount((select scheme from fixture),2,1.001)$$,
 '22023','amount must be positive with at most two decimal places','fractional paise payout is rejected');
select draw_kuri_lot((select scheme from fixture),2,(select member from fixture));
select is((select payout_amount from kuri_lots where scheme_id=(select scheme from fixture) and installment_no=2),7100::numeric,'lot draw stores the customized award');
select is((select can_edit from kuri_payout_amount_schedule((select scheme from fixture)) where installment_no=2),false,'pending payout is locked after draw');
select throws_ok($$select set_kuri_payout_amount((select scheme from fixture),2,null)$$,
 '22023','only future payouts after the last lot draw can be changed','drawn payout cannot be reset');
select mark_kuri_payout((select id from kuri_lots where scheme_id=(select scheme from fixture) and installment_no=2),'2026-10-03',89101);
select is((select total_paid_out from kuri_scheme_detail((select scheme from fixture))),7100::numeric,'payment posts the customized payout');
select set_kuri_payout_amount((select scheme from fixture),3,7500,'Future payout',8000);
select draw_kuri_lot((select scheme from fixture),3,(select other_member from fixture));
select mark_kuri_payout((select id from kuri_lots where scheme_id=(select scheme from fixture) and installment_no=3),'2026-10-03',89101);
select is((select total_paid_out from kuri_scheme_detail((select scheme from fixture))),14600::numeric,'both customized payouts reach accounting totals');
select is((select payout_amount from kuri_payout_schedule((select scheme from fixture)) where installment_no=2),7100::numeric,'previous award remains unchanged');
select record_kuri_receipt((select scheme from fixture),(select member from fixture),12500,'2026-10-03',null,null,89101);
select record_kuri_receipt((select scheme from fixture),(select other_member from fixture),12500,'2026-10-03',null,null,89101);
select is((select status from kuri_schemes where id=(select scheme from fixture)),'completed','custom payouts and dues support normal completion');
select throws_ok($$select set_kuri_payout_amount((select scheme from fixture),3,7600)$$,
 '22023','completed schemes cannot be changed','completed scheme cannot be edited');
reset role;
update public.profiles set role='viewer' where user_id='00000000-0000-0000-0000-00000000ae01';
set local role authenticated;
select throws_ok($$select set_kuri_payout_amount((select scheme from fixture),3,7600)$$,
 '42501','not authorized','viewers cannot change payouts');
select is((select payout_amount from kuri_payout_schedule((select scheme from fixture)) where installment_no=3),7500::numeric,'viewer can read the saved payout');
select finish();
rollback;
