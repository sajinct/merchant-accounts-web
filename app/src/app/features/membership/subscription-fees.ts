import { DecimalPipe } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  OnInit,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AccountHead, SubscriptionYear } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { must, SupabaseService } from '../../core/supabase.service';
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
        heading="Subscription fees"
        description="Set the yearly subscription fee for each financial year (April to March). Every member owes the fee for each year from when they joined until they leave."
      />

      <section class="panel" aria-labelledby="fee-years-heading">
        <div class="panel-header">
          <h2 id="fee-years-heading">Fees by financial year</h2>
          <span class="status-badge neutral">{{ years().length }} years</span>
        </div>
        <div class="table-wrap" tabindex="0" role="region" aria-label="Subscription fees">
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
      </section>

      <form
        appEnterToNext
        class="panel"
        [formGroup]="addForm"
        (ngSubmit)="addYear()"
        aria-labelledby="add-year-heading"
      >
        <div class="panel-header"><h2 id="add-year-heading">Add a financial year</h2></div>
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
          <h2 id="sub-head-heading">Receipt account</h2>
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
    </div>
  `,
  styles: `
    .panel + form.panel,
    form.panel + .panel {
      margin-top: 20px;
    }
    .status-badge.success {
      margin-left: 8px;
    }
  `,
})
export class SubscriptionFees implements OnInit {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly sb = inject(SupabaseService).client;
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);

  protected readonly currentFy = fyStart();
  protected readonly label = fyLabel;
  protected readonly years = signal<SubscriptionYear[]>([]);
  protected readonly heads = signal<AccountHead[]>([]);
  protected readonly headCode = signal<number | null>(null);
  protected readonly savedHeadCode = signal<number | null>(null);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly editing = signal<number | null>(null);
  protected readonly editFee = signal(0);

  /** Five years back to two years ahead, minus years that already have a fee. */
  protected readonly availableYears = computed(() => {
    const taken = new Set(this.years().map((y) => y.fy_start));
    const options: number[] = [];
    for (let fy = this.currentFy + 2; fy >= this.currentFy - 5; fy--) {
      if (!taken.has(fy)) options.push(fy);
    }
    return options;
  });

  protected readonly addForm = inject(FormBuilder).group({
    fy_start: [null as number | null, Validators.required],
    fee: [null as number | null, [Validators.required, Validators.min(0)]],
  });

  async ngOnInit(): Promise<void> {
    await this.load();
    const latest = this.years()[0];
    this.addForm.patchValue({
      fy_start: this.availableYears().includes(this.currentFy) ? this.currentFy : null,
      fee: latest?.fee ?? null,
    });
  }

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
      const [years, heads, settings] = await Promise.all([
        must(
          this.sb
            .from('subscription_years')
            .select('fy_start, fee')
            .order('fy_start', { ascending: false }),
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
