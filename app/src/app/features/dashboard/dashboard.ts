import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AuthService } from '../../core/auth.service';
import { FinancialYearService } from '../../core/financial-year.service';
import { DaybookRow, SubscriptionDuesSummary, VoucherType } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { voucherRef } from '../../core/voucher-types';
import { must, SupabaseService } from '../../core/supabase.service';
import { addDays, isoDate } from '../../shared/dates';
import { CashFlowChart } from './cash-flow-chart';
import { CashSummary, summariseCash } from './dashboard-data';
import { PageHeader } from '../../shared/page-header';
import { EmptyState } from '../../shared/empty-state';

const CHART_DAYS = 7;
const RECENT_LIMIT = 6;

interface RecentVoucher {
  id: number;
  voucher_type: VoucherType;
  voucher_no: number;
  voucher_date: string;
  total_amount: number;
  narration: string;
  reference_no: string | null;
}

interface YearResult {
  income: number;
  expense: number;
  net_result: number;
}

@Component({
  selector: 'app-dashboard',
  imports: [
    EmptyState,
    PageHeader,
    DatePipe,
    DecimalPipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    CashFlowChart,
  ],
  template: `
    <div class="page">
      <app-page-header
        [eyebrow]="(today | date: 'EEEE, d MMMM yyyy') ?? ''"
        [heading]="'Welcome back, ' + firstName()"
      >
        <p description class="page-description">
          @if (isToday()) {
            Here is where your accounts stand today.
          } @else {
            Showing figures as on <strong>{{ asOn() | date: 'dd-MMM-yyyy' }}</strong
            >, the nearest date in the selected financial year.
          }
        </p>
        <span class="status-badge" [class.success]="!fy.closed()" [class.warning]="fy.closed()">
          <mat-icon>{{ fy.closed() ? 'lock' : 'lock_open' }}</mat-icon>
          FY {{ fy.label() }} · {{ fy.closed() ? 'Closed' : 'Open' }}
        </span>
      </app-page-header>

      <div class="loading-slot" aria-hidden="true">
        @if (loading()) {
          <mat-progress-bar mode="indeterminate" />
        }
      </div>

      <section
        class="kpi-row"
        aria-label="Key figures"
        [attr.aria-busy]="loading()"
        [class.refreshing]="loading()"
      >
        <a class="kpi" routerLink="/reports/daybook">
          <span class="kpi-label"><mat-icon>account_balance</mat-icon>Cash & bank balance</span>
          <strong class="kpi-value" [class.danger]="(cash()?.closing ?? 0) < 0">{{
            cash() ? (cash()!.closing | number: '1.2-2') : '—'
          }}</strong>
          <span class="kpi-note">All cash and bank accounts</span>
        </a>
        <a class="kpi" routerLink="/transactions/vouchers">
          <span class="kpi-label"
            ><span class="dot in"></span>Money in {{ isToday() ? 'today' : 'that day' }}</span
          >
          <strong class="kpi-value">{{
            cash() ? (cash()!.today.received | number: '1.2-2') : '—'
          }}</strong>
          <span class="kpi-note">{{
            cash()
              ? (weekTotal('received') | number: '1.2-2') + ' in the last 7 days'
              : 'Last 7 days'
          }}</span>
        </a>
        <a class="kpi" routerLink="/transactions/vouchers">
          <span class="kpi-label"
            ><span class="dot out"></span>Money out {{ isToday() ? 'today' : 'that day' }}</span
          >
          <strong class="kpi-value">{{
            cash() ? (cash()!.today.paid | number: '1.2-2') : '—'
          }}</strong>
          <span class="kpi-note">{{
            cash() ? (weekTotal('paid') | number: '1.2-2') + ' in the last 7 days' : 'Last 7 days'
          }}</span>
        </a>
        <a class="kpi" routerLink="/membership/subscriptions">
          <span class="kpi-label"><mat-icon>card_membership</mat-icon>Subscription dues</span>
          <strong class="kpi-value">{{ dues() ? (dues()!.total | number: '1.2-2') : '—' }}</strong>
          <span class="kpi-note">{{
            !dues()
              ? 'Outstanding member fees'
              : dues()!.members
                ? dues()!.members + (dues()!.members === 1 ? ' member owes' : ' members owe')
                : 'No outstanding dues'
          }}</span>
        </a>
      </section>

      <div class="dashboard-main">
        <section class="panel" aria-labelledby="flow-heading">
          <div class="panel-header">
            <div>
              <h2 id="flow-heading">Money in and out</h2>
              <p>Cash and bank accounts, last 7 days</p>
            </div>
            <a mat-button routerLink="/reports/daybook">Day book</a>
          </div>
          <div class="panel-body" [class.refreshing]="loading()">
            @if (cash(); as summary) {
              <app-cash-flow-chart [days]="summary.days" />
            } @else {
              <app-empty-state
                [message]="loading() ? 'Loading cash movement…' : 'Cash movement is unavailable.'"
                status
              />
            }
          </div>
        </section>

        <section class="panel" aria-labelledby="year-heading">
          <div class="panel-header">
            <div>
              <h2 id="year-heading">Financial year {{ fy.label() }}</h2>
              <p>{{ fy.start() | date: 'd MMM yyyy' }} – {{ fy.end() | date: 'd MMM yyyy' }}</p>
            </div>
          </div>
          <div class="panel-body" [class.refreshing]="loading()">
            <dl class="year-figures">
              <div>
                <dt>Income</dt>
                <dd>{{ year() ? (year()!.income | number: '1.2-2') : '—' }}</dd>
              </div>
              <div>
                <dt>Expenses</dt>
                <dd>{{ year() ? (year()!.expense | number: '1.2-2') : '—' }}</dd>
              </div>
              <div class="net">
                <dt>{{ (year()?.net_result ?? 0) < 0 ? 'Net deficit' : 'Net surplus' }}</dt>
                <dd [class.danger]="(year()?.net_result ?? 0) < 0">
                  {{ year() ? (absolute(year()!.net_result) | number: '1.2-2') : '—' }}
                </dd>
              </div>
            </dl>
            <p class="hint">
              {{
                fy.closed()
                  ? 'This year is closed. Reports stay available; posting is locked.'
                  : 'Income and expenses posted so far this year.'
              }}
            </p>
            <a mat-stroked-button routerLink="/reports/trial-balance"
              ><mat-icon>balance</mat-icon> Trial balance</a
            >
          </div>
        </section>
      </div>

      <section class="panel recent" aria-labelledby="recent-heading">
        <div class="panel-header">
          <div>
            <h2 id="recent-heading">Recent vouchers</h2>
            <p>Latest vouchers of every type in the selected year</p>
          </div>
          <a mat-button routerLink="/transactions/vouchers">All vouchers</a>
        </div>
        @if (recent().length) {
          <div class="table-wrap" tabindex="0" role="region" aria-label="Recent vouchers">
            <table class="data-table">
              <thead>
                <tr>
                  <th scope="col">Voucher</th>
                  <th scope="col">Date</th>
                  <th scope="col">Reference</th>
                  <th scope="col">Narration</th>
                  <th scope="col" class="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                @for (voucher of recent(); track voucher.id) {
                  <tr>
                    <td>
                      <span class="voucher-ref" [class.receipt]="voucher.voucher_type === 1">{{
                        voucherRef(voucher.voucher_type, voucher.voucher_no)
                      }}</span>
                    </td>
                    <td class="nowrap">{{ voucher.voucher_date | date: 'dd-MMM-yyyy' }}</td>
                    <td class="table-primary">{{ voucher.reference_no || '—' }}</td>
                    <td class="table-secondary narration">{{ voucher.narration || '—' }}</td>
                    <td class="num">{{ voucher.total_amount | number: '1.2-2' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <app-empty-state
            icon="receipt_long"
            [heading]="loading() ? 'Loading vouchers' : 'No vouchers yet'"
            message="Receipts and payments for this financial year will appear here."
            status
          />
        }
      </section>

      <nav class="quick-links" aria-labelledby="quick-heading">
        <h2 id="quick-heading">Quick access</h2>
        <div class="quick-grid">
          @for (link of links; track link.link) {
            @if (!link.editor || auth.canEdit()) {
              <a class="quick-link" [routerLink]="link.link">
                <mat-icon>{{ link.icon }}</mat-icon
                ><span>{{ link.title }}</span>
              </a>
            }
          }
        </div>
        <p class="hint">
          <mat-icon>keyboard</mat-icon> Press Esc to open the menu, then the letter beside an item.
        </p>
      </nav>
    </div>
  `,
  styles: `
    :host {
    }
    .loading-slot {
      height: 4px;
      margin: -14px 0 10px;
    }
    .kpi-row {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 16px;
      margin-bottom: 20px;
    }
    .kpi {
      display: grid;
      align-content: start;
      gap: 6px;
      min-width: 0;
      padding: 16px 18px;
      border: 1px solid var(--app-border);
      border-radius: var(--app-radius);
      background: var(--app-surface);
      color: var(--app-ink);
      text-decoration: none;
      transition: border-color 120ms ease;
    }
    .kpi:hover {
      border-color: var(--app-accent-border);
    }
    .kpi:focus-visible {
      outline: 2px solid var(--app-accent);
      outline-offset: 3px;
    }
    .kpi-label {
      display: flex;
      align-items: center;
      gap: 7px;
      color: var(--app-muted);
      font-size: 12px;
      font-weight: 500;
    }
    .kpi-label mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
      color: var(--app-accent);
    }
    .dot {
      width: 10px;
      height: 10px;
      margin: 0 3px;
      border-radius: 2px;
    }
    .dot.in {
      background: var(--app-flow-in);
    }
    .dot.out {
      background: var(--app-flow-out);
    }
    .kpi-value {
      font-size: clamp(20px, 2vw, 25px);
      font-weight: 650;
      letter-spacing: -0.6px;
      line-height: 1.25;
      overflow-wrap: anywhere;
    }
    .kpi-note {
      color: var(--app-muted);
      font-size: 11px;
    }
    .dashboard-main {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr);
      gap: 20px;
      align-items: start;
    }
    .dashboard-main .panel + .panel,
    .recent {
      margin-top: 0;
    }
    .recent {
      margin-top: 20px;
    }
    .year-figures {
      display: grid;
      gap: 2px;
      margin: 0 0 12px;
    }
    .year-figures div {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 9px 0;
      border-bottom: 1px solid var(--app-border);
    }
    .year-figures dt {
      color: var(--app-muted);
    }
    .year-figures dd {
      margin: 0;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .year-figures .net {
      border-bottom: 0;
    }
    .year-figures .net dt {
      color: var(--app-ink);
      font-weight: 600;
    }
    .year-figures .net dd {
      font-size: 18px;
    }
    .year-figures + .hint {
      margin: 0 0 14px;
    }
    .voucher-ref {
      display: inline-flex;
      padding: 3px 7px;
      border-radius: 4px;
      background: var(--app-payment-bg);
      color: var(--app-payment-ink);
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
    }
    .voucher-ref.receipt {
      background: var(--app-receipt-bg);
      color: var(--app-receipt-ink);
    }
    .nowrap {
      white-space: nowrap;
    }
    .narration {
      max-width: 280px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .data-table {
      min-width: 620px;
    }
    .quick-links {
      margin-top: 24px;
    }
    .quick-links h2 {
      margin: 0 0 10px;
      font-size: 14px;
      font-weight: 650;
    }
    .quick-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .quick-link {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 40px;
      padding: 0 14px;
      border: 1px solid var(--app-border);
      border-radius: 8px;
      background: var(--app-surface);
      color: var(--app-ink);
      font-weight: 500;
      text-decoration: none;
    }
    .quick-link:hover {
      border-color: var(--app-accent-border);
      background: var(--app-accent-tint);
    }
    .quick-link:focus-visible {
      outline: 2px solid var(--app-accent);
      outline-offset: 2px;
    }
    .quick-link mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
      color: var(--app-accent);
    }
    .quick-links .hint {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 14px 0 0;
    }
    .quick-links .hint mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
    @media (max-width: 1199px) {
      .kpi-row {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .dashboard-main {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    @media (max-width: 440px) {
      .kpi-row {
        grid-template-columns: minmax(0, 1fr);
        gap: 10px;
      }
    }
  `,
})
export class Dashboard {
  protected readonly auth = inject(AuthService);
  protected readonly fy = inject(FinancialYearService);
  private readonly sb = inject(SupabaseService).client;
  private readonly notify = inject(NotifyService);

