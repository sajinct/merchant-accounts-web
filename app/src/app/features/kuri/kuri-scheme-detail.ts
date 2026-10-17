import { DatePipe, DecimalPipe, TitleCasePipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../core/auth.service';
import { NotifyService } from '../../core/notify.service';
import { PageHeader } from '../../shared/page-header';
import { EmptyState } from '../../shared/empty-state';
import { StatCard } from '../../shared/stat-card';
import { confirmAction } from '../../shared/confirm-dialog';
import { EnterToNext } from '../../shared/enter-to-next.directive';
import { EntrySelect } from '../../shared/entry-select.directive';
import { isoDate } from '../../shared/dates';
import { KuriService } from './kuri.service';
import {
  formatCustomerAddress,
  hasCustomHolderName,
  KuriCustomerSummary,
  KuriSchemeDetail as KuriSchemeDetailModel,
  KuriPayoutSlot,
  KuriMember,
  KuriLot,
  ticketHolderAddress,
  ticketHolderName,
  ticketHolderPhone,
} from './kuri.models';

@Component({
  selector: 'app-kuri-scheme-detail',
  imports: [
    DatePipe,
    DecimalPipe,
    TitleCasePipe,
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTabsModule,
    MatTooltipModule,
    PageHeader,
    EmptyState,
    StatCard,
    EnterToNext,
    EntrySelect,
  ],
  template: `
    <div class="page">
      @if (scheme(); as s) {
        <app-page-header eyebrow="Kuri" [heading]="s.name">
          <span class="status-badge {{ schemeTone(s.status) }}">{{ s.status | titlecase }}</span>
          @if (s.status === 'draft' && s.enrolled_count === s.num_members && auth.canEdit()) {
            <button mat-flat-button [disabled]="busy()" (click)="activateScheme()">Activate</button>
          }
          <a mat-stroked-button [routerLink]="['/kuri/schemes', s.id, 'installments', 1]"
            >Installments</a
          >
        </app-page-header>

        <div class="summary-grid">
          <app-stat-card label="Total Value" [value]="s.total_value | number: '1.2-2'" />
          <app-stat-card label="Collected" [value]="s.total_collected | number: '1.2-2'" />
          <app-stat-card label="Paid Out" [value]="s.total_paid_out | number: '1.2-2'" />
          <app-stat-card label="Lots Drawn" [value]="s.lots_drawn + ' / ' + s.num_members" />
        </div>

        <mat-tab-group>
          <mat-tab label="Payout Schedule">
            <div class="panel">
              <div class="panel-body">
                <div class="table-wrap" role="region" tabindex="0" aria-label="Payout schedule">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th scope="col">Installment</th>
                        <th scope="col">Lot #</th>
                        <th scope="col" class="num">Payout Amount</th>
                        <th scope="col">Winner</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (slot of combinedSchedule(); track slot.installment_no) {
                        <tr>
                          <td>{{ slot.installment_no }}</td>
                          <td>{{ slot.lot_number ?? '—' }}</td>
                          <td class="num">
                            @if (slot.payout_amount === null) {
                              <span class="hint">Collection only (no lot)</span>
                            } @else {
                              {{ slot.payout_amount | number: '1.2-2' }}
                            }
                          </td>
                          <td>
                            @if (slot.lot; as lot) {
                              {{ holderName(lot.member) }} (Tkt: {{ lot.member?.ticket_no }})
                              @if (isCustomHolder(lot.member)) {
                                <div class="table-secondary">
                                  Member #{{ lot.member?.customer?.code }}:
                                  {{ lot.member?.customer?.name }}
                                </div>
                              }
                            } @else {
                              —
                            }
                          </td>
                          <td>
                            @if (slot.lot; as lot) {
                              <span class="status-badge {{ payoutTone(lot.payout_status) }}">{{
                                lot.payout_status | titlecase
                              }}</span>
                            } @else {
                              —
                            }
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </mat-tab>

          <mat-tab label="Members ({{ members().length }})">
            <div class="panel">
              <div class="panel-body">
                <div class="table-wrap" role="region" tabindex="0" aria-label="Scheme members">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th scope="col">Ticket #</th>
                        <th scope="col">Ticket Holder</th>
                        <th scope="col">Address</th>
                        <th scope="col">Phone</th>
                        <th scope="col">Linked Member</th>
                        <th scope="col">Lot Won</th>
                        <th scope="col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (m of members(); track m.id) {
                        <tr>
                          <td>{{ m.ticket_no }}</td>
                          <td>{{ holderName(m) }}</td>
                          <td class="table-secondary">{{ holderAddress(m) || '—' }}</td>
                          <td>{{ holderPhone(m) || '—' }}</td>
                          <td>
                            <a
                              class="table-link"
                              [routerLink]="['/masters/members', m.customer_code]"
                            >
                              #{{ m.customer_code }} — {{ m.customer?.name }}
                            </a>
                          </td>
                          <td>{{ getMemberWin(m.id) || '—' }}</td>
                          <td>
                            @if (s.status === 'draft' && auth.isAdmin()) {
                              <button
                                mat-icon-button
                                class="danger"
                                [disabled]="busy()"
                                [attr.aria-label]="'Remove ticket ' + m.ticket_no"
                                (click)="removeMember(m)"
                                matTooltip="Remove"
                              >
                                <mat-icon>delete</mat-icon>
                              </button>
                            }
                          </td>
                        </tr>
                      }
                      @if (members().length === 0) {
                        <tr>
                          <td colspan="7" class="empty-cell">No members added yet.</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>

                @if (s.status === 'draft' && auth.canEdit() && members().length < s.num_members) {
                  <div class="panel-header" style="margin-top: 2rem;">
                    <h2>Assign Ticket</h2>
                  </div>
                  <form
                    appEnterToNext
                    [formGroup]="memberForm"
                    (ngSubmit)="addMember()"
                    class="form-grid"
                  >
                    <mat-form-field subscriptSizing="dynamic">
                      <mat-label>Member Code (Linked Member)</mat-label>
                      <input
                        matInput
                        type="number"
                        formControlName="customerCode"
                        min="1"
                        step="1"
                      />
                      <mat-error>Enter a positive whole-number member code.</mat-error>
                    </mat-form-field>
                    <mat-form-field subscriptSizing="dynamic">
                      <mat-label>Ticket #</mat-label>
                      <input
                        matInput
                        type="number"
                        formControlName="ticketNo"
                        min="1"
                        [max]="s.num_members"
                        step="1"
                      />
                      <mat-error
                        >Enter an available ticket number from 1 to {{ s.num_members }}.</mat-error
                      >
                    </mat-form-field>

                    @if (selectedCustomer(); as c) {
                      <div class="linked-member-preview full">
                        <mat-icon aria-hidden="true">person</mat-icon>
                        <div>
                          <strong>Member #{{ c.code }}: {{ c.name }}</strong>
                          <span class="preview-meta">
                            @if (customerAddress(c)) {
                              · {{ customerAddress(c) }}
                            }
                            @if (c.phone) {
                              · {{ c.phone }}
                            }
                          </span>
                        </div>
                      </div>
                    } @else if (customerLookupFailed()) {
                      <div class="linked-member-preview warning full">
                        <mat-icon aria-hidden="true">warning_amber</mat-icon>
                        <span>No member found with that code.</span>
                      </div>
                    }

                    <div class="custom-holder-toggle full">
                      <mat-checkbox formControlName="useCustomHolder">
                        Use different ticket holder details (linked to this member ID)
                      </mat-checkbox>
                    </div>

                    @if (memberForm.controls.useCustomHolder.value) {
                      <mat-form-field subscriptSizing="dynamic">
                        <mat-label>Ticket Holder Name</mat-label>
                        <input matInput formControlName="holderName" maxlength="100" />
                        <mat-error>Enter the ticket holder’s name.</mat-error>
                      </mat-form-field>
                      <mat-form-field subscriptSizing="dynamic">
                        <mat-label>Ticket Holder Phone</mat-label>
                        <input matInput type="tel" formControlName="holderPhone" maxlength="30" />
                      </mat-form-field>
                      <mat-form-field subscriptSizing="dynamic" class="full">
                        <mat-label>Ticket Holder Address</mat-label>
                        <input matInput formControlName="holderAddress" maxlength="250" />
                      </mat-form-field>
                    }

                    <div class="form-actions full">
                      <button
                        mat-flat-button
                        type="submit"
                        [disabled]="memberForm.invalid || busy()"
                      >
                        Add
                      </button>
                    </div>
                  </form>
                }
              </div>
            </div>
          </mat-tab>

          <mat-tab label="Lot History">
            <div class="panel">
              <div class="panel-body">
                <div class="table-wrap" role="region" tabindex="0" aria-label="Lot history">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th scope="col">Installment</th>
                        <th scope="col">Winner</th>
                        <th scope="col" class="num">Payout Amount</th>
                        <th scope="col">Status</th>
                        <th scope="col">Payout Date</th>
                        <th scope="col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (lot of lots(); track lot.id) {
                        <tr>
                          <td>{{ lot.installment_no }}</td>
                          <td>
                            {{ holderName(lot.member) }} (Tkt: {{ lot.member?.ticket_no }})
                            @if (isCustomHolder(lot.member)) {
                              <div class="table-secondary">
                                Member #{{ lot.member?.customer?.code }}:
                                {{ lot.member?.customer?.name }}
                              </div>
                            }
                          </td>
                          <td class="num">{{ lot.payout_amount | number: '1.2-2' }}</td>
                          <td>
                            <span class="status-badge {{ payoutTone(lot.payout_status) }}">{{
                              lot.payout_status | titlecase
                            }}</span>
                          </td>
                          <td>{{ lot.payout_date ? (lot.payout_date | date) : '—' }}</td>
                          <td>
                            @if (lot.payout_status === 'pending' && auth.isAdmin()) {
                              <button
                                mat-stroked-button
                                [disabled]="busy()"
                                (click)="markPaid(lot)"
                              >
                                Mark Paid
                              </button>
                            }
                          </td>
                        </tr>
                      }
                      @if (lots().length === 0) {
                        <tr>
                          <td colspan="6" class="empty-cell">No lots drawn yet.</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>

                @if (
                  s.status === 'active' &&
                  auth.canEdit() &&
                  pendingLots().length &&
                  eligibleMembers().length
                ) {
                  <div class="panel-header" style="margin-top: 2rem;">
                    <h2>Draw Lot</h2>
                  </div>
                  <form
                    appEnterToNext
                    [formGroup]="drawForm"
                    (ngSubmit)="drawLot()"
                    class="form-grid"
                  >
                    <mat-form-field subscriptSizing="dynamic">
                      <mat-label>Installment</mat-label>
                      <mat-select appEntrySelect formControlName="installmentNo">
                        @for (inst of pendingLots(); track inst) {
                          <mat-option [value]="inst">{{ inst }}</mat-option>
                        }
                      </mat-select>
                    </mat-form-field>
                    <mat-form-field subscriptSizing="dynamic">
                      <mat-label>Winner</mat-label>
                      <mat-select appEntrySelect formControlName="winnerMemberId">
                        @for (m of eligibleMembers(); track m.id) {
                          <mat-option [value]="m.id">
                            {{ holderName(m) }} (Tkt: {{ m.ticket_no }}
                            @if (isCustomHolder(m)) {
                              · Member #{{ m.customer_code }}: {{ m.customer?.name }}
                            }
                            )
                          </mat-option>
                        }
                      </mat-select>
                    </mat-form-field>
                    <div class="form-actions full">
                      <button mat-flat-button type="submit" [disabled]="drawForm.invalid || busy()">
                        Record Lot Draw
                      </button>
                    </div>
                  </form>
                }
              </div>
            </div>
          </mat-tab>
        </mat-tab-group>
      } @else {
        <app-empty-state
          icon="pending"
          [message]="loading() ? 'Loading scheme details…' : 'Unable to load scheme details.'"
        />
        @if (!loading()) {
          <button mat-stroked-button type="button" (click)="loadData()">Retry</button>
        }
      }
    </div>
  `,
  styleUrl: './kuri-summary.scss',
  styles: `
    .panel-body > .form-grid {
      margin-top: 16px;
    }
    .empty-cell {
      text-align: center;
      color: var(--app-muted);
      padding: 2rem !important;
    }
    .linked-member-preview {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      border-radius: 8px;
      background: var(--app-surface-subtle, rgba(0, 0, 0, 0.03));
      border: 1px solid var(--app-border);
      font-size: 13px;
    }
    .linked-member-preview.warning {
      color: var(--app-warning-ink);
    }
    .preview-meta {
      color: var(--app-muted);
      margin-left: 4px;
    }
    .custom-holder-toggle {
      margin: 2px 0;
    }
  `,
})
export class KuriSchemeDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly kuri = inject(KuriService);
  protected readonly auth = inject(AuthService);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);
  private readonly fb = inject(FormBuilder);

  private readonly schemeId = signal<number>(0);
  protected readonly scheme = signal<KuriSchemeDetailModel | null>(null);
  protected readonly slots = signal<KuriPayoutSlot[]>([]);
  protected readonly members = signal<KuriMember[]>([]);
  protected readonly lots = signal<KuriLot[]>([]);
  protected readonly selectedCustomer = signal<KuriCustomerSummary | null>(null);
  protected readonly customerLookupFailed = signal(false);
  protected readonly busy = signal(false);
  protected readonly loading = signal(true);
  private loadRequest = 0;
  private customerLookupRequest = 0;

  protected readonly holderName = ticketHolderName;
  protected readonly holderAddress = ticketHolderAddress;
  protected readonly holderPhone = ticketHolderPhone;
  protected readonly customerAddress = formatCustomerAddress;
  protected readonly isCustomHolder = hasCustomHolderName;

  protected readonly memberForm = this.fb.group({
    customerCode: [
      null as number | null,
      [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)],
    ],
    ticketNo: [
      null as number | null,
      [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)],
    ],
    useCustomHolder: [false],
    holderName: [''],
    holderAddress: [''],
    holderPhone: [''],
  });

  protected readonly drawForm = this.fb.group({
    installmentNo: [null as number | null, Validators.required],
    winnerMemberId: [null as number | null, Validators.required],
  });

  /**
   * Every installment, not just the ones with a lot: `kuri_payout_schedule` returns rows for
   * installments 2..N+1, and installment 1 is collection-only.
   */
  protected readonly combinedSchedule = computed(() => {
    const scheme = this.scheme();
    if (!scheme) return [];
    const slots = this.slots();
    const lots = this.lots();
    return Array.from({ length: scheme.num_installments }, (_, i) => {
      const installmentNo = i + 1;
      const slot = slots.find((x) => x.installment_no === installmentNo);
      return {
        installment_no: installmentNo,
        lot_number: slot?.lot_number ?? null,
        payout_amount: slot?.payout_amount ?? null,
        lot: lots.find((l) => l.installment_no === installmentNo),
      };
    });
  });

  constructor() {
    this.memberForm.controls.useCustomHolder.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((useCustom) => {
        const nameCtrl = this.memberForm.controls.holderName;
        if (useCustom) {
          nameCtrl.setValidators([Validators.required, Validators.pattern(/\S/)]);
          const cust = this.selectedCustomer();
          if (cust) {
            if (!nameCtrl.value?.trim()) {
              nameCtrl.setValue(cust.name, { emitEvent: false });
            }
            if (!this.memberForm.controls.holderAddress.value?.trim()) {
              this.memberForm.controls.holderAddress.setValue(formatCustomerAddress(cust), {
                emitEvent: false,
              });
            }
            if (!this.memberForm.controls.holderPhone.value?.trim() && cust.phone) {
              this.memberForm.controls.holderPhone.setValue(cust.phone, { emitEvent: false });
            }
          }
        } else {
          nameCtrl.clearValidators();
          this.memberForm.patchValue(
            { holderName: '', holderAddress: '', holderPhone: '' },
            { emitEvent: false },
          );
        }
        nameCtrl.updateValueAndValidity({ emitEvent: false });
      });

    this.memberForm.controls.customerCode.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((code) => {
        void this.lookupCustomer(code);
      });
  }

  private async lookupCustomer(code: number | null): Promise<void> {
    const req = ++this.customerLookupRequest;
    this.selectedCustomer.set(null);
    this.customerLookupFailed.set(false);
    if (!code || !Number.isInteger(Number(code)) || Number(code) < 1) return;
    if (typeof this.kuri.getCustomer !== 'function') return;
    try {
      const customer = await this.kuri.getCustomer(Number(code));
      if (req !== this.customerLookupRequest) return;
      this.selectedCustomer.set(customer);
      this.customerLookupFailed.set(!customer);
    } catch {
      if (req === this.customerLookupRequest) {
        this.selectedCustomer.set(null);
      }
    }
  }

  /** Maps a scheme or payout status onto the badge tones the global stylesheet defines. */
  protected schemeTone(status: KuriSchemeDetailModel['status']): string {
    return status === 'active' ? 'success' : 'neutral';
  }

  protected payoutTone(status: KuriLot['payout_status']): string {
    return status === 'paid' ? 'success' : 'warning';
  }

  protected getMemberWin(memberId: number): string | null {
    const lot = this.lots().find((l) => l.winner_member_id === memberId);
    return lot ? `Inst #${lot.installment_no}` : null;
  }

  protected readonly pendingLots = computed(() => {
    const s = this.scheme();
    if (!s) return [];
    const drawn = this.lots().map((l) => l.installment_no);
    const pending: number[] = [];
    for (let i = 2; i <= s.num_installments; i++) {
      if (!drawn.includes(i)) pending.push(i);
    }
    return pending;
  });

  protected readonly eligibleMembers = computed(() => {
    const winners = new Set(this.lots().map((l) => l.winner_member_id));
    return this.members().filter((m) => !winners.has(m.id));
  });

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const id = Number(params.get('id'));
      if (id) {
        this.schemeId.set(id);
        this.scheme.set(null);
        this.resetMemberForm();
        this.drawForm.reset();
        void this.loadData();
      }
    });
  }

  private resetMemberForm(): void {
    this.selectedCustomer.set(null);
    this.customerLookupFailed.set(false);
    this.memberForm.reset({
      customerCode: null,
      ticketNo: null,
      useCustomHolder: false,
      holderName: '',
      holderAddress: '',
      holderPhone: '',
    });
  }

  protected async loadData(): Promise<void> {
    const request = ++this.loadRequest;
    this.loading.set(true);
    try {
      const id = this.schemeId();
      const [schemes, slots, members, lots] = await Promise.all([
        this.kuri.getSchemeDetail(id),
        this.kuri.getPayoutSchedule(id),
        this.kuri.getMembers(id),
        this.kuri.getLots(id),
      ]);
      if (request !== this.loadRequest) return;
      this.scheme.set(schemes[0] || null);
      this.slots.set(slots);
      this.members.set(members);
      this.lots.set(lots);
      this.memberForm.controls.ticketNo.setValidators([
        Validators.required,
        Validators.min(1),
        Validators.max(schemes[0]?.num_members ?? 0),
        Validators.pattern(/^\d+$/),
      ]);
      this.memberForm.controls.ticketNo.updateValueAndValidity();

      const pending = this.pendingLots();
      if (pending.length > 0) {
        this.drawForm.patchValue({ installmentNo: pending[0] });
      }
    } catch (err) {
      if (request === this.loadRequest) {
        this.scheme.set(null);
        this.notify.error(err);
      }
    } finally {
      if (request === this.loadRequest) this.loading.set(false);
    }
  }

  protected async activateScheme(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await this.kuri.activateScheme(this.schemeId());
      this.notify.success('Scheme activated successfully');
      await this.loadData();
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.busy.set(false);
    }
  }

  protected async addMember(): Promise<void> {
    if (this.memberForm.invalid || this.busy()) return;
    const v = this.memberForm.getRawValue();
    this.busy.set(true);
    this.memberForm.disable({ emitEvent: false });
    try {
      if (v.useCustomHolder) {
        await this.kuri.addMember(this.schemeId(), v.customerCode!, v.ticketNo!, {
          holderName: v.holderName?.trim() || null,
          holderAddress: v.holderAddress?.trim() || null,
          holderPhone: v.holderPhone?.trim() || null,
        });
      } else {
        await this.kuri.addMember(this.schemeId(), v.customerCode!, v.ticketNo!);
      }
      this.notify.success('Member added');
      this.resetMemberForm();
      await this.loadData();
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.memberForm.enable({ emitEvent: false });
      this.busy.set(false);
    }
  }

  protected async removeMember(m: KuriMember): Promise<void> {
    if (this.busy()) return;
    const schemeId = this.schemeId();
    const result = await confirmAction(this.dialog, {
      title: 'Remove Member?',
      message: `Remove ticket #${m.ticket_no} (${this.holderName(m)}) from this scheme?`,
      destructive: true,
      confirmLabel: 'Remove',
    });
    if (!result || this.busy() || schemeId !== this.schemeId()) return;
    this.busy.set(true);
    try {
      await this.kuri.removeMember(m.id);
      this.notify.success('Member removed');
      await this.loadData();
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.busy.set(false);
    }
  }

  protected async drawLot(): Promise<void> {
    if (this.drawForm.invalid || this.busy()) return;
    const v = this.drawForm.value;
    this.busy.set(true);
    this.drawForm.disable({ emitEvent: false });
    try {
      await this.kuri.drawLot(this.schemeId(), v.installmentNo!, v.winnerMemberId!);
      this.notify.success('Lot recorded successfully');
      this.drawForm.reset();
      await this.loadData();
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.drawForm.enable({ emitEvent: false });
      this.busy.set(false);
    }
  }

  protected async markPaid(lot: KuriLot): Promise<void> {
    if (this.busy()) return;
    const schemeId = this.schemeId();
    const result = await confirmAction(this.dialog, {
      title: 'Mark Paid?',
      message: `Confirm payout of ${lot.payout_amount} to ${this.holderName(lot.member)}?`,
      confirmLabel: 'Mark Paid',
    });
    if (!result || this.busy() || schemeId !== this.schemeId()) return;
    this.busy.set(true);
    try {
      await this.kuri.markPayout(lot.id, isoDate());
      this.notify.success('Payout marked as paid');
      await this.loadData();
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.busy.set(false);
    }
  }
}
