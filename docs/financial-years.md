# Financial years

Accounting years run from **1 April to 31 March**. For example, 2026-27 covers 2026-04-01 through 2027-03-31.

## Selecting and creating years

The header selector chooses the accounting year for the dashboard, receipts/payments, journal register and accounting reports. Selection remains active while navigating the app; a fresh app session starts with the current year. Reports default to the selected year's start through today, or its end when reviewing a past year.

Admins can open **Utilities → Financial Years** (U, then F) to create years. The migration creates the current year and any years already containing journals. Dates in an unconfigured year cannot be posted.

Switching years preserves dates on unfinished entry forms. A date outside the selected year must be corrected before saving. Date controls and database checks enforce the year boundaries. Subscription fee years remain independent: a payment made in the selected accounting year can settle an earlier year's membership dues.

## Closing a year

1. Create an equity account for retained earnings in Account heads if needed.
2. Complete entries and review the ledger and trial balance.
3. Open Financial Years, choose **Review & close**, and review income, expenses and the net result.
4. Select the retained-earnings equity account and choose **Close and lock year**.

The database permits closing only after the year has reached its final date, with earlier configured years closed first. It locks the year while calculating the final balances, so concurrent postings cannot slip through. The review shows the operating result; the closing transaction recalculates from the latest committed entries.

Closing posts one balanced journal to clear income/expense balances into equity, locks the year, and creates the next year if needed. An empty year needs no closing journal. Repeated closing requests do not duplicate the transfer.

Assets, liabilities and equity carry forward through the existing ledger. **Do not enter opening balances again when moving into a new year.** Cash/bank totals do not change on closing. Closed-year reports remain available; the year summary excludes closing journals and their reopening reversals so the operating result remains visible.

## Reopening and corrections

Only admins can reopen a year, and a reason is required. Later closed years must be reopened first. Reopening records an audit entry and reverses the old closing journal on its original date. Original journals are retained. Re-closing calculates the corrected transfer without duplicating retained earnings.

Posting and voucher/subscription cancellation in a closed year are blocked by the database. A closing journal cannot be reversed through the ordinary journal screen. Normal journals can still be corrected with an authorized reversal dated in an open year.

## Verification

Migration: `supabase/migrations/20260917000000_financial_years.sql`.

The financial-year database suite covers date boundaries, closing, retained earnings, cash preservation, automatic carry-forward, duplicate closing, locks, reopen ordering and audit records. The existing double-entry suite also passes with this migration. A separate concurrent-session test verifies that a posting waiting on year closing is rejected and fully rolled back after closing commits.

Run database tests only in an isolated development database. No year was closed and no financial transactions were entered in the linked project during verification.