  protected readonly today = new Date();
  protected readonly asOn = computed(() => this.fy.entryDate());
  protected readonly isToday = computed(() => this.asOn() === isoDate());
  protected readonly firstName = computed(() => {
    const profile = this.auth.profile();
    return (profile?.full_name || profile?.username || 'there').trim().split(/\s+/)[0];
  });

  protected readonly loading = signal(true);
  protected readonly cash = signal<CashSummary | null>(null);
  protected readonly year = signal<YearResult | null>(null);
  protected readonly dues = signal<SubscriptionDuesSummary | null>(null);
  protected readonly recent = signal<RecentVoucher[]>([]);
  private loadId = 0;

  protected readonly voucherRef = voucherRef;
  protected readonly links = [
    { title: 'Receipt', icon: 'south_west', link: '/transactions/voucher/receipt', editor: true },
    { title: 'Payment', icon: 'north_east', link: '/transactions/voucher/payment', editor: true },
    { title: 'Voucher Register', icon: 'receipt_long', link: '/transactions/vouchers' },
    { title: 'Members', icon: 'groups', link: '/masters/members' },
    { title: 'Subscriptions', icon: 'card_membership', link: '/membership/subscriptions' },
    { title: 'Day Book', icon: 'menu_book', link: '/reports/daybook' },
    { title: 'Ledger', icon: 'account_balance_wallet', link: '/reports/ledger' },
    {
      title: 'Ledger Verification',
      icon: 'publish',
      link: '/transactions/daybook-posting',
      editor: true,
    },
  ];

