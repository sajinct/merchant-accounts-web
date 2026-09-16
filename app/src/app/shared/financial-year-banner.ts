import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../core/auth.service';
import { FinancialYearService } from '../core/financial-year.service';
import { isoDate } from './dates';

/** Workspace-wide warning that the selected year no longer accepts postings. */
@Component({
  selector: 'app-financial-year-banner',
  imports: [DatePipe, RouterLink, MatIconModule],
  template: `
    @if (fy.closed()) {
      <div class="year-banner" role="status">
        <mat-icon>lock</mat-icon>
        <p>
          <strong>Financial year {{ fy.label() }} is closed.</strong>
          Reports and enquiries work as usual; new entries, payments and cancellations are locked.
          Switch to an open year to continue entry.
        </p>
        @if (auth.isAdmin()) {
          <a routerLink="/admin/financial-years">Manage years</a>
        }
      </div>
    } @else if (outsideYear()) {
      <div class="year-banner subtle" role="status">
        <mat-icon>event_note</mat-icon>
        <p>
          You are working in <strong>{{ fy.label() }}</strong
          >, which does not include today. Entries default to
          {{ fy.entryDate() | date: 'dd-MMM-yyyy' }}.
        </p>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .year-banner {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      padding: 10px 28px;
      background: var(--app-warning-bg);
      color: var(--app-warning-ink);
      border-bottom: 1px solid var(--app-border);
      font-size: 12px;
    }
    .year-banner.subtle {
      background: var(--app-surface-muted);
      color: var(--app-ink-soft);
    }
    .year-banner mat-icon {
      flex-shrink: 0;
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .year-banner p {
      flex: 1 1 260px;
      margin: 0;
      min-width: 0;
      line-height: 1.6;
    }
    .year-banner a {
      margin-left: auto;
      color: inherit;
      font-weight: 600;
      white-space: nowrap;
    }
    @media (max-width: 599px) {
      .year-banner {
        padding: 10px 16px;
      }
    }
  `,
})
export class FinancialYearBanner {
  protected readonly fy = inject(FinancialYearService);
  protected readonly auth = inject(AuthService);

  protected outsideYear(): boolean {
    return !this.fy.contains(isoDate());
  }
}
