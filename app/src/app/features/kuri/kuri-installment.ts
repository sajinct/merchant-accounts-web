import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../core/auth.service';
import { NotifyService } from '../../core/notify.service';
import { PageHeader } from '../../shared/page-header';
import { StatCard } from '../../shared/stat-card';
import { EmptyState } from '../../shared/empty-state';
import { confirmAction } from '../../shared/confirm-dialog';
import { EnterToNext } from '../../shared/enter-to-next.directive';
import { EntrySelect } from '../../shared/entry-select.directive';
import { isoDate } from '../../shared/dates';
import { KuriService } from './kuri.service';
import { KuriCollectionRow, KuriSchemeDetail } from './kuri.models';

@Component({
  selector: 'app-kuri-installment',
  imports: [
    ReactiveFormsModule,
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
      @if (scheme(); as s) {
        <app-page-header
          eyebrow="Kuri"
          [heading]="'Installment ' + installmentNo()"
          [description]="s.name"
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

        @if (auth.canEdit() && s.status !== 'draft' && !loading() && !loadFailed()) {
          <div class="panel" style="margin-bottom: 24px">
            <div class="panel-header">
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
            </div>

            @if (showPaymentForm()) {
              <div class="panel-body">
                <form
                  id="kuri-payment-form"
                  appEnterToNext
                  [formGroup]="paymentForm"
                  (ngSubmit)="onSubmitPayment()"
                  class="form-grid"
                >
                  <mat-form-field subscriptSizing="dynamic">
                    <mat-label>Member</mat-label>
                    <mat-select
                      appEntrySelect
                      formControlName="member_id"
                      (selectionChange)="onMemberSelect($event.value)"
                    >
                      @for (member of unpaidMembers(); track member.member_id) {
                        <mat-option [value]="member.member_id">
                          #{{ member.ticket_no }} — {{ member.customer_name }} (Bal:
                          {{ member.balance | number: '1.2-2' }})
                        </mat-option>
                      }
                    </mat-select>
                    <mat-error>Select a member with an outstanding balance.</mat-error>
                  </mat-form-field>

                  <mat-form-field subscriptSizing="dynamic">
                    <mat-label>Amount</mat-label>
                    <input matInput type="number" formControlName="amount" min="0.01" step="0.01" />
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

                  <div class="form-actions full">
                    <button
                      mat-flat-button
                      type="submit"
                      [disabled]="paymentForm.invalid || isSubmitting()"
                    >
                      {{ isSubmitting() ? 'Saving…' : 'Save Payment' }}
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
              </div>
            }
          </div>
        }

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
                      {{ row.customer_name }}
                      @if (row.has_won_lot) {
                        <mat-icon
                          class="lot-winner"
                          [matTooltip]="'Won lot in installment ' + row.won_installment"
                          >emoji_events</mat-icon
                        >
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
        @if (loadFailed()) {
          <button mat-stroked-button type="button" (click)="loadData()">Retry</button>
        }
      } @else {
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

  protected readonly schemeId = signal(0);
  protected readonly installmentNo = signal(0);
  protected readonly scheme = signal<KuriSchemeDetail | null>(null);
  protected readonly collections = signal<KuriCollectionRow[]>([]);
  protected readonly showPaymentForm = signal(false);
  protected readonly isSubmitting = signal(false);
  protected readonly loading = signal(true);
  protected readonly loadFailed = signal(false);
  private loadRequest = 0;
  private paymentRequest: { payload: string; id: string } | null = null;

  protected readonly paymentForm = this.fb.group({
    // null, not 0: Validators.required treats 0 as a filled-in value.
    member_id: [null as number | null, Validators.required],
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
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.schemeId.set(Number(params.get('id')));
      this.installmentNo.set(Number(params.get('no')));
      this.resetPaymentForm();
      this.showPaymentForm.set(false);
      void this.loadData();
    });
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
        this.kuri.getCollectionStatus(id, installment),
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
    this.paymentForm.reset({ member_id: null, amount: null, paid_on: isoDate(), notes: '' });
  }

  protected onMemberSelect(memberId: number): void {
    const member = this.collections().find((m) => m.member_id === memberId);
    if (member) {
      this.paymentForm.controls.amount.setValidators([
        Validators.required,
        Validators.min(0.01),
        Validators.max(Number(member.balance)),
        Validators.pattern(/^\d+(\.\d{1,2})?$/),
      ]);
      this.paymentForm.patchValue({ amount: member.balance });
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
    const val = this.paymentForm.getRawValue();
    const member = this.unpaidMembers().find((row) => row.member_id === val.member_id);
    if (!member || Number(val.amount) > Number(member.balance)) {
      this.paymentForm.controls.amount.setErrors({ max: true });
      return;
    }
    const payload = {
      p_scheme_id: this.schemeId(),
      p_installment_no: this.installmentNo(),
      p_member_id: val.member_id!,
      p_amount: val.amount!,
      p_paid_on: val.paid_on!,
      p_notes: val.notes || undefined,
    };
    const key = JSON.stringify(payload);
    if (this.paymentRequest?.payload !== key) {
      this.paymentRequest = { payload: key, id: crypto.randomUUID() };
    }
    this.isSubmitting.set(true);
    this.paymentForm.disable({ emitEvent: false });
    try {
      await this.kuri.recordPayment({ ...payload, p_request_id: this.paymentRequest.id });
      this.notify.success('Payment recorded successfully');
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

    const outstanding = this.pending();
    const result = await confirmAction(this.dialog, {
      title: 'Mark All Paid',
      message: `Record the outstanding balance for ${unpaidCount} member(s) in installment ${this.installmentNo()}?`,
      details: [{ label: 'Total to collect', value: outstanding.toFixed(2) }],
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
      const count = await this.kuri.recordBulkPayment(schemeId, installment, isoDate());
      this.notify.success(`Recorded payments for ${count} members`);
      await this.loadData();
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
