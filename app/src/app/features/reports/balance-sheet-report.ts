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
import { BalanceSheetRow } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { must, SupabaseService } from '../../core/supabase.service';
import { downloadCsv } from '../../shared/csv';
import { displayDate, isoDate } from '../../shared/dates';
import { ReportShell } from '../../shared/report-shell';
import { PageHeader } from '../../shared/page-header';
import { EmptyState } from '../../shared/empty-state';

interface Section {
  key: 'asset' | 'liability' | 'equity';
  title: string;
  totalLabel: string;
  emptyLabel: string;
  rows: BalanceSheetRow[];
  total: number;
}

@Component({
  selector: 'app-balance-sheet-report',
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
        heading="Balance sheet"
        description="What the organisation owns and owes on a date, and the funds behind it."
      />
      <app-report-shell
        title="Balance Sheet"
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
          <div class="table-wrap" role="region" tabindex="0" aria-label="Balance sheet accounts">
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
                  @for (row of section.rows; track row.head_code ?? 0) {
                    <tr>
                      <td class="num">{{ row.head_code }}</td>
                      <td class="account-name" [class.derived]="row.row_kind === 'result'">
                        {{ row.head_name }}
                      </td>
                      <td class="num">{{ row.amount | number: '1.2-2' }}</td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="3" class="empty">No {{ section.emptyLabel }} on this date.</td>
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
                  <td colspan="2">Total liabilities and funds</td>
                  <td class="num">{{ funds() | number: '1.2-2' }}</td>
                </tr>
                <tr>
                  <td colspan="2">Difference (must be zero)</td>
                  <td class="num">{{ difference() | number: '1.2-2' }}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p class="report-note">
            Income and expenses stay on their own accounts until the year is closed, so the surplus
            or deficit earned since the last closing is carried under funds. Year-end closing moves
            it to the retained earnings account.
          </p>
        }

        @if (loading()) {
          <app-empty-state class="no-print" message="Preparing your report…" status />
        } @else if (!ran()) {
          <app-empty-state
            class="no-print"
            icon="account_balance"
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
    .account-name.derived {
      font-style: italic;
      font-weight: 400;
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
export class BalanceSheetReport {
  private readonly sb = inject(SupabaseService).client;
  private readonly notify = inject(NotifyService);
  private readonly locale = inject(LOCALE_ID);

  protected readonly rows = signal<BalanceSheetRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly ran = signal(false);
  protected readonly subtitle = signal('');
  protected readonly form = inject(FormBuilder).nonNullable.group({
    asOn: [isoDate(), Validators.required],
  });

  protected readonly sections = computed<Section[]>(() =>
    (
      [
        { key: 'asset', title: 'Assets', totalLabel: 'Total assets', emptyLabel: 'assets' },
        {
          key: 'liability',
          title: 'Liabilities',
          totalLabel: 'Total liabilities',
          emptyLabel: 'liabilities',
        },
        {
          key: 'equity',
          title: 'Funds and reserves',
          totalLabel: 'Total funds and reserves',
          emptyLabel: 'funds',
        },
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

  /** Liabilities plus funds: what the assets were financed by. */
  protected readonly funds = computed(() => {
    const [, liabilities, equity] = this.sections();
    return liabilities.total + equity.total;
  });

  /** Zero for every complete set of double-entry records; shown so it can be seen. */
  protected readonly difference = computed(() => this.sections()[0].total - this.funds());

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
      this.rows.set(await must(this.sb.rpc('rpt_balance_sheet', { p_as_on: asOn })));
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
      'balance-sheet.csv',
      ['Section', 'Code', 'Account', 'Amount'],
      this.rows().map((r) => [r.section, r.head_code, r.head_name, r.amount]),
    );
  }
}
