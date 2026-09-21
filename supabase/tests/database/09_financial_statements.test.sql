-- Profit & loss, balance sheet and cash flow: what each statement counts, and that
-- the balance sheet balances before, during and after a year-end closing.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email) values('00000000-0000-0000-0000-00000000fe01','statements@test.local');
update profiles set role='admin' where user_id='00000000-0000-0000-0000-00000000fe01';
insert into account_heads(code,name,account_type,is_cash_bank) values
 (87001,'S cash','asset',true),(87002,'S bank','asset',true),
 (87003,'S subscription income','income',false),(87004,'S rent expense','expense',false),
 (87005,'S equipment','asset',false),(87006,'S loan from bank','liability',false),
 (87007,'S capital','equity',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000fe01',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000fe01","role":"authenticated"}',true);
set local role authenticated;
set constraints all deferred;
select lives_ok($$select create_financial_year(1992)$$,'the reported year is open');

-- Opening capital, four cash transactions, a transfer and an accrual with no cash.
select lives_ok($$select create_journal('1992-04-01','Opening capital',
 '[{"account":87001,"debit":5000},{"account":87007,"credit":5000}]'::jsonb,
 '00000000-0000-0000-0000-00000000fe11',true)$$,'opening balances posted');
select lives_ok($$select create_voucher(1,'1992-05-01',87003,'Subscriptions',2000,87001,
 '00000000-0000-0000-0000-00000000fe12')$$,'income received');
select lives_ok($$select create_voucher(2,'1992-06-01',87004,'Hall rent',800,87001,
 '00000000-0000-0000-0000-00000000fe13')$$,'expense paid');
select lives_ok($$select create_voucher(2,'1992-07-01',87005,'Chairs',1500,87001,
 '00000000-0000-0000-0000-00000000fe14')$$,'asset bought for cash');
select lives_ok($$select create_voucher(1,'1992-08-01',87006,'Bank loan',3000,87001,
 '00000000-0000-0000-0000-00000000fe15')$$,'loan received');
select lives_ok($$select post_voucher(3,'1992-09-01',null,null,'Cash to bank',null,
 '[{"account":87002,"debit":1000},{"account":87001,"credit":1000}]'::jsonb,false,
 '00000000-0000-0000-0000-00000000fe16')$$,'own funds transferred');
select lives_ok($$select create_journal('1992-10-01','Rent payable',
 '[{"account":87004,"debit":200},{"account":87006,"credit":200}]'::jsonb,
 '00000000-0000-0000-0000-00000000fe17')$$,'expense accrued without cash');

-- Profit & loss: income as credits, expenses as debits, both positive.
select is((select amount from rpt_profit_and_loss('1992-04-01','1993-03-31') where head_code=87003),
 2000::numeric,'income is reported for the period');
select is((select amount from rpt_profit_and_loss('1992-04-01','1993-03-31') where head_code=87004),
 1000::numeric,'expense includes the accrual that never touched cash');
select is((select section from rpt_profit_and_loss('1992-04-01','1993-03-31') where head_code=87004),
 'expense','each row carries its classification');
select is((select sum(case when section='income' then amount else -amount end)
 from rpt_profit_and_loss('1992-04-01','1993-03-31')),1000::numeric,'surplus is income less expenses');
select is((select count(*)::integer from rpt_profit_and_loss('1992-04-01','1993-03-31')
 where section not in ('income','expense')),0,'only income and expense accounts appear');
select is((select amount from rpt_profit_and_loss('1992-06-01','1992-06-30') where head_code=87004),
 800::numeric,'a shorter period reports only its own entries');
select is((select count(*)::integer from rpt_profit_and_loss('1992-06-01','1992-06-30')
 where head_code=87003),0,'accounts with no entries in the period are left out');

-- Balance sheet: assets as debit balances, liabilities and equity as credits, and the
-- result of the year so far as one equity row, so the two sides agree.
select is((select amount from rpt_balance_sheet('1993-03-31') where head_code=87001),
 6700::numeric,'cash balance nets receipts, payments and the transfer out');
select is((select amount from rpt_balance_sheet('1993-03-31') where head_code=87002),
 1000::numeric,'bank balance holds the transfer in');
select is((select amount from rpt_balance_sheet('1993-03-31') where head_code=87005),
 1500::numeric,'the equipment is an asset, not an expense');
select is((select amount from rpt_balance_sheet('1993-03-31') where head_code=87006),
 3200::numeric,'the loan and the accrual are liabilities');
select is((select amount from rpt_balance_sheet('1993-03-31') where row_kind='result'),
 1000::numeric,'the surplus not yet transferred is shown under equity');
select is((select sum(case when section='asset' then amount else -amount end) from rpt_balance_sheet('1993-03-31')),
 0::numeric,'assets equal liabilities plus equity');
select is((select sum(amount) from rpt_balance_sheet('1993-03-31') where section='asset'),
 9200::numeric,'total assets');
select is((select sum(case when section='asset' then amount else -amount end) from rpt_balance_sheet('1992-05-31')),
 0::numeric,'a mid-year sheet balances too');
