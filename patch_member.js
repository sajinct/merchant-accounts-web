const fs = require('fs');
let content = fs.readFileSync('app/src/app/features/membership/member-subscription.ts', 'utf8');

// Add new imports
if (!content.includes('JoiningFeePayment')) {
  content = content.replace('SubscriptionPayment } from', 'SubscriptionPayment, JoiningFeePayment } from');
}

// Add interfaces
if (!content.includes('JoiningFeePaymentRow')) {
  content = content.replace(
    'interface PaymentRow extends SubscriptionPayment {',
    'interface JoiningFeePaymentRow extends JoiningFeePayment {\n  voucher: { voucher_no: number } | null;\n}\n\ninterface PaymentRow extends SubscriptionPayment {'
  );
}

// Add properties
const props = `
  protected readonly joiningFee = signal<number>(0);
  protected readonly joiningPayments = signal<JoiningFeePaymentRow[]>([]);
  protected readonly joiningPaid = computed(() => this.joiningPayments().filter(p => !p.cancelled_at).reduce((sum, p) => sum + Number(p.amount), 0));
  protected readonly joiningBalance = computed(() => this.joiningFee() - this.joiningPaid());
  
  protected readonly joiningForm = inject(FormBuilder).group({
    cash: [null as number | null, Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    paid_on: [isoDate(), Validators.required],
    notes: [''],
  });
  protected readonly joiningPaymentOpen = signal(false);
`;

if (!content.includes('joiningFee = signal')) {
  content = content.replace('protected readonly paymentOpen = signal(false);', 'protected readonly paymentOpen = signal(false);\n' + props);
}

// Update load
const newLoad = `private async load(code: number): Promise<void> {
    this.loading.set(true);
    try {
      const [years, payments, memberRes, joiningPayments] = await Promise.all([
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
        must(this.sb.from('customers').select('joining_fee').eq('code', code).maybeSingle()),
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
      this.years.set(years as MemberSubscriptionYear[]);
      this.payments.set(payments as unknown as PaymentRow[]);
      this.joiningFee.set(memberRes?.joining_fee || 0);
      this.joiningPayments.set(joiningPayments as unknown as JoiningFeePaymentRow[]);
      
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
  }`;

content = content.replace(/private async load\(code: number\): Promise<void> \{[\s\S]*?\}\n  \}/, newLoad);

// Add joining fee UI
const joiningUI = `
      <!-- Joining Fee -->
      @if (joiningFee() > 0) {
      <section class="panel">
        <div class="panel-header">
          <h2>Joining fee</h2>
          <div class="status-actions">
            @if (joiningBalance() > 0) {
              <span class="status-badge warning">Due {{ joiningBalance() | number: '1.2-2' }}</span>
              @if (auth.canEdit() && !joiningPaymentOpen()) {
                <button mat-stroked-button type="button" (click)="joiningPaymentOpen.set(true); joiningForm.patchValue({amount: joiningBalance()})">
                  <mat-icon>payments</mat-icon> Record payment
                </button>
              }
            } @else {
              <span class="status-badge success">Fully paid</span>
            }
          </div>
        </div>
        
        @if (joiningPaymentOpen()) {
          <form
            class="panel-body payment-form"
            [formGroup]="joiningForm"
            (ngSubmit)="recordJoiningPayment()"
            appEnterToNext
            appFinancialYearScope="entry"
          >
            <h3>Record joining fee payment</h3>
            <app-financial-year-notice />
            <div class="form-grid">
              <app-cash-account-field [control]="joiningForm.controls.cash" />
              <mat-form-field>
                <mat-label>Amount</mat-label>
                <input matInput type="number" min="0.01" step="0.01" formControlName="amount" />
                <mat-hint>Up to {{ joiningBalance() | number: '1.2-2' }}</mat-hint>
              </mat-form-field>
              <mat-form-field>
                <mat-label>Paid on</mat-label>
                <input matInput [matDatepicker]="jpicker" formControlName="paid_on" />
                <mat-datepicker-toggle matIconSuffix [for]="jpicker" />
                <mat-datepicker #jpicker />
              </mat-form-field>
              <mat-form-field class="wide">
                <mat-label>Notes (optional)</mat-label>
                <input matInput formControlName="notes" />
              </mat-form-field>
            </div>
            <div class="form-actions">
              <button mat-flat-button type="submit" [disabled]="joiningForm.invalid || saving()">
                <mat-icon>check</mat-icon> Confirm payment
              </button>
              <button mat-button type="button" (click)="joiningPaymentOpen.set(false)" [disabled]="saving()">
                Cancel
              </button>
            </div>
          </form>
        }
        
        @if (joiningPayments().length) {
          <div class="panel-body list-body">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Paid on</th>
                  <th>Receipt No</th>
                  <th class="amount">Amount</th>
                  <th>Notes</th>
                  <th class="action-cell"></th>
                </tr>
              </thead>
              <tbody>
                @for (p of joiningPayments(); track p.id) {
                  <tr [class.cancelled]="p.cancelled_at">
                    <td>{{ p.paid_on | date: 'dd/MM/yyyy' }}</td>
                    <td>{{ p.voucher?.voucher_no }}</td>
                    <td class="amount">{{ p.amount | number: '1.2-2' }}</td>
                    <td class="sub">
                      {{ p.cancelled_at ? 'Cancelled: ' + p.cancel_reason : p.notes }}
                    </td>
                    <td class="action-cell">
                      @if (!p.cancelled_at && auth.isAdmin()) {
                        <button
                          mat-icon-button
                          matTooltip="Cancel payment"
                          (click)="cancelJoiningPayment(p)"
                          [disabled]="saving()"
                        >
                          <mat-icon>cancel</mat-icon>
                        </button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>
      }

      <section class="panel">
`;

if (!content.includes('<h2>Joining fee</h2>')) {
  content = content.replace('<section class="panel">', joiningUI);
}

// Add functions
const joinFuncs = `
  protected async recordJoiningPayment(): Promise<void> {
    if (this.joiningForm.invalid) return;
    this.saving.set(true);
    const { amount, paid_on, notes } = this.joiningForm.getRawValue();
    try {
      await must(
        this.sb.rpc('record_joining_fee_payment', {
          p_member_code: this.code(),
          p_amount: amount!,
          p_paid_on: paid_on!,
          p_notes: notes,
        }),
      );
      this.notify.success('Joining fee payment recorded');
      this.joiningForm.reset({ paid_on, notes: '' });
      this.joiningPaymentOpen.set(false);
      await this.load(this.code());
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.saving.set(false);
    }
  }

  protected async cancelJoiningPayment(p: JoiningFeePaymentRow): Promise<void> {
    const reason = await confirmAction(this.dialog, {
      title: 'Cancel Joining Fee Payment',
      message: \`Are you sure you want to cancel the joining fee payment of ₹\${formatNumber(
        p.amount,
        this.locale,
        '1.2-2',
      )} made on \${formatDate(p.paid_on, 'mediumDate', this.locale)}?\`,
      danger: 'Cancel payment',
      requireReason: true,
    });
    if (!reason) return;

    this.saving.set(true);
    try {
      await must(
        this.sb.rpc('cancel_joining_fee_payment', { p_id: p.id, p_reason: reason as string }),
      );
      this.notify.success('Payment cancelled');
      await this.load(this.code());
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.saving.set(false);
    }
  }
`;

if (!content.includes('recordJoiningPayment')) {
  content = content.replace('protected async startPayment() {', joinFuncs + '\n  protected async startPayment() {');
}

fs.writeFileSync('app/src/app/features/membership/member-subscription.ts', content);
