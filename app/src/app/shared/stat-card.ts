import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** One figure in a summary row: label, value, and an icon on the right. */
@Component({
  selector: 'app-stat-card',
  host: { class: 'summary-card' },
  imports: [MatIconModule],
  styles: `
    /* Money leaving the business reads warm, money arriving reads like the accent. */
    .summary-icon.payment-icon {
      background: var(--app-payment-bg);
      color: var(--app-payment-icon-ink);
    }
  `,
  template: `
    <div>
      <span class="summary-label">{{ label() }}</span>
      <strong class="summary-value" [class.danger]="negative()">{{ value() }}</strong>
    </div>
    @if (icon()) {
      <div class="summary-icon" [class.payment-icon]="tone() === 'payment'">
        <mat-icon>{{ icon() }}</mat-icon>
      </div>
    }
  `,
})
export class StatCard {
  readonly label = input.required<string>();
  readonly value = input.required<string | number | null>();
  readonly icon = input('');
  /** 'payment' tints the icon like money leaving the business. */
  readonly tone = input<'accent' | 'payment'>('accent');
  readonly negative = input(false);
}
