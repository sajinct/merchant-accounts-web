import { effect } from '@angular/core';
import { FinancialYearService } from '../../core/financial-year.service';
import { FinancialYearNotice } from '../../shared/financial-year-notice';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { AccountHead } from '../../core/models';
import { AuthService } from '../../core/auth.service';
import { NotifyService } from '../../core/notify.service';
import { must, SupabaseService } from '../../core/supabase.service';
import { isoDate } from '../../shared/dates';

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
    FinancialYearNotice,
    FormsModule,
    DatePipe,
    DecimalPipe,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: ` <div class="page">
    <div class="page-header">
      <div class="page-heading">
        <span class="eyebrow">Double-entry accounting</span>
        <h1>Journals & transfers</h1>
        <p class="page-description">
          Every entry must have equal debits and credits. For a bank transfer, debit the destination
          and credit the source.
        </p>
      </div>
    </div>
    <app-financial-year-notice />
    @if (auth.canEdit()) {
      <section class="panel">
        <div class="panel-header"><h2>New entry</h2></div>
        <div class="panel-body">
          <div class="form-grid">
            <mat-form-field
              ><mat-label>Date</mat-label
              ><input matInput type="date" [(ngModel)]="date" [disabled]="saving()"
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
              <mat-form-field
                ><mat-label>Account {{ i + 1 }}</mat-label
                ><mat-select [(ngModel)]="line.account" [disabled]="saving()">
                  @for (head of accounts(); track head.code) {
                    <mat-option [value]="head.code">{{ head.code }} · {{ head.name }}</mat-option>
                  }
                </mat-select></mat-form-field
              >
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
          <p>
            Latest 100 entries in the selected financial year, including receipts, payments and
            reversals.
          </p>
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
    @media (max-width: 640px) {
      .journal-line {
        grid-template-columns: 1fr 1fr;
      }
      .journal-line mat-form-field:first-child {
        grid-column: 1/-1;
      }
    }
  `,
})
export class Journals {
  protected readonly auth = inject(AuthService);
  private readonly sb = inject(SupabaseService).client;
  private readonly notify = inject(NotifyService);
  protected readonly accounts = signal<AccountHead[]>([]);
  protected readonly entries = signal<Journal[]>([]);
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
  protected async load() {
    const loadId = ++this.loadId;
    this.entries.set([]);
    this.loading.set(true);
    try {
      const [accounts, entries] = await Promise.all([
        must(
          this.sb
            .from('account_heads')
            .select('code,name')
            .not('account_type', 'is', null)
            .order('name'),
        ),
        must(
          this.sb
            .from('journals')
            .select(
              'id,entry_date,narration,kind,reversal_of,voucher_id,daybook(head_code,debit,credit)',
            )
            .gte('entry_date', this.fy.start())
            .lte('entry_date', this.fy.end())
            .order('id', { ascending: false })
            .limit(100),
        ),
      ]);
      if (loadId !== this.loadId) return;
      this.accounts.set(accounts);
      this.entries.set(entries as Journal[]);
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
    const reason = prompt(`Reason for reversing J-${entry.id}:`);
    if (!reason?.trim()) return;
    const date = prompt('Reversal date (YYYY-MM-DD):', isoDate());
    if (!date) return;
    this.saving.set(true);
    try {
      await must(
        this.sb.rpc('reverse_journal', { p_id: entry.id, p_date: date, p_reason: reason }),
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
