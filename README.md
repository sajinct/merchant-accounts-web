# Merchant Accounts (web)

Browser rebuild of the VB.NET *Merchant Accounts* desktop app: receipts/payments against account heads, day book posting, and day book / ledger / trial balance reports.

- **Backend:** Supabase (Postgres, Auth, Storage, Edge Functions)
- **Frontend:** Angular (`app/`, coming in Phase 3)
- **Migration:** `tools/migrate/` (Azure SQL → Supabase, Phase 5)

## Layout

```
supabase/
  config.toml            CLI config (auth settings apply to local stacks only)
  migrations/            schema, RLS, RPCs
  tests/database/        pgTAP tests
  seed.sql               demo data for a dev project
app/                     Angular app (Phase 3)
tools/migrate/           data migration (Phase 5)
```

## Setup (Supabase cloud)

Requires Node 20+. There is no local Supabase stack; everything targets the cloud project.

```bash
npm install
npx supabase login                       # or set SUPABASE_ACCESS_TOKEN
npm run db:link -- <project-ref>         # asks for the database password
npm run db:push:dry                      # preview pending migrations
npm run db:push                          # apply migrations
npm run db:test                          # pgTAP tests against the linked project (run in a dev project)
npm run db:types                         # regenerate TypeScript types for the app
```

`seed.sql` is not applied by `db push`. Run it once from the dashboard SQL editor in a dev project if you want demo data. **Never run it on production.**

In the dashboard, also turn off public sign-ups (Authentication → Sign In / Providers → *Allow new users to sign up*). `config.toml` only covers local stacks.

Create the first user in the dashboard (Authentication → Users → Add user). **The first user created becomes `admin`**; later users are `viewer` until an admin changes their role.

Prefer a separate **dev** project for `db:test` and experiments. The pgTAP tests run inside a transaction that is rolled back, so they leave no data behind.

## Roles

| Role | Can |
|---|---|
| `viewer` | read everything |
| `accountant` | + create account heads, customers, vouchers, manual day book rows |
| `admin` | + cancel vouchers, delete customers, company settings, manage users |

Vouchers are only written through the `create_voucher` / `cancel_voucher` RPCs. Numbers come from `voucher_counters`, one sequence per type (1 receipt, 2 payment).

## Open items

- Meaning of legacy `MAS_HEADS.CKORC` / `CBORP` (stored as `account_heads.kind` / `group_type`). This decides P&L vs Balance Sheet grouping.
- Printed samples of the Crystal reports (Day Book, Ledger, Trial Balance) to match layouts.
- Rotate the Azure SQL password committed in the VB repo before running the migration.
