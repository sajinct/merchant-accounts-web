import { effect } from '@angular/core';
import { FinancialYearService } from '../../core/financial-year.service';
import { FinancialYearNotice } from '../../shared/financial-year-notice';
import { DatePipe, DecimalPipe, formatDate, formatNumber } from '@angular/common';
import { Component, inject, LOCALE_ID, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { AccountHead } from '../../core/models';
import { AuthService } from '../../core/auth.service';
import { NotifyService } from '../../core/notify.service';
import { must, SupabaseService } from '../../core/supabase.service';
import { AccountPicker } from '../../shared/account-picker';
import { confirmAction } from '../../shared/confirm-dialog';
import { PageHeader } from '../../shared/page-header';

const PAGE_SIZE = 25;

interface Line {
  account: number | null;
  debit: number | null;
  credit: number | null;
}
interface Journal {
  id: number;
  entry_date: string;
  narration: string;
  kind: string;
  reversal_of: number | null;
  voucher_id: number | null;
  daybook: { head_code: number; debit: number; credit: number }[];
}

@Component({
  selector: 'app-journals',
  imports: [
    PageHeader,
    FinancialYearNotice,
    AccountPicker,
    FormsModule,
    DatePipe,
    DecimalPipe,
    MatButtonModule,
    MatFormFieldModule,
    MatDatepickerModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: ` <div class="page">
    <app-page-header
      eyebrow="Double-entry accounting"
      heading="Journals & transfers"
      description="Every entry must have equal debits and credits. For a bank transfer, debit the destination and credit the source."
    />
    <app-financial-year-notice />
    @if (auth.canEdit()) {
      <section class="panel">
        <div class="panel-header"><h2>New entry</h2></div>
        <div class="panel-body">
          <div class="form-grid">
            <mat-form-field
              ><mat-label>Date</mat-label
              ><input
                matInput
                [matDatepicker]="datePicker"
                [(ngModel)]="date"
                [disabled]="saving()"
                [min]="fy.start()"
                [max]="fy.end()"
                placeholder="dd/mm/yyyy" /><mat-datepicker-toggle
                matIconSuffix
                [for]="datePicker" /><mat-datepicker #datePicker
            /></mat-form-field>
            <mat-form-field
              ><mat-label>Entry type</mat-label
              ><mat-select [(ngModel)]="opening" [disabled]="saving()">
                <mat-option [value]="false">Journal / transfer</mat-option>
                @if (auth.isAdmin()) {
                  <mat-option [value]="true">Opening balances</mat-option>
                }
              </mat-select></mat-form-field
            >
            <mat-form-field
              ><mat-label>Narration</mat-label
              ><input matInput [(ngModel)]="narration" [disabled]="saving()" maxlength="500"
            /></mat-form-field>
          </div>
          @for (line of lines; track $index; let i = $index) {
            <div class="journal-line">
              <app-account-picker
                [label]="'Account ' + (i + 1)"
                [accounts]="accounts()"
                [loading]="loading()"
                [(ngModel)]="line.account"
                [disabled]="saving()"
              />
              <mat-form-field
                ><mat-label>Debit</mat-label
                ><input
                  matInput
                  type="number"
                  min="0"
                  step="0.01"
                  [(ngModel)]="line.debit"
                  [disabled]="saving()"
              /></mat-form-field>
              <mat-form-field
                ><mat-label>Credit</mat-label
                ><input
                  matInput
                  type="number"
                  min="0"
                  step="0.01"
                  [(ngModel)]="line.credit"
                  [disabled]="saving()"
              /></mat-form-field>
              <button
                mat-button
                type="button"
                (click)="remove(i)"
                [disabled]="saving() || lines.length <= 2"
                [attr.aria-label]="'Remove line ' + (i + 1)"
              >
                Remove
              </button>
            </div>
          }
          <p role="status">
            Debit: <strong>{{ total('debit') / 100 | number: '1.2-2' }}</strong> · Credit:
            <strong>{{ total('credit') / 100 | number: '1.2-2' }}</strong> · Difference:
            <strong>{{ (total('debit') - total('credit')) / 100 | number: '1.2-2' }}</strong>
          </p>
          @if (!accounts().length) {
            <p class="hint">Classify accounts in Masters → Account heads before posting.</p>
          }
          <div class="form-actions">
            <button mat-flat-button (click)="post()" [disabled]="saving() || !valid()">
              {{ saving() ? 'Posting…' : 'Post balanced entry' }}
            </button>
            <button mat-stroked-button (click)="add()" [disabled]="saving() || lines.length >= 200">
              Add line
            </button>
            <button mat-button (click)="clear()" [disabled]="saving()">New entry</button>
          </div>
        </div>
      </section>
    }
    <section class="panel register">
      <div class="panel-header">
        <div>
          <h2>Journal register</h2>
          <p>Entries in the selected financial year, including receipts, payments and reversals.</p>
        </div>
        <button mat-button (click)="load()" [disabled]="loading()">Refresh</button>
      </div>
      @for (entry of entries(); track entry.id) {
        <details class="entry">
          <summary>
            J-{{ entry.id }} · {{ entry.entry_date | date: 'dd MMM yyyy' }} · {{ entry.kind }} ·
            {{ entry.narration }}
          </summary>
          @if (entry.reversal_of) {
            <p>Reversal of J-{{ entry.reversal_of }}</p>
          }
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th class="num">Debit</th>
                  <th class="num">Credit</th>
                </tr>
              </thead>
              <tbody>
                @for (line of entry.daybook; track $index) {
                  <tr>
                    <td>{{ accountName(line.head_code) }}</td>
                    <td class="num">{{ line.debit | number: '1.2-2' }}</td>
                    <td class="num">{{ line.credit | number: '1.2-2' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (auth.isAdmin() && !entry.voucher_id && !entry.reversal_of) {
            <button mat-button (click)="reverse(entry)" [disabled]="saving()">Reverse entry</button>
          }
        </details>
      } @empty {
        <div class="panel-body">{{ loading() ? 'Loading…' : 'No journal entries yet.' }}</div>
      }
      @if (entries().length) {
        <div class="register-footer">
          <span class="toolbar-count" aria-live="polite"
            >Showing {{ entries().length }} of {{ totalEntries() }}</span
          >
          @if (entries().length < totalEntries()) {
            <button mat-stroked-button (click)="loadMore()" [disabled]="loadingMore()">
              {{ loadingMore() ? 'Loading…' : 'Load more' }}
            </button>
          }
        </div>
      }
    </section>
  </div>`,
  styles: `
    .journal-line {
      display: grid;
      grid-template-columns: minmax(180px, 2fr) repeat(2, minmax(100px, 1fr)) auto;
      gap: 12px;
      align-items: start;
    }
    .register {
      margin-top: 24px;
    }
    .entry {
      padding: 16px;
      border-top: 1px solid var(--app-border);
    }
    summary {
      cursor: pointer;
      min-height: 32px;
    }
    .register-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      padding: 14px 16px;
      border-top: 1px solid var(--app-border);
    }
    @media (max-width: 640px) {
      .journal-line {
        grid-template-columns: 1fr 1fr;
      }
      .journal-line > :first-child {
        grid-column: 1/-1;
      }
    }
  `,
})
export class Journals {
  protected readonly auth = inject(AuthService);
  private readonly sb = inject(SupabaseService).client;
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);
  private readonly locale = inject(LOCALE_ID);
  protected readonly accounts = signal<AccountHead[]>([]);
  protected readonly entries = signal<Journal[]>([]);
  protected readonly totalEntries = signal(0);
  protected readonly loadingMore = signal(false);
  protected readonly saving = signal(false);
  protected readonly loading = signal(false);
  protected readonly fy = inject(FinancialYearService);
  protected date = this.fy.entryDate();
  protected narration = '';
  protected opening = false;
  protected lines: Line[] = [
    { account: null, debit: null, credit: null },
    { account: null, debit: null, credit: null },
  ];
  private loadId = 0;
  private requestId = crypto.randomUUID();
  constructor() {
    effect(() => {
      this.fy.selected();
      if (this.lines.every((line) => !line.account && !line.debit && !line.credit))
        this.date = this.fy.entryDate();
      void this.load();
    });
  }

  hasPendingChanges(): boolean {
    return (
      !this.saving() &&
      (!!this.narration.trim() ||
        this.lines.some((line) => line.account !== null || !!line.debit || !!line.credit))
    );
  }
  protected total(side: 'debit' | 'credit') {
    return this.lines.reduce((sum, line) => sum + Math.round(Number(line[side] ?? 0) * 100), 0);
  }
  protected valid() {
    return (
      !!this.date &&
      this.fy.contains(this.date) &&
      !this.fy.closed() &&
      this.total('debit') > 0 &&
      this.total('debit') === this.total('credit') &&
      this.lines.every((line) => {
        const d = Number(line.debit ?? 0),
          c = Number(line.credit ?? 0);
        return (
          !!line.account &&
          Number.isFinite(d) &&
          Number.isFinite(c) &&
          d >= 0 &&
          c >= 0 &&
          ((d > 0 && c === 0) || (c > 0 && d === 0)) &&
          Math.abs(d * 100 - Math.round(d * 100)) < 0.00001 &&
          Math.abs(c * 100 - Math.round(c * 100)) < 0.00001
        );
      })
    );
  }
  protected add() {
    this.lines.push({ account: null, debit: null, credit: null });
  }
  protected remove(index: number) {
    this.lines.splice(index, 1);
  }
  protected clear() {
    this.lines = [
      { account: null, debit: null, credit: null },
      { account: null, debit: null, credit: null },
    ];
    this.narration = '';
    this.requestId = crypto.randomUUID();
  }
  protected accountName(code: number) {
    return this.accounts().find((a) => a.code === code)?.name ?? String(code);
  }
  /** Entries older than the last one shown, so new postings never shift a loaded page. */
  protected async loadMore() {
    const loadId = this.loadId;
    const oldest = this.entries().at(-1)?.id;
    if (!oldest || this.loadingMore()) return;
    this.loadingMore.set(true);
    try {
      const { data, error } = await this.entryQuery().lt('id', oldest);
      if (error) throw error;
      if (loadId !== this.loadId) return;
      this.entries.update((entries) => [...entries, ...((data ?? []) as Journal[])]);
    } catch (error) {
      this.notify.error(error);
    } finally {
      if (loadId === this.loadId) this.loadingMore.set(false);
    }
  }

  private entryQuery() {
    return this.sb
      .from('journals')
      .select(
        'id,entry_date,narration,kind,reversal_of,voucher_id,daybook(head_code,debit,credit)',
        { count: 'exact' },
      )
      .gte('entry_date', this.fy.start())
      .lte('entry_date', this.fy.end())
      .order('id', { ascending: false })
      .limit(PAGE_SIZE);
  }

  protected async load() {
    const loadId = ++this.loadId;
    this.entries.set([]);
    this.totalEntries.set(0);
    this.loading.set(true);
    try {
      const [accounts, page] = await Promise.all([
        must(
          this.sb
            .from('account_heads')
            .select('code,name')
            .not('account_type', 'is', null)
            .order('name'),
        ),
        this.entryQuery(),
      ]);
      if (page.error) throw page.error;
      if (loadId !== this.loadId) return;
      this.accounts.set(accounts);
      this.entries.set((page.data ?? []) as Journal[]);
      this.totalEntries.set(page.count ?? 0);
    } catch (error) {
      this.notify.error(error);
    } finally {
      if (loadId === this.loadId) this.loading.set(false);
    }
  }

  protected async post() {
    if (this.saving() || !this.valid()) return;
    this.saving.set(true);
    try {
      const id = await must(
        this.sb.rpc('create_journal', {
          p_date: this.date,
          p_narration: this.narration,
          p_lines: this.lines,
          p_request_id: this.requestId,
          p_opening: this.opening,
        }),
      );
      this.notify.success(`Journal J-${id} posted`);
      this.clear();
      await this.load();
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.saving.set(false);
    }
  }
  protected async reverse(entry: Journal) {
    const debit = entry.daybook.reduce((sum, line) => sum + Number(line.debit), 0);
    const result = await confirmAction(this.dialog, {
      title: `Reverse journal J-${entry.id}?`,
      message: 'A balancing entry with opposite debits and credits is posted on the chosen date.',
      details: [
        { label: 'Entry date', value: formatDate(entry.entry_date, 'dd-MMM-yyyy', this.locale) },
        { label: 'Narration', value: entry.narration || '—' },
        { label: 'Total debit', value: formatNumber(debit, this.locale, '1.2-2') },
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
    this.saving.set(true);
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
      this.saving.set(false);
    }
  }
}
