import { Component, inject } from '@angular/core';
import { FinancialYearService } from '../core/financial-year.service';
@Component({
  selector: 'app-financial-year-notice',
  template: ` <p class="hint" role="status">
    Financial year {{ fy.label() }} · {{ fy.start() }} to {{ fy.end() }}.
    @if (fy.closed()) {
      <strong>Closed — reports are available; posting and cancellation are locked.</strong>
    } @else {
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
