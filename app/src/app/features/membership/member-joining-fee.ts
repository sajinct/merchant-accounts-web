import { DatePipe, DecimalPipe, formatDate, formatNumber } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  LOCALE_ID,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../core/auth.service';
import { JoiningFeePayment } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { must, SupabaseService } from '../../core/supabase.service';
import { confirmAction } from '../../shared/confirm-dialog';
import { isoDate } from '../../shared/dates';
import { EnterToNext } from '../../shared/enter-to-next.directive';

interface PaymentRow extends JoiningFeePayment {
  voucher: { voucher_no: number } | null;
}

/** Historical joining-fee payments update membership balances without posting to accounts. */
@Component({
  selector: 'app-member-joining-fee',
  imports: [
    DatePipe,
    DecimalPipe,
    EnterToNext,
    ReactiveFormsModule,
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatTooltipModule,
  ],
  template: `
    <section class="panel" aria-labelledby="joining-fee-heading">
      <div class="panel-header">
        <div>
          <h2 #joiningHeading id="joining-fee-heading" tabindex="-1">Joining fee</h2>
          <p>Record the joining fee already paid by this member.</p>
        </div>
        @if (auth.canEdit() && !loading() && !loadFailed() && balance() > 0 && !paymentOpen()) {
          <button mat-stroked-button type="button" (click)="startPayment()">
            <mat-icon>history</mat-icon> Record past payment
          </button>
        }
      </div>

      <div class="panel-body">
        @if (loading()) {
          <p class="hint" role="status">Loading joining fee…</p>
        } @else if (loadFailed()) {
          <p class="form-error" role="alert">Joining fee records could not be loaded.</p>
        } @else {
          <dl class="fee-summary">
            <div>
              <dt>Fee</dt>
              <dd>{{ fee() | number: '1.2-2' }}</dd>
            </div>
            <div>
              <dt>Paid</dt>
              <dd>{{ paid() | number: '1.2-2' }}</dd>
            </div>
            <div>
              <dt>Balance</dt>
              <dd>{{ balance() | number: '1.2-2' }}</dd>
            </div>
          </dl>
          @if (!fee()) {
            <p class="hint">No joining fee is due. Set the member's joining fee above if needed.</p>
          }
        }
        <p class="hint membership-only">
          Updates membership records only. No receipt voucher or daybook entry is created.
        </p>
      </div>

      @if (auth.canEdit() && paymentOpen()) {
        <form
          #paymentForm
          appEnterToNext
          class="panel-body payment-form"
          [formGroup]="form"
          (ngSubmit)="record()"
        >
          <h3>Record past joining-fee payment</h3>
          <div class="form-grid">
            <mat-form-field>
              <mat-label>Amount already paid</mat-label>
              <input
                matInput
                type="number"
                min="0.01"
                [max]="balance()"
                step="0.01"
                formControlName="amount"
              />
              <mat-hint>Up to {{ balance() | number: '1.2-2' }}</mat-hint>
              <mat-error>Enter an amount greater than zero, up to the balance.</mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>Paid on</mat-label>
              <input
                matInput
                [matDatepicker]="paidOnPicker"
                formControlName="paid_on"
                placeholder="dd/mm/yyyy"
              />
              <mat-datepicker-toggle matIconSuffix [for]="paidOnPicker" />
              <mat-datepicker #paidOnPicker />
              <mat-error>Enter a valid payment date.</mat-error>
            </mat-form-field>
            <mat-form-field class="payment-notes">
              <mat-label>Notes</mat-label>
              <input
                matInput
                formControlName="notes"
                maxlength="200"
                placeholder="Previous receipt or payment reference"
              />
            </mat-form-field>
          </div>
          @if (amountTooHigh()) {
            <p class="form-error" role="alert">The amount is more than the joining fee balance.</p>
          }
          <div class="form-actions">
            <button
              mat-flat-button
              type="submit"
              [disabled]="form.invalid || amountTooHigh() || saving() || loading() || loadFailed()"
            >
              <mat-icon>history</mat-icon> {{ saving() ? 'Saving…' : 'Record past payment' }}
            </button>
            <button mat-button type="button" [disabled]="saving()" (click)="closePayment()">
              Cancel
            </button>
          </div>
        </form>
      }

      @if (payments().length) {
        <div class="panel-body history">
          <h3>Payment history</h3>
          <div class="table-wrap" tabindex="0" role="region" aria-label="Joining fee payments">
            <table class="data-table">
              <thead>
                <tr>
                  <th scope="col">Paid on</th>
                  <th scope="col">Record</th>
                  <th scope="col" class="num">Amount</th>
                  <th scope="col">Notes</th>
                  <th scope="col"><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                @for (payment of payments(); track payment.id) {
                  <tr [class.cancelled]="payment.cancelled_at">
                    <td>{{ payment.paid_on | date: 'dd MMM yyyy' }}</td>
                    <td>
                      {{
                        payment.voucher_id === null
                          ? 'Historical record'
                          : payment.voucher
                            ? 'R-' + payment.voucher.voucher_no
                            : 'Linked receipt'
                      }}
                    </td>
                    <td class="num">{{ payment.amount | number: '1.2-2' }}</td>
                    <td class="table-secondary">
                      @if (payment.cancelled_at) {
                        <span class="status-badge neutral">Cancelled</span>
                        {{ payment.cancel_reason }}
                      } @else {
                        {{ payment.notes || '—' }}
                      }
                    </td>
                    <td class="row-actions">
                      @if (auth.isAdmin() && !payment.cancelled_at) {
                        <button
                          mat-icon-button
                          type="button"
                          class="danger"
                          [disabled]="saving()"
                          (click)="cancel(payment)"
                          matTooltip="Cancel payment record"
                          aria-label="Cancel joining fee payment record"
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
    .fee-summary {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
      max-width: 620px;
      margin: 0;
    }
    dt {
      color: var(--app-muted);
      font-size: 12px;
    }
    dd {
      margin: 4px 0 0;
      font-size: 18px;
      font-weight: 650;
      font-variant-numeric: tabular-nums;
      overflow-wrap: anywhere;
    }
    .membership-only {
      margin: 12px 0 0;
    }
    .payment-form,
    .history {
      border-top: 1px solid var(--app-border);
    }
    .payment-form .form-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px 24px;
      max-width: 760px;
    }
    .payment-notes {
      grid-column: 1 / -1;
    }
    @media (max-width: 600px) {
      .payment-form .form-grid {
        grid-template-columns: minmax(0, 1fr);
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
export class MemberJoiningFee {
  readonly memberCode = input.required<number>();
  readonly refreshKey = input(0);
  protected readonly auth = inject(AuthService);
  private readonly sb = inject(SupabaseService).client;
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);
  private readonly locale = inject(LOCALE_ID);
  private readonly injector = inject(Injector);
  private readonly paymentForm = viewChild<ElementRef<HTMLFormElement>>('paymentForm');
  private readonly joiningHeading = viewChild<ElementRef<HTMLElement>>('joiningHeading');

  protected readonly fee = signal(0);
  protected readonly payments = signal<PaymentRow[]>([]);
  protected readonly paid = computed(() =>
    this.payments()
      .filter((payment) => !payment.cancelled_at)
      .reduce((sum, payment) => sum + Number(payment.amount), 0),
  );
  protected readonly balance = computed(() => Math.max(0, this.fee() - this.paid()));
  protected readonly loading = signal(true);
  protected readonly loadFailed = signal(false);
  protected readonly saving = signal(false);
  protected readonly paymentOpen = signal(false);
  protected readonly form = inject(FormBuilder).group({
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    paid_on: [isoDate(), Validators.required],
    notes: ['', Validators.maxLength(200)],
  });
  private readonly formValue = signal(this.form.getRawValue());
  protected readonly amountTooHigh = computed(() => {
    const amount = this.formValue().amount;
    return amount !== null && amount > this.balance() + 0.001;
  });
  private requestId = crypto.randomUUID();

  constructor() {
    this.form.valueChanges.subscribe(() => this.formValue.set(this.form.getRawValue()));
    effect(() => {
      const code = this.memberCode();
      this.refreshKey();
      untracked(() => this.load(code));
    });
  }

  protected startPayment(): void {
    if (!this.auth.canEdit() || this.loading() || this.loadFailed() || this.balance() <= 0) return;
    this.form.patchValue({ amount: this.balance() });
    this.paymentOpen.set(true);
    afterNextRender(
      () => {
        const form = this.paymentForm()?.nativeElement;
        form?.scrollIntoView({ block: 'nearest' });
        form?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
      },
      { injector: this.injector },
    );
  }

  protected closePayment(): void {
    this.paymentOpen.set(false);
    this.focusHeading();
  }

  protected async record(): Promise<void> {
    const { amount, paid_on, notes } = this.form.getRawValue();
    if (
      !this.auth.canEdit() ||
      this.saving() ||
      this.loading() ||
      this.loadFailed() ||
      this.form.invalid ||
      this.amountTooHigh() ||
      amount === null ||
      !Number.isFinite(amount) ||
      !paid_on
    )
      return;
    this.saving.set(true);
    try {
      await must(
        this.sb.rpc('record_joining_fee_payment', {
          p_member_code: this.memberCode(),
          p_amount: amount,
          p_paid_on: paid_on,
          p_notes: notes ?? '',
          p_request_id: this.requestId,
        }),
      );
      this.notify.success(`Past joining-fee payment of ${amount.toFixed(2)} recorded`);
      this.requestId = crypto.randomUUID();
      this.form.reset({ amount: null, paid_on: isoDate(), notes: '' });
      await this.load(this.memberCode());
      this.closePayment();
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.saving.set(false);
    }
  }

  protected async cancel(payment: PaymentRow): Promise<void> {
    if (!this.auth.isAdmin() || this.saving() || payment.cancelled_at) return;
    const linked = payment.voucher_id !== null;
    const result = await confirmAction(this.dialog, {
      title: 'Cancel this joining-fee payment?',
      message: linked
        ? 'This payment is linked to a receipt voucher. Cancelling it also reverses that voucher in the accounts and daybook.'
        : 'This only corrects the member’s joining-fee balance. Accounts and daybook entries are unchanged. You can then record the corrected past payment.',
      details: [
        { label: 'Paid on', value: formatDate(payment.paid_on, 'dd-MMM-yyyy', this.locale) },
        { label: 'Amount', value: formatNumber(Number(payment.amount), this.locale, '1.2-2') },
      ],
      fields: [{ key: 'reason', label: 'Reason for cancelling', required: true, maxLength: 200 }],
      confirmLabel: 'Cancel payment record',
      cancelLabel: 'Keep payment',
      destructive: true,
    });
    if (!result || this.saving()) return;
    this.saving.set(true);
    try {
      await must(
        this.sb.rpc('cancel_joining_fee_payment', {
          p_id: payment.id,
          p_reason: result['reason'],
        }),
      );
      this.notify.success(
        linked
          ? 'Payment cancelled with a balancing reversal.'
          : 'Historical payment record cancelled.',
      );
      await this.load(this.memberCode());
      this.focusHeading();
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.saving.set(false);
    }
  }

  private focusHeading(): void {
    this.joiningHeading()?.nativeElement.focus({ preventScroll: true });
  }

  private async load(code: number): Promise<void> {
    this.loading.set(true);
    this.loadFailed.set(false);
    try {
      const [fee, payments] = await Promise.all([
        must(this.sb.rpc('member_joining_fee', { p_member_code: code })),
        must(
          this.sb
            .from('joining_fee_payments')
            .select(
              'id, member_code, paid_on, amount, voucher_id, notes, cancelled_at, cancel_reason, voucher:vouchers(voucher_no)',
            )
            .eq('member_code', code)
            .order('paid_on', { ascending: false })
            .order('id', { ascending: false }),
        ),
      ]);
      this.fee.set(Number(fee) || 0);
      this.payments.set(payments as unknown as PaymentRow[]);
    } catch (err) {
      this.loadFailed.set(true);
      this.notify.error(err);
    } finally {
      this.loading.set(false);
    }
  }
}
