import { DecimalPipe } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  LOCALE_ID,
  OnInit,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AccountHead, JoiningFee, SubscriptionYear } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { must, SupabaseService } from '../../core/supabase.service';
import { displayDate, isoDate } from '../../shared/dates';
import { fyLabel, fyStart } from '../../shared/fy';
import { confirmAction } from '../../shared/confirm-dialog';
import { PageHeader } from '../../shared/page-header';
import { EmptyState } from '../../shared/empty-state';
import { EnterToNext } from '../../shared/enter-to-next.directive';
import { EntrySelect } from '../../shared/entry-select.directive';

@Component({
  selector: 'app-subscription-fees',
  imports: [
    EnterToNext,
    EntrySelect,
    EmptyState,
    PageHeader,
    DecimalPipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
  ],
  template: `
    <div class="page narrow-page">
      <app-page-header
        eyebrow="Membership"
        heading="Fees"
        description="The joining fee is paid once when a member joins. The subscription fee is owed every financial year. Both are kept as a history, so changing a fee never rewrites what was already charged."
      />

      <!-- ------------------------------------------------------------------ -->
      <!-- Joining fee: one-time, charged at the rate in force when they join  -->
      <!-- ------------------------------------------------------------------ -->
      <section class="fee-group" aria-labelledby="joining-heading">
        <header class="group-header">
          <h2 id="joining-heading">Joining fee</h2>
          <p>
            Paid once, when a member joins. A member is charged the rate effective on their joining
            date, so adding a new rate below never changes what existing members owe.
          </p>
        </header>

        <div class="panel">
          <div class="panel-header">
            <h3 id="joining-history-heading">Rate history</h3>
            @if (currentJoining(); as current) {
              <span class="status-badge success"
                >Now {{ current.fee | number: '1.2-2' }} to {{ headName(current.head_code) }}</span
              >
            } @else {
              <span class="status-badge neutral">Not set</span>
            }
          </div>
          <div
            class="table-wrap"
            tabindex="0"
            role="region"
            aria-labelledby="joining-history-heading"
          >
            <table class="data-table">
              <thead>
                <tr>
                  <th scope="col">Effective from</th>
                  <th scope="col" class="num">Fee</th>
                  <th scope="col">Posts to</th>
                  <th scope="col">Note</th>
                  <th scope="col"><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                @for (rate of joiningFees(); track rate.effective_from) {
                  <tr [attr.data-joining-rate]="rate.effective_from">
                    <td>
                      <span class="table-primary">{{ date(rate.effective_from) }}</span>
                      @if (rate === currentJoining()) {
                        <span class="status-badge success">Current</span>
                      }
                    </td>
                    <td class="num">
                      @if (editingJoining() === rate.effective_from) {
                        <mat-form-field subscriptSizing="dynamic" class="compact">
                          <input
                            matInput
                            type="number"
                            min="0"
                            step="0.01"
                            [value]="rate.fee"
                            (input)="editJoiningFee.set($any($event.target).valueAsNumber)"
                            (keydown)="handleJoiningKey($event, rate)"
                            [attr.aria-label]="'Fee effective ' + date(rate.effective_from)"
                          />
                        </mat-form-field>
                      } @else {
                        {{ rate.fee | number: '1.2-2' }}
                      }
                    </td>
                    <td>{{ headName(rate.head_code) }}</td>
                    <td class="muted">{{ rate.note || '—' }}</td>
                    <td class="row-actions">
                      @if (editingJoining() === rate.effective_from) {
                        <button
                          mat-icon-button
                          type="button"
                          (click)="updateJoiningFee(rate, editJoiningFee())"
                          matTooltip="Save fee"
                          aria-label="Save fee"
                        >
                          <mat-icon>check</mat-icon>
                        </button>
                        <button
                          mat-icon-button
                          type="button"
                          (click)="cancelJoiningEdit(rate)"
                          matTooltip="Cancel"
                          aria-label="Cancel"
                        >
                          <mat-icon>close</mat-icon>
                        </button>
                      } @else {
                        <button
                          mat-icon-button
                          type="button"
                          (click)="startJoiningEdit(rate)"
                          matTooltip="Correct this fee"
                          [attr.aria-label]="'Correct fee effective ' + date(rate.effective_from)"
                        >
                          <mat-icon>edit</mat-icon>
                        </button>
                        <button
                          mat-icon-button
                          type="button"
                          class="danger"
                          (click)="removeJoining(rate)"
                          matTooltip="Remove rate"
                          [attr.aria-label]="'Remove rate effective ' + date(rate.effective_from)"
                        >
                          <mat-icon>delete_outline</mat-icon>
                        </button>
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="5">
                      <app-empty-state
                        icon="how_to_reg"
                        [heading]="loading() ? 'Loading fees' : 'No joining fee set'"
                        message="Add a rate below before recording joining fee payments."
                        status
                      />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <form
          appEnterToNext
          class="panel"
          [formGroup]="joiningForm"
          (ngSubmit)="addJoiningFee()"
          aria-labelledby="add-joining-heading"
        >
          <div class="panel-header">
            <h3 id="add-joining-heading">Change the joining fee</h3>
            <span class="hint">Applies to members who join on or after this date</span>
          </div>
          <div class="panel-body">
            <div class="form-grid">
              <mat-form-field>
                <mat-label>Effective from</mat-label>
                <input
                  matInput
                  [matDatepicker]="effectivePicker"
                  formControlName="effective_from"
                  placeholder="dd/mm/yyyy"
                /><mat-datepicker-toggle matIconSuffix [for]="effectivePicker" /><mat-datepicker
                  #effectivePicker
                />
                <mat-error>Choose the date this fee starts.</mat-error>
              </mat-form-field>
              <mat-form-field>
                <mat-label>Joining fee</mat-label>
                <input matInput type="number" min="0" step="0.01" formControlName="fee" />
                <mat-error>Enter a fee of zero or more.</mat-error>
              </mat-form-field>
              <mat-form-field class="wide">
                <mat-label>Account head</mat-label>
                <mat-select appEntrySelect formControlName="head_code">
                  @for (head of heads(); track head.code) {
                    <mat-option [value]="head.code">{{ head.code }} – {{ head.name }}</mat-option>
                  }
                </mat-select>
                <mat-hint>Receipts for this fee post here</mat-hint>
                <mat-error>Choose the account head to post to.</mat-error>
              </mat-form-field>
              <mat-form-field class="wide">
                <mat-label>Note</mat-label>
                <input matInput formControlName="note" placeholder="Committee decision, date" />
              </mat-form-field>
            </div>
            <div class="form-actions">
              <button mat-flat-button type="submit" [disabled]="joiningForm.invalid || saving()">
                <mat-icon>add</mat-icon> Add rate
              </button>
            </div>
          </div>
        </form>
      </section>

      <!-- ------------------------------------------------------------------ -->
      <!-- Subscription fee: one fee per financial year                        -->
      <!-- ------------------------------------------------------------------ -->
      <section class="fee-group" aria-labelledby="subscription-heading">
        <header class="group-header">
          <h2 id="subscription-heading">Subscription fee</h2>
          <p>
            Owed every financial year a member belongs to, from the year they joined until the year
            they left. Unpaid years carry forward as arrears.
          </p>
        </header>

        <div class="panel">
          <div class="panel-header">
            <h3 id="fee-years-heading">Fee by financial year</h3>
            <span class="status-badge neutral">{{ years().length }} years</span>
          </div>
          <div class="table-wrap" tabindex="0" role="region" aria-labelledby="fee-years-heading">
            <table class="data-table">
              <thead>
                <tr>
                  <th scope="col">Financial year</th>
                  <th scope="col" class="num">Fee</th>
                  <th scope="col"><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                @for (year of years(); track year.fy_start) {
                  <tr [attr.data-fee-year]="year.fy_start">
                    <td>
                      <span class="table-primary">{{ label(year.fy_start) }}</span>
                      @if (year.fy_start === currentFy) {
                        <span class="status-badge success">Current</span>
                      }
                    </td>
                    <td class="num">
                      @if (editing() === year.fy_start) {
                        <mat-form-field subscriptSizing="dynamic" class="compact">
                          <input
                            matInput
                            type="number"
                            min="0"
                            step="0.01"
                            [value]="year.fee"
                            (input)="editFee.set($any($event.target).valueAsNumber)"
                            (keydown)="handleEditKey($event, year)"
                            [attr.aria-label]="'Fee for ' + label(year.fy_start)"
                          />
                        </mat-form-field>
                      } @else {
                        {{ year.fee | number: '1.2-2' }}
                      }
                    </td>
                    <td class="row-actions">
                      @if (editing() === year.fy_start) {
                        <button
                          mat-icon-button
                          type="button"
                          (click)="updateFee(year, editFee())"
                          matTooltip="Save fee"
                          aria-label="Save fee"
                        >
                          <mat-icon>check</mat-icon>
                        </button>
                        <button
                          mat-icon-button
                          type="button"
                          (click)="cancelEdit(year)"
                          matTooltip="Cancel"
                          aria-label="Cancel"
                        >
                          <mat-icon>close</mat-icon>
                        </button>
                      } @else {
                        <button
                          mat-icon-button
                          type="button"
                          (click)="startEdit(year)"
                          matTooltip="Change fee"
                          [attr.aria-label]="'Change fee for ' + label(year.fy_start)"
                        >
                          <mat-icon>edit</mat-icon>
                        </button>
                        <button
                          mat-icon-button
                          type="button"
                          class="danger"
                          (click)="remove(year)"
                          matTooltip="Remove year"
                          [attr.aria-label]="'Remove ' + label(year.fy_start)"
                        >
                          <mat-icon>delete_outline</mat-icon>
                        </button>
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="3">
                      <app-empty-state
                        icon="event_repeat"
                        [heading]="loading() ? 'Loading fees' : 'No subscription years yet'"
                        message="Add the current financial year below to start collecting subscriptions."
                        status
                      />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <form
          appEnterToNext
          class="panel"
          [formGroup]="addForm"
          (ngSubmit)="addYear()"
          aria-labelledby="add-year-heading"
        >
          <div class="panel-header"><h3 id="add-year-heading">Add a financial year</h3></div>
          <div class="panel-body">
            <div class="form-grid">
              <mat-form-field>
                <mat-label>Financial year</mat-label>
                <mat-select appEntrySelect formControlName="fy_start">
                  @for (fy of availableYears(); track fy) {
                    <mat-option [value]="fy">{{ label(fy) }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field>
                <mat-label>Yearly fee</mat-label>
                <input matInput type="number" min="0" step="0.01" formControlName="fee" />
                <mat-error>Enter a fee of zero or more.</mat-error>
              </mat-form-field>
            </div>
            <div class="form-actions">
              <button mat-flat-button type="submit" [disabled]="addForm.invalid || saving()">
                <mat-icon>add</mat-icon> Add year
              </button>
            </div>
          </div>
        </form>

        <form
          class="panel"
          aria-labelledby="sub-head-heading"
          appEnterToNext
          (submit)="$event.preventDefault(); saveHead()"
        >
          <div class="panel-header">
            <h3 id="sub-head-heading">Receipt account</h3>
            <span class="hint">Where subscription receipts are posted</span>
          </div>
          <div class="panel-body">
            <div class="form-grid">
              <mat-form-field class="wide">
                <mat-label>Account head</mat-label>
                <mat-select
                  appEntrySelect
                  [value]="headCode()"
                  (selectionChange)="headCode.set($event.value)"
                >
                  @for (head of heads(); track head.code) {
                    <mat-option [value]="head.code">{{ head.code }} – {{ head.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            </div>
            <div class="form-actions">
              <button
                mat-stroked-button
                type="submit"
                [disabled]="!headCode() || headCode() === savedHeadCode() || saving()"
              >
                Save account
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  `,
  styles: `
    .fee-group + .fee-group {
      margin-top: 32px;
    }
    .group-header {
      margin-bottom: 12px;
    }
    .group-header h2 {
      margin: 0;
    }
    .group-header p {
      margin: 4px 0 0;
      color: var(--text-muted);
      max-width: 68ch;
    }
    .fee-group .panel + .panel {
      margin-top: 20px;
    }
    .status-badge.success {
      margin-left: 8px;
    }
    .muted {
      color: var(--text-muted);
    }
  `,
})
export class SubscriptionFees implements OnInit {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly sb = inject(SupabaseService).client;
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);
  private readonly locale = inject(LOCALE_ID);

  protected readonly currentFy = fyStart();
  protected readonly label = fyLabel;
  protected readonly years = signal<SubscriptionYear[]>([]);
  protected readonly joiningFees = signal<JoiningFee[]>([]);
  protected readonly heads = signal<AccountHead[]>([]);
  protected readonly headCode = signal<number | null>(null);
  protected readonly savedHeadCode = signal<number | null>(null);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly editing = signal<number | null>(null);
  protected readonly editFee = signal(0);
  protected readonly editingJoining = signal<string | null>(null);
  protected readonly editJoiningFee = signal(0);

  /** The rate in force today: the newest one that has already started. */
  protected readonly currentJoining = computed(() => {
    const today = isoDate();
    return this.joiningFees().find((rate) => rate.effective_from <= today);
  });

  /** Five years back to two years ahead, minus years that already have a fee. */
  protected readonly availableYears = computed(() => {
    const taken = new Set(this.years().map((y) => y.fy_start));
    const options: number[] = [];
    for (let fy = this.currentFy + 2; fy >= this.currentFy - 5; fy--) {
      if (!taken.has(fy)) options.push(fy);
    }
    return options;
  });

  private readonly fb = inject(FormBuilder);

  protected readonly addForm = this.fb.group({
    fy_start: [null as number | null, Validators.required],
    fee: [null as number | null, [Validators.required, Validators.min(0)]],
  });

  protected readonly joiningForm = this.fb.group({
    effective_from: [null as Date | string | null, Validators.required],
    fee: [null as number | null, [Validators.required, Validators.min(0)]],
    head_code: [null as number | null, Validators.required],
    note: [''],
  });

  protected date(iso: string): string {
    return displayDate(iso, this.locale);
  }

  protected headName(code: number): string {
    const head = this.heads().find((h) => h.code === code);
    return head ? `${head.code} – ${head.name}` : String(code);
  }

  async ngOnInit(): Promise<void> {
    await this.load();
    const latest = this.years()[0];
    this.addForm.patchValue({
      fy_start: this.availableYears().includes(this.currentFy) ? this.currentFy : null,
      fee: latest?.fee ?? null,
    });
    const current = this.currentJoining();
    this.joiningForm.patchValue({
      fee: current?.fee ?? null,
      head_code: current?.head_code ?? null,
    });
  }

  // --------------------------------------------------------------------------
  // Joining fee
  // --------------------------------------------------------------------------

  protected async addJoiningFee(): Promise<void> {
    const { effective_from, fee, head_code, note } = this.joiningForm.getRawValue();
    if (this.joiningForm.invalid || !effective_from || fee === null || head_code === null) return;
    const from = effective_from instanceof Date ? isoDate(effective_from) : effective_from;
    this.saving.set(true);
    try {
      await must(
        this.sb
          .from('joining_fees')
          .insert({ effective_from: from, fee, head_code, note: note?.trim() || null }),
      );
      this.notify.success(`Joining fee of ${fee} effective ${this.date(from)} added`);
      await this.load();
      this.joiningForm.patchValue({ effective_from: null, note: '' });
    } catch (err) {
      // 23505: a rate already starts on this date.
      this.notify.error(err);
    } finally {
      this.saving.set(false);
    }
  }

  protected startJoiningEdit(rate: JoiningFee): void {
    this.editJoiningFee.set(Number(rate.fee));
    this.editingJoining.set(rate.effective_from);
    afterNextRender(
      () => {
        if (this.editingJoining() === rate.effective_from)
          this.host.nativeElement
            .querySelector<HTMLInputElement>(`[data-joining-rate="${rate.effective_from}"] input`)
            ?.focus();
      },
      { injector: this.injector },
    );
  }

  protected cancelJoiningEdit(rate: JoiningFee): void {
    this.editingJoining.set(null);
    afterNextRender(
      () => {
        if (this.editingJoining() === null)
          this.host.nativeElement
            .querySelector<HTMLButtonElement>(
              `[data-joining-rate="${rate.effective_from}"] button[aria-label^="Correct fee"]`,
            )
            ?.focus();
      },
      { injector: this.injector },
    );
  }

  protected handleJoiningKey(event: KeyboardEvent, rate: JoiningFee): void {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.keyCode === 229 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      (event.key !== 'Enter' && event.key !== 'Escape')
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    if (event.key === 'Escape') {
      this.cancelJoiningEdit(rate);
    } else {
      void this.updateJoiningFee(rate, this.editJoiningFee());
    }
  }

  protected async updateJoiningFee(rate: JoiningFee, fee: number): Promise<void> {
    if (!Number.isFinite(fee) || fee < 0) {
      this.notify.error(new Error('Enter a fee of zero or more.'));
      return;
    }
    try {
      await must(
        this.sb.from('joining_fees').update({ fee }).eq('effective_from', rate.effective_from),
      );
      this.notify.success(`Joining fee effective ${this.date(rate.effective_from)} corrected`);
      this.editingJoining.set(null);
      await this.load();
    } catch (err) {
      this.notify.error(err);
    }
  }

  protected async removeJoining(rate: JoiningFee): Promise<void> {
    const confirmed = await confirmAction(this.dialog, {
      title: `Remove the rate effective ${this.date(rate.effective_from)}?`,
      message:
        'Members who joined on or after this date fall back to the rate before it. Payments already recorded keep their own receipts.',
      confirmLabel: 'Remove rate',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await must(this.sb.from('joining_fees').delete().eq('effective_from', rate.effective_from));
      this.notify.success(`Rate effective ${this.date(rate.effective_from)} removed`);
      await this.load();
    } catch (err) {
      this.notify.error(err);
    }
  }

  // --------------------------------------------------------------------------
  // Subscription fee
  // --------------------------------------------------------------------------

  protected async addYear(): Promise<void> {
    const { fy_start, fee } = this.addForm.getRawValue();
    if (this.addForm.invalid || fy_start === null || fee === null) return;
    this.saving.set(true);
    try {
      await must(this.sb.from('subscription_years').insert({ fy_start, fee }));
      this.notify.success(`Fee for ${fyLabel(fy_start)} added`);
      await this.load();
      this.addForm.patchValue({ fy_start: null });
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.saving.set(false);
    }
  }

  protected startEdit(year: SubscriptionYear): void {
    this.editFee.set(Number(year.fee));
    this.editing.set(year.fy_start);
    afterNextRender(
      () => {
        if (this.editing() === year.fy_start)
          this.host.nativeElement
            .querySelector<HTMLInputElement>(`[data-fee-year="${year.fy_start}"] input`)
            ?.focus();
      },
      { injector: this.injector },
    );
  }

  protected cancelEdit(year: SubscriptionYear): void {
    this.editing.set(null);
    afterNextRender(
      () => {
        if (this.editing() === null)
          this.host.nativeElement
            .querySelector<HTMLButtonElement>(
              `[data-fee-year="${year.fy_start}"] button[aria-label^="Change fee"]`,
            )
            ?.focus();
      },
      { injector: this.injector },
    );
  }

  protected handleEditKey(event: KeyboardEvent, year: SubscriptionYear): void {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.keyCode === 229 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      (event.key !== 'Enter' && event.key !== 'Escape')
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    if (event.key === 'Escape') {
      this.cancelEdit(year);
    } else {
      void this.updateFee(year, this.editFee());
    }
  }

  protected async updateFee(year: SubscriptionYear, fee: number): Promise<void> {
    if (!Number.isFinite(fee) || fee < 0) {
      this.notify.error(new Error('Enter a fee of zero or more.'));
      return;
    }
    try {
      await must(this.sb.from('subscription_years').update({ fee }).eq('fy_start', year.fy_start));
      this.notify.success(
        `Fee for ${fyLabel(year.fy_start)} changed. Member balances use the new fee.`,
      );
      this.editing.set(null);
      await this.load();
    } catch (err) {
      this.notify.error(err);
    }
  }

  protected async remove(year: SubscriptionYear): Promise<void> {
    const confirmed = await confirmAction(this.dialog, {
      title: `Remove ${fyLabel(year.fy_start)}?`,
      message: 'Members will no longer owe a subscription for this year.',
      confirmLabel: 'Remove year',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await must(this.sb.from('subscription_years').delete().eq('fy_start', year.fy_start));
      this.notify.success(`${fyLabel(year.fy_start)} removed`);
      await this.load();
    } catch (err) {
      // 23503: payments already recorded for this year.
      this.notify.error(err);
    }
  }

  protected async saveHead(): Promise<void> {
    const code = this.headCode();
    if (!code) return;
    this.saving.set(true);
    try {
      await must(
        this.sb.from('company_settings').update({ subscription_head_code: code }).eq('id', true),
      );
      this.savedHeadCode.set(code);
      this.notify.success('Subscription receipt account saved');
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.saving.set(false);
    }
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [years, joining, heads, settings] = await Promise.all([
        must(
          this.sb
            .from('subscription_years')
            .select('fy_start, fee')
            .order('fy_start', { ascending: false }),
        ),
        must(
          this.sb
            .from('joining_fees')
            .select('effective_from, fee, head_code, note')
            .order('effective_from', { ascending: false }),
        ),
        must(
          this.sb
            .from('account_heads')
            .select('code, name')
            .eq('account_type', 'income')
            .order('name'),
        ),
        must(
          this.sb
            .from('company_settings')
            .select('subscription_head_code')
            .maybeSingle<{ subscription_head_code: number | null }>(),
        ),
      ]);
      this.years.set(years as SubscriptionYear[]);
      this.joiningFees.set(joining as JoiningFee[]);
      this.heads.set(heads as AccountHead[]);
      this.headCode.set(settings?.subscription_head_code ?? null);
      this.savedHeadCode.set(settings?.subscription_head_code ?? null);
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.loading.set(false);
    }
  }
}
