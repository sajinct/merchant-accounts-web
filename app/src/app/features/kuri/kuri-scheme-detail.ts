import { DatePipe, DecimalPipe, TitleCasePipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
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
import { isoDate } from '../../shared/dates';
import { KuriService } from './kuri.service';
import {
  KuriSchemeDetail as KuriSchemeDetailModel,
  KuriPayoutSlot,
  KuriMember,
  KuriLot,
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
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTabsModule,
    MatTooltipModule,
    PageHeader,
    EmptyState,
    StatCard,
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
                <div class="table-wrap">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th>Installment</th>
                        <th>Lot #</th>
                        <th class="num">Payout Amount</th>
                        <th>Winner</th>
                        <th>Status</th>
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
                            @if (slot.lot) {
                              {{ slot.lot.member?.customer?.name }} (Tkt:
                              {{ slot.lot.member?.ticket_no }})
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
                <div class="table-wrap">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th>Ticket #</th>
                        <th>Name</th>
                        <th>Phone</th>
                        <th>Lot Won</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (m of members(); track m.id) {
                        <tr>
                          <td>{{ m.ticket_no }}</td>
                          <td>{{ m.customer?.name }}</td>
                          <td>{{ m.customer?.phone || '—' }}</td>
                          <td>{{ getMemberWin(m.id) || '—' }}</td>
                          <td>
                            @if (s.status === 'draft' && auth.isAdmin()) {
                              <button
                                mat-icon-button
                                color="warn"
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
                          <td colspan="5" class="empty-cell">No members added yet.</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>

                @if (s.status === 'draft' && auth.canEdit()) {
                  <div class="panel-header" style="margin-top: 2rem;">
                    <h2>Add Member</h2>
                  </div>
                  <form [formGroup]="memberForm" (ngSubmit)="addMember()" class="form-grid">
                    <mat-form-field>
                      <mat-label>Customer Code</mat-label>
                      <input matInput type="number" formControlName="customerCode" />
                    </mat-form-field>
                    <mat-form-field>
                      <mat-label>Ticket #</mat-label>
                      <input matInput type="number" formControlName="ticketNo" />
                    </mat-form-field>
                    <div class="form-actions">
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
                <div class="table-wrap">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th>Installment</th>
                        <th>Winner</th>
                        <th class="num">Payout Amount</th>
                        <th>Status</th>
                        <th>Payout Date</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (lot of lots(); track lot.id) {
                        <tr>
                          <td>{{ lot.installment_no }}</td>
                          <td>
                            {{ lot.member?.customer?.name }} (Tkt: {{ lot.member?.ticket_no }})
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

                @if (s.status === 'active' && auth.canEdit()) {
                  <div class="panel-header" style="margin-top: 2rem;">
                    <h2>Draw Lot</h2>
                  </div>
                  <form [formGroup]="drawForm" (ngSubmit)="drawLot()" class="form-grid">
                    <mat-form-field>
                      <mat-label>Installment</mat-label>
                      <mat-select formControlName="installmentNo">
                        @for (inst of pendingLots(); track inst) {
                          <mat-option [value]="inst">{{ inst }}</mat-option>
                        }
                      </mat-select>
                    </mat-form-field>
                    <mat-form-field>
                      <mat-label>Winner</mat-label>
                      <mat-select formControlName="winnerMemberId">
                        @for (m of eligibleMembers(); track m.id) {
                          <mat-option [value]="m.id"
                            >{{ m.customer?.name }} (Tkt: {{ m.ticket_no }})</mat-option
                          >
                        }
                      </mat-select>
                    </mat-form-field>
                    <div class="form-actions">
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
        <app-empty-state icon="pending" message="Loading scheme details..." />
      }
    </div>
  `,
  styles: `
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }
    .empty-cell {
      text-align: center;
      color: var(--app-muted);
      padding: 2rem !important;
    }
    .form-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      align-items: center;
    }
    .form-actions {
      display: flex;
      align-items: center;
      padding-bottom: 1.25rem;
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
  protected readonly busy = signal(false);

  protected readonly memberForm = this.fb.group({
    customerCode: [null as number | null, Validators.required],
    ticketNo: [null as number | null, Validators.required],
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
        void this.loadData();
      }
    });
  }

  private async loadData(): Promise<void> {
    try {
      const id = this.schemeId();
      const [schemes, slots, members, lots] = await Promise.all([
        this.kuri.getSchemeDetail(id),
        this.kuri.getPayoutSchedule(id),
        this.kuri.getMembers(id),
        this.kuri.getLots(id),
      ]);
      this.scheme.set(schemes[0] || null);
      this.slots.set(slots);
      this.members.set(members);
      this.lots.set(lots);

      const pending = this.pendingLots();
      if (pending.length > 0) {
        this.drawForm.patchValue({ installmentNo: pending[0] });
      }
    } catch (err) {
      this.notify.error(err);
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
    const v = this.memberForm.value;
    this.busy.set(true);
    try {
      await this.kuri.addMember(this.schemeId(), v.customerCode!, v.ticketNo!);
      this.notify.success('Member added');
      this.memberForm.reset();
      await this.loadData();
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.busy.set(false);
    }
  }

  protected async removeMember(m: KuriMember): Promise<void> {
    const result = await confirmAction(this.dialog, {
      title: 'Remove Member?',
      message: `Remove ticket #${m.ticket_no} (${m.customer?.name}) from this scheme?`,
      destructive: true,
      confirmLabel: 'Remove',
    });
    if (!result) return;
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
    try {
      await this.kuri.drawLot(this.schemeId(), v.installmentNo!, v.winnerMemberId!);
      this.notify.success('Lot recorded successfully');
      this.drawForm.reset();
      await this.loadData();
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.busy.set(false);
    }
  }

  protected async markPaid(lot: KuriLot): Promise<void> {
    const result = await confirmAction(this.dialog, {
      title: 'Mark Paid?',
      message: `Confirm payout of ${lot.payout_amount} to ${lot.member?.customer?.name}?`,
      confirmLabel: 'Mark Paid',
    });
    if (!result) return;
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
