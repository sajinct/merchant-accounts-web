import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { AccountHead, LedgerRow } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { must, SupabaseService } from '../../core/supabase.service';
import { downloadCsv } from '../../shared/csv';
import { firstOfMonth, isoDate } from '../../shared/dates';
import { ReportShell } from '../../shared/report-shell';

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
    DatePipe,
    DecimalPipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatSelectModule,
    ReportShell,
  ],
  template: `
    <div class="page">
      <div class="page-header no-print">
        <div class="page-heading">
          <span class="eyebrow">Reports</span>
          <h1>General ledger</h1>
          <p class="page-description">
            Explore account activity with opening and closing balances.
          </p>
        </div>
      </div>
      <app-report-shell
        title="General Ledger"
        [subtitle]="subtitle()"
        [loading]="loading()"
        [hasData]="rows().length > 0"
        (csv)="exportCsv()"
      >
        <form filters [formGroup]="form" (ngSubmit)="run()" class="filter-row">
          <mat-form-field subscriptSizing="dynamic" class="account-select">
            <mat-label>Account</mat-label>
            <mat-select formControlName="account">
              <mat-option [value]="all">All accounts</mat-option>
              @for (head of heads(); track head.code) {
                <mat-option [value]="head.code">{{ head.code }} – {{ head.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field subscriptSizing="dynamic"
            ><mat-label>From date</mat-label><input matInput type="date" formControlName="from"
          /></mat-form-field>
          <mat-form-field subscriptSizing="dynamic"
            ><mat-label>To date</mat-label><input matInput type="date" formControlName="to"
          /></mat-form-field>
          <button mat-flat-button type="submit" [disabled]="form.invalid || loading()">
            <mat-icon>play_arrow</mat-icon>{{ loading() ? 'Loading…' : 'Run report' }}
          </button>
        </form>

        @if (ran() && !loading() && !groups().length) {
          <div class="empty-state">
            <div class="empty-icon"><mat-icon>search_off</mat-icon></div>
            <h3>No matching entries</h3>
            <p>Try another account or date range to find ledger activity.</p>
          </div>
        }
        @for (group of loading() ? [] : groups(); track group.code) {
          <div class="ledger-group">
            <h3>{{ group.code }} – {{ group.name }}</h3>
            <div class="table-wrap" role="region" tabindex="0" aria-label="General ledger entries">
              <table class="report-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Voucher</th>
                    <th>Narration</th>
                    <th class="num">Receipt</th>
                    <th class="num">Payment</th>
                    <th class="num">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of group.rows; track row.seq) {
                    <tr [class.opening]="row.row_kind === 'opening'">
                      <td>{{ row.tran_date | date: 'dd-MMM-yyyy' }}</td>
                      <td>{{ row.voucher_ref }}</td>
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
                    <td colspan="3">Total / closing balance</td>
                    <td class="num">{{ group.credit | number: '1.2-2' }}</td>
                    <td class="num">{{ group.debit | number: '1.2-2' }}</td>
                    <td class="num">{{ group.closing | number: '1.2-2' }}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        }

        @if (loading()) {
          <div class="empty-state no-print" role="status"><p>Preparing your report…</p></div>
        } @else if (!ran()) {
          <div class="empty-state no-print">
            <div class="empty-icon"><mat-icon>menu_book</mat-icon></div>
            <h3>Your report starts here</h3>
            <p>Choose your filters and run the report to review your account data.</p>
          </div>
        }
      </app-report-shell>
    </div>
  `,
})
export class LedgerReport implements OnInit {
  private readonly sb = inject(SupabaseService).client;
  private readonly notify = inject(NotifyService);

  protected readonly all = ALL;
  protected readonly heads = signal<AccountHead[]>([]);
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
      this.heads.set(
        await must(
          this.sb.from('account_heads').select('code, name').gt('code', 1000).order('name'),
        ),
      );
    } catch (err) {
      this.notify.error(err);
    }
  }

  protected async run(): Promise<void> {
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
      this.subtitle.set(`For the period ${from} to ${to}`);
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
      ['Account code', 'Account', 'Date', 'Voucher', 'Narration', 'Receipt', 'Payment', 'Balance'],
      this.rows().map((r) => [
        r.head_code,
        r.head_name,
        r.tran_date,
        r.voucher_ref,
        r.narration,
        r.credit,
        r.debit,
        r.balance,
      ]),
    );
  }
}
