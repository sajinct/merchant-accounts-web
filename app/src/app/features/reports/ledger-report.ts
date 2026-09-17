import { FinancialYearScope } from '../../shared/financial-year-scope';
import { FinancialYearNotice } from '../../shared/financial-year-notice';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, LOCALE_ID, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { AccountHead, LedgerRow } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { must, SupabaseService } from '../../core/supabase.service';
import { AccountPicker } from '../../shared/account-picker';
import { downloadCsv } from '../../shared/csv';
import { displayDate, firstOfMonth, isoDate } from '../../shared/dates';
import { DrCrPipe } from '../../shared/dr-cr.pipe';
import { ReportShell } from '../../shared/report-shell';
import { PageHeader } from '../../shared/page-header';
import { EmptyState } from '../../shared/empty-state';

interface LedgerGroup {
  code: number;
  name: string;
  rows: LedgerRow[];
  debit: number;
  credit: number;
  closing: number;
}

/** Sentinel for "All accounts" in the account select. */
const ALL = 0;

@Component({
  selector: 'app-ledger-report',
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
    AccountPicker,
    DrCrPipe,
    ReportShell,
  ],
  template: `
    <div class="page">
      <app-page-header
        class="no-print"
        eyebrow="Reports"
        heading="General ledger"
        description="Explore account activity with running debit (Dr) and credit (Cr) balances."
      />
      <app-report-shell
        title="General Ledger"
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
          <app-account-picker
            class="account-select"
            formControlName="account"
            subscriptSizing="dynamic"
            allLabel="All accounts"
            [allValue]="all"
            [accounts]="heads()"
            [loading]="loadingHeads()"
          />
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

        @if (ran() && !loading() && !groups().length) {
          <app-empty-state
            icon="search_off"
            heading="No matching entries"
            message="Try another account or date range to find ledger activity."
          />
        }
        @for (group of loading() ? [] : groups(); track group.code) {
          <div class="ledger-group">
            <h3>
              <span class="account-code">{{ group.code }}</span
              >{{ group.name }}
            </h3>
            <div
              class="table-wrap"
              role="region"
              tabindex="0"
              [attr.aria-label]="group.name + ' ledger entries'"
            >
              <table class="report-table">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Voucher</th>
                    <th scope="col">Narration</th>
                    <th scope="col" class="num">Debit</th>
                    <th scope="col" class="num">Credit</th>
                    <th scope="col" class="num">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of group.rows; track row.seq) {
                    <tr [class.opening]="row.row_kind === 'opening'">
                      <td>{{ row.tran_date | date: 'dd-MMM-yyyy' }}</td>
                      <td>{{ row.voucher_ref }}</td>
                      <td class="narration">{{ row.narration }}</td>
                      <td class="num">
                        {{ row.row_kind === 'entry' ? (row.debit | number: '1.2-2') : '' }}
                      </td>
                      <td class="num">
                        {{ row.row_kind === 'entry' ? (row.credit | number: '1.2-2') : '' }}
                      </td>
                      <td class="num">{{ row.balance | drCr }}</td>
                    </tr>
                  }
                </tbody>
                <tfoot>
                  <tr>
                    <td colspan="3">Total / closing balance</td>
                    <td class="num">{{ group.debit | number: '1.2-2' }}</td>
                    <td class="num">{{ group.credit | number: '1.2-2' }}</td>
                    <td class="num">{{ group.closing | drCr }}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        }

        @if (loading()) {
          <app-empty-state class="no-print" message="Preparing your report…" status />
        } @else if (!ran()) {
          <app-empty-state
            class="no-print"
            icon="menu_book"
            heading="Your report starts here"
            message="Choose your filters and run the report to review your account data."
          />
        }
      </app-report-shell>
    </div>
  `,
  styles: `
    .ledger-group {
      margin-bottom: 32px;
    }
    .ledger-group h3 {
      display: flex;
      align-items: baseline;
      gap: 12px;
      margin-bottom: 14px;
      font-size: 15px;
      line-height: 1.5;
      overflow-wrap: anywhere;
    }
    .account-code {
      flex-shrink: 0;
      color: var(--app-muted);
      font-size: 13px;
      font-variant-numeric: tabular-nums;
      font-weight: 500;
    }
    .report-table {
      min-width: 780px;
    }
    .narration {
      min-width: 220px;
      max-width: 480px;
      overflow-wrap: anywhere;
    }
    @media print {
      .report-table,
      .narration {
        min-width: 0;
      }
      .account-code {
        color: inherit;
      }
    }
  `,
})
export class LedgerReport implements OnInit {
  private readonly sb = inject(SupabaseService).client;
  private readonly notify = inject(NotifyService);
  private readonly locale = inject(LOCALE_ID);

  protected readonly all = ALL;
  protected readonly heads = signal<AccountHead[]>([]);
  protected readonly loadingHeads = signal(true);
  protected readonly rows = signal<LedgerRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly ran = signal(false);
  protected readonly subtitle = signal('');
  protected readonly form = inject(FormBuilder).nonNullable.group({
    account: [ALL, Validators.required],
    from: [firstOfMonth(), Validators.required],
    to: [isoDate(), Validators.required],
  });

  protected readonly groups = computed<LedgerGroup[]>(() => {
    const groups = new Map<number, LedgerGroup>();
    for (const row of this.rows()) {
      let group = groups.get(row.head_code);
      if (!group) {
        group = {
          code: row.head_code,
          name: row.head_name,
          rows: [],
          debit: 0,
          credit: 0,
          closing: 0,
        };
        groups.set(row.head_code, group);
      }
      group.rows.push(row);
      if (row.row_kind === 'entry') {
        group.debit += Number(row.debit);
        group.credit += Number(row.credit);
      }
      group.closing = Number(row.balance);
    }
    return [...groups.values()];
  });

  async ngOnInit(): Promise<void> {
    try {
      this.heads.set(await must(this.sb.from('account_heads').select('code, name').order('name')));
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.loadingHeads.set(false);
    }
  }

  private reportRequest = 0;
  protected invalidateReport() {
    this.reportRequest++;
    this.ran.set(false);
    this.rows.set([]);
  }
  protected async run(): Promise<void> {
    const request = this.reportRequest;
    if (this.form.invalid || this.loading()) return;
    const { account, from, to } = this.form.getRawValue();
    this.loading.set(true);
    try {
      this.rows.set(
        await must(
          this.sb.rpc('rpt_ledger', {
            p_head_code: account === ALL ? null : account,
            p_from: from,
            p_to: to,
          }),
        ),
      );
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
      'ledger.csv',
      [
        'Account code',
        'Account',
        'Date',
        'Voucher',
        'Narration',
        'Debit',
        'Credit',
        'Balance (+Cr / -Dr)',
      ],
      this.rows().map((r) => [
        r.head_code,
        r.head_name,
        r.tran_date,
        r.voucher_ref,
        r.narration,
        r.debit,
        r.credit,
        r.balance,
      ]),
    );
  }
}
