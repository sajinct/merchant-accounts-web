begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email) values('00000000-0000-0000-0000-00000000af01','zero-admin@test.local');
update profiles set role='admin' where user_id='00000000-0000-0000-0000-00000000af01';
insert into account_heads(code,name,account_type,is_cash_bank) values
 (89201,'Zero cash','asset',true),(89202,'Zero scheme','liability',false);
insert into customers(code,name) values(89201,'Zero ticket 1'),(89202,'Zero ticket 2');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000af01',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000af01","role":"authenticated"}',true);
set local role authenticated;
set constraints all deferred;
select create_financial_year(2026);
create temporary table fixture(scheme integer,member integer,other_member integer);
insert into fixture(scheme) select id from create_kuri_scheme('Ticket member update test',4000,2,20.4,'2026-10-01',null,89202);
update fixture set member=(select id from add_kuri_member((select scheme from fixture),89201,1));
update fixture set other_member=(select id from add_kuri_member((select scheme from fixture),89202,2));

insert into customers(code,name) values(89203,'Replacement member');
select update_kuri_member((select member from fixture),89203,0,'Custom holder','New address','123456');
select is((select customer_code from kuri_members where id=(select member from fixture)),89203,'draft ticket can change its linked member');
select is((select ticket_no from kuri_members where id=(select member from fixture)),1::smallint,'ticket number is preserved');
select is((select holder_name from kuri_members where id=(select member from fixture)),'Custom holder','custom holder details can be updated');
select is((select revision from kuri_members where id=(select member from fixture)),1,'revision advances to protect against stale edits');
select throws_ok($$select update_kuri_member((select member from fixture),89201,0)$$,
 '22023','Ticket member changed. Reload the members before saving.','stale member updates are refused');
select throws_ok($$select update_kuri_member((select member from fixture),9999999,1)$$,
 'P0002','member not found','nonexistent linked member is refused');
select throws_ok($$select update_kuri_member((select member from fixture),89201,1,repeat('x',101))$$,
 '22023','ticket holder details are too long','oversized holder details are refused');
select update_kuri_member((select member from fixture),89201,1);
select is((select holder_name from kuri_members where id=(select member from fixture)),null::text,'custom holder details can be cleared');
select activate_kuri_scheme((select scheme from fixture));
select record_kuri_payment((select scheme from fixture),(select member from fixture),1,3800,'2026-10-03',null,
 '00000000-0000-0000-0000-00000000af11',89201);
select draw_kuri_lot((select scheme from fixture),2,(select member from fixture));
select update_kuri_member((select member from fixture),89203,2);
select is((select count(*) from kuri_members where scheme_id=(select scheme from fixture)),2::bigint,'active edit does not add or remove tickets');
select is((select balance from kuri_member_ledger((select scheme from fixture),(select member from fixture)) where installment_no=1),200::numeric,'past collections and balance stay with the ticket');
select is((select winner_member_id from kuri_lots where scheme_id=(select scheme from fixture) and installment_no=2),(select member from fixture),'lot win remains on the same ticket');
select is((select party_code from vouchers where id=(select voucher_id from kuri_payments where request_id='00000000-0000-0000-0000-00000000af11')),89201,'existing receipt voucher keeps its recorded member');
select is((select previous_details->>'customer_code' from kuri_member_history where member_id=(select member from fixture) order by id desc limit 1),'89201','audit preserves previous member');
select is((select new_details->>'customer_code' from kuri_member_history where member_id=(select member from fixture) order by id desc limit 1),'89203','audit records new member');
select record_kuri_receipt((select scheme from fixture),(select member from fixture),8200,'2026-10-03',null,
 '00000000-0000-0000-0000-00000000af12',89201);
select is((select party_code from vouchers where id=(select voucher_id from kuri_payments where receipt_id='00000000-0000-0000-0000-00000000af12' limit 1)),89203,'new receipts post to the updated member');
select mark_kuri_payout((select id from kuri_lots where scheme_id=(select scheme from fixture) and installment_no=2),'2026-10-03',89201);
select is((select party_code from vouchers where id=(select voucher_id from kuri_lots where scheme_id=(select scheme from fixture) and installment_no=2)),89203,'pending payout posts to the updated member');
select update_kuri_member((select member from fixture),89202,3);
select is((select party_code from vouchers where id=(select voucher_id from kuri_lots where scheme_id=(select scheme from fixture) and installment_no=2)),89203,'paid voucher is preserved after a later member edit');
select is((select count(*) from kuri_members where scheme_id=(select scheme from fixture) and customer_code=89202),2::bigint,'one member may hold multiple tickets');
select record_kuri_receipt((select scheme from fixture),(select other_member from fixture),12000,'2026-10-03',null,null,89201);
select draw_kuri_lot((select scheme from fixture),3,(select other_member from fixture));
select mark_kuri_payout((select id from kuri_lots where scheme_id=(select scheme from fixture) and installment_no=3),'2026-10-03',89201);
select throws_ok($$select update_kuri_member((select member from fixture),89201,4)$$,
 '22023','completed schemes cannot be changed','completed tickets are locked');
-- Editing must not prevent normal removal of an unused draft ticket.
create temporary table draft as select id as scheme from create_kuri_scheme('Draft removal',4000,2,20.4,null,null,89202);
create temporary table draft_ticket as select id from add_kuri_member((select scheme from draft),89201,1);
select update_kuri_member((select id from draft_ticket),89203,0);
select lives_ok($$select remove_kuri_member((select id from draft_ticket))$$,'edited unused draft ticket remains removable');
select is((select count(*) from kuri_member_history where member_id=(select id from draft_ticket)),1::bigint,'audit survives removal of a draft ticket');
reset role;
update profiles set role='viewer' where user_id='00000000-0000-0000-0000-00000000af01';
set local role authenticated;
select throws_ok($$select update_kuri_member((select member from fixture),89201,4)$$,
 '42501','not authorized','viewers cannot update ticket members');
select is((select count(*) from kuri_member_history),0::bigint,'viewers cannot read member change audit details');
select finish();
rollback;
