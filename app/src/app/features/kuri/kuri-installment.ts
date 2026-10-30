import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroupDirective, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../core/auth.service';
import { AccountHead } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { PageHeader } from '../../shared/page-header';
import { StatCard } from '../../shared/stat-card';
import { EmptyState } from '../../shared/empty-state';
import { confirmAction } from '../../shared/confirm-dialog';
import { EnterToNext } from '../../shared/enter-to-next.directive';
import { EntrySelect } from '../../shared/entry-select.directive';
import { isoDate } from '../../shared/dates';
import { KuriService } from './kuri.service';
import { allocateKuriReceipt } from './kuri-allocation';
import {
  hasCustomHolderName,
  KuriCollectionRow,
  KuriSchemeDetail,
  KuriSchemeListRow,
  KuriMemberLedgerRow,
  ticketHolderName,
} from './kuri.models';

@Component({
  selector: 'app-kuri-installment',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatAutocompleteModule,
    DatePipe,
    DecimalPipe,
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
    PageHeader,
    StatCard,
    EmptyState,
    EnterToNext,
    EntrySelect,
  ],
  template: `
    <div class="page">
      @if (receiptEntry) {
        <app-page-header
          eyebrow="Kuri"
          heading="Installment receipts"
          description="Choose a scheme and ticket. Each receipt clears the oldest unpaid installments first."
        >
          <a mat-stroked-button routerLink="/kuri/schemes">All schemes</a>
        </app-page-header>
        <section class="panel receipt-context" aria-label="Choose scheme">
          <div class="panel-body filter-row">
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>Scheme</mat-label>
              <mat-select
                [value]="schemeId() || null"
                [disabled]="isSubmitting() || paymentForm.dirty || loadingSchemes()"
                (selectionChange)="selectReceiptScheme($event.value)"
              >
                @for (row of receiptSchemes(); track row.id) {
                  <mat-option [value]="row.id">{{ row.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>
          @if (paymentForm.dirty) {
            <p class="hint">Save or clear this receipt before changing the scheme.</p>
          }
          @if (schemesFailed()) {
            <p class="hint">
              Could not load schemes.
              <button mat-button (click)="loadReceiptSchemes()">Retry</button>
            </p>
          } @else if (!loadingSchemes() && !receiptSchemes().length) {
            <p class="hint">
              No schemes are ready for receipts. Enroll all tickets, activate the scheme and link
              its account in All schemes.
            </p>
          }
        </section>
      }
      @if (scheme(); as s) {
        @if (!receiptEntry) {
          <app-page-header
            eyebrow="Kuri"
            [heading]="'Installment ' + installmentNo()"
            [description]="
              s.head_code ? s.name + ' · Account ' + s.head_code + ' – ' + s.head_name : s.name
            "
          >
            <div class="installment-nav">
              <button
                mat-icon-button
                aria-label="Previous installment"
                [disabled]="installmentNo() <= 1 || loading() || isSubmitting()"
                (click)="goToInstallment(installmentNo() - 1)"
              >
                <mat-icon>chevron_left</mat-icon>
              </button>
              <span class="installment-counter"
                >{{ installmentNo() }} / {{ s.num_installments }}</span
              >
              <button
                mat-icon-button
                aria-label="Next installment"
                [disabled]="installmentNo() >= s.num_installments || loading() || isSubmitting()"
                (click)="goToInstallment(installmentNo() + 1)"
              >
                <mat-icon>chevron_right</mat-icon>
              </button>
            </div>
          </app-page-header>

          <div class="summary-grid">
            <app-stat-card
              label="Total Due"
              [value]="totalDue() | number: '1.2-2'"
              icon="receipt_long"
            />
            <app-stat-card
              label="Collected"
              [value]="collected() | number: '1.2-2'"
              icon="payments"
            />
            <app-stat-card
              label="Pending"
              [value]="pending() | number: '1.2-2'"
              icon="pending_actions"
            />
            <app-stat-card label="Paid" [value]="paidCountText()" icon="group" />
          </div>
        }

        @if (auth.canEdit() && s.status !== 'draft' && !loading() && !loadFailed()) {
          <div class="panel" style="margin-bottom: 24px">
            <div class="panel-header">
              @if (receiptEntry) {
                <h3>New receipt · {{ s.name }}</h3>
              } @else {
                <button
                  mat-button
                  type="button"
                  class="payment-toggle"
                  [attr.aria-expanded]="showPaymentForm()"
                  aria-controls="kuri-payment-form"
                  (click)="showPaymentForm.set(!showPaymentForm())"
                >
                  <mat-icon>add_circle_outline</mat-icon>
                  Record Payment
                  <mat-icon iconPositionEnd>{{
                    showPaymentForm() ? 'expand_less' : 'expand_more'
                  }}</mat-icon>
                </button>
              }
            </div>

            @if (showPaymentForm()) {
              <div class="panel-body">
                <form
                  #paymentEntry="ngForm"
                  id="kuri-payment-form"
                  appEnterToNext
                  [formGroup]="paymentForm"
                  (ngSubmit)="onSubmitPayment()"
                  class="form-grid"
                >
                  <mat-form-field subscriptSizing="dynamic">
                    <mat-label>{{ receiptEntry ? 'Ticket holder' : 'Member' }}</mat-label>
                    @if (receiptEntry) {
                      <input
                        matInput
                        formControlName="member_id"
                        [matAutocomplete]="ticketOptions"
                        placeholder="Search by ticket number or name"
                        (input)="memberQuery.set($any($event.target).value)"
                      />
                      <mat-autocomplete
                        #ticketOptions="matAutocomplete"
                        [displayWith]="displayTicket"
                        requireSelection
                        (optionSelected)="onMemberSelect($event.option.value)"
                      >
                        @for (member of matchingMembers(); track member.member_id) {
                          <mat-option [value]="member.member_id">
                            #{{ member.ticket_no }} — {{ holderName(member) }} · Remaining
                            {{ member.balance | number: '1.2-2' }}
                          </mat-option>
                        } @empty {
                          <mat-option disabled>No unpaid tickets match</mat-option>
                        }
                      </mat-autocomplete>
                    } @else {
                      <mat-select
                        appEntrySelect
                        formControlName="member_id"
                        (selectionChange)="onMemberSelect($event.value)"
                      >
                        @for (member of unpaidMembers(); track member.member_id) {
                          <mat-option [value]="member.member_id">
                            #{{ member.ticket_no }} — {{ holderName(member) }}
                            @if (isCustomHolder(member)) {
                              (Member #{{ member.customer_code }}: {{ member.customer_name }})
                            }
                            (Bal: {{ member.balance | number: '1.2-2' }})
                          </mat-option>
                        }
                      </mat-select>
                    }
                    <mat-error>Select a member with an outstanding balance.</mat-error>
                  </mat-form-field>

                  @if (cashAccounts().length > 0 || receiptEntry) {
                    <mat-form-field subscriptSizing="dynamic">
                      <mat-label>Received into</mat-label>
                      <mat-select appEntrySelect formControlName="cash_account_code">
                        @for (acc of cashAccounts(); track acc.code) {
                          <mat-option [value]="acc.code"
                            >{{ acc.code }} – {{ acc.name }}</mat-option
                          >
                        }
                      </mat-select>
                    </mat-form-field>
                  }

                  <mat-form-field subscriptSizing="dynamic">
                    <mat-label>Amount</mat-label>
                    <input matInput type="number" formControlName="amount" min="0.01" step="0.01" />
                    @if (receiptEntry && selectedMember(); as member) {
                      <mat-hint
                        >Remaining across all installments:
                        {{ receiptBalance() | number: '1.2-2' }}. Part payments and payments towards
                        future installments are allowed.</mat-hint
                      >
                    }
                    <mat-error
                      >Enter an amount within the balance, with at most two decimal
                      places.</mat-error
                    >
                  </mat-form-field>

                  <mat-form-field subscriptSizing="dynamic">
                    <mat-label>Paid On</mat-label>
                    <input
                      matInput
                      [matDatepicker]="picker"
                      formControlName="paid_on"
                      placeholder="dd/mm/yyyy"
                    />
                    <mat-datepicker-toggle matIconSuffix [for]="picker" />
                    <mat-datepicker #picker />
                    <mat-error>Enter a valid date as dd/mm/yyyy.</mat-error>
                  </mat-form-field>

                  <mat-form-field subscriptSizing="dynamic">
                    <mat-label>Notes</mat-label>
                    <input matInput formControlName="notes" />
                  </mat-form-field>

                  @if (receiptEntry && selectedMember()) {
                    <section
                      class="allocation-preview full"
                      aria-label="Receipt allocation"
                      aria-live="polite"
                    >
                      @if (loadingAllocation()) {
                        <p>Loading ticket balances…</p>
                      } @else if (allocationFailed()) {
                        <p>Could not load ticket balances. Refresh balances before saving.</p>
                      } @else {
                        <h4>How this receipt will be applied</h4>
                        @for (part of allocationPreview(); track part.installment_no) {
                          <p>
                            Installment {{ part.installment_no }}
                            <strong>{{ part.amount | number: '1.2-2' }}</strong>
                          </p>
                        } @empty {
                          <p>Enter an amount within the ticket's remaining balance.</p>
                        }
                      }
                      <button
                        mat-button
                        type="button"
                        [disabled]="isSubmitting() || loadingAllocation()"
                        (click)="refreshAllocation()"
                      >
                        Refresh balances
                      </button>
                    </section>
                  }
                  <div class="form-actions full">
                    <button
                      mat-flat-button
                      type="submit"
                      [disabled]="
                        paymentForm.invalid ||
                        isSubmitting() ||
                        (receiptEntry &&
                          (loadingAllocation() ||
                            allocationFailed() ||
                            !allocationPreview().length))
                      "
                    >
                      {{
                        isSubmitting() ? 'Saving…' : receiptEntry ? 'Save receipt' : 'Save Payment'
                      }}
                    </button>
                    <button
                      mat-button
                      type="button"
                      [disabled]="isSubmitting()"
                      (click)="resetPaymentForm()"
                    >
                      Clear
                    </button>
                  </div>
                </form>
                @if (receiptEntry && accountsFailed()) {
                  <p class="hint">
                    Could not load cash/bank accounts.
                    <button mat-button (click)="loadAccounts()">Retry</button>
                  </p>
                } @else if (receiptEntry && !loadingAccounts() && !cashAccounts().length) {
                  <p class="hint">
                    Create an active cash or bank account before recording receipts.
                  </p>
                }
              </div>
            }
          </div>
        }

        @if (!receiptEntry) {
          <div class="panel">
            <div class="panel-header">
              <h3>Collection Status</h3>
              @if (s.status === 'draft') {
                <span class="status-badge neutral">Activate the scheme to collect</span>
              }
              @if (
                auth.canEdit() &&
                s.status !== 'draft' &&
                unpaidMembers().length > 0 &&
                !loading() &&
                !loadFailed()
              ) {
                <button mat-stroked-button [disabled]="isSubmitting()" (click)="onBulkPayment()">
                  <mat-icon>done_all</mat-icon> Mark All Paid
                </button>
              }
            </div>
            <div
              class="table-wrap"
              role="region"
              tabindex="0"
              aria-label="Installment collection status"
              [attr.aria-busy]="loading()"
            >
              <table class="report-table">
                <thead>
                  <tr>
                    <th scope="col">Tkt #</th>
                    <th scope="col">Member</th>
                    <th scope="col">Phone</th>
                    <th scope="col" class="num">Due</th>
                    <th scope="col" class="num">Paid</th>
                    <th scope="col" class="num">Balance</th>
                    <th scope="col">Last Paid</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of collections(); track row.member_id) {
                    <tr>
                      <td>{{ row.ticket_no }}</td>
                      <td>
                        {{ holderName(row) }}
                        @if (row.has_won_lot) {
                          <mat-icon
                            class="lot-winner"
                            [matTooltip]="'Won lot in installment ' + row.won_installment"
                            >emoji_events</mat-icon
                          >
                        }
                        @if (isCustomHolder(row)) {
                          <div class="table-secondary">
                            Member #{{ row.customer_code }}: {{ row.customer_name }}
                          </div>
                        }
                      </td>
                      <td>{{ row.phone || '—' }}</td>
                      <td class="num">{{ row.amount_due | number: '1.2-2' }}</td>
                      <td class="num">{{ row.amount_paid | number: '1.2-2' }}</td>
                      <td class="num" [class.overdue]="row.balance > 0">
                        {{ row.balance | number: '1.2-2' }}
                      </td>
                      <td>{{ row.last_paid_on ? (row.last_paid_on | date: 'dd MMM') : '—' }}</td>
                      <td>
                        @if (row.balance <= 0) {
                          <span class="status-badge success">Paid</span>
                        } @else if (row.amount_paid > 0) {
                          <span class="status-badge warning">Part paid</span>
                        } @else {
                          <span class="status-badge neutral">Unpaid</span>
                        }
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="8">
                        <app-empty-state
                          [heading]="
                            loading()
                              ? 'Loading…'
                              : loadFailed()
                                ? 'Unable to load collections'
                                : 'No members'
                          "
                          [message]="
                            loadFailed()
                              ? 'Try loading the installment again.'
                              : 'No collection data available.'
                          "
                        />
                      </td>
                    </tr>
                  }
                </tbody>
                @if (collections().length) {
                  <tfoot>
                    <tr>
                      <td colspan="3">Total ({{ collections().length }} members)</td>
                      <td class="num">{{ totalDue() | number: '1.2-2' }}</td>
                      <td class="num">{{ collected() | number: '1.2-2' }}</td>
                      <td class="num">{{ pending() | number: '1.2-2' }}</td>
                      <td colspan="2"></td>
                    </tr>
                  </tfoot>
                }
              </table>
            </div>
          </div>
        } @else if (!loading() && !loadFailed()) {
          <p class="hint" role="status">
            Received {{ collected() | number: '1.2-2' }} · Remaining across the full scheme
            {{ pending() | number: '1.2-2' }}
          </p>
          @if (!unpaidMembers().length) {
            <p role="status">All tickets are paid for this scheme.</p>
          }
          <a
            mat-button
            [routerLink]="['/kuri/schemes', schemeId(), 'installments', installmentNo()]"
            >View collection status</a
          >
        }
        @if (loadFailed()) {
          <button mat-stroked-button type="button" (click)="loadData()">Retry</button>
        }
      } @else if (!receiptEntry || schemeId()) {
        <app-empty-state
          [heading]="loadFailed() ? 'Unable to load installment' : 'Loading'"
          [message]="
            loadFailed() ? 'Try loading the installment again.' : 'Loading installment data…'
          "
          icon="hourglass_empty"
        />
        @if (loadFailed()) {
          <button mat-stroked-button type="button" (click)="loadData()">Retry</button>
        }
      }
    </div>
  `,
  styleUrl: './kuri-summary.scss',
  styles: `
    .allocation-preview {
      margin-top: 20px;
      padding: 16px;
      border: 1px solid var(--app-border);
      border-radius: var(--app-radius);
    }
    .allocation-preview h4 {
      margin: 0 0 12px;
    }
    .allocation-preview p {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      margin: 8px 0;
    }
    .receipt-context {
      margin-bottom: 20px;
    }
    .receipt-context .hint {
      padding: 0 20px 16px;
      margin: 0;
    }
    .installment-nav {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .installment-counter {
      font-size: 14px;
      font-weight: 500;
      min-width: 50px;
      text-align: center;
    }
    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .payment-toggle {
      width: 100%;
      justify-content: flex-start;
    }
    .panel-header h3 {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
    }
    .lot-winner {
      font-size: 16px;
      height: 16px;
      width: 16px;
      color: var(--app-warning-ink);
      vertical-align: middle;
      margin-left: 4px;
    }
    .overdue {
      color: var(--mat-sys-error);
      font-weight: 600;
    }
  `,
})
export class KuriInstallment implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly kuri = inject(KuriService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly notify = inject(NotifyService);
  protected readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly paymentEntry = viewChild<FormGroupDirective>('paymentEntry');
  protected readonly receiptEntry = this.route.snapshot?.data?.['receiptEntry'] === true;
  protected readonly receiptSchemes = signal<KuriSchemeListRow[]>([]);
  protected readonly loadingSchemes = signal(false);
  protected readonly schemesFailed = signal(false);
  protected readonly loadingAccounts = signal(false);
  protected readonly accountsFailed = signal(false);
  protected readonly memberQuery = signal('');
  protected readonly loadingAllocation = signal(false);
  protected readonly allocationFailed = signal(false);
  private readonly allocationLedger = signal<KuriMemberLedgerRow[]>([]);
  private readonly receiptAmount = signal<number | null>(null);
  private allocationRequest = 0;
  protected readonly receiptBalance = computed(
    () =>
      this.allocationLedger().reduce((sum, row) => sum + Math.round(Number(row.balance) * 100), 0) /
      100,
  );
  protected readonly allocationPreview = computed(() =>
    allocateKuriReceipt(Number(this.receiptAmount()), this.allocationLedger()),
  );
  protected readonly matchingMembers = computed(() => {
    const q = this.memberQuery().trim().toLowerCase().replace(/^#/, '');
    return this.unpaidMembers().filter((m) =>
      `${m.ticket_no} ${ticketHolderName(m)} ${m.customer_name}`.toLowerCase().includes(q),
    );
  });
  protected readonly selectedMember = computed(() =>
    this.collections().find((m) => m.member_id === this.selectedMemberId()),
  );
  private readonly selectedMemberId = signal<number | null>(null);
  protected readonly displayTicket = (id: number | null): string => {
    const member = this.collections().find((m) => m.member_id === id);
    return member ? `#${member.ticket_no} — ${ticketHolderName(member)}` : '';
  };

  protected readonly holderName = ticketHolderName;
  protected readonly isCustomHolder = hasCustomHolderName;

  protected readonly schemeId = signal(0);
  protected readonly installmentNo = signal(0);
  protected readonly scheme = signal<KuriSchemeDetail | null>(null);
  protected readonly collections = signal<KuriCollectionRow[]>([]);
  protected readonly cashAccounts = signal<AccountHead[]>([]);
  protected readonly showPaymentForm = signal(false);
  protected readonly isSubmitting = signal(false);
  protected readonly loading = signal(true);
  protected readonly loadFailed = signal(false);
  private loadRequest = 0;
  private paymentRequest: { payload: string; id: string } | null = null;

  protected readonly paymentForm = this.fb.group({
    // null, not 0: Validators.required treats 0 as a filled-in value.
    member_id: [null as number | null, Validators.required],
    cash_account_code: [null as number | null],
    amount: [
      null as number | null,
      [Validators.required, Validators.min(0.01), Validators.pattern(/^\d+(\.\d{1,2})?$/)],
    ],
    paid_on: [isoDate(), Validators.required],
    notes: [''],
  });

  protected readonly totalDue = computed(() =>
    this.collections().reduce((sum, r) => sum + Number(r.amount_due), 0),
  );
  protected readonly collected = computed(() =>
    this.collections().reduce((sum, r) => sum + Number(r.amount_paid), 0),
  );
  protected readonly pending = computed(() =>
    this.collections().reduce((sum, r) => sum + Number(r.balance), 0),
  );
  protected readonly unpaidMembers = computed(() =>
    this.collections().filter((r) => r.balance > 0),
  );
  protected readonly paidCountText = computed(() => {
    const all = this.collections().length;
    if (!all) return '0 / 0';
    const paid = this.collections().filter((r) => r.balance <= 0).length;
    return `${paid} / ${all}`;
  });

  ngOnInit(): void {
    void this.loadAccounts();
    this.paymentForm.controls.member_id.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((id) => {
        this.selectedMemberId.set(id);
        this.allocationRequest++;
        this.allocationLedger.set([]);
        this.loadingAllocation.set(false);
      });
    this.paymentForm.controls.amount.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((amount) => this.receiptAmount.set(amount));
    if (this.receiptEntry) {
      this.paymentForm.controls.cash_account_code.setValidators(Validators.required);
      this.paymentForm.controls.cash_account_code.updateValueAndValidity();
      this.loading.set(false);
      void this.loadReceiptSchemes();
      return;
    }
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.schemeId.set(Number(params.get('id')));
      this.installmentNo.set(Number(params.get('no')));
      this.resetPaymentForm();
      this.showPaymentForm.set(false);
      void this.loadData();
    });
  }

  protected async loadAccounts(): Promise<void> {
    if (typeof this.kuri.getAccounts !== 'function') return;
    this.loadingAccounts.set(true);
    this.accountsFailed.set(false);
    try {
      const all = await this.kuri.getAccounts();
      const cash = all.filter((a) => a.is_cash_bank);
      this.cashAccounts.set(cash);
      if (this.paymentForm.controls.cash_account_code.value === null && cash.length > 0) {
        this.paymentForm.controls.cash_account_code.setValue(cash[0].code, { emitEvent: false });
      }
    } catch {
      this.accountsFailed.set(true);
      // Non-fatal: backend falls back to default cash account if not loaded.
    } finally {
      this.loadingAccounts.set(false);
    }
  }

  protected async loadReceiptSchemes(): Promise<void> {
    if (this.loadingSchemes()) return;
    this.loadingSchemes.set(true);
    this.schemesFailed.set(false);
    try {
      const schemes = (await this.kuri.listSchemes()).filter(
        (s) => s.status !== 'draft' && s.head_code != null,
      );
      this.receiptSchemes.set(schemes);
      const requested = Number(this.route.snapshot.queryParamMap.get('scheme'));
      const selected =
        schemes.find((s) => s.id === requested) ?? (schemes.length === 1 ? schemes[0] : null);
      if (selected) {
        await this.selectReceiptScheme(selected.id);
      }
    } catch (err) {
      this.schemesFailed.set(true);
      this.notify.error(err);
    } finally {
      this.loadingSchemes.set(false);
    }
  }

  protected async selectReceiptScheme(id: number): Promise<void> {
    if (
      this.isSubmitting() ||
      this.paymentForm.dirty ||
      !this.receiptSchemes().some((s) => s.id === id)
    )
      return;
    this.schemeId.set(id);
    this.installmentNo.set(1);
    this.scheme.set(null);
    this.resetPaymentForm();
    this.showPaymentForm.set(true);
    await this.loadData();
  }

  hasPendingChanges(): boolean {
    return this.isSubmitting() || this.paymentForm.dirty;
  }

  protected async loadData(): Promise<void> {
    const request = ++this.loadRequest;
    const id = this.schemeId();
    const installment = this.installmentNo();
    this.loading.set(true);
    this.loadFailed.set(false);
    this.collections.set([]);
    try {
      const [schemes, rows] = await Promise.all([
        this.kuri.getSchemeDetail(id),
        this.receiptEntry
          ? this.kuri.getReceiptTickets(id)
          : this.kuri.getCollectionStatus(id, installment),
      ]);
      if (request !== this.loadRequest) return;
      if (!schemes?.length || installment < 1 || installment > schemes[0].num_installments) {
        this.notify.error('Scheme or installment not found');
        this.router.navigate(['/kuri/schemes']);
        return;
      }
      this.scheme.set(schemes[0]);
      this.collections.set(rows);
    } catch (err) {
      if (request === this.loadRequest) {
        this.loadFailed.set(true);
        this.notify.error(err);
      }
    } finally {
      if (request === this.loadRequest) this.loading.set(false);
    }
  }

  protected goToInstallment(no: number): void {
    const s = this.scheme();
    if (!s || this.loading() || this.isSubmitting() || no < 1 || no > s.num_installments) return;
    this.router.navigate(['/kuri/schemes', this.schemeId(), 'installments', no]);
  }

  protected resetPaymentForm(): void {
    this.paymentRequest = null;
    const current = this.paymentForm.getRawValue();
    const defaultCash =
      (this.receiptEntry ? current.cash_account_code : null) ??
      this.cashAccounts()[0]?.code ??
      null;
    this.memberQuery.set('');
    this.selectedMemberId.set(null);
    this.allocationRequest++;
    this.allocationLedger.set([]);
    this.allocationFailed.set(false);
    this.loadingAllocation.set(false);
    const values = {
      member_id: null,
      cash_account_code: defaultCash,
      amount: null,
      paid_on: (this.receiptEntry ? current.paid_on : null) || isoDate(),
      notes: '',
    };
    const entry = this.paymentEntry();
    if (entry) entry.resetForm(values);
    else this.paymentForm.reset(values);
  }

  protected async onMemberSelect(memberId: number): Promise<void> {
    const member = this.collections().find((m) => m.member_id === memberId);
    if (member) {
      if (this.receiptEntry) {
        await this.loadAllocation(memberId, true);
        return;
      }
      this.paymentForm.controls.amount.setValidators([
        Validators.required,
        Validators.min(0.01),
        Validators.max(Number(member.balance)),
        Validators.pattern(/^\d+(\.\d{1,2})?$/),
      ]);
      this.paymentForm.patchValue({ amount: member.balance });
    }
  }

  protected async refreshAllocation(): Promise<void> {
    const id = this.paymentForm.controls.member_id.value;
    if (id && !this.isSubmitting()) await this.loadAllocation(id, false);
  }

  private async loadAllocation(memberId: number, prefill: boolean): Promise<void> {
    const request = ++this.allocationRequest;
    const schemeId = this.schemeId();
    this.loadingAllocation.set(true);
    this.allocationFailed.set(false);
    this.allocationLedger.set([]);
    try {
      const rows = await this.kuri.getMemberLedger(schemeId, memberId);
      if (request !== this.allocationRequest || schemeId !== this.schemeId()) return;
      this.allocationLedger.set(rows);
      const balance =
        rows.reduce((sum, row) => sum + Math.round(Number(row.balance) * 100), 0) / 100;
      this.paymentForm.controls.amount.setValidators([
        Validators.required,
        Validators.min(0.01),
        Validators.max(Math.min(balance, 9999999999.99)),
        Validators.pattern(/^\d+(\.\d{1,2})?$/),
      ]);
      this.paymentForm.controls.amount.updateValueAndValidity();
      if (prefill)
        this.paymentForm.controls.amount.setValue(
          Number(rows.find((r) => r.balance > 0)?.balance) || null,
        );
    } catch (err) {
      if (request === this.allocationRequest) {
        this.allocationFailed.set(true);
        this.notify.error(err);
      }
    } finally {
      if (request === this.allocationRequest) this.loadingAllocation.set(false);
    }
  }

  protected async onSubmitPayment(): Promise<void> {
    if (
      this.paymentForm.invalid ||
      this.isSubmitting() ||
      this.loading() ||
      this.loadFailed() ||
      !this.auth.canEdit()
    )
      return;
    if (this.scheme()?.status === 'draft' || (this.receiptEntry && !this.scheme()?.head_code))
      return;
    if (
      this.receiptEntry &&
      (this.loadingAllocation() || this.allocationFailed() || !this.allocationPreview().length)
    )
      return;
    const val = this.paymentForm.getRawValue();
    const member = this.unpaidMembers().find((row) => row.member_id === val.member_id);
    if (
      !member ||
      Number(val.amount) > (this.receiptEntry ? this.receiptBalance() : Number(member.balance))
    ) {
      this.paymentForm.controls.amount.setErrors({ max: true });
      return;
    }
    const payload: {
      p_scheme_id: number;
      p_installment_no: number;
      p_member_id: number;
      p_amount: number;
      p_paid_on: string;
      p_notes?: string;
      p_cash_account_code?: number | null;
    } = {
      p_scheme_id: this.schemeId(),
      p_installment_no: this.installmentNo(),
      p_member_id: val.member_id!,
      p_amount: val.amount!,
      p_paid_on: val.paid_on!,
      p_notes: val.notes || undefined,
    };
    if (val.cash_account_code != null) {
      payload.p_cash_account_code = val.cash_account_code;
    }
    const allocations = this.receiptEntry ? this.allocationPreview() : undefined;
    // Refreshing a preview after a lost response must not create another receipt.
    const key = JSON.stringify(payload);
    if (this.paymentRequest?.payload !== key) {
      this.paymentRequest = { payload: key, id: crypto.randomUUID() };
    }
    this.isSubmitting.set(true);
    this.paymentForm.disable({ emitEvent: false });
    try {
      if (this.receiptEntry) {
        const { p_installment_no: _installment, ...receipt } = payload;
        await this.kuri.recordReceipt({
          ...receipt,
          p_request_id: this.paymentRequest.id,
          p_expected_allocations: allocations!,
        });
      } else {
        await this.kuri.recordPayment({ ...payload, p_request_id: this.paymentRequest.id });
      }
      this.notify.success(
        this.receiptEntry
          ? `Receipt saved for ticket #${member.ticket_no}`
          : 'Payment recorded successfully',
      );
      this.resetPaymentForm();
      await this.loadData();
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.paymentForm.enable({ emitEvent: false });
      this.isSubmitting.set(false);
    }
  }

  protected async onBulkPayment(): Promise<void> {
    if (this.isSubmitting() || this.loading() || this.loadFailed() || !this.auth.canEdit()) return;
    const schemeId = this.schemeId();
    const installment = this.installmentNo();
    const unpaidCount = this.unpaidMembers().length;
    if (unpaidCount === 0) return;

    const cashCode =
      this.paymentForm.controls.cash_account_code.value ?? this.cashAccounts()[0]?.code ?? null;
    const cashAcc = this.cashAccounts().find((a) => a.code === cashCode);
    const outstanding = this.pending();
    const details = [{ label: 'Total to collect', value: outstanding.toFixed(2) }];
    if (cashAcc) {
      details.push({ label: 'Received into', value: `${cashAcc.code} – ${cashAcc.name}` });
    }
    const result = await confirmAction(this.dialog, {
      title: 'Mark All Paid',
      message: `Record the outstanding balance for ${unpaidCount} member(s) in installment ${this.installmentNo()}?`,
      details,
      confirmLabel: 'Mark All Paid',
    });
    if (
      !result ||
      this.isSubmitting() ||
      this.loading() ||
      schemeId !== this.schemeId() ||
      installment !== this.installmentNo()
    )
      return;

    this.isSubmitting.set(true);
    try {
      const count = await this.kuri.recordBulkPayment(
        schemeId,
        installment,
        isoDate(),
        undefined,
        cashCode,
      );
      this.notify.success(`Recorded payments for ${count} members`);
      await this.loadData();
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
