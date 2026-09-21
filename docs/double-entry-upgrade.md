# Double-entry accounting

The upgrade starts fresh, as requested: existing financial entries were demo data. The linked project was checked and contained zero vouchers, day-book rows and subscription payments before upgrading.

## Getting started

1. In Masters → Account heads, classify accounts as asset, liability, equity, income or expense. Existing account names are retained, but unknown classifications are not guessed. The configured membership subscription account is classified as income.
2. A Cash in hand asset is created by the migration. Add actual bank accounts as assets and select Yes for Cash / bank account.
3. Enter any real opening balances as an admin in Transactions → Journal → Entry type → Opening balances. Debits and credits must match. Do not enter invented balances just to make totals match.
4. Enter money received in Transactions → Receipt and money paid in Transactions → Payment. Choose the cash or bank account once, then one line per account head; the cash side is generated. Saving posts both sides immediately. Subscription collection uses the same posting engine.
5. Move money between your own accounts in Transactions → Contra, and post adjustments with no money moving in Transactions → Journal.

## The voucher module

Receipt, Payment, Contra and Journal are one screen, one service, one set of validations and one database structure; the voucher type in the route drives the differences. A voucher is a header in `vouchers` and any number of debit/credit lines in `daybook`, so a single receipt can carry membership fee, welfare fund, late fee and donation in one transaction.

`post_voucher` is the only way a voucher is written. It re-validates every account, generates the cash counterpart for simplified receipts and payments, checks that debits equal credits, allocates the number under the counter's row lock, writes the header and lines, and rolls back the whole transaction on any failure. The frontend never decides which side an amount posts to. Modules added later — fee collection, supplier payment, payroll, loan collection, bank reconciliation — post through the same function instead of implementing accounting of their own.

Two entry modes exist for receipts and payments. Simplified mode shows one amount column and hides the cash side; *Advanced accounting view* shows debit and credit columns with a running difference and refuses to save until it is zero. Contra and journal vouchers always use the debit/credit grid. Which accounts a line may use follows the voucher type: contras are limited to cash and bank, journals exclude them unless an admin turns on *Allow cash and bank accounts in journal vouchers* in Company settings, and group (control) heads and retired accounts take no entries at all.

Opening balances remain separate from vouchers: they open the books rather than record a transaction, so they carry no voucher number, are restricted to admins, and may use cash and bank accounts.

## Ledger rules

Journal headers and their daybook lines are the authoritative ledger. Database checks require at least two lines, a positive amount on exactly one side of each line, two-decimal precision and equal debit/credit totals. RPCs are atomic, role-checked and protected against repeated request IDs. Changing the contents of an already-used request is rejected.

Posted journals and lines cannot be edited or deleted. Account classifications cannot change after posting. Voucher and subscription cancellation writes an equal reversing journal on the original transaction date and retains both entries. General journals can be reversed by admins on a chosen date no earlier than the original. Reversing the same journal twice is rejected. [Financial-year closing](financial-years.md) locks closed years and supports audited reopening.

Subscription dues remain membership tracking; fees are recorded as income when payment is collected. This release does not automatically accrue unpaid subscriptions into receivables.

## Reports

- General ledger uses actual debit/credit lines. Its existing signed balance convention remains credit minus debit; the page explains that negative balances are debit balances.
- Trial balance includes the cash/bank counterparts; the difference must be zero.
- Profit & loss reports income and expense accounts for a period, whichever way cash moved, so an accrued expense counts and an asset bought for cash does not. Year-end closing transfers the result to retained earnings, and both the closing entry and the reversal a reopened year writes are excluded, so a closed year still reports what it earned.
- Balance sheet reports assets as debit balances and liabilities and funds as credits, as on a date. Income and expense stay on their own accounts until the year is closed, so the surplus earned since the last closing is carried as one row under funds; that is what makes the two sides agree on any date. The difference is printed and must be zero.
- Cash flow reports the opening cash and bank balance, the accounts money was received from or paid to, and the closing balance, grouped by classification. It is a direct statement: each row comes from the other side of a journal that moved cash, so nothing is allocated or estimated. A contra between own accounts moves no money in or out and is not listed, and an entry that never touched cash appears only on the profit & loss. Operating, investing and financing are not separated, because the chart of accounts does not record which an account is.
- Day book and day closing show combined cash/bank movements and balances, not a sum of every ledger account. The cash book retains Receipt / Payment column labels. Use the account ledger for an individual cash or bank account.
- The Voucher Register pages through the year's entries, filtered by voucher type, with each voucher's lines, reference, party and reversal links; historical date ranges remain available in ledger reports.
- Ledger Verification replaces the old rebuilding/posting operation. It checks balance integrity without deleting or duplicating entries.

## Migration and verification

The migration has been applied to the linked Supabase project. Post-migration checks confirmed an empty journal/voucher ledger, one cash/bank asset, both deferred balance constraints, and no client truncate privilege.

Migration: supabase/migrations/20260916000000_double_entry.sql. It refuses to run when financial entries remain. For an explicitly authorized demo-only reset, run supabase/scripts/reset-demo-ledger.sql first. It clears transactional records and voucher counters while retaining users, company settings, members, accounts and fee configuration. Never use it to convert real financial history.

The active database suites are supabase/tests/database/04_double_entry.test.sql, 07_voucher_module.test.sql, which covers multi-head receipts and payments, contras, journals, the account restrictions per type, idempotent retries, numbering per type and cancellation, and 09_financial_statements.test.sql, which checks the three financial statements through a year of entries, a closing, a reopening and a cancellation, and that the balance sheet balances at every step. The previous single-entry tests are retained in supabase/legacy-tests for historical migrations and must not run against the new schema. Run database tests only in an isolated, empty development database. The local integration run covers receipts, payments, transfers, opening balances, reversals, subscription integration, permissions, immutable entries, request retries and reporting. A separate simultaneous-request check verifies one voucher and two balanced lines for three concurrent requests with the same ID.

The Angular application and database migration must be released together. Old cached clients receive an explicit update-required error instead of creating single-entry vouchers. Updating GitHub Pages alone does not migrate Supabase.
