import { Routes } from '@angular/router';
import { voucherType } from './core/voucher-types';
import { authGuard, roleGuard } from './core/guards';
import { pendingChangesGuard } from './core/pending-changes';
import { Shell } from './layout/shell';

const editors = roleGuard('admin', 'accountant');
const admins = roleGuard('admin');

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login').then((m) => m.Login),
    title: 'Sign in',
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
        title: 'Dashboard',
      },

      // Receipt, Payment, Contra and Journal are one screen; the type is the route.
      {
        path: 'transactions/voucher/:type',
        canActivate: [editors],
        canDeactivate: [pendingChangesGuard],
        loadComponent: () =>
          import('./features/transactions/voucher-entry').then((m) => m.VoucherEntry),
        title: (route) => `${voucherType(route.paramMap.get('type'))?.label ?? 'Voucher'} entry`,
      },
      {
        path: 'transactions/voucher',
        pathMatch: 'full',
        redirectTo: 'transactions/voucher/receipt',
      },
      {
        path: 'transactions/vouchers',
        loadComponent: () =>
          import('./features/transactions/voucher-register').then((m) => m.VoucherRegister),
        title: 'Voucher Register',
      },
      { path: 'transactions/journals', redirectTo: 'transactions/voucher/journal' },
      {
        path: 'transactions/daybook-posting',
        canActivate: [editors],
        loadComponent: () =>
          import('./features/transactions/daybook-posting').then((m) => m.DaybookPosting),
        title: 'Ledger Verification',
      },
      {
        path: 'transactions/day-closing',
        loadComponent: () =>
          import('./features/transactions/day-closing').then((m) => m.DayClosing),
        title: 'Day Closing Balance',
      },

      {
        path: 'reports/daybook',
        loadComponent: () =>
          import('./features/reports/daybook-report').then((m) => m.DaybookReport),
        title: 'Day Book',
      },
      {
        path: 'reports/ledger',
        loadComponent: () => import('./features/reports/ledger-report').then((m) => m.LedgerReport),
        title: 'Ledger',
      },
      {
        path: 'reports/trial-balance',
        loadComponent: () =>
          import('./features/reports/trial-balance-report').then((m) => m.TrialBalanceReport),
        title: 'Trial Balance',
      },
      {
        path: 'reports/profit-and-loss',
        loadComponent: () =>
          import('./features/reports/profit-and-loss-report').then((m) => m.ProfitAndLossReport),
        title: 'Profit & Loss',
      },
      {
        path: 'reports/balance-sheet',
        loadComponent: () =>
          import('./features/reports/balance-sheet-report').then((m) => m.BalanceSheetReport),
        title: 'Balance Sheet',
      },
      {
        path: 'reports/cash-flow',
        loadComponent: () =>
          import('./features/reports/cash-flow-report').then((m) => m.CashFlowReport),
        title: 'Cash Flow',
      },

      {
        path: 'masters/account-heads',
        canDeactivate: [pendingChangesGuard],
        loadComponent: () => import('./features/masters/account-heads').then((m) => m.AccountHeads),
        title: 'Account Heads',
      },
      {
        path: 'masters/members',
        loadComponent: () => import('./features/masters/members').then((m) => m.Members),
        title: 'Members',
      },
      {
        path: 'masters/members/new',
        canDeactivate: [pendingChangesGuard],
        canActivate: [editors],
        loadComponent: () => import('./features/masters/member-form').then((m) => m.MemberForm),
        title: 'New Member',
      },
      {
        path: 'masters/members/:code',
        canDeactivate: [pendingChangesGuard],
        loadComponent: () => import('./features/masters/member-form').then((m) => m.MemberForm),
        title: 'Member',
      },

      {
        path: 'membership/subscriptions',
        loadComponent: () =>
          import('./features/membership/subscriptions').then((m) => m.Subscriptions),
        title: 'Subscriptions',
      },
      {
        path: 'membership/fees',
        canActivate: [admins],
        loadComponent: () =>
          import('./features/membership/subscription-fees').then((m) => m.SubscriptionFees),
        title: 'Fees & Settings',
      },

      // Kuri (Chit Fund) Management
      {
        path: 'kuri/schemes',
        loadComponent: () => import('./features/kuri/kuri-schemes').then((m) => m.KuriSchemes),
        title: 'Kuri Schemes',
      },
      {
        path: 'kuri/schemes/new',
        canActivate: [editors],
        canDeactivate: [pendingChangesGuard],
        loadComponent: () =>
          import('./features/kuri/kuri-scheme-form').then((m) => m.KuriSchemeForm),
        title: 'New Kuri Scheme',
      },
      {
        path: 'kuri/schemes/:id',
        loadComponent: () =>
          import('./features/kuri/kuri-scheme-detail').then((m) => m.KuriSchemeDetail),
        title: 'Kuri Scheme',
      },
      {
        path: 'kuri/schemes/:id/installments/:no',
        loadComponent: () =>
          import('./features/kuri/kuri-installment').then((m) => m.KuriInstallment),
        title: 'Kuri Installment',
      },
      {
        path: 'kuri/defaulters',
        loadComponent: () =>
          import('./features/kuri/kuri-defaulters').then((m) => m.KuriDefaulters),
        title: 'Kuri Defaulters',
      },
      {
        path: 'kuri/ledger',
        loadComponent: () =>
          import('./features/kuri/kuri-member-ledger').then((m) => m.KuriMemberLedger),
        title: 'Kuri Member Ledger',
      },

      {
        path: 'admin/financial-years',
        canActivate: [admins],
        loadComponent: () =>
          import('./features/admin/financial-years').then((m) => m.FinancialYears),
        title: 'Financial Years',
      },
      {
        path: 'admin/settings',
        canDeactivate: [pendingChangesGuard],
        canActivate: [admins],
        loadComponent: () =>
          import('./features/admin/company-settings').then((m) => m.CompanySettingsPage),
        title: 'Company Settings',
      },
      {
        path: 'admin/users',
        canActivate: [admins],
        loadComponent: () => import('./features/admin/users').then((m) => m.Users),
        title: 'Users',
      },
      {
        path: 'account/password',
        loadComponent: () =>
          import('./features/auth/change-password').then((m) => m.ChangePassword),
        title: 'Change Password',
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
