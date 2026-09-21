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
import { CashFlowRow } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { must, SupabaseService } from '../../core/supabase.service';
import { downloadCsv } from '../../shared/csv';
import { displayDate, firstOfMonth, isoDate } from '../../shared/dates';
import { ReportShell } from '../../shared/report-shell';
import { PageHeader } from '../../shared/page-header';
import { EmptyState } from '../../shared/empty-state';

/** The classifications money can move against, in the order the statement reads. */
const SECTIONS = [
  { key: 'income', title: 'Income received', totalLabel: 'Total income received' },
  { key: 'expense', title: 'Expenses paid', totalLabel: 'Total expenses paid' },
  { key: 'asset', title: 'Other assets', totalLabel: 'Total other assets' },
  { key: 'liability', title: 'Liabilities', totalLabel: 'Total liabilities' },
  { key: 'equity', title: 'Funds and reserves', totalLabel: 'Total funds and reserves' },
] as const;

interface Section {
  key: string;
  title: string;
  totalLabel: string;
  rows: CashFlowRow[];
  inflow: number;
  outflow: number;
}

@Component({
  selector: 'app-cash-flow-report',
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
        heading="Cash flow"
        description="Where cash and bank money came from and went in a period, and what is left."
      />
      <app-report-shell
        title="Cash Flow Statement"
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
          <div class="table-wrap" role="region" tabindex="0" aria-label="Cash flow entries">
            <table class="report-table">
              <thead>
                <tr>
                  <th scope="col" class="num">Code</th>
                  <th scope="col">Account</th>
                  <th scope="col" class="num">Inflow</th>
                  <th scope="col" class="num">Outflow</th>
                  <th scope="col" class="num">Balance</th>
                </tr>
              </thead>

              <tbody>
                <tr class="opening">
                  <td colspan="4"><strong>Opening cash and bank balance</strong></td>
                  <td class="num">
                    <strong>{{ opening() | number: '1.2-2' }}</strong>
                  </td>
                </tr>
              </tbody>

              @for (section of sections(); track section.key) {
                <tbody>
                  <tr class="section-head">
                    <td colspan="5">{{ section.title }}</td>
                  </tr>
                  @for (row of section.rows; track row.seq) {
                    <tr>
                      <td class="num">{{ row.head_code }}</td>
                      <td class="account-name">{{ row.head_name }}</td>
                      <td class="num">{{ row.inflow ? (row.inflow | number: '1.2-2') : '' }}</td>
                      <td class="num">{{ row.outflow ? (row.outflow | number: '1.2-2') : '' }}</td>
                      <td></td>
                    </tr>
                  }
                  <tr class="section-total">
                    <td colspan="2">{{ section.totalLabel }}</td>
                    <td class="num">{{ section.inflow | number: '1.2-2' }}</td>
                    <td class="num">{{ section.outflow | number: '1.2-2' }}</td>
                    <td></td>
                  </tr>
                </tbody>
              }

              @if (!sections().length) {
                <tbody>
                  <tr>
                    <td colspan="5" class="empty">No cash or bank movement in this period.</td>
                  </tr>
                </tbody>
              }

              <tfoot>
                <tr>
                  <td colspan="2">Movement in the period</td>
                  <td class="num">{{ totals().inflow | number: '1.2-2' }}</td>
                  <td class="num">{{ totals().outflow | number: '1.2-2' }}</td>
                  <td class="num">{{ totals().inflow - totals().outflow | number: '1.2-2' }}</td>
                </tr>
                <tr>
                  <td colspan="4">Closing cash and bank balance</td>
                  <td class="num">{{ closing() | number: '1.2-2' }}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p class="report-note">
            Every cash and bank account together. Each row is an account money was received from or
            paid to; a transfer between your own cash and bank accounts moves no money in or out, so
            it is not listed. Amounts owed or earned without a payment belong on the profit & loss.
          </p>
        }

        @if (loading()) {
          <app-empty-state class="no-print" message="Preparing your report…" status />
        } @else if (!ran()) {
          <app-empty-state
            class="no-print"
            icon="savings"
            heading="Your report starts here"
            message="Choose your filters and run the report to review your account data."
          />
        }
      </app-report-shell>
    </div>
  `,
  styles: `
    .report-table {
      min-width: 720px;
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
export class CashFlowReport {
  private readonly sb = inject(SupabaseService).client;
  private readonly notify = inject(NotifyService);
  private readonly locale = inject(LOCALE_ID);

  protected readonly rows = signal<CashFlowRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly ran = signal(false);
  protected readonly subtitle = signal('');
  protected readonly form = inject(FormBuilder).nonNullable.group({
    from: [firstOfMonth(), Validators.required],
    to: [isoDate(), Validators.required],
  });

  protected readonly opening = computed(
    () => Number(this.rows().find((row) => row.row_kind === 'opening')?.balance) || 0,
  );
  protected readonly closing = computed(
    () => Number(this.rows().find((row) => row.row_kind === 'closing')?.balance) || 0,
  );

  /** Only the classifications money actually moved against, in statement order. */
  protected readonly sections = computed<Section[]>(() =>
    SECTIONS.map((section) => {
      const rows = this.rows().filter(
        (row) => row.row_kind === 'flow' && row.section === section.key,
      );
      return {
        ...section,
        rows,
        inflow: rows.reduce((sum, row) => sum + Number(row.inflow), 0),
        outflow: rows.reduce((sum, row) => sum + Number(row.outflow), 0),
      };
    }).filter((section) => section.rows.length > 0),
  );

  protected readonly totals = computed(() => ({
    inflow: this.sections().reduce((sum, section) => sum + section.inflow, 0),
    outflow: this.sections().reduce((sum, section) => sum + section.outflow, 0),
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
    const { from, to } = this.form.getRawValue();
    this.loading.set(true);
    try {
      this.rows.set(await must(this.sb.rpc('rpt_cash_flow', { p_from: from, p_to: to })));
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
      'cash-flow.csv',
      ['Section', 'Code', 'Account', 'Inflow', 'Outflow', 'Balance'],
      this.rows().map((r) => [
        r.section ?? r.row_kind,
        r.head_code,
        r.head_name,
        r.inflow,
        r.outflow,
        r.row_kind === 'flow' ? '' : r.balance,
      ]),
    );
  }
}
