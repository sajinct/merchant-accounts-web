import { DatePipe, DecimalPipe, formatNumber } from '@angular/common';
import { Component, computed, inject, LOCALE_ID, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../core/auth.service';
import { NotifyService } from '../../core/notify.service';
import { confirmAction } from '../../shared/confirm-dialog';
import { downloadCsv } from '../../shared/csv';
import { EmptyState } from '../../shared/empty-state';
import { EnterToNext } from '../../shared/enter-to-next.directive';
import { PageHeader } from '../../shared/page-header';
import { ReportShell } from '../../shared/report-shell';
import { KuriService } from './kuri.service';
import { KuriMember, KuriMemberLedgerRow, KuriPaymentRow, KuriSchemeListRow } from './kuri.models';

@Component({
  selector: 'app-kuri-member-ledger',
  imports: [
    DatePipe,
    DecimalPipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatTooltipModule,
    EnterToNext,
    EmptyState,
    PageHeader,
    ReportShell,
  ],
  template: `
    <div class="page">
      <app-page-header
        class="no-print"
        eyebrow="Kuri"
        heading="Member ledger"
        description="Every installment for one ticket, and the payments recorded against them."
      />

      <app-report-shell
        title="Kuri Member Ledger"
        [subtitle]="subtitle()"
        [loading]="loading()"
        [hasData]="ledger().length > 0"
        (csv)="exportCsv()"
      >
        <form appEnterToNext filters [formGroup]="form" (ngSubmit)="run()" class="filter-row">
          <mat-form-field subscriptSizing="dynamic" class="scheme-select">
            <mat-label>Scheme</mat-label>
            <mat-select formControlName="scheme">
              @for (scheme of schemes(); track scheme.id) {
                <mat-option [value]="scheme.id">{{ scheme.name }}</mat-option>
              }
            </mat-select>
            @if (!loadingSchemes() && !schemes().length) {
              <mat-hint>No schemes have been created yet.</mat-hint>
            }
          </mat-form-field>

          <mat-form-field subscriptSizing="dynamic" class="member-select">
            <mat-label>Ticket</mat-label>
            <mat-select formControlName="member">
              @for (member of members(); track member.id) {
                <mat-option [value]="member.id">
                  #{{ member.ticket_no }} — {{ member.customer?.name }}
                </mat-option>
              }
            </mat-select>
            @if (!loadingMembers() && form.controls.scheme.value && !members().length) {
              <mat-hint>This scheme has no tickets yet.</mat-hint>
            }
          </mat-form-field>

          <button mat-flat-button type="submit" [disabled]="form.invalid || loading()">
            <mat-icon>play_arrow</mat-icon>{{ loading() ? 'Loading…' : 'Run report' }}
          </button>
        </form>

        @if (!loading() && ledger().length) {
          <div class="table-wrap" role="region" tabindex="0" aria-label="Installment ledger">
            <table class="report-table">
              <thead>
                <tr>
                  <th scope="col">Installment</th>
                  <th scope="col" class="num">Due</th>
                  <th scope="col" class="num">Paid</th>
                  <th scope="col" class="num">Balance</th>
                  <th scope="col">Last paid</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                @for (row of ledger(); track row.installment_no) {
                  <tr>
                    <td>{{ row.installment_no }}</td>
                    <td class="num">{{ row.amount_due | number: '1.2-2' }}</td>
                    <td class="num">{{ row.amount_paid | number: '1.2-2' }}</td>
                    <td class="num">{{ row.balance | number: '1.2-2' }}</td>
                    <td>{{ row.last_paid_on ? (row.last_paid_on | date: 'dd-MMM-yyyy') : '—' }}</td>
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
                }
              </tbody>
              <tfoot>
                <tr>
                  <td>Total ({{ ledger().length }} installments)</td>
                  <td class="num">{{ totals().due | number: '1.2-2' }}</td>
                  <td class="num">{{ totals().paid | number: '1.2-2' }}</td>
                  <td class="num">{{ totals().balance | number: '1.2-2' }}</td>
                  <td colspan="2"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <h3 class="history-heading">Payments</h3>
          <div class="table-wrap" role="region" tabindex="0" aria-label="Payment history">
            <table class="report-table">
              <thead>
                <tr>
                  <th scope="col">Paid on</th>
                  <th scope="col">Installment</th>
                  <th scope="col" class="num">Amount</th>
                  <th scope="col">Notes</th>
                  <th scope="col" class="no-print"><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                @for (payment of payments(); track payment.id) {
                  <tr [class.cancelled]="payment.cancelled_at">
                    <td>{{ payment.paid_on | date: 'dd-MMM-yyyy' }}</td>
                    <td>{{ payment.installment_no }}</td>
                    <td class="num">{{ payment.amount | number: '1.2-2' }}</td>
                    <td class="table-secondary">
                      @if (payment.cancelled_at) {
                        <span class="status-badge neutral">Cancelled</span>
                        {{ payment.cancel_reason }}
                      } @else {
                        {{ payment.notes || '—' }}
                      }
                    </td>
                    <td class="row-actions no-print">
                      @if (auth.isAdmin() && !payment.cancelled_at) {
                        <button
                          mat-icon-button
                          type="button"
                          class="danger"
                          [disabled]="saving()"
                          matTooltip="Cancel this payment"
                          (click)="cancel(payment)"
                        >
                          <mat-icon>block</mat-icon>
                        </button>
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="5">
                      <app-empty-state message="No payments recorded for this ticket yet." status />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }

        @if (loading()) {
          <app-empty-state class="no-print" message="Preparing your report…" status />
        } @else if (!ran()) {
          <app-empty-state
            class="no-print"
            icon="account_balance_wallet"
            heading="Your report starts here"
            message="Pick a scheme and a ticket, then run the report."
          />
        }
      </app-report-shell>
    </div>
  `,
  styles: `
    .scheme-select,
    .member-select {
      min-width: 220px;
    }
    .report-table {
      min-width: 620px;
    }
    .history-heading {
      margin: 28px 0 14px;
      font-size: 15px;
      line-height: 1.5;
    }
    tr.cancelled td {
      color: var(--app-muted);
      text-decoration: line-through;
    }
    tr.cancelled .table-secondary {
      text-decoration: none;
    }
    @media print {
      .report-table {
        min-width: 0;
      }
    }
  `,
})
export class KuriMemberLedger implements OnInit {
  private readonly kuri = inject(KuriService);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);
  private readonly locale = inject(LOCALE_ID);
  protected readonly auth = inject(AuthService);

  protected readonly schemes = signal<KuriSchemeListRow[]>([]);
  protected readonly members = signal<KuriMember[]>([]);
  protected readonly ledger = signal<KuriMemberLedgerRow[]>([]);
  protected readonly payments = signal<KuriPaymentRow[]>([]);
  protected readonly loadingSchemes = signal(true);
  protected readonly loadingMembers = signal(false);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly ran = signal(false);
  protected readonly subtitle = signal('');

  protected readonly form = inject(FormBuilder).nonNullable.group({
    scheme: [0, [Validators.required, Validators.min(1)]],
    member: [0, [Validators.required, Validators.min(1)]],
  });

  private readonly formValue = signal(this.form.getRawValue());

  protected readonly totals = computed(() =>
    this.ledger().reduce(
      (sum, row) => ({
        due: sum.due + Number(row.amount_due),
        paid: sum.paid + Number(row.amount_paid),
        balance: sum.balance + Number(row.balance),
      }),
      { due: 0, paid: 0, balance: 0 },
    ),
  );

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      const previous = this.formValue();
      const current = this.form.getRawValue();
      this.formValue.set(current);
      if (current.scheme !== previous.scheme) {
        this.form.controls.member.setValue(0, { emitEvent: false });
        this.formValue.set(this.form.getRawValue());
        this.invalidate();
        void this.loadMembers(current.scheme);
      } else if (current.member !== previous.member) {
        this.invalidate();
      }
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      this.schemes.set(await this.kuri.listSchemes());
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.loadingSchemes.set(false);
    }
  }

  private async loadMembers(schemeId: number): Promise<void> {
    this.members.set([]);
    if (!schemeId) return;
    this.loadingMembers.set(true);
    try {
      this.members.set(await this.kuri.getMembers(schemeId));
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.loadingMembers.set(false);
    }
  }

  private invalidate(): void {
    this.ran.set(false);
    this.ledger.set([]);
    this.payments.set([]);
  }

  protected async run(): Promise<void> {
    if (this.form.invalid || this.loading()) return;
    const { scheme: schemeId, member: memberId } = this.form.getRawValue();
    this.loading.set(true);
    try {
      const [ledger, payments] = await Promise.all([
        this.kuri.getMemberLedger(schemeId, memberId),
        this.kuri.getPaymentHistory(schemeId, memberId),
      ]);
      this.ledger.set(ledger);
      this.payments.set(payments);
      this.subtitle.set(this.describe(schemeId, memberId));
      this.ran.set(true);
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  private describe(schemeId: number, memberId: number): string {
    const scheme = this.schemes().find((s) => s.id === schemeId);
    const member = this.members().find((m) => m.id === memberId);
    const who = member ? `ticket #${member.ticket_no} — ${member.customer?.name ?? ''}` : '';
    return [scheme?.name, who].filter(Boolean).join(' · ');
  }

  protected async cancel(payment: KuriPaymentRow): Promise<void> {
    if (!this.auth.isAdmin() || this.saving() || payment.cancelled_at) return;
    const result = await confirmAction(this.dialog, {
      title: 'Cancel this payment?',
      message:
        'The amount stops counting towards the installment. The record stays on the ledger with your reason against it.',
      details: [
        { label: 'Installment', value: String(payment.installment_no) },
        { label: 'Amount', value: formatNumber(Number(payment.amount), this.locale, '1.2-2') },
      ],
      fields: [{ key: 'reason', label: 'Reason for cancelling', required: true, maxLength: 200 }],
      confirmLabel: 'Cancel payment',
      cancelLabel: 'Keep payment',
      destructive: true,
    });
    if (!result || this.saving()) return;
    this.saving.set(true);
    try {
      await this.kuri.cancelPayment(payment.id, result['reason']);
      this.notify.success('Payment cancelled');
      await this.run();
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.saving.set(false);
    }
  }

  protected exportCsv(): void {
    downloadCsv(
      'kuri-member-ledger.csv',
      ['Installment', 'Due', 'Paid', 'Balance', 'Last paid'],
      this.ledger().map((row) => [
        row.installment_no,
        row.amount_due,
        row.amount_paid,
        row.balance,
        row.last_paid_on,
      ]),
    );
  }
}
