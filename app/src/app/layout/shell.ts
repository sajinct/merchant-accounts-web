import { Component, inject, OnInit } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
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
      { label: 'Day Book Posting', link: '/transactions/daybook-posting', icon: 'publish', editorsOnly: true },
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
    MatListModule,
    MatMenuModule,
    MatSidenavModule,
    MatToolbarModule,
  ],
  template: `
    <mat-toolbar class="app-toolbar no-print">
      <button mat-icon-button type="button" (click)="drawer.toggle()" aria-label="Toggle menu">
        <mat-icon>menu</mat-icon>
      </button>
      <div class="app-title">
        <span class="app-company">{{ company.settings()?.name || 'Merchant Accounts' }}</span>
        <span class="app-place">{{ company.settings()?.place }}</span>
      </div>
      <span class="spacer"></span>
      <button mat-button type="button" [matMenuTriggerFor]="userMenu">
        <mat-icon>account_circle</mat-icon>
        {{ auth.profile()?.full_name || auth.profile()?.username }}
      </button>
      <mat-menu #userMenu="matMenu">
        <div class="menu-role" mat-menu-item disabled>Role: {{ auth.role() }}</div>
        <a mat-menu-item routerLink="/account/password"><mat-icon>lock</mat-icon> Change password</a>
        <button mat-menu-item type="button" (click)="signOut()"><mat-icon>logout</mat-icon> Sign out</button>
      </mat-menu>
    </mat-toolbar>

    <mat-sidenav-container class="app-container">
      <mat-sidenav #drawer mode="side" opened class="app-sidenav no-print">
        <mat-nav-list>
          @for (group of nav; track group.heading) {
            <div mat-subheader>{{ group.heading }}</div>
            @for (item of group.items; track item.link) {
              @if (visible(item)) {
                <a mat-list-item [routerLink]="item.link" routerLinkActive #rla="routerLinkActive" [activated]="rla.isActive">
                  <mat-icon matListItemIcon>{{ item.icon }}</mat-icon>
                  <span matListItemTitle>{{ item.label }}</span>
                </a>
              }
            }
          }
        </mat-nav-list>
      </mat-sidenav>
      <mat-sidenav-content class="app-content">
        <router-outlet />
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
})
export class Shell implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly company = inject(CompanyService);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);

  protected readonly nav = NAV;

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
