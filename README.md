# Merchant Accounts (web)

Browser rebuild of the VB.NET *Merchant Accounts* desktop app: receipts/payments against account heads, day book posting, and day book / ledger / trial balance reports.

- **Backend:** Supabase cloud (Postgres, Auth, Storage, Edge Functions)
- **Frontend:** Angular 21 + Angular Material (`app/`)
- **Migration:** `tools/migrate/` (Azure SQL → Supabase, Phase 5, not started)

## Layout

```
supabase/
  config.toml            CLI config (auth settings apply to local stacks only)
  migrations/            schema, RLS, posting and report functions
  functions/admin-users/ edge function: create users, set passwords (admin only)
  tests/database/        pgTAP tests
  seed.sql               demo data for a dev project
app/
  src/environments/      Supabase URL + publishable key
  src/app/core/          Supabase client, auth, guards, models
  src/app/layout/        side-nav shell
  src/app/features/      auth, masters, transactions, reports, admin
  src/app/shared/        report shell, webcam capture, Enter-to-next directive
```

## 1. Database (Supabase cloud)

Requires Node 20+. There is no local Supabase stack; everything targets the cloud project.

```bash
npm install
npx supabase login                       # or set SUPABASE_ACCESS_TOKEN
npm run db:link -- <project-ref>         # asks for the database password
npm run db:push:dry                      # preview pending migrations
npm run db:push                          # apply migrations
npx supabase functions deploy admin-users
npm run db:test                          # pgTAP tests (use a dev project, see below)
```

Then, in the Supabase dashboard:

1. **Turn off public sign-ups:** Authentication → Sign In / Providers → *Allow new users to sign up*. `config.toml` only covers local stacks.
2. **Create the first user:** Authentication → Users → Add user, with *Auto Confirm User* ticked. **The first user created becomes `admin`**; later users are `viewer` until an admin changes their role. After that, add users from the app (Utilities → Users).
3. Optionally, in a **dev** project only, run `supabase/seed.sql` in the SQL editor for demo data.

Run `db:test` against a **dev** project with no vouchers or day book data. The tests roll back, so they leave nothing behind, but existing voucher numbers change the expected results.

## 2. App

```bash
cd app
npm install          # if npm 10.9 crashes with "reading 'edgesOut'", use: npx npm@11 install
```

Edit `app/src/environments/environment.ts` with the project URL and the **publishable (anon) key** from Project Settings → API. Never use the service role key in the app.

```bash
npm start            # http://localhost:4200
npm test             # unit tests (Vitest)
npm run build        # production build in app/dist/app/browser
```

### Hosting on GitHub Pages

The app uses hash routing (`https://<user>.github.io/<repo>/#/reports/ledger`) and a relative base href, so it works under any repo name without a 404 fallback page.

1. Push this repo to GitHub, on branch `main`.
2. In the repo, go to Settings → Pages → Source and choose **GitHub Actions**.
3. Every push to `main` that touches `app/` runs `.github/workflows/deploy-pages.yml`: install, unit tests, `npm run build:pages`, deploy. It can also be run by hand from the Actions tab.
4. In Supabase, set Authentication → URL Configuration → Site URL to the Pages URL.

`npm run build:pages` builds the same output locally, in `app/dist/app/browser`.

The Angular CLI 21 used here runs on Node 22.12+. Newer Angular majors need Node 22.22+.

## Roles

| Role | Can |
|---|---|
| `viewer` | read everything, run reports |
| `accountant` | + account heads, members, vouchers, day book posting, manual day book rows |
| `admin` | + cancel vouchers, delete members, company settings, manage users |

Vouchers are only written through the `create_voucher` / `cancel_voucher` RPCs. Numbers come from `voucher_counters`, one sequence per type (1 receipt, 2 payment). Cancelling a voucher does not change the day book until that date is posted again.

## Screens (from the desktop menu)

| Desktop | Web |
|---|---|
| Payment/Receipts Entry | Transactions → Payments / Receipts |
| Day Book Posting | Transactions → Day Book Posting |
| Day Closing Balance | Transactions → Day Closing Balance |
| Day Book, Ledger, Trial Balance (Crystal) | Reports → print to A4 / PDF, or export CSV |
| Account Heads, Member Details | Masters |
| User Creation, Change Password | Utilities → Users, Change Password |
| Registration, DB Settings, Fix Day Book Errors, Compact DB | Dropped (no licence file; foreign keys prevent orphan rows) |

## Open items

- **P&L and Balance Sheet** are not built yet. They depend on the meaning of legacy `MAS_HEADS.CKORC` / `CBORP` (stored as `account_heads.kind` / `group_type`).
- **Report layouts:** printed samples of the Crystal reports are needed to match layouts and the debit/credit sign convention in the trial balance.
- **Data migration** (Phase 5). Rotate the Azure SQL password committed in the VB repo before running it.
