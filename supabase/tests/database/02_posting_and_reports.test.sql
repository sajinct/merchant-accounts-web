begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

-- Test data lives in account heads 7101-7102 and dates in 1990, so existing data in a dev
-- project does not change the results. Balances that include all accounts are compared
-- against a baseline taken before the test rows are added.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin2@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'acct2@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', 'viewer2@test.local');
update profiles set role = 'admin'      where user_id = '00000000-0000-0000-0000-0000000000a1';
update profiles set role = 'accountant' where user_id = '00000000-0000-0000-0000-0000000000b1';
update profiles set role = 'viewer'     where user_id = '00000000-0000-0000-0000-0000000000c1';

insert into account_heads (code, name) values (7101, 'TEST SALES'), (7102, 'TEST RENT');

create temp table baseline on commit drop as
select coalesce(sum(credit - debit), 0) as before_1990
  from daybook where tran_date < '1990-01-01' or tran_date is null;
grant select on baseline to authenticated;

-- ---------------------------------------------------------------------------
-- Viewer cannot post
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
select throws_ok($$select post_daybook('1990-01-01', '1990-01-31')$$, '42501', 'not authorized',
                 'viewer cannot post the day book');
reset role;

-- ---------------------------------------------------------------------------
-- Accountant enters vouchers and posts
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);

-- Opening activity before the report range
select create_voucher(1, '1990-01-05', 7101, 'december sales', 1000);
-- In range
select create_voucher(1, '1990-02-01', 7101, 'sales day 1', 500);
select create_voucher(2, '1990-02-01', 7102, 'rent', 800);
select create_voucher(1, '1990-02-02', 7101, 'sales day 2', 200);
select create_voucher(1, '1990-02-02', 7101, 'wrong entry', 999);

-- A manual (non-auto) row in range must survive posting
insert into daybook (head_code, tran_date, credit, narration) values (7101, '1990-02-03', 50, 'manual adjustment');
reset role;

-- Admin cancels the wrong entry
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select cancel_voucher((select id from vouchers where description = 'wrong entry'), 'typo');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);

select throws_ok($$select post_daybook('1990-02-10', '1990-02-01')$$, '22023', null,
                 'reversed date range is rejected');

select is(post_daybook('1990-01-01', '1990-02-28'), 4, 'posting creates one row per non-cancelled voucher');
select is(post_daybook('1990-01-01', '1990-02-28'), 4, 'posting again gives the same count');
select is((select count(*)::int from daybook where head_code in (7101, 7102) and is_auto), 4,
          'reposting does not duplicate rows');
select is((select count(*)::int from daybook where narration = 'manual adjustment'), 1,
          'manual rows survive posting');
select is((select count(*)::int from daybook where narration = 'wrong entry'), 0,
          'cancelled vouchers are not posted');
select is((select row(debit, credit)::text from daybook where narration = 'rent'), '(800.00,0.00)',
          'payments post as debit');
select is((select voucher_ref from daybook where narration = 'sales day 1'), 'R-' ||
          (select voucher_no from vouchers where description = 'sales day 1'),
          'voucher reference is R-<no> for receipts');
select is(daybook_last_date() >= '1990-02-03'::date, true, 'daybook_last_date sees posted rows');

-- ---------------------------------------------------------------------------
-- Ledger (single account): opening 1000, then 500, 200, manual 50
-- ---------------------------------------------------------------------------
select results_eq(
  $$select row_kind, balance from rpt_ledger(7101, '1990-02-01', '1990-02-28') order by seq$$,
  $$values ('opening'::text, 1000.00::numeric), ('entry', 1500.00), ('entry', 1700.00), ('entry', 1750.00)$$,
  'ledger shows opening and running balance'
);
select is((select count(*)::int from rpt_ledger(7102, '1990-02-01', '1990-02-28') where row_kind = 'opening'), 0,
          'no opening row for an account without earlier activity');
select is((select balance from rpt_ledger(null, '1990-02-01', '1990-02-28') where head_code = 7102 order by seq desc limit 1),
          -800.00::numeric, 'all-accounts ledger keeps balances per account');

-- ---------------------------------------------------------------------------
-- Day book: opening = baseline + 1000; closing = opening + 500 - 800 + 200 + 50
-- ---------------------------------------------------------------------------
select is((select balance from rpt_daybook('1990-02-01', '1990-02-28') where row_kind = 'opening'),
          (select before_1990 from baseline) + 1000, 'day book opening balance');
select is((select balance from rpt_daybook('1990-02-01', '1990-02-28') order by seq desc limit 1),
          (select before_1990 from baseline) + 950, 'day book closing balance');

-- ---------------------------------------------------------------------------
-- Day closing and trial balance
-- ---------------------------------------------------------------------------
select results_eq(
  $$select tran_date, closing_balance - (select before_1990 from baseline)
      from rpt_day_closing('1990-02-01', '1990-02-28')$$,
  $$values ('1990-02-01'::date, 700.00::numeric), ('1990-02-02', 900.00), ('1990-02-03', 950.00)$$,
  'day closing balances per day'
);
select results_eq(
  $$select head_code, debit, credit from rpt_trial_balance('1990-02-28') where head_code in (7101, 7102) order by head_code$$,
  $$values (7101, 0.00::numeric, 1750.00::numeric), (7102, 800.00, 0.00)$$,
  'trial balance per account'
);
reset role;

select * from finish();
rollback;
