/** Sidebar structure. Letters are unique within each level, so typing one is unambiguous. */
export interface NavItem {
  shortcut: string;
  label: string;
  link: string;
  icon: string;
  editorsOnly?: boolean;
  adminOnly?: boolean;
}

export interface NavGroup {
  heading: string;
  icon: string;
  shortcut: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    heading: 'Transactions',
    icon: 'swap_horiz',
    shortcut: 'T',
    items: [
      // The four voucher types are one screen; the link carries the type.
      {
        label: 'Receipt',
        shortcut: 'R',
        link: '/transactions/voucher/receipt',
        icon: 'south_west',
        editorsOnly: true,
      },
      {
        label: 'Payment',
        shortcut: 'P',
        link: '/transactions/voucher/payment',
        icon: 'north_east',
        editorsOnly: true,
      },
      {
        label: 'Contra',
        shortcut: 'C',
        link: '/transactions/voucher/contra',
        icon: 'swap_horiz',
        editorsOnly: true,
      },
      {
        label: 'Journal',
        shortcut: 'J',
        link: '/transactions/voucher/journal',
        icon: 'balance',
        editorsOnly: true,
      },
      {
        label: 'Voucher Register',
        shortcut: 'V',
        link: '/transactions/vouchers',
        icon: 'receipt_long',
      },
      {
        label: 'Ledger Verification',
        shortcut: 'D',
        link: '/transactions/daybook-posting',
        icon: 'publish',
        editorsOnly: true,
      },
      {
        label: 'Day Closing Balance',
        shortcut: 'B',
        link: '/transactions/day-closing',
        icon: 'event_available',
      },
    ],
  },
  {
    heading: 'Reports',
    icon: 'bar_chart',
    shortcut: 'R',
    items: [
      { label: 'Day Book', shortcut: 'D', link: '/reports/daybook', icon: 'menu_book' },
      { label: 'Ledger', shortcut: 'L', link: '/reports/ledger', icon: 'account_balance_wallet' },
      { label: 'Trial Balance', shortcut: 'T', link: '/reports/trial-balance', icon: 'balance' },
    ],
  },
  {
    heading: 'Membership',
    icon: 'groups',
    shortcut: 'M',
    items: [
      { label: 'Members', shortcut: 'M', link: '/masters/members', icon: 'group' },
      {
        label: 'Subscriptions',
        shortcut: 'S',
        link: '/membership/subscriptions',
        icon: 'card_membership',
      },
      {
        label: 'Fees & Settings',
        shortcut: 'F',
        link: '/membership/fees',
        icon: 'price_change',
        adminOnly: true,
      },
    ],
  },
  {
    heading: 'Masters',
    icon: 'folder_open',
    shortcut: 'A',
    items: [
      { label: 'Account Heads', shortcut: 'A', link: '/masters/account-heads', icon: 'list_alt' },
    ],
  },
  {
    heading: 'Utilities',
    icon: 'settings',
    shortcut: 'U',
    items: [
      {
        label: 'Company Settings',
        shortcut: 'C',
        link: '/admin/settings',
        icon: 'business',
        adminOnly: true,
      },
      {
        label: 'Financial Years',
        shortcut: 'F',
        link: '/admin/financial-years',
        icon: 'date_range',
        adminOnly: true,
      },
      {
        label: 'Users',
        shortcut: 'U',
        link: '/admin/users',
        icon: 'manage_accounts',
        adminOnly: true,
      },
      { label: 'Change Password', shortcut: 'P', link: '/account/password', icon: 'lock' },
    ],
  },
];
