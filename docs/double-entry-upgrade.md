# Double-entry accounting

The upgrade starts fresh, as requested: existing financial entries were demo data. The linked project was checked and contained zero vouchers, day-book rows and subscription payments before upgrading.

## Getting started

1. In Masters → Account heads, classify accounts as asset, liability, equity, income or expense. Existing account names are retained, but unknown classifications are not guessed. The configured membership subscription account is classified as income.
2. A Cash in hand asset is created by the migration. Add actual bank accounts as assets and select Yes for Cash / bank account.
3. Enter any real opening balances as an admin in Transactions → Journals / Transfers → Opening balances. Debits and credits must match. Do not enter invented balances just to make totals match.
4. Receipts and payments require a cash/bank account and a different counterpart. Saving posts both sides immediately. Subscription collection uses the same balanced posting path.
5. For a bank transfer, debit the destination and credit the source in Journals / Transfers. The screen also supports multi-line journals.

## Ledger rules

Journal headers and their daybook lines are the authoritative ledger. Database checks require at least two lines, a positive amount on exactly one side of each line, two-decimal precision and equal debit/credit totals. RPCs are atomic, role-checked and protected against repeated request IDs. Changing the contents of an already-used request is rejected.

Posted journals and lines cannot be edited or deleted. Account classifications cannot change after posting. Voucher and subscription cancellation writes an equal reversing journal on the original transaction date and retains both entries. General journals can be reversed by admins on a chosen date no earlier than the original. Reversing the same journal twice is rejected. Period locking is not part of this release.

Subscription dues remain membership tracking; fees are recorded as income when payment is collected. This release does not automatically accrue unpaid subscriptions into receivables.

## Reports

- General ledger uses actual debit/credit lines. Its existing signed balance convention remains credit minus debit; the page explains that negative balances are debit balances.
- Trial balance includes the cash/bank counterparts; the difference must be zero.
- Day book and day closing show combined cash/bank movements and balances, not a sum of every ledger account. The cash book retains Receipt / Payment column labels. Use the account ledger for an individual cash or bank account.
- Journals / Transfers shows the latest 100 journals, including their lines and reversal references; historical date ranges remain available in ledger reports.
- Ledger Verification replaces the old rebuilding/posting operation. It checks balance integrity without deleting or duplicating entries.

## Migration and verification

The migration has been applied to the linked Supabase project. Post-migration checks confirmed an empty journal/voucher ledger, one cash/bank asset, both deferred balance constraints, and no client truncate privilege.

Migration: supabase/migrations/20260916000000_double_entry.sql. It refuses to run when financial entries remain. For an explicitly authorized demo-only reset, run supabase/scripts/reset-demo-ledger.sql first. It clears transactional records and voucher counters while retaining users, company settings, members, accounts and fee configuration. Never use it to convert real financial history.

The active database suite is supabase/tests/database/04_double_entry.test.sql. The previous single-entry tests are retained in supabase/legacy-tests for historical migrations and must not run against the new schema. Run database tests only in an isolated, empty development database. The local integration run covers receipts, payments, transfers, opening balances, reversals, subscription integration, permissions, immutable entries, request retries and reporting. A separate simultaneous-request check verifies one voucher and two balanced lines for three concurrent requests with the same ID.

The Angular application and database migration must be released together. Old cached clients receive an explicit update-required error instead of creating single-entry vouchers. Updating GitHub Pages alone does not migrate Supabase.
