import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FinancialYearService } from '../core/financial-year.service';

/**
 * The date range a page is scoped to. The workspace banner carries the closed-year
 * warning, so this stays short.
 */
@Component({
  selector: 'app-financial-year-notice',
  imports: [DatePipe],
  template: ` <p class="hint" role="status">
    Financial year {{ fy.label() }} · {{ fy.start() | date: 'dd-MMM-yyyy' }} to
    {{ fy.end() | date: 'dd-MMM-yyyy' }}.
    @if (!fy.closed()) {
      Dates must be within the selected year. When switching years, unfinished entry dates are kept
      for you to review.
    }
  </p>`,
  styles: `
    :host {
      display: block;
      margin: 0 0 16px;
    }
    p {
      margin: 0;
      line-height: 1.6;
    }
  `,
})
export class FinancialYearNotice {
  protected readonly fy = inject(FinancialYearService);
}
