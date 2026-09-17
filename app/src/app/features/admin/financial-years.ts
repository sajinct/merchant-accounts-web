import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { FinancialYear, FinancialYearService } from '../../core/financial-year.service';
import { AccountHead } from '../../core/models';
import { must, SupabaseService } from '../../core/supabase.service';
import { NotifyService } from '../../core/notify.service';
import { fyLabel, fyStart } from '../../shared/fy';
import { confirmAction } from '../../shared/confirm-dialog';
import { PageHeader } from '../../shared/page-header';
import { EnterToNext } from '../../shared/enter-to-next.directive';
import { EntrySelect } from '../../shared/entry-select.directive';

@Component({
  selector: 'app-financial-years',
  imports: [
    EnterToNext,
    EntrySelect,
    PageHeader,
    FormsModule,
    DatePipe,
    DecimalPipe,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `<div class="page narrow-page">
    <app-page-header
      eyebrow="Accounting setup"
      heading="Financial years"
      description="April 1 to March 31. Close a year to transfer its result to equity and lock its entries."
    />
    <form class="panel" appEnterToNext (ngSubmit)="create()" aria-label="Create a financial year">
      <div class="panel-body">
        <div class="form-grid">
          <mat-form-field
            ><mat-label>Starting year</mat-label
            ><input
              matInput
              type="number"
              min="1900"
              max="9998"
              name="newYear"
              [(ngModel)]="newYear"
          /></mat-form-field>
          <button mat-flat-button type="submit" [disabled]="busy()">Create year</button>
        </div>
        <p class="hint">
          Balances carry forward through the ledger automatically. Do not re-enter opening balances
          when moving to the next year.
        </p>
      </div>
    </form>
    <section class="panel years">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Financial year</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (year of fy.years(); track year.start_year) {
              <tr>
                <td>
                  {{ label(year.start_year) }}
                  <div class="hint">
                    {{ year.starts_on | date: 'dd MMM yyyy' }} –
                    {{ year.ends_on | date: 'dd MMM yyyy' }}
                  </div>
                </td>
                <td>{{ year.closed_at ? 'Closed' : 'Open' }}</td>
                <td>
                  @if (!year.closed_at) {
                    <button mat-button (click)="review(year)" [disabled]="busy()">
                      Review & close
                    </button>
                  } @else {
                    <button mat-button (click)="reopen(year)" [disabled]="busy()">Reopen</button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>
    @if (reviewing(); as year) {
      <form
        class="panel years"
        appEnterToNext
        (ngSubmit)="close()"
        aria-label="Close a financial year"
      >
        <div class="panel-header">
          <h2>Close {{ label(year.start_year) }}</h2>
        </div>
        <div class="panel-body">
          <p>
            Income: <strong>{{ summary().income | number: '1.2-2' }}</strong> · Expenses:
            <strong>{{ summary().expense | number: '1.2-2' }}</strong>
          </p>
          <p>
            Net result: <strong>{{ summary().net_result | number: '1.2-2' }}</strong>
          </p>
          <mat-form-field
            ><mat-label>Retained earnings / equity account</mat-label
            ><mat-select appEntrySelect name="equity" [(ngModel)]="equity">
              @for (account of accounts(); track account.code) {
                <mat-option [value]="account.code">{{ account.name }}</mat-option>
              }</mat-select
            ><mat-hint
              >Create an equity account in Account heads if needed.</mat-hint
            ></mat-form-field
          >
          <p class="hint">
            Closing transfers income/expense balances, locks posting and cancellation in this year,
            and creates the next year. Cash, bank, asset and liability balances remain intact. You
            can close only once the year has ended and earlier years are closed.
          </p>
          <div class="form-actions">
            <button mat-flat-button type="submit" [disabled]="busy() || !equity">
              Close and lock year</button
            ><button mat-button type="button" (click)="reviewing.set(null)" [disabled]="busy()">
              Cancel
            </button>
          </div>
        </div>
      </form>
    }
  </div>`,
  styles: `
    .years {
      margin-top: 20px;
    }
    mat-form-field {
      width: 100%;
    }
    .form-grid {
      align-items: start;
    }
    .form-grid > button {
      min-height: 44px;
    }
  `,
})
export class FinancialYears implements OnInit {
  protected readonly fy = inject(FinancialYearService);
  private readonly sb = inject(SupabaseService).client;
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);
  protected readonly label = fyLabel;
  protected newYear = fyStart() + 1;
  protected equity: number | null = null;
  protected readonly accounts = signal<AccountHead[]>([]);
  protected readonly busy = signal(false);
  protected readonly reviewing = signal<FinancialYear | null>(null);
  protected readonly summary = signal({ income: 0, expense: 0, net_result: 0 });
  async ngOnInit() {
    try {
      await this.fy.load();
      this.accounts.set(
        await must(
          this.sb
            .from('account_heads')
            .select('code,name')
            .eq('account_type', 'equity')
            .order('name'),
        ),
      );
    } catch (error) {
      this.notify.error(error);
    }
  }
  protected async create() {
    if (
      this.busy() ||
      !Number.isInteger(this.newYear) ||
      this.newYear < 1900 ||
      this.newYear > 9998
    )
      return;
    this.busy.set(true);
    try {
      await must(this.sb.rpc('create_financial_year', { p_start_year: this.newYear }));
      await this.fy.load();
      this.notify.success('Financial year is available');
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.busy.set(false);
    }
  }
  protected async review(year: FinancialYear) {
    this.busy.set(true);
    this.reviewing.set(null);
    try {
      const rows = await must(
        this.sb.rpc('financial_year_summary', { p_start_year: year.start_year }),
      );
      this.summary.set(rows[0]);
      this.reviewing.set(year);
      this.equity = year.equity_account_code;
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.busy.set(false);
    }
  }
  protected async close() {
    const year = this.reviewing();
    if (!year || !this.equity || this.busy()) return;
    this.busy.set(true);
    try {
      await must(
        this.sb.rpc('close_financial_year', {
          p_start_year: year.start_year,
          p_equity_account_code: this.equity,
        }),
      );
      this.reviewing.set(null);
      await this.fy.load();
      this.notify.success('Financial year closed; balances carry forward automatically');
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.busy.set(false);
    }
  }
  protected async reopen(year: FinancialYear) {
    if (this.busy()) return;
    const result = await confirmAction(this.dialog, {
      title: `Reopen ${this.label(year.start_year)}?`,
      message:
        'The closing entry is reversed and posting is allowed again. The reopening is recorded in the audit log.',
      fields: [{ key: 'reason', label: 'Reason for reopening', required: true, maxLength: 500 }],
      confirmLabel: 'Reopen year',
      destructive: true,
    });
    if (!result || this.busy()) return;
    const reason = result['reason'];
    this.busy.set(true);
    try {
      await must(
        this.sb.rpc('reopen_financial_year', { p_start_year: year.start_year, p_reason: reason }),
      );
      await this.fy.load();
      this.notify.success('Year reopened with an audited reversal of its closing entry');
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.busy.set(false);
    }
  }
}
