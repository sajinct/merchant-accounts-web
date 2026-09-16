import { FinancialYearScope } from '../../shared/financial-year-scope';
import { FinancialYearNotice } from '../../shared/financial-year-notice';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, LOCALE_ID, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { DaybookRow } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { must, SupabaseService } from '../../core/supabase.service';
import { downloadCsv } from '../../shared/csv';
import { displayDate, isoDate } from '../../shared/dates';
import { ReportShell } from '../../shared/report-shell';
import { PageHeader } from '../../shared/page-header';
import { EmptyState } from '../../shared/empty-state';

@Component({
  selector: 'app-daybook-report',
  imports: [
    EmptyState,
    PageHeader,
    FinancialYearScope,
    FinancialYearNotice,
    DatePipe,
    DecimalPipe,
    ReactiveFormsModule,
    MatButtonModule,
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
        eyebrow="Reports"
        heading="Day book"
        description="All cash and bank accounts combined. Review receipts, payments and running balances for any period."
      />
      <app-report-shell
        title="Day Book"
        [subtitle]="subtitle()"
        [loading]="loading()"
        [hasData]="rows().length > 0"
        (csv)="exportCsv()"
      >
        <app-financial-year-notice />
        <form
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
          <button mat-flat-button type="submit" [disabled]="form.invalid || loading()">
            <mat-icon>play_arrow</mat-icon>{{ loading() ? 'Loading…' : 'Run report' }}
          </button>
        </form>

        @if (!loading() && rows().length) {
          <div class="table-wrap" role="region" tabindex="0" aria-label="Day book entries">
            <table class="report-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Voucher</th>
                  <th>Account</th>
                  <th>Narration</th>
                  <th class="num">Receipt</th>
                  <th class="num">Payment</th>
                  <th class="num">Balance</th>
                </tr>
              </thead>
              <tbody>
                @for (row of rows(); track row.seq) {
                  <tr [class.opening]="row.row_kind === 'opening'">
                    <td>{{ row.tran_date | date: 'dd-MMM-yyyy' }}</td>
                    <td>{{ row.voucher_ref }}</td>
                    <td>{{ row.head_name }}</td>
                    <td>{{ row.narration }}</td>
                    <td class="num">
                      {{ row.row_kind === 'entry' ? (row.credit | number: '1.2-2') : '' }}
                    </td>
                    <td class="num">
                      {{ row.row_kind === 'entry' ? (row.debit | number: '1.2-2') : '' }}
                    </td>
                    <td class="num">{{ row.balance | number: '1.2-2' }}</td>
                  </tr>
                }
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="4">Total / closing balance</td>
                  <td class="num">{{ totals().credit | number: '1.2-2' }}</td>
                  <td class="num">{{ totals().debit | number: '1.2-2' }}</td>
                  <td class="num">{{ totals().closing | number: '1.2-2' }}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        }

        @if (ran() && !loading() && !rows().length) {
          <app-empty-state
            icon="event_busy"
            heading="No entries in this period"
            message="Try a different date range to find day book activity."
          />
        }

        @if (loading()) {
          <app-empty-state class="no-print" message="Preparing your report…" status />
        } @else if (!ran()) {
          <app-empty-state
            class="no-print"
            icon="receipt_long"
            heading="Your report starts here"
            message="Choose your filters and run the report to review your account data."
          />
        }
      </app-report-shell>
    </div>
  `,
})
export class DaybookReport {
  private readonly sb = inject(SupabaseService).client;
  private readonly notify = inject(NotifyService);
  private readonly locale = inject(LOCALE_ID);

  protected readonly rows = signal<DaybookRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly ran = signal(false);
  protected readonly subtitle = signal('');
  protected readonly form = inject(FormBuilder).nonNullable.group({
    from: [isoDate(), Validators.required],
    to: [isoDate(), Validators.required],
  });

  protected readonly totals = computed(() => {
    const entries = this.rows().filter((r) => r.row_kind === 'entry');
    return {
      credit: entries.reduce((sum, r) => sum + Number(r.credit), 0),
      debit: entries.reduce((sum, r) => sum + Number(r.debit), 0),
      closing: this.rows().at(-1)?.balance ?? 0,
    };
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
    const { from, to } = this.form.getRawValue();
    this.loading.set(true);
    try {
      this.rows.set(await must(this.sb.rpc('rpt_daybook', { p_from: from, p_to: to })));
      if (request !== this.reportRequest) {
        this.rows.set([]);
        return;
      }
      this.subtitle.set(
        `From ${displayDate(from, this.locale)} to ${displayDate(to, this.locale)}`,
      );
      this.ran.set(true);
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  protected exportCsv(): void {
    downloadCsv(
      'day-book.csv',
      ['Date', 'Voucher', 'Account code', 'Account', 'Narration', 'Receipt', 'Payment', 'Balance'],
      this.rows().map((r) => [
        r.tran_date,
        r.voucher_ref,
        r.head_code,
        r.head_name,
        r.narration,
        r.credit,
        r.debit,
        r.balance,
      ]),
    );
  }
}
