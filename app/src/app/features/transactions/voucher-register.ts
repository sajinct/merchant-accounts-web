import { DatePipe, DecimalPipe, formatDate, formatNumber } from '@angular/common';
import { Component, computed, effect, inject, LOCALE_ID, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { FinancialYearService } from '../../core/financial-year.service';
import { AccountHead } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { must, SupabaseService } from '../../core/supabase.service';
import { voucherRef, VOUCHER_TYPES } from '../../core/voucher-types';
import { confirmAction } from '../../shared/confirm-dialog';
import { EmptyState } from '../../shared/empty-state';
import { FinancialYearNotice } from '../../shared/financial-year-notice';
import { PageHeader } from '../../shared/page-header';

const PAGE_SIZE = 25;

interface RegisterLine {
  line_no: number;
  head_code: number;
  debit: number;
  credit: number;
  narration: string | null;
}

/** A posted entry: a voucher with its details, or a journal with no voucher header. */
interface RegisterEntry {
  id: number;
  entry_date: string;
  narration: string;
  kind: string;
  reversal_of: number | null;
  voucher_id: number | null;
  daybook: RegisterLine[];
  voucher: {
    voucher_no: number;
    voucher_type: number;
    reference_no: string | null;
    status: string;
    cancelled_at: string | null;
    cancel_reason: string | null;
    total_amount: number;
    party: { name: string } | null;
  } | null;
}

@Component({
  selector: 'app-voucher-register',
  imports: [
    DatePipe,
    DecimalPipe,
    EmptyState,
    FinancialYearNotice,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    PageHeader,
    RouterLink,
  ],
  template: `
    <div class="page">
      <app-page-header
        eyebrow="Transactions"
        heading="Voucher register"
        description="Every receipt, payment, contra and journal posted in the selected financial year."
      >
        @if (auth.canEdit()) {
          <a mat-flat-button routerLink="/transactions/voucher/receipt">
            <mat-icon>add</mat-icon> New voucher
          </a>
        }
      </app-page-header>

      <app-financial-year-notice />

      <section class="panel">
        <div class="toolbar-panel">
          <mat-form-field subscriptSizing="dynamic" class="filter-field">
            <mat-label>Show</mat-label>
            <mat-select [(ngModel)]="kind" (ngModelChange)="load()">
              <mat-option value="all">All entries</mat-option>
              @for (type of types; track type.slug) {
                <mat-option [value]="type.slug">{{ type.label }} vouchers</mat-option>
              }
              <mat-option value="other">Opening balances and reversals</mat-option>
            </mat-select>
          </mat-form-field>
          <span class="toolbar-count" aria-live="polite">{{
            loading() ? 'Loading…' : 'Showing ' + entries().length + ' of ' + total()
          }}</span>
          <button mat-stroked-button type="button" (click)="load()" [disabled]="loading()">
            <mat-icon>refresh</mat-icon> Refresh
          </button>
        </div>

        @for (entry of entries(); track entry.id) {
          <details class="entry" [class.cancelled]="entry.voucher?.cancelled_at">
            <summary>
              <span class="ref">{{ reference(entry) }}</span>
              <span class="when">{{ entry.entry_date | date: 'dd-MMM-yyyy' }}</span>
              <span class="what">{{ entry.narration || '—' }}</span>
              <span class="amount">{{ amount(entry) | number: '1.2-2' }}</span>
              @if (entry.voucher?.cancelled_at) {
                <span class="status-badge">Cancelled</span>
              } @else if (entry.reversal_of) {
                <span class="status-badge neutral">Reversal of J-{{ entry.reversal_of }}</span>
              }
            </summary>

            <div class="entry-body">
              <p class="hint">
                {{ kindLabel(entry) }} · Journal J-{{ entry.id }}
                @if (entry.voucher?.reference_no) {
                  · Reference {{ entry.voucher?.reference_no }}
                }
                @if (entry.voucher?.party) {
                  · {{ entry.voucher?.party?.name }}
                }
              </p>
              @if (entry.voucher?.cancel_reason) {
                <p class="hint">Cancelled: {{ entry.voucher?.cancel_reason }}</p>
              }
              <div class="table-wrap">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Account</th>
                      <th scope="col">Description</th>
                      <th scope="col" class="num">Debit</th>
                      <th scope="col" class="num">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (line of ordered(entry); track $index) {
                      <tr>
                        <td>{{ accountName(line.head_code) }}</td>
                        <td class="table-secondary">{{ line.narration || '—' }}</td>
                        <td class="num">{{ line.debit ? (line.debit | number: '1.2-2') : '' }}</td>
                        <td class="num">
                          {{ line.credit ? (line.credit | number: '1.2-2') : '' }}
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              @if (auth.isAdmin()) {
                @if (entry.voucher_id && !entry.voucher?.cancelled_at) {
                  <button
                    mat-stroked-button
                    type="button"
                    (click)="cancel(entry)"
                    [disabled]="busy()"
                  >
                    <mat-icon>block</mat-icon> Cancel voucher
                  </button>
                } @else if (
                  !entry.voucher_id && !entry.reversal_of && entry.kind !== 'year_closing'
                ) {
                  <button
                    mat-stroked-button
                    type="button"
                    (click)="reverse(entry)"
                    [disabled]="busy()"
                  >
                    <mat-icon>undo</mat-icon> Reverse entry
                  </button>
                }
              }
            </div>
          </details>
        } @empty {
          <app-empty-state
            icon="receipt_long"
            [heading]="loading() ? 'Loading entries' : 'Nothing posted yet'"
            message="Vouchers posted in this financial year will be listed here."
            status
          />
        }

        @if (entries().length < total()) {
          <div class="register-footer">
            <button
              mat-stroked-button
              type="button"
              (click)="loadMore()"
              [disabled]="loadingMore()"
            >
              {{ loadingMore() ? 'Loading…' : 'Load more' }}
            </button>
          </div>
        }
      </section>
    </div>
  `,
  styles: `
    .filter-field {
      min-width: 220px;
    }
    .entry {
      border-top: 1px solid var(--app-border);
    }
    summary {
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
      padding: 14px 16px;
      cursor: pointer;
      min-height: 32px;
    }
    .ref {
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      min-width: 64px;
    }
    .when {
      white-space: nowrap;
    }
    .what {
      flex: 1;
      min-width: 140px;
    }
    .amount {
      font-variant-numeric: tabular-nums;
      font-weight: 600;
    }
    .cancelled summary .ref,
    .cancelled summary .what {
      text-decoration: line-through;
    }
    .entry-body {
      padding: 0 16px 16px;
    }
    .entry-body .hint {
      margin: 0 0 10px;
    }
    .entry-body button {
      margin-top: 12px;
    }
    .register-footer {
      display: flex;
      justify-content: center;
      padding: 14px 16px;
      border-top: 1px solid var(--app-border);
    }
  `,
})
export class VoucherRegister {
  protected readonly auth = inject(AuthService);
  protected readonly types = VOUCHER_TYPES;
  private readonly sb = inject(SupabaseService).client;
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);
  private readonly locale = inject(LOCALE_ID);
  private readonly fy = inject(FinancialYearService);

  protected kind: 'all' | 'other' | string = 'all';
  protected readonly entries = signal<RegisterEntry[]>([]);
  protected readonly accounts = signal<AccountHead[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly loadingMore = signal(false);
  protected readonly busy = signal(false);
  private loadId = 0;

  private readonly byCode = computed(
    () => new Map(this.accounts().map((account) => [account.code, account.name])),
  );

  constructor() {
    effect(() => {
      this.fy.selected();
      void this.load();
    });
  }

  protected accountName(code: number): string {
    return this.byCode().get(code) ?? String(code);
  }

  protected reference(entry: RegisterEntry): string {
    return entry.voucher
      ? voucherRef(entry.voucher.voucher_type, entry.voucher.voucher_no)
      : `J-${entry.id}`;
  }

  protected amount(entry: RegisterEntry): number {
    return entry.voucher
      ? Number(entry.voucher.total_amount)
      : entry.daybook.reduce((sum, line) => sum + Number(line.debit), 0);
  }

  protected kindLabel(entry: RegisterEntry): string {
    const labels: Record<string, string> = {
      receipt: 'Receipt voucher',
      payment: 'Payment voucher',
      contra: 'Contra voucher',
      journal: 'Journal voucher',
      opening: 'Opening balances',
      reversal: 'Reversal',
      year_closing: 'Year closing',
    };
    return labels[entry.kind] ?? entry.kind;
  }

  protected ordered(entry: RegisterEntry): RegisterLine[] {
    return [...entry.daybook].sort((a, b) => a.line_no - b.line_no);
  }

  private query() {
    let query = this.sb
      .from('journals')
      .select(
        'id,entry_date,narration,kind,reversal_of,voucher_id,' +
          'daybook(line_no,head_code,debit,credit,narration),' +
          'voucher:vouchers(voucher_no,voucher_type,reference_no,status,cancelled_at,cancel_reason,total_amount,party:customers(name))',
        { count: 'exact' },
      )
      .gte('entry_date', this.fy.start())
      .lte('entry_date', this.fy.end());
    if (this.kind === 'other') query = query.in('kind', ['opening', 'reversal', 'year_closing']);
    else if (this.kind !== 'all') query = query.eq('kind', this.kind);
    return query.order('id', { ascending: false }).limit(PAGE_SIZE);
  }

  protected async load(): Promise<void> {
    const loadId = ++this.loadId;
    this.loading.set(true);
    this.entries.set([]);
    this.total.set(0);
    try {
      const [accounts, page] = await Promise.all([
        must(this.sb.from('account_heads').select('code,name').order('name')),
        this.query(),
      ]);
      if (page.error) throw page.error;
      if (loadId !== this.loadId) return;
      this.accounts.set(accounts as AccountHead[]);
      this.entries.set((page.data ?? []) as unknown as RegisterEntry[]);
      this.total.set(page.count ?? 0);
    } catch (error) {
      this.notify.error(error);
    } finally {
      if (loadId === this.loadId) this.loading.set(false);
    }
  }

  /** Entries older than the last one shown, so a new posting never shifts a loaded page. */
  protected async loadMore(): Promise<void> {
    const loadId = this.loadId;
    const oldest = this.entries().at(-1)?.id;
    if (!oldest || this.loadingMore()) return;
    this.loadingMore.set(true);
    try {
      const { data, error } = await this.query().lt('id', oldest);
      if (error) throw error;
      if (loadId !== this.loadId) return;
      this.entries.update((entries) => [
        ...entries,
        ...((data ?? []) as unknown as RegisterEntry[]),
      ]);
    } catch (error) {
      this.notify.error(error);
    } finally {
      if (loadId === this.loadId) this.loadingMore.set(false);
    }
  }

  protected async cancel(entry: RegisterEntry): Promise<void> {
    const ref = this.reference(entry);
    const result = await confirmAction(this.dialog, {
      title: `Cancel voucher ${ref}?`,
      message: 'A balancing reversal is posted. The original voucher stays in the audit trail.',
      details: [
        { label: 'Date', value: formatDate(entry.entry_date, 'dd-MMM-yyyy', this.locale) },
        { label: 'Narration', value: entry.narration || '—' },
        { label: 'Amount', value: formatNumber(this.amount(entry), this.locale, '1.2-2') },
      ],
      fields: [{ key: 'reason', label: 'Reason for cancelling', required: true, maxLength: 200 }],
      confirmLabel: 'Cancel voucher',
      cancelLabel: 'Keep voucher',
      destructive: true,
    });
    if (!result) return;
    this.busy.set(true);
    try {
      await must(
        this.sb.rpc('cancel_voucher', { p_id: entry.voucher_id, p_reason: result['reason'] }),
      );
      this.notify.success(`Voucher ${ref} cancelled with a balancing reversal.`);
      await this.load();
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.busy.set(false);
    }
  }

  protected async reverse(entry: RegisterEntry): Promise<void> {
    const result = await confirmAction(this.dialog, {
      title: `Reverse journal J-${entry.id}?`,
      message: 'A balancing entry with opposite debits and credits is posted on the chosen date.',
      details: [
        { label: 'Entry date', value: formatDate(entry.entry_date, 'dd-MMM-yyyy', this.locale) },
        { label: 'Narration', value: entry.narration || '—' },
        { label: 'Total debit', value: formatNumber(this.amount(entry), this.locale, '1.2-2') },
      ],
      fields: [
        { key: 'reason', label: 'Reason for reversing', required: true, maxLength: 500 },
        {
          key: 'date',
          label: 'Reversal date',
          type: 'date',
          value: this.fy.entryDate(),
          required: true,
          min: this.fy.start(),
          max: this.fy.end(),
        },
      ],
      confirmLabel: 'Post reversal',
      destructive: true,
    });
    if (!result) return;
    this.busy.set(true);
    try {
      await must(
        this.sb.rpc('reverse_journal', {
          p_id: entry.id,
          p_date: result['date'],
          p_reason: result['reason'],
        }),
      );
      this.notify.success('Balancing reversal posted');
      await this.load();
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.busy.set(false);
    }
  }
}
