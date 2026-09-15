import { Component, inject, OnInit } from '@angular/core';
import { FinancialYearService } from '../core/financial-year.service';
import { NotifyService } from '../core/notify.service';
import { fyLabel } from './fy';

@Component({
  selector: 'app-financial-year-selector',
  template: `<label
    >Financial year
    <select aria-label="Financial year" [value]="fy.selected()" (change)="choose($event)">
      @for (year of fy.years(); track year.start_year) {
        <option [value]="year.start_year">
          {{ label(year.start_year) }}{{ year.closed_at ? ' · Closed' : '' }}
        </option>
      } @empty {
        <option [value]="fy.selected()">{{ fy.label() }}</option>
      }
    </select>
  </label>`,
  styles: `
    label {
      display: grid;
      gap: 2px;
      font-size: 10px;
      color: var(--app-muted);
    }
    select {
      min-height: 36px;
      max-width: 160px;
      border: 1px solid var(--app-border);
      border-radius: 6px;
      background: var(--app-surface, #fff);
      color: var(--app-ink);
      padding: 4px 8px;
      font: inherit;
      font-size: 12px;
    }
    @media (max-width: 480px) {
      select {
        max-width: 118px;
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
  protected choose(event: Event) {
    const value = Number((event.target as HTMLSelectElement).value);
    if (this.fy.years().some((y) => y.start_year === value)) this.fy.selected.set(value);
  }
}