  constructor() {
    effect(() => {
      const start = this.fy.selected();
      const asOn = this.asOn();
      untracked(() => void this.load(start, asOn));
    });
  }

  protected weekTotal(side: 'received' | 'paid'): number | null {
    return this.cash()?.days.reduce((sum, day) => sum + day[side], 0) ?? null;
  }

  protected absolute(value: number): number {
    return Math.abs(value);
  }

  private async load(startYear: number, asOn: string): Promise<void> {
    const id = ++this.loadId;
    this.loading.set(true);
    const current = () => id === this.loadId;
    const [cash, year, dues, recent] = await Promise.allSettled([
      must(this.sb.rpc('rpt_daybook', { p_from: addDays(asOn, 1 - CHART_DAYS), p_to: asOn })).then(
        (rows) => summariseCash(rows as DaybookRow[], asOn, CHART_DAYS),
      ),
      must(this.sb.rpc('financial_year_summary', { p_start_year: startYear })).then(
        (rows) => ((rows as YearResult[])[0] ?? null) as YearResult | null,
      ),
      // One row, whatever the size of the membership: the sum happens in the database.
      must(this.sb.rpc('subscription_dues_summary', { p_fy: startYear })).then((rows) => {
        const summary = (rows as SubscriptionDuesSummary[])[0];
        return summary
          ? { total: Number(summary.total), members: Number(summary.members) }
          : { total: 0, members: 0 };
      }),
      must(
        this.sb
          .from('vouchers')
          .select(
            'id, voucher_type, voucher_no, voucher_date, total_amount, narration, reference_no',
          )
          .gte('voucher_date', this.fy.start())
          .lte('voucher_date', this.fy.end())
          .is('cancelled_at', null)
          .order('voucher_date', { ascending: false })
          .order('id', { ascending: false })
          .limit(RECENT_LIMIT),
      ).then((rows) => rows as unknown as RecentVoucher[]),
    ]);
    if (!current()) return;

    // Each section keeps its own result so one failing query does not blank the page.
    this.cash.set(cash.status === 'fulfilled' ? cash.value : null);
    this.year.set(year.status === 'fulfilled' ? year.value : null);
    this.dues.set(dues.status === 'fulfilled' ? dues.value : null);
    this.recent.set(recent.status === 'fulfilled' ? recent.value : []);
    const failure = [cash, year, dues, recent].find((result) => result.status === 'rejected');
    if (failure) this.notify.error((failure as PromiseRejectedResult).reason);
    this.loading.set(false);
  }
}
