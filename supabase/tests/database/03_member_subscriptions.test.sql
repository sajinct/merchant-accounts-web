begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

-- Test data: members 97001-97003 and financial years 2091-92 / 2092-93, far away from real data.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a3', 'admin3@test.local'),
  ('00000000-0000-0000-0000-0000000000b3', 'acct3@test.local'),
  ('00000000-0000-0000-0000-0000000000c3', 'viewer3@test.local');
update profiles set role = 'admin'      where user_id = '00000000-0000-0000-0000-0000000000a3';
update profiles set role = 'accountant' where user_id = '00000000-0000-0000-0000-0000000000b3';
update profiles set role = 'viewer'     where user_id = '00000000-0000-0000-0000-0000000000c3';

insert into subscription_years (fy_start, fee) values (2091, 1000), (2092, 1200);

insert into customers (code, name, joined_on, left_on) values
  (97001, 'TEST MEMBER A', '2091-06-01', null),          -- due 2091 and 2092
  (97002, 'TEST MEMBER B', '2092-05-01', null),          -- due 2092 only
  (97003, 'TEST MEMBER C', '2091-04-01', '2091-12-31');  -- due 2091 only

-- ---------------------------------------------------------------------------
-- Helpers and setup
-- ---------------------------------------------------------------------------
select is(fy_start_of('2026-03-31'), 2025::smallint, 'March belongs to the previous financial year');
select is(fy_start_of('2026-04-01'), 2026::smallint, 'April starts a new financial year');
select is(fy_label(2026), '2026-27', 'financial year label');
select is(fy_label(2099), '2099-00', 'financial year label across a century');
select isnt((select subscription_head_code from company_settings), null,
            'migration set the subscription account head');

-- ---------------------------------------------------------------------------
-- Viewer
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true);

select is((select count(*)::int from subscription_years where fy_start in (2091, 2092)), 2,
          'viewer can read subscription fees');
select throws_ok($$select record_subscription_payment(97001, 2091, 100, '2091-07-01')$$,
                 '42501', 'not authorized', 'viewer cannot record payments');
reset role;

-- ---------------------------------------------------------------------------
-- Accountant records payments
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}', true);

select throws_ok($$insert into subscription_years (fy_start, fee) values (2093, 500)$$,
                 '42501', null, 'accountant cannot set subscription fees');

select is((record_subscription_payment(97001, 2091, 400, '2091-07-01', 'first instalment')).amount,
          400.00::numeric, 'accountant records a part payment');

select is(
  (select row(v.voucher_type, v.amount, v.head_code = (select subscription_head_code from company_settings))::text
     from subscription_payments sp join vouchers v on v.id = sp.voucher_id
    where sp.member_code = 97001),
  '(1,400.00,t)',
  'payment creates a receipt voucher against the subscription head'
);

select throws_ok($$select record_subscription_payment(97001, 2091, 700, '2091-08-01')$$,
                 '22023', null, 'payment above the year balance is rejected');
select throws_ok($$select record_subscription_payment(97002, 2091, 100, '2091-08-01')$$,
                 '22023', null, 'payment for a year before the member joined is rejected');
select throws_ok($$select record_subscription_payment(97003, 2092, 100, '2092-08-01')$$,
                 '22023', null, 'payment for a year after the member left is rejected');

select results_eq(
  $$select fy_start, fee, paid, balance from member_subscription_years(97001)$$,
  $$values (2091::smallint, 1000.00::numeric, 400.00::numeric, 600.00::numeric),
           (2092::smallint, 1200.00, 0, 1200.00)$$,
  'member year breakdown shows fee, paid and balance'
);

select results_eq(
  $$select member_code, due_this_year, year_fee, year_paid, year_balance, arrears, total_due
      from rpt_subscription_status(2092) where member_code between 97001 and 97003 order by member_code$$,
  $$values (97001, true,  1200.00::numeric, 0::numeric, 1200.00::numeric, 600.00::numeric, 1800.00::numeric),
           (97002, true,  1200.00, 0, 1200.00, 0, 1200.00),
           (97003, false, 0, 0, 0, 1000.00, 1000.00)$$,
  'status report carries unpaid years forward as arrears'
);

select is((select count(*)::int from rpt_subscription_status(2091) where member_code = 97002), 0,
          'members who joined later are not listed for earlier years');

select throws_ok($$select cancel_subscription_payment((select id from subscription_payments where member_code = 97001), 'x')$$,
                 '42501', 'not authorized', 'accountant cannot cancel subscription payments');
reset role;

-- ---------------------------------------------------------------------------
-- Admin cancels
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);

select throws_ok($$select cancel_voucher((select voucher_id from subscription_payments where member_code = 97001), 'x')$$,
                 '22023', null, 'subscription receipts cannot be cancelled from the voucher screen');

select lives_ok($$select cancel_subscription_payment((select id from subscription_payments where member_code = 97001), 'wrong member')$$,
                'admin cancels a subscription payment');
select isnt((select v.cancelled_at from subscription_payments sp join vouchers v on v.id = sp.voucher_id
              where sp.member_code = 97001), null,
            'cancelling the payment cancels its receipt voucher');
select is((select balance from member_subscription_years(97001) where fy_start = 2091), 1000.00::numeric,
          'cancelled payments no longer count as paid');
reset role;

-- ---------------------------------------------------------------------------
-- Missing account head
-- ---------------------------------------------------------------------------
update company_settings set subscription_head_code = null;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}', true);
select throws_ok($$select record_subscription_payment(97001, 2091, 100, '2091-07-01')$$,
                 '22023', null, 'payments need a subscription account head');
reset role;

select * from finish();
rollback;
