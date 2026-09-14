import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver } from '@angular/cdk/layout';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { AuthService } from '../core/auth.service';
import { CompanyService } from '../core/company.service';
import { NotifyService } from '../core/notify.service';

interface NavItem {
  label: string;
  link: string;
  icon: string;
  editorsOnly?: boolean;
  adminOnly?: boolean;
}

const NAV: { heading: string; items: NavItem[] }[] = [
  {
    heading: 'Transactions',
    items: [
      { label: 'Payments / Receipts', link: '/transactions/vouchers', icon: 'receipt_long' },
      {
        label: 'Day Book Posting',
        link: '/transactions/daybook-posting',
        icon: 'publish',
        editorsOnly: true,
      },
      { label: 'Day Closing Balance', link: '/transactions/day-closing', icon: 'event_available' },
    ],
  },
  {
    heading: 'Reports',
    items: [
      { label: 'Day Book', link: '/reports/daybook', icon: 'menu_book' },
      { label: 'Ledger', link: '/reports/ledger', icon: 'account_balance_wallet' },
      { label: 'Trial Balance', link: '/reports/trial-balance', icon: 'balance' },
    ],
  },
  {
    heading: 'Masters',
    items: [
      { label: 'Account Heads', link: '/masters/account-heads', icon: 'list_alt' },
      { label: 'Members', link: '/masters/members', icon: 'group' },
    ],
  },
  {
    heading: 'Utilities',
    items: [
      { label: 'Company Settings', link: '/admin/settings', icon: 'business', adminOnly: true },
      { label: 'Users', link: '/admin/users', icon: 'manage_accounts', adminOnly: true },
      { label: 'Change Password', link: '/account/password', icon: 'lock' },
    ],
  },
];

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatSidenavModule,
  ],
  styleUrl: './shell.scss',
  template: `
    <a
      class="skip-link no-print"
      href="#main-content"
      (click)="$event.preventDefault(); main.focus()"
      >Skip to main content</a
    >
    <mat-sidenav-container class="workspace-shell">
      <mat-sidenav
        id="workspace-navigation"
        [mode]="isMobile() ? 'over' : 'side'"
        [opened]="drawerOpen()"
        (openedChange)="drawerOpen.set($event)"
        class="workspace-nav no-print"
      >
        <a
          class="brand"
          routerLink="/"
          (click)="closeMobileNav()"
          aria-label="Merchant Accounts home"
        >
          <span class="brand-mark"><mat-icon>account_balance</mat-icon></span>
          <span class="brand-name">Merchant<span>ACCOUNTS</span></span>
        </a>
        <nav class="sidebar-links" aria-label="Main navigation">
          @for (group of nav; track group.heading) {
            <div class="nav-heading">{{ group.heading }}</div>
            @for (item of group.items; track item.link) {
              @if (visible(item)) {
                <a
                  class="nav-link"
                  [routerLink]="item.link"
                  routerLinkActive="is-active"
                  ariaCurrentWhenActive="page"
                  (click)="closeMobileNav()"
                >
                  <mat-icon>{{ item.icon }}</mat-icon>
                  <span>{{ item.label }}</span>
                </a>
              }
            }
          }
        </nav>
      </mat-sidenav>
      <mat-sidenav-content class="workspace-content">
        <header class="workspace-topbar no-print">
          <button
            mat-icon-button
            type="button"
            (click)="drawerOpen.set(!drawerOpen())"
            [attr.aria-label]="drawerOpen() ? 'Close navigation' : 'Open navigation'"
            [attr.aria-expanded]="drawerOpen()"
            aria-controls="workspace-navigation"
          >
            <mat-icon>menu</mat-icon>
          </button>
          <div class="topbar-company">
            <strong>{{ company.settings()?.name || 'Merchant Accounts' }}</strong>
            <span>{{ company.settings()?.place || 'Accounting workspace' }}</span>
          </div>
          <span class="spacer"></span>
          <button
            class="user-control"
            type="button"
            [matMenuTriggerFor]="userMenu"
            aria-label="Open account menu"
          >
            <span class="user-avatar">{{ initials() }}</span>
            <span class="user-details"
              ><strong>{{ userName() }}</strong
              ><span>{{ auth.role() || 'Account' }}</span></span
            >
            <mat-icon class="user-chevron">expand_more</mat-icon>
          </button>
          <mat-menu #userMenu="matMenu">
            <div mat-menu-item disabled>Signed in as {{ auth.role() }}</div>
            <a mat-menu-item routerLink="/account/password"
              ><mat-icon>lock_outline</mat-icon> Change password</a
            >
            <button mat-menu-item type="button" (click)="signOut()">
              <mat-icon>logout</mat-icon> Sign out
            </button>
          </mat-menu>
        </header>
        <div class="workspace-breadcrumb no-print" aria-label="Current location">
          <mat-icon>grid_view</mat-icon><span>{{ context().heading }}</span
          ><mat-icon>chevron_right</mat-icon>
          <strong>{{ context().label }}</strong>
        </div>
        <main #main id="main-content" tabindex="-1"><router-outlet /></main>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
})
export class Shell implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly company = inject(CompanyService);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);
  private readonly breakpoints = inject(BreakpointObserver);

  protected readonly nav = NAV;
  protected readonly isMobile = signal(this.breakpoints.isMatched('(max-width: 959px)'));
  protected readonly drawerOpen = signal(!this.isMobile());
  protected readonly userName = computed(
    () => this.auth.profile()?.full_name || this.auth.profile()?.username || 'My account',
  );
  protected readonly initials = computed(() =>
    this.userName()
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase(),
  );
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  protected readonly context = computed(() => {
    const url = this.currentUrl().split('?')[0];
    for (const group of NAV) {
      const item = group.items.find(
        (entry) => url === entry.link || url.startsWith(entry.link + '/'),
      );
      if (item) return { heading: group.heading, label: item.label };
    }
    return { heading: 'Workspace', label: 'Overview' };
  });

  constructor() {
    this.breakpoints
      .observe('(max-width: 959px)')
      .pipe(takeUntilDestroyed())
      .subscribe(({ matches }) => {
        this.isMobile.set(matches);
        this.drawerOpen.set(!matches);
      });
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.closeMobileNav());
  }

  protected closeMobileNav(): void {
    if (this.isMobile()) this.drawerOpen.set(false);
  }

  ngOnInit(): void {
    this.company.load().catch((err) => this.notify.error(err));
  }

  protected visible(item: NavItem): boolean {
    if (item.adminOnly) {
      return this.auth.isAdmin();
    }
    if (item.editorsOnly) {
      return this.auth.canEdit();
    }
    return true;
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigate(['/login']);
  }
}
