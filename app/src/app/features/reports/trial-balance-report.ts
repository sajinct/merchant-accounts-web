import { FinancialYearScope } from '../../shared/financial-year-scope';
import { FinancialYearNotice } from '../../shared/financial-year-notice';
import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, LOCALE_ID, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { TrialBalanceRow } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { must, SupabaseService } from '../../core/supabase.service';
import { downloadCsv } from '../../shared/csv';
import { displayDate, isoDate } from '../../shared/dates';
import { ReportShell } from '../../shared/report-shell';

@Component({
  selector: 'app-trial-balance-report',
  imports: [
    FinancialYearScope,
    FinancialYearNotice,
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
      <div class="page-header no-print">
        <div class="page-heading">
          <span class="eyebrow">Reports</span>
          <h1>Trial balance</h1>
          <p class="page-description">Review debit and credit balances across your accounts.</p>
        </div>
      </div>
      <app-report-shell
        title="Trial Balance"
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
            ><mat-label>As of date</mat-label
            ><input
              matInput
              [matDatepicker]="asOnPicker"
              formControlName="asOn"
              placeholder="dd/mm/yyyy" /><mat-datepicker-toggle
              matIconSuffix
              [for]="asOnPicker" /><mat-datepicker #asOnPicker
          /></mat-form-field>
          <button mat-flat-button type="submit" [disabled]="form.invalid || loading()">
            <mat-icon>play_arrow</mat-icon>{{ loading() ? 'Loading…' : 'Run report' }}
          </button>
        </form>

        @if (ran() && !loading()) {
          <div class="table-wrap" role="region" tabindex="0" aria-label="Trial balance entries">
            <table class="report-table">
              <thead>
                <tr>
                  <th class="num">Code</th>
                  <th>Account</th>
                  <th class="num">Debit</th>
                  <th class="num">Credit</th>
                </tr>
              </thead>
              <tbody>
                @for (row of rows(); track row.head_code) {
                  <tr>
                    <td class="num">{{ row.head_code }}</td>
                    <td>{{ row.head_name }}</td>
                    <td class="num">{{ row.debit ? (row.debit | number: '1.2-2') : '' }}</td>
                    <td class="num">{{ row.credit ? (row.credit | number: '1.2-2') : '' }}</td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="4" class="empty">No balances as on this date.</td>
                  </tr>
                }
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="2">Total</td>
                  <td class="num">{{ totals().debit | number: '1.2-2' }}</td>
                  <td class="num">{{ totals().credit | number: '1.2-2' }}</td>
                </tr>
                <tr>
                  <td colspan="2">Difference (must be zero)</td>
                  <td colspan="2" class="num">
                    {{ totals().credit - totals().debit | number: '1.2-2' }}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        }

        @if (loading()) {
          <div class="empty-state no-print" role="status"><p>Preparing your report…</p></div>
        } @else if (!ran()) {
          <div class="empty-state no-print">
            <div class="empty-icon"><mat-icon>balance</mat-icon></div>
            <h3>Your report starts here</h3>
            <p>Choose your filters and run the report to review your account data.</p>
          </div>
        }
      </app-report-shell>
    </div>
  `,
})
export class TrialBalanceReport {
  private readonly sb = inject(SupabaseService).client;
  private readonly notify = inject(NotifyService);
  private readonly locale = inject(LOCALE_ID);

  protected readonly rows = signal<TrialBalanceRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly ran = signal(false);
  protected readonly subtitle = signal('');
  protected readonly form = inject(FormBuilder).nonNullable.group({
    asOn: [isoDate(), Validators.required],
  });

  protected readonly totals = computed(() => ({
    debit: this.rows().reduce((sum, r) => sum + Number(r.debit), 0),
    credit: this.rows().reduce((sum, r) => sum + Number(r.credit), 0),
  }));

  private reportRequest = 0;
  protected invalidateReport() {
    this.reportRequest++;
    this.ran.set(false);
    this.rows.set([]);
  }
  protected async run(): Promise<void> {
    const request = this.reportRequest;
    if (this.form.invalid || this.loading()) return;
    const { asOn } = this.form.getRawValue();
    this.loading.set(true);
    try {
      this.rows.set(await must(this.sb.rpc('rpt_trial_balance', { p_as_on: asOn })));
      if (request !== this.reportRequest) {
        this.rows.set([]);
        return;
      }
      this.subtitle.set(`As on ${displayDate(asOn, this.locale)}`);
      this.ran.set(true);
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  protected exportCsv(): void {
    downloadCsv(
      'trial-balance.csv',
      ['Code', 'Account', 'Debit', 'Credit'],
      this.rows().map((r) => [r.head_code, r.head_name, r.debit, r.credit]),
    );
  }
}
