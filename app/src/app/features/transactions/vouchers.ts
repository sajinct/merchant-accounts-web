import { effect, untracked } from '@angular/core';
import { FinancialYearService } from '../../core/financial-year.service';
import { FinancialYearScope } from '../../shared/financial-year-scope';
import { FinancialYearNotice } from '../../shared/financial-year-notice';
import { CashAccountField } from '../../shared/cash-account-field';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../core/auth.service';
import { AccountHead, Voucher, VoucherType } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { must, SupabaseService } from '../../core/supabase.service';
import { isoDate } from '../../shared/dates';
import { EnterToNext } from '../../shared/enter-to-next.directive';

interface VoucherLine extends Voucher {
  receipt: number;
  payment: number;
  balance: number;
}

function isHead(value: unknown): value is AccountHead {
  return !!value && typeof value === 'object' && 'code' in value;
}

@Component({
  selector: 'app-vouchers',
  imports: [
    FinancialYearScope,
    FinancialYearNotice,
    CashAccountField,
    DatePipe,
    DecimalPipe,
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatTooltipModule,
    EnterToNext,
  ],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="page-heading">
          <span class="eyebrow">Transactions</span>
          <h1>Payments & receipts</h1>
          <p class="page-description">
            Record daily transactions and keep every account in balance.
          </p>
        </div>
        <span class="status-badge neutral"><mat-icon>receipt_long</mat-icon> Voucher entry</span>
      </div>

      <app-financial-year-notice />
      <form
        appFinancialYearScope="entry"
        class="panel voucher-form"
        [formGroup]="form"
        (ngSubmit)="save()"
        appEnterToNext
      >
        <div class="panel-header">
          <div>
            <h2>New {{ form.controls.type.value === 1 ? 'receipt' : 'payment' }}</h2>
            <p class="hint">
              {{
                form.controls.type.value === 1
                  ? 'Record money received into an account.'
                  : 'Record money paid from an account.'
              }}
            </p>
          </div>
          <mat-button-toggle-group
            formControlName="type"
            aria-label="Voucher type"
            [hideSingleSelectionIndicator]="true"
          >
            <mat-button-toggle [value]="1"
              ><mat-icon>south_west</mat-icon> Receipt</mat-button-toggle
            >
            <mat-button-toggle [value]="2"
              ><mat-icon>north_east</mat-icon> Payment</mat-button-toggle
            >
          </mat-button-toggle-group>
        </div>

        <div class="panel-body">
          <div class="form-grid voucher-grid">
            <app-cash-account-field [control]="form.controls.cash" />
            <mat-form-field>
              <mat-label>Transaction date</mat-label>
              <input matInput type="date" formControlName="date" />
            </mat-form-field>
            <mat-form-field class="account-field">
              <mat-label>Account</mat-label>
              <mat-icon matPrefix>search</mat-icon>
              <input
                matInput
                formControlName="account"
                [matAutocomplete]="accountAuto"
                placeholder="Search by name or code"
              />
              <mat-autocomplete
                #accountAuto="matAutocomplete"
                [displayWith]="displayHead"
                autoActiveFirstOption
                (optionSelected)="loadAccount($event.option.value)"
              >
                @for (head of matchingHeads(); track head.code) {
                  <mat-option [value]="head">{{ head.code }} – {{ head.name }}</mat-option>
                } @empty {
                  <mat-option disabled>{{
                    loadingHeads() ? 'Loading accounts…' : 'No matching accounts'
                  }}</mat-option>
                }
              </mat-autocomplete>
            </mat-form-field>
            <mat-form-field>
              <mat-label>Amount</mat-label>
              <input
                matInput
                type="number"
                min="0.01"
                step="0.01"
                inputmode="decimal"
                formControlName="amount"
                placeholder="0.00"
              />
              @if (form.controls.amount.hasError('min')) {
                <mat-error>Enter an amount greater than zero.</mat-error>
              }
            </mat-form-field>
            <mat-form-field class="narration-field">
              <mat-label>Narration</mat-label>
              <input
                matInput
                formControlName="description"
                maxlength="200"
                placeholder="Add a short description (optional)"
              />
            </mat-form-field>
          </div>

          <div class="form-actions">
            <button
              mat-flat-button
              type="submit"
              [disabled]="form.invalid || !selectedHead() || saving() || !auth.canEdit()"
            >
              <mat-icon>add</mat-icon>
              {{
                saving()
                  ? 'Saving…'
                  : 'Save ' + (form.controls.type.value === 1 ? 'receipt' : 'payment')
              }}
            </button>
            <button mat-stroked-button type="button" (click)="clear()" [disabled]="saving()">
              Clear entry
            </button>
            @if (!auth.canEdit()) {
              <span class="hint">Your role can view vouchers but not enter them.</span>
            }
          </div>
        </div>
      </form>

      @if (selectedHead(); as head) {
        @if (!loadingAccount() && !accountError()) {
          <div class="summary-grid account-summary">
            <div class="summary-card">
              <div class="summary-icon"><mat-icon>south_west</mat-icon></div>
              <div>
                <span class="summary-label">Total receipts</span
                ><strong class="summary-value">{{ totalReceipts() | number: '1.2-2' }}</strong>
              </div>
            </div>
            <div class="summary-card">
              <div class="summary-icon payment-icon"><mat-icon>north_east</mat-icon></div>
              <div>
                <span class="summary-label">Total payments</span
                ><strong class="summary-value">{{ totalPayments() | number: '1.2-2' }}</strong>
              </div>
            </div>
            <div class="summary-card">
              <div class="summary-icon"><mat-icon>account_balance_wallet</mat-icon></div>
              <div>
                <span class="summary-label">Net receipts / payments</span
                ><strong class="summary-value" [class.danger]="balance() < 0">{{
                  balance() | number: '1.2-2'
                }}</strong>
              </div>
            </div>
          </div>
        }
        <section class="panel account-ledger" [attr.aria-busy]="loadingAccount()">
          <div class="panel-header">
            <div>
              <h2>{{ head.name }}</h2>
              <p class="hint">Account {{ head.code }} · Selected financial year</p>
            </div>
            @if (!loadingAccount() && !accountError()) {
              <span class="status-badge neutral"
                >{{ lines().length }} {{ lines().length === 1 ? 'voucher' : 'vouchers' }}</span
              >
            }
          </div>
          @if (loadingAccount()) {
            <mat-progress-bar mode="indeterminate" />
            <div class="empty-state" role="status"><p>Loading account transactions…</p></div>
          } @else if (accountError()) {
            <div class="empty-state" role="status">
              <div class="empty-icon"><mat-icon>cloud_off</mat-icon></div>
              <h3>Transactions could not be loaded</h3>
              <p>Try again to view this account’s current balance.</p>
              <button mat-stroked-button type="button" (click)="loadAccount(head)">
                <mat-icon>refresh</mat-icon> Try again
              </button>
            </div>
          } @else if (lines().length) {
            <div
              class="table-wrap ledger-table-wrap"
              tabindex="0"
              role="region"
              aria-label="Account transactions"
            >
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Voucher</th>
                    <th>Date</th>
                    <th>Narration</th>
                    <th class="num">Receipt</th>
                    <th class="num">Payment</th>
                    <th class="num">Balance</th>
                    @if (auth.isAdmin()) {
                      <th><span class="visually-hidden">Actions</span></th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (line of lines(); track line.id) {
                    <tr>
                      <td>
                        <span class="voucher-ref" [class.receipt-ref]="line.voucher_type === 1"
                          >{{ line.voucher_type === 1 ? 'R' : 'P' }}-{{ line.voucher_no }}</span
                        >
                      </td>
                      <td>{{ line.voucher_date | date: 'dd-MMM-yyyy' }}</td>
                      <td class="narration-cell">{{ line.description || '—' }}</td>
                      <td class="num">{{ line.receipt | number: '1.2-2' }}</td>
                      <td class="num">{{ line.payment | number: '1.2-2' }}</td>
                      <td class="num ledger-balance" [class.danger]="line.balance < 0">
                        {{ line.balance | number: '1.2-2' }}
                      </td>
                      @if (auth.isAdmin()) {
                        <td class="row-actions">
                          <button
                            mat-icon-button
                            type="button"
                            (click)="cancel(line)"
                            matTooltip="Cancel voucher"
                            aria-label="Cancel voucher"
                          >
                            <mat-icon>block</mat-icon>
                          </button>
                        </td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div class="empty-state">
              <div class="empty-icon"><mat-icon>receipt_long</mat-icon></div>
              <h3>No transactions yet</h3>
              <p>The first receipt or payment for {{ head.name }} will appear here.</p>
            </div>
          }
        </section>
      } @else {
        <section class="panel account-placeholder">
          <div class="empty-state">
            <div class="empty-icon"><mat-icon>account_balance_wallet</mat-icon></div>
            <h3>Your account activity, in one place</h3>
            <p>Select an account above to see its receipts, payments and running balance.</p>
          </div>
        </section>
      }
    </div>
  `,
  styles: `
    .voucher-grid {
      grid-template-columns: 170px minmax(200px, 1fr) 190px;
    }
    .narration-field {
      grid-column: 1 / -1;
    }
    .voucher-form {
      margin-bottom: 20px;
    }
    .voucher-form mat-button-toggle-group {
      margin: 0;
      border-radius: 8px;
    }
    mat-button-toggle mat-icon {
      font-size: 17px;
      width: 17px;
      height: 17px;
      vertical-align: middle;
      margin-right: 5px;
    }
    .panel-header .hint {
      margin: 4px 0 0;
    }
    .voucher-form .form-actions {
      margin: 0;
    }
    .account-summary {
      margin-bottom: 20px;
    }
    .payment-icon {
      background: #fff5e7;
      color: #ad670b;
    }
    .ledger-table-wrap {
      border: 0;
      border-radius: 0 0 12px 12px;
    }
    .data-table {
      min-width: 700px;
    }
    .voucher-ref {
      display: inline-flex;
      padding: 3px 7px;
      border-radius: 4px;
      background: #fff5e7;
      color: #945810;
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
    }
    .receipt-ref {
      background: #eaf6f1;
      color: #177054;
    }
    .ledger-balance {
      font-weight: 600;
    }
    .narration-cell {
      min-width: 170px;
    }
    .account-placeholder .empty-state {
      padding: 46px 20px;
    }
    @media (max-width: 900px) {
      .voucher-grid {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      }
      .account-field {
        grid-column: 2;
        grid-row: 1;
      }
      .narration-field {
        grid-column: 2;
      }
    }
    @media (max-width: 600px) {
      .voucher-grid {
        grid-template-columns: minmax(0, 1fr);
      }
      .account-field,
      .narration-field {
        grid-column: auto;
        grid-row: auto;
      }
      .voucher-form mat-button-toggle-group {
        width: 100%;
      }
      mat-button-toggle {
        flex: 1;
      }
      .account-placeholder .empty-state {
        padding: 32px 18px;
      }
    }
  `,
})
export class Vouchers implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly sb = inject(SupabaseService).client;
  private readonly notify = inject(NotifyService);

  protected readonly heads = signal<AccountHead[]>([]);
  protected readonly selectedHead = signal<AccountHead | null>(null);
  protected readonly lines = signal<VoucherLine[]>([]);
  protected readonly saving = signal(false);
  protected readonly loadingHeads = signal(true);
  protected readonly loadingAccount = signal(false);
  protected readonly accountError = signal(false);

  private readonly fy = inject(FinancialYearService);
  private accountLoadId = 0;
  private requestId = crypto.randomUUID();
  protected readonly form = inject(FormBuilder).group({
    type: [1 as VoucherType, Validators.required],
    date: [isoDate(), Validators.required],
    cash: [null as number | null, Validators.required],
    account: [null as AccountHead | string | null, Validators.required],
    description: [''],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
  });

  private readonly accountValue = toSignal(this.form.controls.account.valueChanges, {
    initialValue: null,
  });

  protected readonly matchingHeads = computed(() => {
    const value = this.accountValue();
    const q = (typeof value === 'string' ? value : '').trim().toLowerCase();
    const heads = this.heads();
    return (
      q
        ? heads.filter((h) => h.name.toLowerCase().includes(q) || String(h.code).startsWith(q))
        : heads
    ).slice(0, 50);
  });

  protected readonly balance = computed(() => this.lines().at(-1)?.balance ?? 0);
  protected readonly totalReceipts = computed(() =>
    this.lines().reduce((sum, line) => sum + line.receipt, 0),
  );
  protected readonly totalPayments = computed(() =>
    this.lines().reduce((sum, line) => sum + line.payment, 0),
  );

  protected readonly displayHead = (head: AccountHead | string | null): string =>
    isHead(head) ? `${head.code} – ${head.name}` : (head ?? '');

  constructor() {
    effect(() => {
      this.fy.selected();
      untracked(() => {
        const head = this.selectedHead();
        if (head) void this.loadAccount(head);
      });
    });
    // Typing over a chosen account clears the selection.
    this.form.controls.account.valueChanges.subscribe((value) => {
      if (!isHead(value) && this.selectedHead()) {
        this.selectedHead.set(null);
        this.lines.set([]);
      }
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      // Only classified accounts can participate in a double-entry voucher.
      this.heads.set(
        await must(
          this.sb
            .from('account_heads')
            .select('code, name')
            .not('account_type', 'is', null)
            .order('name'),
        ),
      );
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.loadingHeads.set(false);
    }
  }

  protected async loadAccount(head: AccountHead): Promise<void> {
    const loadId = ++this.accountLoadId;
    this.selectedHead.set(head);
    this.loadingAccount.set(true);
    this.accountError.set(false);
    this.lines.set([]);
    try {
      const vouchers = await must(
        this.sb
          .from('vouchers')
          .select(
            'id, voucher_type, voucher_no, voucher_date, head_code, description, amount, cancelled_at',
          )
          .eq('head_code', head.code)
          .gte('voucher_date', this.fy.start())
          .lte('voucher_date', this.fy.end())
          .is('cancelled_at', null)
          .order('voucher_date')
          .order('id'),
      );
      if (this.selectedHead()?.code !== head.code || loadId !== this.accountLoadId) return;
      let balance = 0;
      this.lines.set(
        (vouchers as Voucher[]).map((v) => {
          const receipt = v.voucher_type === 1 ? Number(v.amount) : 0;
          const payment = v.voucher_type === 2 ? Number(v.amount) : 0;
          balance += receipt - payment;
          return { ...v, receipt, payment, balance };
        }),
      );
    } catch (err) {
      if (this.selectedHead()?.code === head.code && loadId === this.accountLoadId) {
        this.accountError.set(true);
        this.notify.error(err);
      }
    } finally {
      if (this.selectedHead()?.code === head.code && loadId === this.accountLoadId)
        this.loadingAccount.set(false);
    }
  }

  protected async save(): Promise<void> {
    const head = this.selectedHead();
    const { type, date, description, amount, cash } = this.form.getRawValue();
    if (this.saving() || this.form.invalid || !head || !type || !date || !amount || !cash) {
      return;
    }
    this.saving.set(true);
    try {
      const voucher = await must(
        this.sb
          .rpc('create_voucher', {
            p_type: type,
            p_date: date,
            p_head_code: head.code,
            p_description: description ?? '',
            p_amount: amount,
            p_cash_account_code: cash,
            p_request_id: this.requestId,
          })
          .single<Voucher>(),
      );
      this.notify.success(`${type === 1 ? 'Receipt R' : 'Payment P'}-${voucher.voucher_no} saved`);
      this.requestId = crypto.randomUUID();
      this.form.patchValue({ description: '', amount: null });
      this.form.controls.amount.markAsUntouched();
      await this.loadAccount(head);
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.saving.set(false);
    }
  }

  protected async cancel(line: VoucherLine): Promise<void> {
    const ref = `${line.voucher_type === 1 ? 'R' : 'P'}-${line.voucher_no}`;
    const reason = prompt(`Cancel voucher ${ref} (${line.amount})?\nEnter a reason:`);
    if (reason === null) {
      return;
    }
    try {
      await must(this.sb.rpc('cancel_voucher', { p_id: line.id, p_reason: reason }));
      this.notify.success(`Voucher ${ref} cancelled with a balancing reversal.`);
      const head = this.selectedHead();
      if (head) {
        await this.loadAccount(head);
      }
    } catch (err) {
      this.notify.error(err);
    }
  }

  protected clear(): void {
    this.requestId = crypto.randomUUID();
    this.form.reset({ type: 1, date: isoDate(), account: null, description: '', amount: null });
    this.selectedHead.set(null);
    this.lines.set([]);
  }
}
