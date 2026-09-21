import { FinancialYearScope } from '../../shared/financial-year-scope';
import { FinancialYearNotice } from '../../shared/financial-year-notice';
import { EnterToNext } from '../../shared/enter-to-next.directive';
import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, LOCALE_ID, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { ProfitAndLossRow } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { must, SupabaseService } from '../../core/supabase.service';
import { downloadCsv } from '../../shared/csv';
import { displayDate, firstOfMonth, isoDate } from '../../shared/dates';
import { ReportShell } from '../../shared/report-shell';
import { PageHeader } from '../../shared/page-header';
import { EmptyState } from '../../shared/empty-state';

interface Section {
  key: 'income' | 'expense';
  title: string;
  totalLabel: string;
  emptyLabel: string;
  rows: ProfitAndLossRow[];
  total: number;
}

@Component({
  selector: 'app-profit-and-loss-report',
  imports: [
    EnterToNext,
    EmptyState,
    PageHeader,
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
      <app-page-header
        class="no-print"
        eyebrow="Reports"
        heading="Profit & loss"
        description="Income earned and expenses incurred in a period, whether or not cash moved."
      />
      <app-report-shell
        title="Profit & Loss"
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
          <button mat-flat-button type="submit" [disabled]="form.invalid || loading()">
            <mat-icon>play_arrow</mat-icon>{{ loading() ? 'Loading…' : 'Run report' }}
          </button>
        </form>

        @if (ran() && !loading()) {
          <div class="table-wrap" role="region" tabindex="0" aria-label="Profit and loss accounts">
            <table class="report-table">
              <thead>
                <tr>
                  <th scope="col" class="num">Code</th>
                  <th scope="col">Account</th>
                  <th scope="col" class="num">Amount</th>
                </tr>
              </thead>

              @for (section of sections(); track section.key) {
                <tbody>
                  <tr class="section-head">
                    <td colspan="3">{{ section.title }}</td>
                  </tr>
                  @for (row of section.rows; track row.head_code) {
                    <tr>
                      <td class="num">{{ row.head_code }}</td>
                      <td class="account-name">{{ row.head_name }}</td>
                      <td class="num">{{ row.amount | number: '1.2-2' }}</td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="3" class="empty">No {{ section.emptyLabel }} in this period.</td>
                    </tr>
                  }
                  <tr class="section-total">
                    <td colspan="2">{{ section.totalLabel }}</td>
                    <td class="num">{{ section.total | number: '1.2-2' }}</td>
                  </tr>
                </tbody>
              }

              <tfoot>
                <tr>
                  <td colspan="2">{{ result().label }}</td>
                  <td class="num">{{ result().amount | number: '1.2-2' }}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p class="report-note">
            Year-end closing transfers this result to the retained earnings account, so a closed
            year still reports the income and expenses it earned.
          </p>
        }

        @if (loading()) {
          <app-empty-state class="no-print" message="Preparing your report…" status />
        } @else if (!ran()) {
          <app-empty-state
            class="no-print"
            icon="trending_up"
            heading="Your report starts here"
            message="Choose your filters and run the report to review your account data."
          />
        }
      </app-report-shell>
    </div>
  `,
  styles: `
    .report-table {
      min-width: 520px;
    }
    .account-name {
      min-width: 220px;
      overflow-wrap: anywhere;
      font-weight: 500;
    }
    .report-note {
      margin: 16px 0 0;
      color: var(--app-muted);
      font-size: 12px;
      line-height: 1.6;
    }
    @media print {
      .report-table,
      .account-name {
        min-width: 0;
      }
      .report-note {
        color: inherit;
      }
    }
  `,
})
export class ProfitAndLossReport {
  private readonly sb = inject(SupabaseService).client;
  private readonly notify = inject(NotifyService);
  private readonly locale = inject(LOCALE_ID);

  protected readonly rows = signal<ProfitAndLossRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly ran = signal(false);
  protected readonly subtitle = signal('');
  protected readonly form = inject(FormBuilder).nonNullable.group({
    from: [firstOfMonth(), Validators.required],
    to: [isoDate(), Validators.required],
  });

  protected readonly sections = computed<Section[]>(() =>
    (
      [
        { key: 'income', title: 'Income', totalLabel: 'Total income', emptyLabel: 'income' },
        { key: 'expense', title: 'Expenses', totalLabel: 'Total expenses', emptyLabel: 'expenses' },
      ] as const
    ).map((section) => {
      const rows = this.rows().filter((row) => row.section === section.key);
      return {
        ...section,
        rows,
        total: rows.reduce((sum, row) => sum + Number(row.amount), 0),
      };
    }),
  );

  /** Income less expenses, named for its direction so the sign never has to be read. */
  protected readonly result = computed(() => {
    const [income, expenses] = this.sections();
    const net = income.total - expenses.total;
    return {
      label: net < 0 ? 'Deficit for the period' : 'Surplus for the period',
      amount: Math.abs(net),
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
      this.rows.set(await must(this.sb.rpc('rpt_profit_and_loss', { p_from: from, p_to: to })));
      if (request !== this.reportRequest) {
        this.rows.set([]);
        return;
      }
      this.subtitle.set(
        `For the period ${displayDate(from, this.locale)} to ${displayDate(to, this.locale)}`,
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
      'profit-and-loss.csv',
      ['Section', 'Code', 'Account', 'Amount'],
      this.rows().map((r) => [r.section, r.head_code, r.head_name, r.amount]),
    );
  }
}