select is((select amount from rpt_balance_sheet('1992-05-31') where row_kind='result'),
 2000::numeric,'the mid-year result carries the income earned so far');

-- Cash flow: the opening balance, the accounts money came from or went to, the closing
-- balance. A transfer between own accounts is not a flow, and neither is an accrual.
select is((select balance from rpt_cash_flow('1992-04-01','1993-03-31') where row_kind='opening'),
 0::numeric,'the first year opens with no cash');
select is((select balance from rpt_cash_flow('1992-04-01','1993-03-31') where row_kind='closing'),
 7700::numeric,'closing cash and bank across both accounts');
select is((select inflow from rpt_cash_flow('1992-04-01','1993-03-31') where head_code=87003),
 2000::numeric,'income collected in cash is an inflow');
select is((select outflow from rpt_cash_flow('1992-04-01','1993-03-31') where head_code=87004),
 800::numeric,'only the expense actually paid is an outflow');
select is((select outflow from rpt_cash_flow('1992-04-01','1993-03-31') where head_code=87005),
 1500::numeric,'buying an asset is an outflow');
select is((select inflow from rpt_cash_flow('1992-04-01','1993-03-31') where head_code=87006),
 3000::numeric,'the loan is an inflow, the accrual is not');
select is((select inflow from rpt_cash_flow('1992-04-01','1993-03-31') where head_code=87007),
 5000::numeric,'capital introduced is an inflow');
select is((select count(*)::integer from rpt_cash_flow('1992-04-01','1993-03-31')
 where head_code in (87001,87002)),0,'cash and bank accounts are not their own flows');
select is((select sum(inflow-outflow) from rpt_cash_flow('1992-04-01','1993-03-31') where row_kind='flow'),
 7700::numeric,'the flows add up to the movement between the two balances');
select is((select balance from rpt_cash_flow('1992-06-01','1992-06-30') where row_kind='opening'),
 7000::numeric,'a later period opens with the cash carried forward');
select is((select balance from rpt_cash_flow('1992-06-01','1992-06-30') where row_kind='closing'),
 6200::numeric,'and closes after that period''s payments');
select is((select count(*)::integer from rpt_cash_flow('1992-06-01','1992-06-30') where row_kind='flow'),
 1,'only that period''s flows are listed');

-- Year-end closing empties the income and expense accounts into equity. The profit &
-- loss must ignore it; the balance sheet must include it and still balance.
select lives_ok($$select close_financial_year(1992,87007)$$,'the year is closed');
select is((select amount from rpt_profit_and_loss('1992-04-01','1993-03-31') where head_code=87003),
 2000::numeric,'the closed year still reports its income');
select is((select amount from rpt_profit_and_loss('1992-04-01','1993-03-31') where head_code=87004),
 1000::numeric,'and its expenses');
select is((select count(*)::integer from rpt_balance_sheet('1993-03-31') where row_kind='result'),
 0,'nothing is left to transfer after closing');
select is((select amount from rpt_balance_sheet('1993-03-31') where head_code=87007),
 6000::numeric,'the surplus has moved into retained earnings');
select is((select sum(case when section='asset' then amount else -amount end) from rpt_balance_sheet('1993-03-31')),
 0::numeric,'the closed sheet balances');
select is((select amount from rpt_balance_sheet('1992-05-31') where row_kind='result'),
 2000::numeric,'a date before the closing entry is unaffected by it');

-- Reopening writes a reversal of the closing entry; that must not double the result.
select lives_ok($$select reopen_financial_year(1992,'audit correction')$$,'the year is reopened');
select is((select amount from rpt_profit_and_loss('1992-04-01','1993-03-31') where head_code=87003),
 2000::numeric,'the reversal of a closing entry is ignored as well');
select is((select amount from rpt_balance_sheet('1993-03-31') where row_kind='result'),
 1000::numeric,'the result is back on the income and expense accounts');

-- A cancelled voucher reverses on its original date, so both statements drop it.
select lives_ok($$select cancel_voucher((select id from vouchers where narration='Hall rent'),
 'Paid twice')$$,'the rent payment is cancelled');
select is((select amount from rpt_profit_and_loss('1992-04-01','1993-03-31') where head_code=87004),
 200::numeric,'only the accrued rent remains an expense');
select is((select count(*)::integer from rpt_cash_flow('1992-04-01','1993-03-31') where head_code=87004),
 0,'the cancelled payment nets out of the cash flow');
select is((select balance from rpt_cash_flow('1992-04-01','1993-03-31') where row_kind='closing'),
 8500::numeric,'the cash comes back');
select is((select sum(case when section='asset' then amount else -amount end) from rpt_balance_sheet('1993-03-31')),
 0::numeric,'the sheet still balances after a cancellation');

select lives_ok($$set constraints all immediate$$,'every journal written by this suite balances');
select ok(not has_function_privilege('anon','public.rpt_profit_and_loss(date,date)','execute'),
 'the profit & loss is not public');
select ok(not has_function_privilege('anon','public.rpt_balance_sheet(date)','execute'),
 'the balance sheet is not public');
select ok(not has_function_privilege('anon','public.rpt_cash_flow(date,date)','execute'),
 'the cash flow is not public');
select * from finish();
rollback;
