import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/guards';
import { Shell } from './layout/shell';

const editors = roleGuard('admin', 'accountant');
const admins = roleGuard('admin');

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/auth/login').then((m) => m.Login), title: 'Sign in' },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'transactions/vouchers' },

      {
        path: 'transactions/vouchers',
        loadComponent: () => import('./features/transactions/vouchers').then((m) => m.Vouchers),
        title: 'Payments / Receipts',
      },
      {
        path: 'transactions/daybook-posting',
        canActivate: [editors],
        loadComponent: () => import('./features/transactions/daybook-posting').then((m) => m.DaybookPosting),
        title: 'Day Book Posting',
      },
      {
        path: 'transactions/day-closing',
        loadComponent: () => import('./features/transactions/day-closing').then((m) => m.DayClosing),
        title: 'Day Closing Balance',
      },

      {
        path: 'reports/daybook',
        loadComponent: () => import('./features/reports/daybook-report').then((m) => m.DaybookReport),
        title: 'Day Book',
      },
      {
        path: 'reports/ledger',
        loadComponent: () => import('./features/reports/ledger-report').then((m) => m.LedgerReport),
        title: 'Ledger',
      },
      {
        path: 'reports/trial-balance',
        loadComponent: () => import('./features/reports/trial-balance-report').then((m) => m.TrialBalanceReport),
        title: 'Trial Balance',
      },

      {
        path: 'masters/account-heads',
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
        canActivate: [editors],
        loadComponent: () => import('./features/masters/member-form').then((m) => m.MemberForm),
        title: 'New Member',
      },
      {
        path: 'masters/members/:code',
        loadComponent: () => import('./features/masters/member-form').then((m) => m.MemberForm),
        title: 'Member',
      },

      {
        path: 'admin/settings',
        canActivate: [admins],
        loadComponent: () => import('./features/admin/company-settings').then((m) => m.CompanySettingsPage),
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
        loadComponent: () => import('./features/auth/change-password').then((m) => m.ChangePassword),
        title: 'Change Password',
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
