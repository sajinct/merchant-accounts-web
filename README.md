# Merchant Accounts (web)

Double-entry accounting for Merchant Accounts: receipt, payment, contra and journal vouchers on one entry screen, opening balances, subscriptions, and cash book / ledger / trial balance reports.

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

### Install as an app (PWA)

Production builds include an install manifest and Angular service worker. Open the HTTPS deployment and use the browser's **Install app** option; on iPhone or iPad, use Safari's **Share → Add to Home Screen**. Installation availability depends on the browser. The manifest, app shortcuts and worker use the app directory, including a GitHub Pages repository subpath.

The service worker caches the application files and icons. Sign-in, account data, reports and saving changes still require a connection to Supabase; financial records and API responses are not cached by the worker. App updates are downloaded in the background and applied on a subsequent load, without interrupting an open form.

To update from an installed mobile or desktop shortcut, open the app and choose **Account menu → Check for app updates**. The sign-in screen also has **Check for app updates**. Once the latest files have downloaded, save any unfinished form entries and choose **Reload and update**. The app reloads the current page; reinstalling the shortcut is unnecessary. An update-ready notice appears when the worker downloads a version in the background. **Later** leaves the current page running. Offline checks, server failures, and failed downloads offer a retry instead of claiming the app is up to date. The check has a 30-second timeout that includes service-worker registration on first launch.

