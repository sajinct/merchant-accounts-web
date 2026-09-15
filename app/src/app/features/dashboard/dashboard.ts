import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/auth.service';
import { CompanyService } from '../../core/company.service';
import { fyLabel, fyStart } from '../../shared/fy';

@Component({
  selector: 'app-dashboard',
  imports: [DatePipe, RouterLink, MatIconModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="page-heading">
          <span class="eyebrow">Workspace overview</span>
          <h1>Dashboard</h1>
          <p class="page-description">
            Welcome back, {{ auth.profile()?.full_name || auth.profile()?.username || 'there' }}.
            Choose where to start.
          </p>
        </div>
      </div>
      <section class="welcome-panel" aria-label="Your workspace">
        <div>
          <span class="eyebrow">{{ today | date: 'EEEE, d MMMM yyyy' }}</span>
          <h2>{{ company.settings()?.name || 'Merchant Accounts' }}</h2>
          <p>Your daily accounts, membership and reports in one place.</p>
        </div>
        <div class="year">
          <span>Financial year</span><strong>{{ financialYear }}</strong>
        </div>
      </section>
      <div class="section-header">
        <div>
          <h2>Quick access</h2>
          <p>Open a workspace to get started.</p>
        </div>
      </div>
      <div class="dashboard-grid">
        @for (card of cards; track card.link) {
          @if (!card.editor || auth.canEdit()) {
            <a class="dashboard-card" [routerLink]="card.link">
              <mat-icon class="card-icon">{{ card.icon }}</mat-icon>
              <div>
                <h3>{{ card.title }}</h3>
                <p>{{ card.description }}</p>
              </div>
              <mat-icon class="card-arrow">arrow_forward</mat-icon>
            </a>
          }
        }
      </div>
      <section class="navigation-tip">
        <mat-icon>keyboard</mat-icon>
        <div>
          <strong>Move through your workspace with the keyboard</strong>
          <p>
            Open the menu and press the letter beside an item. Esc opens navigation from a page,
            returns to all menus, then brings you back to this dashboard.
          </p>
        </div>
      </section>
    </div>
  `,
  styles: `
    .welcome-panel {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      padding: 28px;
      background: #172c39;
      color: #fff;
      border-radius: 12px;
    }
    .welcome-panel .eyebrow {
      color: #8fd7c6;
    }
    .welcome-panel h2 {
      margin: 10px 0;
      font-size: 24px;
      letter-spacing: -0.5px;
    }
    .welcome-panel p {
      margin: 0;
      color: #c1d0d9;
      font-size: 13px;
      line-height: 1.7;
    }
    .year {
      flex-shrink: 0;
      display: grid;
      gap: 8px;
      border-left: 1px solid #ffffff26;
      padding-left: 28px;
    }
    .year span {
      font-size: 11px;
      color: #c1d0d9;
    }
    .year strong {
      font-size: 18px;
    }
    .dashboard-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
    }
    .dashboard-card {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      padding: 22px;
      border: 1px solid var(--app-border);
      border-radius: var(--app-radius);
      background: #fff;
      color: var(--app-ink);
      text-decoration: none;
    }
    .dashboard-card:hover {
      border-color: #63ab9c;
      background: #f5fbf8;
    }
    .dashboard-card:focus-visible {
      outline: 2px solid var(--app-accent);
      outline-offset: 3px;
    }
    .dashboard-card div {
      min-width: 0;
    }
    .dashboard-card h3 {
      margin: 2px 0 8px;
      font-size: 14px;
    }
    .dashboard-card p {
      margin: 0;
      color: var(--app-muted);
      font-size: 12px;
      line-height: 1.7;
    }
    .card-icon {
      flex-shrink: 0;
      color: var(--app-accent);
    }
    .card-arrow {
      margin-left: auto;
      flex-shrink: 0;
      width: 16px;
      height: 16px;
      font-size: 16px;
      color: #80938c;
    }
    .navigation-tip {
      display: flex;
      gap: 14px;
      padding: 22px 0;
      color: var(--app-muted);
    }
    .navigation-tip mat-icon {
      flex-shrink: 0;
    }
    .navigation-tip strong {
      font-size: 12px;
      font-weight: 600;
    }
    .navigation-tip p {
      margin: 6px 0 0;
      font-size: 12px;
      line-height: 1.7;
    }
    @media (max-width: 1199px) {
      .dashboard-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @media (max-width: 599px) {
      .dashboard-grid {
        grid-template-columns: minmax(0, 1fr);
        gap: 12px;
      }
      .welcome-panel {
        align-items: flex-start;
        flex-direction: column;
        padding: 22px;
        gap: 18px;
      }
      .year {
        border: 0;
        padding: 0;
      }
      .dashboard-card {
        padding: 18px;
      }
    }
  `,
})
export class Dashboard {
  protected readonly auth = inject(AuthService);
  protected readonly company = inject(CompanyService);
  protected readonly today = new Date();
  protected readonly financialYear = fyLabel(fyStart());
  protected readonly cards = [
    {
      title: 'Payments / Receipts',
      description: 'Review and manage daily transactions.',
      icon: 'receipt_long',
      link: '/transactions/vouchers',
    },
    {
      title: 'Members',
      description: 'Find member details and manage records.',
      icon: 'groups',
      link: '/masters/members',
    },
    {
      title: 'Subscriptions',
      description: 'Review membership fees and outstanding dues.',
      icon: 'card_membership',
      link: '/membership/subscriptions',
    },
    {
      title: 'Day Book',
      description: 'Review daily receipts, payments and balances.',
      icon: 'menu_book',
      link: '/reports/daybook',
    },
    {
      title: 'Ledger',
      description: 'Explore account activity and balances.',
      icon: 'account_balance_wallet',
      link: '/reports/ledger',
    },
    {
      title: 'Ledger Verification',
      description: 'Verify that every journal is balanced.',
      icon: 'publish',
      link: '/transactions/daybook-posting',
      editor: true,
    },
  ];
}
