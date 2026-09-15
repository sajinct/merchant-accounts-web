import { computed, inject, Injectable, signal } from '@angular/core';
import { fyLabel, fyStart } from '../shared/fy';
import { isoDate } from '../shared/dates';
import { must, SupabaseService } from './supabase.service';

export interface FinancialYear {
  start_year: number;
  starts_on: string;
  ends_on: string;
  closed_at: string | null;
  closing_journal_id: number | null;
  equity_account_code: number | null;
}
@Injectable({ providedIn: 'root' })
export class FinancialYearService {
  private readonly sb = inject(SupabaseService).client;
  readonly years = signal<FinancialYear[]>([]);
  readonly selected = signal(fyStart());
  readonly label = computed(() => fyLabel(this.selected()));
  readonly start = computed(() => `${this.selected()}-04-01`);
  readonly end = computed(() => `${this.selected() + 1}-03-31`);
  readonly closed = computed(
    () => !!this.years().find((y) => y.start_year === this.selected())?.closed_at,
  );
  readonly entryDate = computed(() =>
    isoDate() < this.start() ? this.start() : isoDate() > this.end() ? this.end() : isoDate(),
  );
  contains(date: string) {
    return date >= this.start() && date <= this.end();
  }
  async load() {
    this.years.set(
      await must(
        this.sb.from('financial_years').select('*').order('start_year', { ascending: false }),
      ),
    );
    if (this.years().length && !this.years().some((y) => y.start_year === this.selected()))
      this.selected.set(this.years()[0].start_year);
  }
}