Publish the full production output together, including `ngsw.json`, `ngsw-worker.js`, `index.html` and the hashed assets. Keep the deployment's HTTPS URL and manifest identity stable so existing installed shortcuts continue to work. This update control becomes available after users first receive the release that includes it. The update flow follows [Angular's service-worker update guidance](https://angular.dev/ecosystem/service-workers/communications#updating-to-the-latest-version) and reloads the page only on request.

The icon set includes an SVG favicon, 16/32/48px ICO, 192/512px install icons, separate maskable icons, and a 180px Apple touch icon. Regenerate the assets with `npm run icons:generate` inside `app/`. After `npm run build` or `npm run build:pages`, run `npm run check:pwa` to validate the built manifest, icon sizes, cached assets and deployment paths. CI runs this check before deploying.

Service workers are disabled during normal `npm start` development. To check the installed experience locally, run `npm start -- --configuration production` and open localhost. See [Angular's service-worker guide](https://angular.dev/ecosystem/service-workers/getting-started) and [browser installation requirements](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).

### Appearance (light and dark)

The app ships both a light and a dark palette and follows the operating system's setting. **Account menu → Appearance** overrides it with *Light*, *Dark* or *Match system*; the choice is stored per browser and applied before the first paint, so switching never flashes the other theme. Printing always uses the light palette, whatever is on screen.

Colours live in one place: the `scheme-light` and `scheme-dark` mixins in `app/src/styles.scss`. Components only ever reference an `--app-*` token, so a colour is defined twice and used everywhere. `npm run check:contrast` reads both mixins and measures every text, icon, focus-ring and chart pairing against WCAG 2.2 (4.5:1 for text, 3:1 for graphics). It needs no build, and CI runs it before the tests.

## Roles

| Role | Can |
|---|---|
| `viewer` | read everything, run reports |
| `accountant` | + account heads, members, vouchers of every type, subscription payments, ledger verification |
| `admin` | + cancel vouchers and subscription payments, subscription fees, delete members, company settings, manage users |

Vouchers are only written through the `post_voucher` / `cancel_voucher` RPCs. Numbers come from `voucher_counters`, one sequence per type (1 receipt, 2 payment, 3 contra, 4 journal). Cancelling a voucher posts a balancing reversal and keeps the original.

## Member directory

Masters → Members pages and sorts in the database rather than in the browser, so the list stays the same size however many members there are.

Names sort case-insensitively. Postgres orders text by the database collation, which under a `C` collation puts every capitalised name ahead of every lowercase one, so a directory typed by different hands reads as two lists. `customers.name_sort` is a stored, indexed lowercase copy of the name, and every ordered query — the member list and the dues report — sorts on it.

## Membership subscriptions

Members pay one yearly subscription per **financial year (1 April – 31 March)**, labelled like `2026-27`.

- **Fees:** an admin sets the fee for each year under Membership → Subscription Fees. Everyone pays the same fee for a given year, and changing a year's fee changes the balances for that year.
- **Who owes what:** a member owes the fee for every year from the financial year of *Joined on* up to the financial year of *Left on*. A member with no join date owes all years that have a fee.
- **Payments:** on the member's page, record a payment against a year. Part payments are allowed, but a payment can't exceed that year's balance. Unpaid balances carry forward as **arrears**.
- **Accounts:** each payment creates a receipt voucher against the subscription account head, through the same posting engine as any other receipt. The migration creates a `MEMBERSHIP SUBSCRIPTION` head and selects it; you can change it on the Subscription Fees page. Receipts reach the day book and reports after **Day Book Posting**, like any other voucher.
- **Cancelling:** only admins can cancel a payment, from the member's page. That also cancels its receipt voucher. Subscription receipts can't be cancelled from the voucher register.
- **Reports:** Membership → Subscriptions lists every member for a year with fee, paid, balance, arrears and total due. It can be filtered to *Owing* or *Paid up*, printed, or exported to CSV.

- **Dashboard:** the *Subscription dues* figure comes from `subscription_dues_summary`, which totals the outstanding balances in the database and returns a single row. The per-member report behind the Subscriptions page is unchanged; only the dashboard stopped downloading it.

Database objects: `subscription_years`, `subscription_payments`, `record_subscription_payment`, `cancel_subscription_payment`, `member_subscription_years`, `rpt_subscription_status`, `subscription_dues_summary`.

## Vouchers

Receipt, Payment, Contra and Journal are four menu entries, four routes and **one screen**: `VoucherEntry` at `/transactions/voucher/<type>`. The voucher type decides the headings, which accounts the lines may use, whether simplified entry is offered and which rules apply; everything else — account lookup, numbering, narration, validation, saving, printing, the audit trail — is shared.

A voucher is a header (`vouchers`) and any number of debit/credit lines (`daybook`), so one voucher can carry many account heads. There is no "from account / to account".

| Voucher | Posts | Line accounts |
|---|---|---|
| Receipt (R) | Cash/bank Dr, heads Cr | anything except the cash side itself |
| Payment (P) | Heads Dr, cash/bank Cr | anything except the cash side itself |
| Contra (C) | Between your own accounts | cash and bank only |
| Journal (V) | A general adjustment | no cash/bank unless an admin enables it |

**Simplified and advanced entry.** Receipts and payments open in simplified mode: choose the cash or bank account once, then enter one amount per head. A member paying ₹1,000 membership, ₹500 welfare fund, ₹100 late fee and ₹400 donation is four lines and one total; the ₹2,000 cash debit is generated. *Advanced accounting view* shows the same voucher as debit and credit columns with a running difference, and saving is refused until the difference is zero. Contra and journal vouchers always use the debit/credit grid. Amounts typed in one mode carry over to the other.

**The posting engine.** The browser prepares the transaction; `post_voucher` does the accounting. In one database transaction it re-validates every account, generates the cash counterpart in simplified mode, checks that debits equal credits, allocates the voucher number under the counter's row lock, writes the header and the lines, and rolls the lot back if any step fails. Repeating a save with the same request id returns the first voucher instead of posting a second — a lost connection cannot double-post. Future modules (fee collection, supplier payment, payroll, loan collection) post through the same function rather than writing their own entries; subscription collection already does, through the single-head `create_voucher` wrapper.

**Account heads** carry a classification (asset, liability, equity, income, expense), a cash/bank flag, and a *Posting* setting: *Ledger* accounts take entries, *Group* accounts only organise the chart, and *Retired* accounts keep their history but take no new entries. Group and retired accounts are left out of voucher account lists and refused by the posting engine; a reversal can still reach a retired account, so cancelling an old voucher never gets stuck.

**Validation**, in the database and mirrored in the screen so mistakes are caught before a round trip: at least two ledger entries, equal debits and credits, positive amounts with at most two decimals, classified and active non-group accounts, a cash/bank debit on a receipt and a credit on a payment, cash and bank only on a contra, configurable restrictions on a journal, a date inside an open financial year, and unique numbers per type. Posted vouchers are never edited or deleted: cancellation writes a balancing reversal on the original date and keeps both.

**Opening balances** stay on the Journal screen, for admins, under *Entry type*. They open the books rather than record a transaction, so they take no voucher number and may touch cash and bank accounts.

**Voucher Register** lists everything posted in the year, filtered by type, with each voucher's lines, its reference, party and cancellation reason. Admins cancel vouchers and reverse journals from there.

Database objects: `vouchers` (header), `daybook` (details), `journals` (posting, idempotency, immutability), `post_voucher`, `create_voucher`, `cancel_voucher`, `next_voucher_no`, `voucher_counters`.

## Screens (from the desktop menu)

| Desktop | Web |
|---|---|
| Payment/Receipts Entry | Transactions → Receipt / Payment |
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

### Release version numbers

The update dialog shows the installed version and the latest server version (for example, 2026.09.15.v1). The server label is fetched without using the offline cache; seeing a newer label does not mean its files have finished downloading. Wait for **Reload and update**.

GitHub Actions automatically generates the deployment version before testing and building, using the current date in India and the workflow run number: for example, run 42 on September 15 produces **2026.09.15.v42**. The revision increases across workflow runs and does not reset each day. Retrying the same run on the same date retains its version. The generated version is embedded in both the app and the service-worker manifest and shown in the Actions summary. These generated changes stay in the build workspace; no version commit or repository write permission is needed.

For releases built locally, **npm run release:version** remains available: it starts at v1 on a new date and increments the revision for further local releases that day. Both build commands synchronize the selected label into the service-worker manifest without incrementing it. Deploy the complete build output together. Older releases without version metadata display an explanatory label.

## Double-entry upgrade

See [Double-entry setup and migration](docs/double-entry-upgrade.md) for account classification, opening balances, fresh-start migration and verification. Receipts and payments now post immediately; the former Day Book Posting screen verifies the ledger.

## Financial years

Use the header selector for the active accounting year. Admins manage April–March years, close them into a selected retained-earnings equity account, and reopen them with an audit reason in **Utilities → Financial Years**. See [Financial-year setup and closing](docs/financial-years.md). Ledger balances carry forward automatically without duplicate opening entries.
