import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { AuthService } from '../../core/auth.service';
import { SubscriptionStatusRow } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { must, SupabaseService } from '../../core/supabase.service';
import { downloadCsv } from '../../shared/csv';
import { fyLabel, fyStart } from '../../shared/fy';
import { ReportShell } from '../../shared/report-shell';

type StatusFilter = 'all' | 'due' | 'paid';

@Component({
  selector: 'app-subscriptions',
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    ReportShell,
  ],
  template: `
    <div class="page">
      <div class="page-header no-print">
        <div class="page-heading">
          <span class="eyebrow">Membership</span>
          <h1>Subscriptions</h1>
          <p class="page-description">
            Who has paid for the year, who still owes, and arrears carried from earlier years.
          </p>
        </div>
        @if (auth.isAdmin()) {
          <a mat-stroked-button routerLink="/membership/fees"><mat-icon>settings</mat-icon> Fees</a>
        }
      </div>

      <app-report-shell
        title="Subscription Status"
        [subtitle]="'Financial year ' + label(fy())"
        [loading]="loading()"
        [hasData]="filtered().length > 0"
        (csv)="exportCsv()"
      >
        <div filters class="filter-row">
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>Financial year</mat-label>
            <mat-select [value]="fy()" (selectionChange)="selectYear($event.value)">
              @for (year of yearOptions(); track year) {
                <mat-option [value]="year">{{ label(year) }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-button-toggle-group
            [value]="status()"
            (change)="status.set($event.value)"
            aria-label="Filter by status"
          >
            <mat-button-toggle value="all">All</mat-button-toggle>
            <mat-button-toggle value="due">Owing</mat-button-toggle>
            <mat-button-toggle value="paid">Paid up</mat-button-toggle>
          </mat-button-toggle-group>
          <mat-form-field subscriptSizing="dynamic" class="search-field">
            <mat-label>Search</mat-label>
            <mat-icon matPrefix>search</mat-icon>
            <input
              matInput
              placeholder="Name, code or phone"
              [value]="query()"
              (input)="query.set($any($event.target).value)"
            />
          </mat-form-field>
        </div>

        @if (!loading() && !yearOptions().length) {
          <div class="empty-state">
            <div class="empty-icon"><mat-icon>event_repeat</mat-icon></div>
            <h3>No subscription fees set up</h3>
            <p>An admin needs to add the fee for a financial year first.</p>
          </div>
        } @else {
          <div class="summary-grid">
            <div class="summary-card">
              <div>
                <span class="summary-label">Members due {{ label(fy()) }}</span>
                <strong class="summary-value">{{ totals().members }}</strong>
              </div>
              <div class="summary-icon"><mat-icon>group</mat-icon></div>
            </div>
            <div class="summary-card">
              <div>
                <span class="summary-label">Collected {{ label(fy()) }}</span>
                <strong class="summary-value">{{ totals().paid | number: '1.2-2' }}</strong>
              </div>
              <div class="summary-icon"><mat-icon>savings</mat-icon></div>
            </div>
            <div class="summary-card">
              <div>
                <span class="summary-label">Still owed {{ label(fy()) }}</span>
                <strong class="summary-value">{{ totals().yearBalance | number: '1.2-2' }}</strong>
              </div>
              <div class="summary-icon"><mat-icon>pending_actions</mat-icon></div>
            </div>
            <div class="summary-card">
              <div>
                <span class="summary-label">Arrears from earlier years</span>
                <strong class="summary-value" [class.danger]="totals().arrears > 0">{{
                  totals().arrears | number: '1.2-2'
                }}</strong>
              </div>
              <div class="summary-icon"><mat-icon>history</mat-icon></div>
            </div>
          </div>

          <div
            class="table-wrap"
            tabindex="0"
            role="region"
            aria-label="Subscription status by member"
          >
            <table class="report-table">
              <thead>
                <tr>
                  <th class="num">Code</th>
                  <th>Member</th>
                  <th>Phone</th>
                  <th class="num">Fee</th>
                  <th class="num">Paid</th>
                  <th class="num">Balance</th>
                  <th class="num">Arrears</th>
                  <th class="num">Total due</th>
                  <th>Last paid</th>
                  <th class="no-print">Status</th>
                </tr>
              </thead>
              <tbody>
                @for (row of filtered(); track row.member_code) {
                  <tr class="clickable" (click)="open(row.member_code)">
                    <td class="num">{{ row.member_code }}</td>
                    <td>
                      <a
                        class="table-link"
                        [routerLink]="['/masters/members', row.member_code]"
                        (click)="$event.stopPropagation()"
                        >{{ row.member_name }}</a
                      >
                    </td>
                    <td>{{ row.phone || '—' }}</td>
                    <td class="num">{{ row.year_fee | number: '1.2-2' }}</td>
                    <td class="num">{{ row.year_paid | number: '1.2-2' }}</td>
                    <td class="num">{{ row.year_balance | number: '1.2-2' }}</td>
                    <td class="num">{{ row.arrears | number: '1.2-2' }}</td>
                    <td class="num">
                      <strong>{{ row.total_due | number: '1.2-2' }}</strong>
                    </td>
                    <td>{{ row.last_paid_on ? (row.last_paid_on | date: 'dd MMM yyyy') : '—' }}</td>
                    <td class="no-print">
                      @if (row.total_due <= 0) {
                        <span class="status-badge success">Paid up</span>
                      } @else if (row.arrears > 0) {
                        <span class="status-badge warning">Arrears</span>
                      } @else if (row.year_paid > 0) {
                        <span class="status-badge warning">Part paid</span>
                      } @else {
                        <span class="status-badge neutral">Due</span>
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="10">
                      <div class="empty-state" role="status">
                        <h3>{{ loading() ? 'Loading…' : 'No members match' }}</h3>
                        <p>{{ loading() ? '' : 'Try another year, status or search.' }}</p>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
              @if (filtered().length) {
                <tfoot>
                  <tr>
                    <td colspan="3">Total ({{ filtered().length }} members)</td>
                    <td class="num">{{ shownTotals().fee | number: '1.2-2' }}</td>
                    <td class="num">{{ shownTotals().paid | number: '1.2-2' }}</td>
                    <td class="num">{{ shownTotals().balance | number: '1.2-2' }}</td>
                    <td class="num">{{ shownTotals().arrears | number: '1.2-2' }}</td>
                    <td class="num">{{ shownTotals().due | number: '1.2-2' }}</td>
                    <td colspan="2"></td>
                  </tr>
                </tfoot>
              }
            </table>
          </div>
        }
      </app-report-shell>
    </div>
  `,
  styles: `
    .summary-grid {
      margin: 0 0 20px;
    }
    .summary-card {
      box-shadow: none;
      justify-content: space-between;
    }
    tr.clickable {
      cursor: pointer;
    }
  `,
})
export class Subscriptions implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly sb = inject(SupabaseService).client;
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);

  protected readonly label = fyLabel;
  protected readonly fy = signal(fyStart());
  protected readonly yearOptions = signal<number[]>([]);
  protected readonly rows = signal<SubscriptionStatusRow[]>([]);
  protected readonly status = signal<StatusFilter>('all');
  protected readonly query = signal('');
  protected readonly loading = signal(true);

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.rows().filter((row) => {
      if (this.status() === 'due' && row.total_due <= 0) return false;
      if (this.status() === 'paid' && row.total_due > 0) return false;
      return (
        !q ||
        row.member_name.toLowerCase().includes(q) ||
        String(row.member_code).startsWith(q) ||
        (row.phone ?? '').includes(q)
      );
    });
  });

  protected readonly totals = computed(() => {
    const rows = this.rows();
    return {
      members: rows.filter((r) => r.due_this_year).length,
      paid: sum(rows, (r) => r.year_paid),
      yearBalance: sum(rows, (r) => Math.max(0, Number(r.year_balance))),
      arrears: sum(rows, (r) => Math.max(0, Number(r.arrears))),
    };
  });

  protected readonly shownTotals = computed(() => {
    const rows = this.filtered();
    return {
      fee: sum(rows, (r) => r.year_fee),
      paid: sum(rows, (r) => r.year_paid),
      balance: sum(rows, (r) => r.year_balance),
      arrears: sum(rows, (r) => r.arrears),
      due: sum(rows, (r) => r.total_due),
    };
  });

  async ngOnInit(): Promise<void> {
    try {
      const years = await must(
        this.sb
          .from('subscription_years')
          .select('fy_start')
          .order('fy_start', { ascending: false }),
      );
      const options = (years as { fy_start: number }[]).map((y) => y.fy_start);
      this.yearOptions.set(options);
      if (options.length && !options.includes(this.fy())) {
        this.fy.set(options.find((y) => y <= fyStart()) ?? options[0]);
      }
      if (options.length) {
        await this.load();
      }
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  protected async selectYear(fy: number): Promise<void> {
    this.fy.set(fy);
    await this.load();
  }

  protected open(code: number): void {
    this.router.navigate(['/masters/members', code]);
  }

  protected exportCsv(): void {
    downloadCsv(
      `subscriptions-${fyLabel(this.fy())}.csv`,
      ['Code', 'Member', 'Phone', 'Fee', 'Paid', 'Balance', 'Arrears', 'Total due', 'Last paid'],
      this.filtered().map((r) => [
        r.member_code,
        r.member_name,
        r.phone,
        r.year_fee,
        r.year_paid,
        r.year_balance,
        r.arrears,
        r.total_due,
        r.last_paid_on,
      ]),
    );
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.rows.set(await must(this.sb.rpc('rpt_subscription_status', { p_fy: this.fy() })));
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.loading.set(false);
    }
  }
}

function sum(rows: SubscriptionStatusRow[], pick: (row: SubscriptionStatusRow) => number): number {
  return rows.reduce((total, row) => total + Number(pick(row)), 0);
}
