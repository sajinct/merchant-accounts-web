import { formatNumber } from '@angular/common';
import { inject, LOCALE_ID, Pipe, PipeTransform } from '@angular/core';

/**
 * Formats a signed balance as an unsigned amount with a Dr/Cr suffix, so readers never
 * need to know the sign convention. `creditPositive` matches ledgers computed as
 * credit - debit; pass false for balances computed as debit - credit.
 */
@Pipe({ name: 'drCr' })
export class DrCrPipe implements PipeTransform {
  private readonly locale = inject(LOCALE_ID);

  transform(value: number | string | null | undefined, creditPositive = true): string {
    const amount = Number(value ?? 0);
    if (!Number.isFinite(amount)) return '';
    const formatted = formatNumber(Math.abs(amount), this.locale, '1.2-2');
    if (Math.abs(amount) < 0.005) return formatted;
    return `${formatted} ${amount > 0 === creditPositive ? 'Cr' : 'Dr'}`;
  }
}
