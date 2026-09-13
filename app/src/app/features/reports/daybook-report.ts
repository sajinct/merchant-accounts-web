import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { DaybookRow } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { must, SupabaseService } from '../../core/supabase.service';
import { downloadCsv } from '../../shared/csv';
import { isoDate } from '../../shared/dates';
import { ReportShell } from '../../shared/report-shell';

@Component({
  selector: 'app-daybook-report',
  imports: [DatePipe, DecimalPipe, ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, ReportShell],
  template: `
    <div class="page">
      <app-report-shell title="Day Book" [subtitle]="subtitle()" [loading]="loading()"
                        [hasData]="rows().length > 0" (csv)="exportCsv()">
        <form filters [formGroup]="form" (ngSubmit)="run()" class="filter-row">
          <mat-form-field subscriptSizing="dynamic"><mat-label>From</mat-label><input matInput type="date" formControlName="from" /></mat-form-field>
          <mat-form-field subscriptSizing="dynamic"><mat-label>To</mat-label><input matInput type="date" formControlName="to" /></mat-form-field>
          <button mat-flat-button type="submit" [disabled]="form.invalid || loading()">Show</button>
        </form>

        @if (rows().length) {
          <table class="report-table">
            <thead>
              <tr>
                <th>Date</th><th>Voucher</th><th>Account</th><th>Narration</th>
                <th class="num">Receipt</th><th class="num">Payment</th><th class="num">Balance</th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.seq) {
                <tr [class.opening]="row.row_kind === 'opening'">
                  <td>{{ row.tran_date | date: 'dd-MMM-yyyy' }}</td>
                  <td>{{ row.voucher_ref }}</td>
                  <td>{{ row.head_name }}</td>
                  <td>{{ row.narration }}</td>
                  <td class="num">{{ row.row_kind === 'entry' ? (row.credit | number: '1.2-2') : '' }}</td>
                  <td class="num">{{ row.row_kind === 'entry' ? (row.debit | number: '1.2-2') : '' }}</td>
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
        }
      </app-report-shell>
    </div>
  `,
})
export class DaybookReport {
  private readonly sb = inject(SupabaseService).client;
  private readonly notify = inject(NotifyService);

  protected readonly rows = signal<DaybookRow[]>([]);
  protected readonly loading = signal(false);
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

  protected async run(): Promise<void> {
    const { from, to } = this.form.getRawValue();
    this.loading.set(true);
    try {
      this.rows.set(await must(this.sb.rpc('rpt_daybook', { p_from: from, p_to: to })));
      this.subtitle.set(`From ${from} to ${to}`);
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
      this.rows().map((r) => [r.tran_date, r.voucher_ref, r.head_code, r.head_name, r.narration, r.credit, r.debit, r.balance]),
    );
  }
}
