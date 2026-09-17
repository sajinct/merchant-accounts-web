import { FinancialYearScope } from '../../shared/financial-year-scope';
import { FinancialYearNotice } from '../../shared/financial-year-notice';
import { CashAccountField } from '../../shared/cash-account-field';
import { DatePipe, DecimalPipe, formatDate, formatNumber } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  effect,
  inject,
  Injector,
  input,
  LOCALE_ID,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../core/auth.service';
import { MemberSubscriptionYear, SubscriptionPayment } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { must, SupabaseService } from '../../core/supabase.service';
import { isoDate } from '../../shared/dates';
import { fyLabel, fyStart } from '../../shared/fy';
import { confirmAction } from '../../shared/confirm-dialog';
import { EnterToNext } from '../../shared/enter-to-next.directive';
import { EntrySelect } from '../../shared/entry-select.directive';

interface PaymentRow extends SubscriptionPayment {
  voucher: { voucher_no: number } | null;
}

/** Subscription years, payment entry and payment history for one member. */
@Component({
  selector: 'app-member-subscription',
  imports: [
    EnterToNext,
    EntrySelect,
    FinancialYearScope,
    FinancialYearNotice,
    CashAccountField,
    DatePipe,
    DecimalPipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatDatepickerModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
  ],
  template: `
    <section class="panel" aria-labelledby="subscription-heading">
      <div class="panel-header">
        <div>
          <h2 #subscriptionHeading id="subscription-heading" tabindex="-1">Subscription</h2>
          <p>Yearly fee per financial year (April to March)</p>
        </div>
        <div class="subscription-actions">
          @if (!loading()) {
            @if (totalDue() > 0) {
              <span class="status-badge warning">Due {{ totalDue() | number: '1.2-2' }}</span>
            } @else if (years().length) {
              <span class="status-badge success">Fully paid</span>
            }
          }
          @if (auth.canEdit() && payableYears().length && !paymentOpen()) {
            <button mat-stroked-button type="button" (click)="startPayment()">
              <mat-icon>payments</mat-icon> Record payment
            </button>
          }
        </div>
      </div>

      @if (!loading() && !years().length) {
        <div class="panel-body">
          <p class="hint">
            No subscription is due yet. Check the member's joining date, or
            @if (auth.isAdmin()) {
              <a routerLink="/membership/fees">add the fee for this financial year</a>.
            } @else {
              ask an admin to add the fee for this financial year.
            }
          </p>
        </div>
      } @else {
        <div class="table-wrap" tabindex="0" role="region" aria-label="Subscription by year">
          <table class="data-table">
            <thead>
              <tr>
                <th scope="col">Year</th>
                <th scope="col" class="num">Fee</th>
                <th scope="col" class="num">Paid</th>
                <th scope="col" class="num">Balance</th>
                <th scope="col">Status</th>
                <th scope="col"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              @for (year of years(); track year.fy_start) {
                <tr>
                  <td>{{ label(year.fy_start) }}</td>
                  <td class="num">{{ year.fee | number: '1.2-2' }}</td>
                  <td class="num">{{ year.paid | number: '1.2-2' }}</td>
                  <td class="num">{{ year.balance | number: '1.2-2' }}</td>
                  <td>
                    @if (year.balance <= 0) {
                      <span class="status-badge success">Paid</span>
                    } @else if (year.paid > 0) {
                      <span class="status-badge warning">Part paid</span>
                    } @else if (year.fy_start < currentFy) {
                      <span class="status-badge warning">Arrears</span>
                    } @else {
                      <span class="status-badge neutral">Due</span>
                    }
                  </td>
                  <td class="row-actions">
                    @if (auth.canEdit() && year.balance > 0) {
                      <button mat-stroked-button type="button" (click)="startPayment(year)">
                        Pay
                      </button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      @if (auth.canEdit() && payableYears().length && paymentOpen()) {
        <form
          #paymentForm
          appEnterToNext
          appFinancialYearScope="entry"
          class="panel-body payment-form"
          [formGroup]="form"
          (ngSubmit)="record()"
        >
          <h3>Record a payment</h3>
          <app-financial-year-notice />
          <div class="form-grid">
            <app-cash-account-field [control]="form.controls.cash" />
            <mat-form-field>
              <mat-label>For year</mat-label>
              <mat-select
                appEntrySelect
                formControlName="fy_start"
                (selectionChange)="fillBalance()"
              >
                @for (year of payableYears(); track year.fy_start) {
                  <mat-option [value]="year.fy_start">
                    {{ label(year.fy_start) }} · balance {{ year.balance | number: '1.2-2' }}
                  </mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field>
              <mat-label>Amount</mat-label>
              <input matInput type="number" min="0.01" step="0.01" formControlName="amount" />
              @if (selectedBalance() !== null) {
                <mat-hint>Up to {{ selectedBalance() | number: '1.2-2' }}</mat-hint>
              }
            </mat-form-field>
            <mat-form-field>
              <mat-label>Paid on</mat-label>
              <input
                matInput
                [matDatepicker]="paid_onPicker"
                formControlName="paid_on"
                placeholder="dd/mm/yyyy"
              /><mat-datepicker-toggle matIconSuffix [for]="paid_onPicker" /><mat-datepicker
                #paid_onPicker
              />
            </mat-form-field>
            <mat-form-field class="payment-notes">
              <mat-label>Notes</mat-label>
              <input
                matInput
                formControlName="notes"
                maxlength="200"
                placeholder="Cash, UPI ref…"
              />
            </mat-form-field>
          </div>
          @if (amountTooHigh()) {
            <p class="form-error" role="alert">
              The amount is more than the balance for this year.
            </p>
          }
          <div class="form-actions">
            <button
              mat-flat-button
              type="submit"
              [disabled]="form.invalid || amountTooHigh() || saving()"
            >
              <mat-icon>payments</mat-icon> {{ saving() ? 'Saving…' : 'Record payment' }}
            </button>
            <button mat-button type="button" [disabled]="saving()" (click)="closePayment()">
              Cancel
            </button>
          </div>
          <p class="hint payment-hint">A receipt voucher is created automatically.</p>
        </form>
      }

      @if (payments().length) {
        <div class="panel-body history">
          <h3>Payment history</h3>
          <div class="table-wrap" tabindex="0" role="region" aria-label="Subscription payments">
            <table class="data-table">
              <thead>
                <tr>
                  <th scope="col">Paid on</th>
                  <th scope="col">Year</th>
                  <th scope="col">Receipt</th>
                  <th scope="col" class="num">Amount</th>
                  <th scope="col">Notes</th>
                  <th scope="col"><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                @for (p of payments(); track p.id) {
                  <tr [class.cancelled]="p.cancelled_at">
                    <td>{{ p.paid_on | date: 'dd MMM yyyy' }}</td>
                    <td>{{ label(p.fy_start) }}</td>
                    <td>{{ p.voucher ? 'R-' + p.voucher.voucher_no : '—' }}</td>
                    <td class="num">{{ p.amount | number: '1.2-2' }}</td>
                    <td class="table-secondary">
                      @if (p.cancelled_at) {
                        <span class="status-badge neutral">Cancelled</span> {{ p.cancel_reason }}
                      } @else {
                        {{ p.notes || '—' }}
                      }
                    </td>
                    <td class="row-actions">
                      @if (auth.isAdmin() && !p.cancelled_at) {
                        <button
                          mat-icon-button
                          type="button"
                          class="danger"
                          (click)="cancel(p)"
                          matTooltip="Cancel payment"
                          aria-label="Cancel payment"
                        >
                          <mat-icon>block</mat-icon>
                        </button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </section>
  `,
  styles: `
    .panel-header p {
      margin: 2px 0 0;
    }
    h3 {
      margin: 0 0 12px;
      font-size: 13px;
      font-weight: 650;
    }
    .payment-form,
    .history {
      border-top: 1px solid var(--app-border);
    }
    .subscription-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
    }
    .payment-form .form-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px 24px;
      max-width: 760px;
    }
    .payment-notes {
      grid-column: 1 / -1;
    }
    .payment-hint {
      margin: 12px 0 0;
    }
    @media (max-width: 600px) {
      .payment-form .form-grid {
        grid-template-columns: minmax(0, 1fr);
      }
      .subscription-actions {
        width: 100%;
        justify-content: space-between;
      }
    }
    tr.cancelled td {
      color: var(--app-muted);
      text-decoration: line-through;
    }
    tr.cancelled td .status-badge {
      text-decoration: none;
    }
  `,
})
export class MemberSubscription {
  readonly memberCode = input.required<number>();

