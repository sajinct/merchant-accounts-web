begin;
create extension if not exists pgtap with schema extensions;

select plan(31);

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
select has_table('public', t, 'table ' || t || ' exists')
from unnest(array['company_settings', 'account_heads', 'customers', 'vouchers',
                  'voucher_counters', 'daybook', 'profiles']) as t;

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0,
  'RLS is enabled on every public table'
);

-- ---------------------------------------------------------------------------
-- Users and profiles (first user becomes admin)
-- ---------------------------------------------------------------------------
create temp table had_profiles on commit drop as select exists (select 1 from profiles) as val;
grant select on had_profiles to anon, authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'acct@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'viewer@test.local');

select is((select role from profiles where user_id = '00000000-0000-0000-0000-00000000000a'),
          case when (select val from had_profiles) then 'viewer' else 'admin' end,
          'first user is admin (viewer if the project already had users)');
select is((select role from profiles where user_id = '00000000-0000-0000-0000-00000000000c'),
          'viewer', 'later users default to viewer');

update profiles set role = 'admin' where user_id = '00000000-0000-0000-0000-00000000000a';
update profiles set role = 'accountant' where user_id = '00000000-0000-0000-0000-00000000000b';

insert into account_heads (code, name) values (7001, 'CASH SALES'), (7002, 'RENT');

-- ---------------------------------------------------------------------------
-- Anonymous access
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok('select * from public.vouchers', '42501', null, 'anon cannot read vouchers');
select throws_ok($$select public.create_voucher(1, current_date, 7001, 'x', 10)$$,
                 '42501', null, 'anon cannot call create_voucher');
reset role;

-- ---------------------------------------------------------------------------
-- Viewer
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);

select is((select count(*)::int from account_heads where code in (7001, 7002)), 2, 'viewer can read account heads');
select throws_ok($$insert into account_heads (code, name) values (7003, 'X')$$,
                 '42501', null, 'viewer cannot insert account heads');
select throws_ok($$select create_voucher(1, current_date, 7001, 'x', 10)$$,
                 '42501', 'not authorized', 'viewer cannot create vouchers');
select is((select count(*)::int from profiles), 1, 'viewer sees only own profile');
reset role;

-- ---------------------------------------------------------------------------
-- Accountant
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

select lives_ok($$insert into account_heads (code, name) values (7003, 'ELECTRICITY')$$,
                'accountant can insert account heads');
delete from account_heads where code = 7003;
select is((select count(*)::int from account_heads where code = 7003), 1,
          'account heads cannot be deleted');

select is((create_voucher(1, '2026-09-01', 7001, 'first receipt', 500)).voucher_no, 1, 'first receipt is no 1');
select is((create_voucher(1, '2026-09-01', 7001, 'second receipt', 250)).voucher_no, 2, 'second receipt is no 2');
select is((create_voucher(2, '2026-09-02', 7002, 'rent', 300)).voucher_no, 1, 'payments are numbered separately');
select is((select created_by from vouchers where voucher_type = 2 and voucher_no = 1),
          '00000000-0000-0000-0000-00000000000b'::uuid, 'created_by is the caller');

select throws_ok($$select create_voucher(1, current_date, 7001, 'x', 0)$$,
                 '22023', null, 'zero amount is rejected');
select throws_ok($$select create_voucher(3, current_date, 7001, 'x', 10)$$,
                 '22023', null, 'unknown voucher type is rejected');
select throws_ok($$select create_voucher(1, current_date, 9999, 'x', 10)$$,
                 '23503', null, 'unknown account head is rejected');
select is((select last_no from voucher_counters where voucher_type = 1), 2,
          'failed inserts do not consume voucher numbers');

update vouchers set amount = 1;
select is((select sum(amount) from vouchers), 1050.00::numeric,
          'vouchers cannot be updated directly');
select throws_ok($$select cancel_voucher((select id from vouchers where voucher_no = 1 and voucher_type = 1), 'oops')$$,
                 '42501', 'not authorized', 'accountant cannot cancel vouchers');
select throws_ok($$insert into daybook (head_code, tran_date, credit, is_auto) values (7001, current_date, 5, true)$$,
                 '42501', null, 'accountant cannot write auto day book rows');
reset role;

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select isnt((cancel_voucher((select id from vouchers where voucher_no = 1 and voucher_type = 1), 'duplicate')).cancelled_at,
            null, 'admin can cancel a voucher');
reset role;

select * from finish();
rollback;
