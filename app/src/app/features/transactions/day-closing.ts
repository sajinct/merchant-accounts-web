import { FinancialYearScope } from '../../shared/financial-year-scope';
import { FinancialYearNotice } from '../../shared/financial-year-notice';
import { EnterToNext } from '../../shared/enter-to-next.directive';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { DayClosingRow } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { must, SupabaseService } from '../../core/supabase.service';
import { downloadCsv } from '../../shared/csv';
import { firstOfMonth, isoDate } from '../../shared/dates';
import { ReportShell } from '../../shared/report-shell';
import { PageHeader } from '../../shared/page-header';
import { EmptyState } from '../../shared/empty-state';
import { StatCard } from '../../shared/stat-card';

@Component({
  selector: 'app-day-closing',
  imports: [
    EnterToNext,
    StatCard,
    EmptyState,
    PageHeader,
    FinancialYearScope,
    FinancialYearNotice,
    DatePipe,
    DecimalPipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatDatepickerModule,
    MatInputModule,
    MatIconModule,
    ReportShell,
  ],
  template: `
    <div class="page">
      <app-page-header
        class="no-print"
        eyebrow="Transactions"
        heading="Day closing balance"
        description="All cash and bank accounts combined. Review daily balances and quickly identify negative closing positions."
      />
      <app-report-shell
        title="Day Closing Balance"
        [subtitle]="subtitle()"
        [loading]="loading()"
        [hasData]="rows().length > 0"
        (csv)="exportCsv()"
      >
        <app-financial-year-notice />
        <form
          appEnterToNext
          [appFinancialYearScope]="'report'"
          (yearChanged)="invalidateReport()"
          filters
          [formGroup]="form"
          (ngSubmit)="run()"
          class="filter-row"
        >
          <mat-form-field subscriptSizing="dynamic"
            ><mat-label>From date</mat-label
            ><input
              matInput
              [matDatepicker]="fromPicker"
              formControlName="from"
              placeholder="dd/mm/yyyy" /><mat-datepicker-toggle
              matIconSuffix
              [for]="fromPicker" /><mat-datepicker #fromPicker
          /></mat-form-field>
          <mat-form-field subscriptSizing="dynamic"
            ><mat-label>To date</mat-label
            ><input
              matInput
              [matDatepicker]="toPicker"
              formControlName="to"
              placeholder="dd/mm/yyyy" /><mat-datepicker-toggle
              matIconSuffix
              [for]="toPicker" /><mat-datepicker #toPicker
          /></mat-form-field>
          <mat-checkbox formControlName="negativeOnly">Negative balances only</mat-checkbox>
          <button mat-flat-button type="submit" [disabled]="form.invalid || loading()">
            <mat-icon>play_arrow</mat-icon>{{ loading() ? 'Loading…' : 'Run report' }}
          </button>
        </form>

        @if (loading()) {
          <app-empty-state message="Loading daily closing balances…" status />
        } @else if (ran() && rows().length) {
          <div class="summary-grid closing-summary no-print">
            <app-stat-card label="Days shown" icon="calendar_month" [value]="rows().length" />
            <app-stat-card
              label="Lowest balance shown"
              icon="south"
              [value]="lowestBalance() | number: '1.2-2'"
              [negative]="lowestBalance() < 0"
            />
            <app-stat-card
              label="Last balance shown"
              icon="account_balance_wallet"
              [value]="lastBalance() | number: '1.2-2'"
              [negative]="lastBalance() < 0"
            />
          </div>
          <div
            class="table-wrap closing-table-wrap"
            tabindex="0"
            role="region"
            aria-label="Daily closing balances"
          >
            <table class="report-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th class="num">Closing balance</th>
                </tr>
              </thead>
              <tbody>
                @for (row of rows(); track row.tran_date) {
                  <tr [class.negative]="row.closing_balance < 0">
                    <td>{{ row.tran_date | date: 'dd MMM yyyy' }}</td>
                    <td class="num">{{ row.closing_balance | number: '1.2-2' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else if (ran()) {
          <app-empty-state
            icon="event_busy"
            heading="No matching balances"
            message="There are no day book entries matching this date range and filter."
          />
        } @else {
          <app-empty-state
            class="no-print"
            icon="account_balance_wallet"
            heading="A clear view of each day"
            message="Choose a date range and run the report to see your daily closing balances."
          />
        }
      </app-report-shell>
    </div>
  `,
  styles: `
    .closing-summary {
      margin: 0 0 22px;
    }
    .closing-summary .summary-card {
      box-shadow: none;
      justify-content: space-between;
    }
    .closing-summary .summary-value {
      font-size: 22px;
    }
    .closing-table-wrap {
      border-radius: 8px;
    }
    .report-table {
      min-width: 260px;
    }
    .report-table .num {
      font-weight: 600;
    }
    .empty-state {
      padding: 44px 20px;
    }
    @media (max-width: 600px) {
      .filter-row mat-form-field {
        flex: 1 1 140px;
        min-width: 0;
      }
      .filter-row mat-checkbox {
        flex-basis: 100%;
      }
      .filter-row button {
        width: 100%;
      }
      .closing-summary .summary-value {
        font-size: 19px;
      }
    }
    @media print {
      .closing-table-wrap {
        border: 0;
        overflow: visible;
      }
      .report-table {
        min-width: 0;
      }
    }
  `,
})
export class DayClosing {
  private readonly sb = inject(SupabaseService).client;
  private readonly notify = inject(NotifyService);

  protected readonly rows = signal<DayClosingRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly ran = signal(false);
  protected readonly subtitle = signal('');
  protected readonly lowestBalance = computed(() =>
    this.rows().length ? Math.min(...this.rows().map((row) => Number(row.closing_balance))) : 0,
  );
  protected readonly lastBalance = computed(() => Number(this.rows().at(-1)?.closing_balance ?? 0));
  protected readonly form = inject(FormBuilder).nonNullable.group({
    from: [firstOfMonth(), Validators.required],
    to: [isoDate(), Validators.required],
    negativeOnly: [false],
  });

  private reportRequest = 0;
  protected invalidateReport() {
    this.reportRequest++;
    this.ran.set(false);
    this.rows.set([]);
  }
  protected async run(): Promise<void> {
    const request = this.reportRequest;
    if (this.form.invalid || this.loading()) return;
    const { from, to, negativeOnly } = this.form.getRawValue();
    this.loading.set(true);
    try {
      this.rows.set(
        await must(
          this.sb.rpc('rpt_day_closing', { p_from: from, p_to: to, p_negative_only: negativeOnly }),
        ),
      );
      if (request !== this.reportRequest) {
        this.rows.set([]);
        return;
      }
      this.subtitle.set(`${from} to ${to}${negativeOnly ? ' (negative balances only)' : ''}`);
      this.ran.set(true);
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  protected exportCsv(): void {
    downloadCsv(
      'day-closing.csv',
      ['Date', 'Closing balance'],
      this.rows().map((r) => [r.tran_date, r.closing_balance]),
    );
  }
}
