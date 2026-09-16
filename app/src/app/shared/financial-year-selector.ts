import { Component, inject, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { FinancialYearService } from '../core/financial-year.service';
import { NotifyService } from '../core/notify.service';
import { fyLabel } from './fy';

/** Top-bar control for the financial year every page is scoped to. */
@Component({
  selector: 'app-financial-year-selector',
  imports: [MatButtonModule, MatIconModule, MatMenuModule],
  template: `
    <button
      type="button"
      class="year-control"
      [class.is-closed]="fy.closed()"
      [matMenuTriggerFor]="menu"
      [attr.aria-label]="
        'Financial year ' + fy.label() + (fy.closed() ? ', closed' : '') + '. Change year'
      "
    >
      <mat-icon class="year-icon">{{ fy.closed() ? 'lock' : 'event_note' }}</mat-icon>
      <span class="year-text">
        <span>Financial year</span>
        <strong>{{ fy.label() }}{{ fy.closed() ? ' · Closed' : '' }}</strong>
      </span>
      <mat-icon class="year-chevron">expand_more</mat-icon>
    </button>
    <mat-menu #menu="matMenu" class="year-menu">
      <div mat-menu-item disabled class="year-menu-heading">Financial year</div>
      @for (year of fy.years(); track year.start_year) {
        <button
          mat-menu-item
          type="button"
          (click)="choose(year.start_year)"
          [attr.aria-current]="year.start_year === fy.selected() ? 'true' : null"
        >
          <mat-icon>{{ year.start_year === fy.selected() ? 'check' : '' }}</mat-icon>
          <span class="year-option">
            {{ label(year.start_year) }}
            @if (year.closed_at) {
              <span class="year-flag"><mat-icon>lock</mat-icon>Closed</span>
            }
          </span>
        </button>
      } @empty {
        <button mat-menu-item type="button" disabled>
          <mat-icon>check</mat-icon>{{ fy.label() }}
        </button>
      }
    </mat-menu>
  `,
  styles: `
    .year-control {
      display: flex;
      align-items: center;
      gap: 9px;
      min-height: 40px;
      padding: 4px 8px 4px 10px;
      border: 1px solid var(--app-border);
      border-radius: 8px;
      background: var(--app-surface);
      color: var(--app-ink);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .year-control:hover {
      border-color: var(--app-accent-border);
      background: var(--app-accent-tint);
    }
    .year-control.is-closed {
      border-color: var(--app-warning-ink);
      background: var(--app-warning-bg);
      color: var(--app-warning-ink);
    }
    .year-text {
      display: grid;
      gap: 1px;
      min-width: 0;
    }
    .year-text span {
      color: var(--app-muted);
      font-size: 10px;
    }
    .year-control.is-closed .year-text span {
      color: inherit;
    }
    .year-text strong {
      font-size: 12px;
      font-weight: 650;
      white-space: nowrap;
    }
    .year-icon {
      flex-shrink: 0;
      color: var(--app-accent);
    }
    .year-control.is-closed .year-icon {
      color: inherit;
    }
    .year-icon,
    .year-chevron {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .year-chevron {
      flex-shrink: 0;
      color: var(--app-muted);
    }
    .year-option {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .year-flag {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 2px 6px;
      border-radius: 5px;
      background: var(--app-warning-bg);
      color: var(--app-warning-ink);
      font-size: 10px;
      font-weight: 600;
    }
    .year-flag mat-icon {
      width: 12px;
      height: 12px;
      font-size: 12px;
    }
    .year-menu-heading {
      font-size: 10px;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    @media (max-width: 599px) {
      .year-control {
        gap: 6px;
        padding: 4px 6px;
      }
      .year-text span,
      .year-chevron {
        display: none;
      }
    }
  `,
})
export class FinancialYearSelector implements OnInit {
  protected readonly fy = inject(FinancialYearService);
  private readonly notify = inject(NotifyService);
  protected readonly label = fyLabel;

  async ngOnInit() {
    try {
      await this.fy.load();
    } catch (error) {
      this.notify.error(error);
    }
  }

  protected choose(startYear: number) {
    if (this.fy.years().some((y) => y.start_year === startYear)) this.fy.selected.set(startYear);
  }
}
