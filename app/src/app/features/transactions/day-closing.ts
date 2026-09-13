import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { DayClosingRow } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { must, SupabaseService } from '../../core/supabase.service';
import { downloadCsv } from '../../shared/csv';
import { firstOfMonth, isoDate } from '../../shared/dates';
import { ReportShell } from '../../shared/report-shell';

@Component({
  selector: 'app-day-closing',
  imports: [DatePipe, DecimalPipe, ReactiveFormsModule, MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatInputModule, ReportShell],
  template: `
    <div class="page">
      <app-report-shell title="Day Closing Balance" [subtitle]="subtitle()" [loading]="loading()"
                        [hasData]="rows().length > 0" (csv)="exportCsv()">
        <form filters [formGroup]="form" (ngSubmit)="run()" class="filter-row">
          <mat-form-field subscriptSizing="dynamic"><mat-label>From</mat-label><input matInput type="date" formControlName="from" /></mat-form-field>
          <mat-form-field subscriptSizing="dynamic"><mat-label>To</mat-label><input matInput type="date" formControlName="to" /></mat-form-field>
          <mat-checkbox formControlName="negativeOnly">Negative balances only</mat-checkbox>
          <button mat-flat-button type="submit" [disabled]="form.invalid || loading()">Show</button>
        </form>

        @if (ran()) {
          <table class="report-table">
            <thead><tr><th>Date</th><th class="num">Closing balance</th></tr></thead>
            <tbody>
              @for (row of rows(); track row.tran_date) {
                <tr [class.negative]="row.closing_balance < 0">
                  <td>{{ row.tran_date | date: 'dd-MMM-yyyy' }}</td>
                  <td class="num">{{ row.closing_balance | number: '1.2-2' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="2" class="empty">No day book entries in this period.</td></tr>
              }
            </tbody>
          </table>
        }
      </app-report-shell>
    </div>
  `,
})
export class DayClosing {
  private readonly sb = inject(SupabaseService).client;
  private readonly notify = inject(NotifyService);

  protected readonly rows = signal<DayClosingRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly ran = signal(false);
  protected readonly subtitle = signal('');
  protected readonly form = inject(FormBuilder).nonNullable.group({
    from: [firstOfMonth(), Validators.required],
    to: [isoDate(), Validators.required],
    negativeOnly: [false],
  });

  protected async run(): Promise<void> {
    const { from, to, negativeOnly } = this.form.getRawValue();
    this.loading.set(true);
    try {
      this.rows.set(
        await must(this.sb.rpc('rpt_day_closing', { p_from: from, p_to: to, p_negative_only: negativeOnly })),
      );
      this.subtitle.set(`${from} to ${to}${negativeOnly ? ' (negative balances only)' : ''}`);
      this.ran.set(true);
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  protected exportCsv(): void {
    downloadCsv('day-closing.csv', ['Date', 'Closing balance'], this.rows().map((r) => [r.tran_date, r.closing_balance]));
  }
}