  protected readonly auth = inject(AuthService);
  private readonly sb = inject(SupabaseService).client;
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);
  private readonly locale = inject(LOCALE_ID);
  private readonly injector = inject(Injector);
  private readonly paymentForm = viewChild<ElementRef<HTMLFormElement>>('paymentForm');
  private readonly subscriptionHeading = viewChild<ElementRef<HTMLElement>>('subscriptionHeading');

  protected readonly label = fyLabel;
  protected readonly currentFy = fyStart();
  protected readonly years = signal<MemberSubscriptionYear[]>([]);
  protected readonly payments = signal<PaymentRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly paymentOpen = signal(false);

  protected readonly totalDue = computed(() =>
    this.years()
      .filter((y) => y.fy_start <= this.currentFy)
      .reduce((sum, y) => sum + Math.max(0, Number(y.balance)), 0),
  );
  protected readonly payableYears = computed(() =>
    this.years().filter((y) => Number(y.balance) > 0),
  );

  private requestId = crypto.randomUUID();
  protected readonly form = inject(FormBuilder).group({
    fy_start: [null as number | null, Validators.required],
    cash: [null as number | null, Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    paid_on: [isoDate(), Validators.required],
    notes: [''],
  });

  private readonly formValue = signal(this.form.getRawValue());
  protected readonly selectedBalance = computed(() => {
    const fy = this.formValue().fy_start;
    const year = this.years().find((y) => y.fy_start === fy);
    return year ? Number(year.balance) : null;
  });
  protected readonly amountTooHigh = computed(() => {
    const balance = this.selectedBalance();
    const amount = this.formValue().amount;
    return balance !== null && amount !== null && amount > balance + 0.001;
  });

  constructor() {
    this.form.valueChanges.subscribe(() => this.formValue.set(this.form.getRawValue()));
    effect(() => {
      const code = this.memberCode();
      untracked(() => this.load(code));
    });
  }

  protected startPayment(year?: MemberSubscriptionYear): void {
    if (year) {
      this.form.patchValue({ fy_start: year.fy_start, amount: Number(year.balance) });
    }
    this.paymentOpen.set(true);
    afterNextRender(
      () => {
        const form = this.paymentForm()?.nativeElement;
        form?.scrollIntoView({ block: 'nearest' });
        form?.querySelector<HTMLElement>('mat-select')?.focus({ preventScroll: true });
      },
      { injector: this.injector },
    );
  }

  protected closePayment(): void {
    this.paymentOpen.set(false);
    this.subscriptionHeading()?.nativeElement.focus({ preventScroll: true });
  }

  protected fillBalance(): void {
    const balance = this.selectedBalance();
    if (balance !== null) this.form.patchValue({ amount: balance });
  }

  protected async record(): Promise<void> {
    const { fy_start, amount, paid_on, notes, cash } = this.form.getRawValue();
    if (
      this.saving() ||
      !cash ||
      this.form.invalid ||
      this.amountTooHigh() ||
      fy_start === null ||
      amount === null ||
      !paid_on
    )
      return;
    this.saving.set(true);
    try {
      await must(
        this.sb.rpc('record_subscription_payment', {
          p_member_code: this.memberCode(),
          p_fy_start: fy_start,
          p_amount: amount,
          p_paid_on: paid_on,
          p_notes: notes ?? '',
          p_cash_account_code: cash,
          p_request_id: this.requestId,
        }),
      );
      this.notify.success(`Payment of ${amount.toFixed(2)} for ${fyLabel(fy_start)} recorded`);
      this.requestId = crypto.randomUUID();
      this.form.reset({ cash, fy_start: null, amount: null, paid_on: isoDate(), notes: '' });
      await this.load(this.memberCode());
      this.closePayment();
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.saving.set(false);
    }
  }

  protected async cancel(payment: PaymentRow): Promise<void> {
    const result = await confirmAction(this.dialog, {
      title: 'Cancel this payment?',
      message: 'Its receipt voucher is cancelled too, with a balancing reversal.',
      details: [
        { label: 'Year', value: fyLabel(payment.fy_start) },
        { label: 'Paid on', value: formatDate(payment.paid_on, 'dd-MMM-yyyy', this.locale) },
        { label: 'Amount', value: formatNumber(Number(payment.amount), this.locale, '1.2-2') },
      ],
      fields: [{ key: 'reason', label: 'Reason for cancelling', required: true, maxLength: 200 }],
      confirmLabel: 'Cancel payment',
      cancelLabel: 'Keep payment',
      destructive: true,
    });
    if (!result) return;
    try {
      await must(
        this.sb.rpc('cancel_subscription_payment', {
          p_id: payment.id,
          p_reason: result['reason'],
        }),
      );
      this.notify.success('Payment cancelled with a balancing reversal.');
      await this.load(this.memberCode());
    } catch (err) {
      this.notify.error(err);
    }
  }

  private async load(code: number): Promise<void> {
    this.loading.set(true);
    try {
      const [years, payments] = await Promise.all([
        must(this.sb.rpc('member_subscription_years', { p_member_code: code })),
        must(
          this.sb
            .from('subscription_payments')
            .select(
              'id, member_code, fy_start, paid_on, amount, voucher_id, notes, cancelled_at, cancel_reason, voucher:vouchers(voucher_no)',
            )
            .eq('member_code', code)
            .order('paid_on', { ascending: false })
            .order('id', { ascending: false }),
        ),
      ]);
      this.years.set(years as MemberSubscriptionYear[]);
      this.payments.set(payments as unknown as PaymentRow[]);
      const oldest =
        this.payableYears().find((y) => y.fy_start <= this.currentFy) ?? this.payableYears()[0];
      if (oldest && this.form.controls.fy_start.value === null && this.auth.canEdit()) {
        this.form.patchValue({ fy_start: oldest.fy_start, amount: Number(oldest.balance) });
      }
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.loading.set(false);
    }
  }
}
