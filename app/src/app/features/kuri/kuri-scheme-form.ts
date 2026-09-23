import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatIconModule } from '@angular/material/icon';
import { DecimalPipe } from '@angular/common';

import { PageHeader } from '../../shared/page-header';
import { EnterToNext } from '../../shared/enter-to-next.directive';
import { HasPendingChanges } from '../../core/pending-changes';
import { NotifyService } from '../../core/notify.service';
import { KuriService } from './kuri.service';

@Component({
  selector: 'app-kuri-scheme-form',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatIconModule,
    RouterLink,
    PageHeader,
    EnterToNext,
    DecimalPipe,
  ],
  template: `
    <div class="page">
      <app-page-header
        eyebrow="Kuri"
        heading="New Kuri Scheme"
        description="The payout schedule below is worked out from these figures and cannot be edited later."
      >
        <a mat-stroked-button routerLink="/kuri/schemes"
          ><mat-icon>arrow_back</mat-icon> All schemes</a
        >
      </app-page-header>

      <form [formGroup]="form" (ngSubmit)="save()" appEnterToNext class="scheme-form">
        <section class="panel" aria-labelledby="scheme-details-heading">
          <div class="panel-header"><h2 id="scheme-details-heading">Scheme details</h2></div>
          <div class="panel-body form-grid">
            <mat-form-field subscriptSizing="dynamic" class="wide">
              <mat-label>Name</mat-label>
              <input matInput formControlName="name" maxlength="80" placeholder="e.g. Daily 1000" />
              <mat-error>Enter a name for the scheme.</mat-error>
            </mat-form-field>

            <mat-form-field subscriptSizing="dynamic">
              <mat-label>Installment amount</mat-label>
              <input
                matInput
                type="number"
                formControlName="installment_amount"
                min="0.01"
                step="0.01"
              />
              <mat-error>Enter a positive amount with at most two decimal places.</mat-error>
            </mat-form-field>

            <mat-form-field subscriptSizing="dynamic">
              <mat-label>Number of members</mat-label>
              <input
                matInput
                type="number"
                formControlName="num_members"
                min="2"
                max="32766"
                step="1"
              />
              <mat-hint>One ticket each; the scheme runs for one more month than this.</mat-hint>
              <mat-error>Enter a whole number from 2 to 32,766.</mat-error>
            </mat-form-field>

            <mat-form-field subscriptSizing="dynamic">
              <mat-label>Max deduction %</mat-label>
              <input matInput type="number" formControlName="max_deduction_pct" step="0.01" />
              <mat-error>Enter a percentage between 0 and 100.</mat-error>
            </mat-form-field>

            <mat-form-field subscriptSizing="dynamic">
              <mat-label>Start date (optional)</mat-label>
              <input
                matInput
                [matDatepicker]="picker"
                formControlName="start_date"
                placeholder="dd/mm/yyyy"
              />
              <mat-datepicker-toggle matIconSuffix [for]="picker" />
              <mat-datepicker #picker />
              <mat-error>Enter a valid date as dd/mm/yyyy.</mat-error>
            </mat-form-field>

            <mat-form-field subscriptSizing="dynamic" class="wide">
              <mat-label>Notes</mat-label>
              <textarea matInput formControlName="notes" rows="3"></textarea>
            </mat-form-field>
          </div>
        </section>

        <section class="panel" aria-labelledby="scheme-preview-heading">
          <div class="panel-header"><h2 id="scheme-preview-heading">Payout preview</h2></div>
          <div class="panel-body">
            <dl class="preview-stats">
              <div class="stat">
                <dt>Total kuri value</dt>
                <dd>{{ totalValue() | number: '1.2-2' }}</dd>
              </div>
              <div class="stat">
                <dt>First lot payout</dt>
                <dd>{{ firstLotPayout() | number: '1.2-2' }}</dd>
              </div>
              <div class="stat">
                <dt>Last lot payout</dt>
                <dd>{{ lastLotPayout() | number: '1.2-2' }}</dd>
              </div>
              <div class="stat">
                <dt>Increment per lot</dt>
                <dd>{{ incrementPerLot() | number: '1.2-2' }}</dd>
              </div>
              <div class="stat">
                <dt>Number of installments</dt>
                <dd>{{ numInstallments() }}</dd>
              </div>
            </dl>
            <p class="hint">
              Installment 1 is collection only. Lots are drawn from installment 2 onwards, one per
              member.
            </p>
          </div>
        </section>

        <div class="form-actions full">
          <button mat-flat-button type="submit" [disabled]="form.invalid || saving()">
            <mat-icon>check</mat-icon>
            {{ saving() ? 'Saving…' : 'Create scheme' }}
          </button>
          <button mat-button type="button" (click)="cancel()">Cancel</button>
        </div>
      </form>
    </div>
  `,
  styles: `
    .scheme-form {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .scheme-form > .panel + .panel {
      margin-top: 0;
    }
    .preview-stats {
      margin: 0;
      display: grid;
      gap: 10px;
    }
    .stat {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--app-border-subtle);
    }
    .stat:last-child {
      border-bottom: 0;
      padding-bottom: 0;
    }
    .stat dt {
      color: var(--app-muted);
    }
    .stat dd {
      margin: 0;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class KuriSchemeForm implements HasPendingChanges {
  private readonly fb = inject(FormBuilder);
  private readonly kuri = inject(KuriService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);

  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    name: this.fb.nonNullable.control('', [Validators.required, Validators.pattern(/\S/)]),
    installment_amount: this.fb.nonNullable.control(0, [
      Validators.required,
      Validators.min(0.01),
      Validators.max(9999999999.99),
      Validators.pattern(/^\d+(\.\d{1,2})?$/),
    ]),
    num_members: this.fb.nonNullable.control(25, [
      Validators.required,
      Validators.min(2),
      Validators.max(32766),
      Validators.pattern(/^\d+$/),
    ]),
    max_deduction_pct: this.fb.nonNullable.control(20.4, [
      Validators.required,
      Validators.min(0.01),
      Validators.max(99.99),
      Validators.pattern(/^\d+(\.\d{1,2})?$/),
    ]),
    start_date: this.fb.control<string | null>(null),
    notes: this.fb.control<string | null>(null),
  });

  private readonly formValue = signal(this.form.getRawValue());

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.formValue.set(this.form.getRawValue());
    });
  }

  protected readonly totalValue = computed(() => {
    const val = this.formValue();
    return val.num_members * val.installment_amount;
  });

  protected readonly firstLotPayout = computed(() => {
    const val = this.formValue();
    const total = this.totalValue();
    return total * (1 - val.max_deduction_pct / 100);
  });

  protected readonly lastLotPayout = computed(() => this.totalValue());

  protected readonly incrementPerLot = computed(() => {
    const val = this.formValue();
    const total = this.totalValue();
    if (val.num_members <= 1) return 0;
    return (total * (val.max_deduction_pct / 100)) / (val.num_members - 1);
  });

  protected readonly numInstallments = computed(() => this.formValue().num_members + 1);

  hasPendingChanges(): boolean {
    return this.form.dirty;
  }

  protected cancel(): void {
    this.router.navigate(['/kuri/schemes']);
  }

  protected async save(): Promise<void> {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    try {
      const val = this.form.getRawValue();
      await this.kuri.createScheme({
        p_name: val.name,
        p_installment_amount: val.installment_amount,
        p_num_members: val.num_members,
        p_max_deduction_pct: val.max_deduction_pct,
        p_start_date: val.start_date || null,
        p_notes: val.notes || null,
      });
      this.notify.success('Scheme created successfully');
      this.form.markAsPristine();
      this.router.navigate(['/kuri/schemes']);
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.saving.set(false);
    }
  }
}
