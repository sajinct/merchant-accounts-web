begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email) values('00000000-0000-0000-0000-00000000ms01','member-sort@test.local');
update profiles set role='admin' where user_id='00000000-0000-0000-0000-00000000ms01';
insert into account_heads(code,name,account_type,is_cash_bank) values
 (84101,'Sort test cash','asset',true),(84102,'Sort test subscription','income',false);
update company_settings set subscription_head_code=84102;
insert into financial_years(start_year) values(2090) on conflict do nothing;
insert into subscription_years(fy_start,fee) values(2090,500) on conflict(fy_start) do update set fee=500;

-- A dev project may already hold members, so the dues figures are checked as a
-- change against what was owed before these four were added.
create temporary table dues_baseline as select total,members from subscription_dues_summary(2090);
grant select on dues_baseline to authenticated;

-- Mixed case and a leading space, which is what a hand-typed directory looks like.
insert into customers(code,name,joined_on) values
 (84001,'  zarina beevi','2090-04-01'),(84002,'Anand Kumar','2090-04-01'),
 (84003,'aBRAHAM Joseph','2090-04-01'),(84004,'Zachariah Mathew','2090-04-01');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000ms01',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000ms01","role":"authenticated"}',true);
set local role authenticated;

-- ---------------------------------------------------------------------------
-- Case-insensitive ordering
-- ---------------------------------------------------------------------------
select is((select name_sort from customers where code=84001),'zarina beevi','sort key is lowercased and trimmed');
select results_eq(
 $$select code from customers where code between 84001 and 84004 order by name_sort,code$$,
 $$values(84003),(84002),(84004),(84001)$$,
 'members order by name whatever the case');
select results_eq(
 $$select member_code from rpt_subscription_status(2090) where member_code between 84001 and 84004$$,
 $$values(84003),(84002),(84004),(84001)$$,
 'the dues report orders by name the same way');
select is((select count(*)::integer from pg_indexes where indexname='customers_name_sort_idx'),1,
 'the sort key is indexed');
select throws_ok($$update customers set name_sort='hand written' where code=84001$$,'428C9',
 null,'the sort key cannot be written directly');
select lives_ok($$update customers set name='Zarina Beevi' where code=84001$$,'a member can be renamed');
select is((select name_sort from customers where code=84001),'zarina beevi','the sort key follows the name');

-- ---------------------------------------------------------------------------
-- Dashboard dues
-- ---------------------------------------------------------------------------
select is((select total-(select total from dues_baseline) from subscription_dues_summary(2090)),
 2000::numeric,'four members owe a full year each');
select is((select members-(select members from dues_baseline) from subscription_dues_summary(2090)),
 4,'four members owe');
select lives_ok($$select record_subscription_payment(84002,2090,500,'2090-06-01',null,84101,gen_random_uuid())$$,
 'a payment in full is recorded');
select is((select total-(select total from dues_baseline) from subscription_dues_summary(2090)),
 1500::numeric,'paying in full clears that member from the total');
select is((select members-(select members from dues_baseline) from subscription_dues_summary(2090)),
 3,'paying in full clears that member from the count');
select lives_ok($$select record_subscription_payment(84003,2090,200,'2090-06-01',null,84101,gen_random_uuid())$$,
 'a part payment is recorded');
select is((select total-(select total from dues_baseline) from subscription_dues_summary(2090)),
 1300::numeric,'a part payment reduces the total');
select is((select members-(select members from dues_baseline) from subscription_dues_summary(2090)),
 3,'a part payer still owes');

-- The dashboard figure and the Subscriptions page must not disagree.
select is((select total from subscription_dues_summary(2090)),
 (select coalesce(sum(total_due),0) from rpt_subscription_status(2090) where total_due>0),
 'the summary total matches the per-member report');
select is((select members from subscription_dues_summary(2090)),
 (select count(*)::integer from rpt_subscription_status(2090) where total_due>0),
 'the summary count matches the per-member report');

select ok(has_function_privilege('authenticated','public.subscription_dues_summary(integer)','EXECUTE'),
 'signed-in users can read the summary');
select ok(not has_function_privilege('anon','public.subscription_dues_summary(integer)','EXECUTE'),
 'anonymous callers cannot');
select * from finish();
rollback;
