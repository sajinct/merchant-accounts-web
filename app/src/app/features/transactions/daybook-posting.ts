import { FinancialYearScope } from '../../shared/financial-year-scope';
import { FinancialYearNotice } from '../../shared/financial-year-notice';
import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatInputModule } from '@angular/material/input';
import { NotifyService } from '../../core/notify.service';
import { must, SupabaseService } from '../../core/supabase.service';
import { addDays, isoDate } from '../../shared/dates';
import { PageHeader } from '../../shared/page-header';
import { EnterToNext } from '../../shared/enter-to-next.directive';

@Component({
  selector: 'app-daybook-posting',
  imports: [
    EnterToNext,
    PageHeader,
    FinancialYearScope,
    FinancialYearNotice,
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatDatepickerModule,
    MatInputModule,
  ],
  template: `
    <div class="page narrow-page posting-page">
      <app-page-header
        eyebrow="Transactions"
        heading="Ledger verification"
        description="Entries post immediately with balanced debits and credits. Verify a selected period here."
      />

      <div class="panel posting-status">
        <div class="summary-icon"><mat-icon>event_available</mat-icon></div>
        <div>
          <span class="summary-label">Latest day book date</span>
          <strong>{{
            loading()
              ? 'Loading…'
              : dateUnavailable()
                ? 'Unavailable'
                : lastDate()
                  ? (lastDate() | date: 'dd MMM yyyy')
                  : 'No entries yet'
          }}</strong>
        </div>
        @if (lastDate()) {
          <span class="status-badge neutral">Recorded</span>
        }
      </div>

      <app-financial-year-notice />
      <form
        appEnterToNext
        [appFinancialYearScope]="'report'"
        class="panel"
        [formGroup]="form"
        (ngSubmit)="post()"
      >
        <div class="panel-header">
          <div>
            <h2>Select verification period</h2>
            <p class="hint">Include the dates you want to verify.</p>
          </div>
          <mat-icon class="panel-symbol">date_range</mat-icon>
        </div>
        <div class="panel-body">
          <div class="form-grid">
            <mat-form-field>
              <mat-label>From date</mat-label>
              <input
                matInput
                [matDatepicker]="fromPicker"
                formControlName="from"
                placeholder="dd/mm/yyyy"
              /><mat-datepicker-toggle matIconSuffix [for]="fromPicker" /><mat-datepicker
                #fromPicker
              />
            </mat-form-field>
            <mat-form-field>
              <mat-label>To date</mat-label>
              <input
                matInput
                [matDatepicker]="toPicker"
                formControlName="to"
                placeholder="dd/mm/yyyy"
              /><mat-datepicker-toggle matIconSuffix [for]="toPicker" /><mat-datepicker #toPicker />
            </mat-form-field>
          </div>
          <div class="posting-note">
            <mat-icon>info_outline</mat-icon>
            <p>
              Verification checks every journal in the period. It does not rebuild, delete or
              duplicate entries.
            </p>
          </div>
          <div class="form-actions">
            <button mat-flat-button type="submit" [disabled]="form.invalid || busy() || loading()">
              <mat-icon>publish</mat-icon> {{ busy() ? 'Verifying…' : 'Verify ledger' }}
            </button>
          </div>
        </div>
      </form>

      @if (lastPosting(); as result) {
        <div class="posting-result" role="status">
          <mat-icon>check_circle</mat-icon>
          <div>
            <strong
              >Verification complete · {{ result.count }}
              {{ result.count === 1 ? 'entry' : 'entries' }}</strong
            >
            <p>{{ result.from | date: 'dd MMM yyyy' }} – {{ result.to | date: 'dd MMM yyyy' }}</p>
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .posting-page {
      max-width: 780px;
    }
    .posting-status {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 18px 20px;
      margin-bottom: 20px;
    }
    .posting-status strong {
      display: block;
      font-size: 17px;
      font-weight: 650;
      margin-top: 4px;
    }
    .posting-status .status-badge {
      margin-left: auto;
    }
    .panel-header .hint {
      margin: 4px 0 0;
    }
    .panel-symbol {
      color: var(--app-symbol-ink);
    }
    .posting-note {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 13px 15px;
      background: var(--app-note-bg);
      border: 1px solid var(--app-note-border);
      border-radius: 8px;
      margin-bottom: 20px;
    }
    .posting-note mat-icon {
      flex: 0 0 19px;
      font-size: 19px;
      height: 19px;
      color: var(--app-note-icon);
      margin-top: 1px;
    }
    .posting-note p {
      margin: 0;
      color: var(--app-note-ink);
      font-size: 12px;
      line-height: 1.7;
    }
    .form-actions {
      margin: 0;
    }
    .posting-result {
      display: flex;
      gap: 12px;
      align-items: center;
      padding: 16px 18px;
      margin-top: 18px;
      border: 1px solid var(--app-confirm-border);
      background: var(--app-confirm-bg);
      border-radius: 10px;
      color: var(--app-confirm-ink);
      font-size: 13px;
    }
    .posting-result p {
      margin: 5px 0 0;
      font-size: 12px;
    }
    @media (max-width: 480px) {
      .posting-status {
        padding: 16px;
        gap: 10px;
      }
      .posting-status .status-badge {
        display: none;
      }
      .form-grid {
        grid-template-columns: minmax(0, 1fr);
      }
      .form-actions button {
        width: 100%;
      }
    }
  `,
})
export class DaybookPosting implements OnInit {
  private readonly sb = inject(SupabaseService).client;
  private readonly notify = inject(NotifyService);

  protected readonly busy = signal(false);
  protected readonly loading = signal(true);
  protected readonly dateUnavailable = signal(false);
  protected readonly lastDate = signal<string | null>(null);
  protected readonly lastPosting = signal<{ count: number; from: string; to: string } | null>(null);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    from: [isoDate(), Validators.required],
    to: [isoDate(), Validators.required],
  });

  async ngOnInit(): Promise<void> {
    try {
      const last = await must(this.sb.rpc('daybook_last_date'));
      this.lastDate.set(last as string | null);
      if (last) {
        const next = addDays(last as string, 1);
        this.form.patchValue({ from: next <= isoDate() ? next : isoDate() });
      }
    } catch (err) {
      this.dateUnavailable.set(true);
      this.notify.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  protected async post(): Promise<void> {
    if (this.form.invalid || this.busy()) return;
    const { from, to } = this.form.getRawValue();
    if (from > to) {
      this.notify.error(new Error('"From" date must not be after "To" date.'));
      return;
    }
    this.busy.set(true);
    try {
      const count = await must(this.sb.rpc('post_daybook', { p_from: from, p_to: to }));
      this.lastPosting.set({ count: Number(count), from, to });
      this.notify.success(`Ledger verification completed: ${count} entries.`);
      this.lastDate.set((await must(this.sb.rpc('daybook_last_date'))) as string | null);
      this.dateUnavailable.set(false);
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.busy.set(false);
    }
  }
}
