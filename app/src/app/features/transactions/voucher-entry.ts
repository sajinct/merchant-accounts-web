import { DatePipe, DecimalPipe } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { CompanyService } from '../../core/company.service';
import { FinancialYearService } from '../../core/financial-year.service';
import { AccountHead, Voucher } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import {
  emptyLine,
  isBlank,
  previewPostings,
  requestLines,
  VoucherEntryLine,
  voucherProblem,
  voucherTotals,
} from '../../core/voucher-rules';
import { Party, VoucherService } from '../../core/voucher.service';
import {
  postableAccounts,
  voucherRef,
  voucherType,
  VoucherTypeConfig,
  VOUCHER_TYPES,
} from '../../core/voucher-types';
import { AccountPicker } from '../../shared/account-picker';
import { confirmAction } from '../../shared/confirm-dialog';
import { EnterToNext } from '../../shared/enter-to-next.directive';
import { FinancialYearNotice } from '../../shared/financial-year-notice';
import { FinancialYearScope } from '../../shared/financial-year-scope';
import { PageHeader } from '../../shared/page-header';

/** Rows the grid starts with, and the floor it is trimmed back to. */
const STARTING_LINES = 3;

/**
 * The single voucher entry screen. `/transactions/voucher/receipt`, `/payment`,
 * `/contra` and `/journal` are the same component; the voucher type in the route
 * decides the labels, which accounts may be chosen, which entry modes exist and
 * which rules apply. The debits and credits themselves are worked out by the
 * posting engine in the database, not here.
 */
@Component({
  selector: 'app-voucher-entry',
  host: { '(document:keydown)': 'onSaveShortcut($event)' },
  imports: [
    AccountPicker,
    DatePipe,
    DecimalPipe,
    EnterToNext,
    FinancialYearNotice,
    FinancialYearScope,
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
    PageHeader,
    ReactiveFormsModule,
    RouterLink,
  ],
  template: `
    @let config = type();
    <div class="page no-print">
      <app-page-header
        eyebrow="Transactions"
        [heading]="config.label + ' voucher'"
        [description]="config.description"
      >
        <span class="voucher-number" aria-live="polite">
          <span class="hint">Voucher no.</span>
          <strong>{{
            opening() || nextNo() === null ? '—' : config.prefix + '-' + nextNo()
          }}</strong>
        </span>
      </app-page-header>

      <nav class="type-switch" aria-label="Voucher type">
        @for (option of allTypes; track option.slug) {
          <a
            class="type-link"
            [class.current]="option.slug === config.slug"
            [routerLink]="['/transactions/voucher', option.slug]"
            [attr.aria-current]="option.slug === config.slug ? 'page' : null"
          >
            <mat-icon>{{ option.icon }}</mat-icon> {{ option.label }}
          </a>
        }
      </nav>

      <app-financial-year-notice />

      <form
        appFinancialYearScope="entry"
        class="panel"
        [formGroup]="form"
        (ngSubmit)="save('stay')"
        appEnterToNext
      >
        <div class="panel-body">
          <div class="form-grid header-grid">
            <mat-form-field>
              <mat-label>Voucher date</mat-label>
              <input
                matInput
                [matDatepicker]="datePicker"
                formControlName="date"
                placeholder="dd/mm/yyyy"
              />
              <mat-datepicker-toggle matIconSuffix [for]="datePicker" />
              <mat-datepicker #datePicker />
            </mat-form-field>

            <mat-form-field>
              <mat-label>Reference no.</mat-label>
              <input matInput formControlName="referenceNo" maxlength="40" placeholder="Optional" />
            </mat-form-field>

            @if (config.primaryLabel && simplified()) {
              <mat-form-field>
                <mat-label>{{ config.primaryLabel }}</mat-label>
                <mat-select formControlName="cashAccount">
                  @for (account of cashAccounts(); track account.code) {
                    <mat-option [value]="account.code">{{ account.name }}</mat-option>
                  }
                </mat-select>
                <mat-hint>{{
                  cashAccounts().length
                    ? 'Cash or bank account'
                    : 'Create a cash/bank asset in Account heads.'
                }}</mat-hint>
                <mat-error>Choose a cash or bank account.</mat-error>
              </mat-form-field>
            }

            @if (config.code === 4 && auth.isAdmin()) {
              <mat-form-field>
                <mat-label>Entry type</mat-label>
                <mat-select [value]="opening()" (selectionChange)="opening.set($event.value)">
                  <mat-option [value]="false">Journal voucher</mat-option>
                  <mat-option [value]="true">Opening balances</mat-option>
                </mat-select>
                <mat-hint>{{
                  opening()
                    ? 'Opens the books; no voucher number is allocated.'
                    : 'A numbered adjustment voucher.'
                }}</mat-hint>
              </mat-form-field>
            }

            @if (config.partyLabel) {
              <app-account-picker
                formControlName="partyCode"
                [label]="config.partyLabel"
                placeholder="Search members by name or code"
                hint="Optional"
                [accounts]="parties()"
                [loading]="loading()"
              />
            }

            <mat-form-field class="span-all">
              <mat-label>Narration</mat-label>
              <input
                matInput
                formControlName="narration"
                maxlength="200"
                placeholder="What this voucher is for"
              />
            </mat-form-field>
          </div>

          <div class="lines-header">
            <div>
              <h2>{{ config.linesHeading }}</h2>
              <p class="hint">{{ config.linesHint }}</p>
            </div>
            @if (config.simplified) {
              <mat-button-toggle-group
                [hideSingleSelectionIndicator]="true"
                [value]="simplified()"
                (change)="setSimplified($event.value)"
                aria-label="Entry mode"
              >
                <mat-button-toggle [value]="true">Simplified</mat-button-toggle>
                <mat-button-toggle [value]="false">Advanced accounting view</mat-button-toggle>
              </mat-button-toggle-group>
            }
          </div>

          <div
            #grid
            class="table-wrap"
            tabindex="0"
            role="region"
            [attr.aria-label]="config.label + ' lines'"
          >
            <table class="data-table entry-grid">
              <thead>
                <tr>
                  <th scope="col" class="account-col">Account head</th>
                  <th scope="col">Description</th>
                  @if (simplified()) {
                    <th scope="col" class="num">{{ config.amountLabel }}</th>
                  } @else {
                    <th scope="col" class="num">Debit</th>
                    <th scope="col" class="num">Credit</th>
                  }
                  <th scope="col"><span class="visually-hidden">Remove</span></th>
                </tr>
              </thead>
              <tbody>
                @for (line of lines(); track $index; let i = $index) {
                  <tr>
                    <td class="account-col">
                      <app-account-picker
                        label="Account"
                        subscriptSizing="dynamic"
                        [accounts]="lineAccounts()"
                        [loading]="loading()"
                        [ngModel]="line.account"
                        [ngModelOptions]="{ standalone: true }"
                        (ngModelChange)="patch(i, { account: $event })"
                        [disabled]="saving()"
                      />
                    </td>
                    <td>
                      <mat-form-field subscriptSizing="dynamic">
                        <mat-label>Description</mat-label>
                        <input
                          matInput
                          maxlength="200"
                          [ngModel]="line.description"
                          [ngModelOptions]="{ standalone: true }"
                          (ngModelChange)="patch(i, { description: $event })"
                          [disabled]="saving()"
                        />
                      </mat-form-field>
                    </td>
                    @if (simplified()) {
                      <td class="num">
                        <mat-form-field subscriptSizing="dynamic">
                          <mat-label>{{ config.amountLabel }}</mat-label>
                          <input
                            matInput
                            type="number"
                            min="0"
                            step="0.01"
                            inputmode="decimal"
                            [ngModel]="line.amount"
                            [ngModelOptions]="{ standalone: true }"
                            (ngModelChange)="patch(i, { amount: $event })"
                            [disabled]="saving()"
                          />
                        </mat-form-field>
                      </td>
                    } @else {
                      <td class="num">
                        <mat-form-field subscriptSizing="dynamic">
                          <mat-label>Debit</mat-label>
                          <input
                            matInput
                            type="number"
                            min="0"
                            step="0.01"
                            inputmode="decimal"
                            [ngModel]="line.debit"
                            [ngModelOptions]="{ standalone: true }"
                            (ngModelChange)="patch(i, { debit: $event })"
                            [disabled]="saving()"
                          />
                        </mat-form-field>
                      </td>
                      <td class="num">
                        <mat-form-field subscriptSizing="dynamic">
                          <mat-label>Credit</mat-label>
                          <input
                            matInput
                            type="number"
                            min="0"
                            step="0.01"
                            inputmode="decimal"
                            [ngModel]="line.credit"
                            [ngModelOptions]="{ standalone: true }"
                            (ngModelChange)="patch(i, { credit: $event })"
                            [disabled]="saving()"
                          />
                        </mat-form-field>
                      </td>
                    }
                    <td class="row-actions">
                      <button
                        mat-icon-button
                        type="button"
                        (click)="removeLine(i)"
                        [disabled]="saving() || lines().length <= 1"
                        matTooltip="Remove line"
                        [attr.aria-label]="'Remove line ' + (i + 1)"
                      >
                        <mat-icon>close</mat-icon>
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <div class="totals" role="status">
            @if (simplified()) {
              <span class="total-main"
                >{{ config.totalLabel }}
                <strong>{{ totals().total / 100 | number: '1.2-2' }}</strong></span
              >
            } @else {
              <span
                >Debit <strong>{{ totals().debit / 100 | number: '1.2-2' }}</strong></span
              >
              <span
                >Credit <strong>{{ totals().credit / 100 | number: '1.2-2' }}</strong></span
              >
              <span [class.danger]="totals().difference !== 0"
                >Difference <strong>{{ totals().difference / 100 | number: '1.2-2' }}</strong></span
              >
            }
          </div>

          @if (simplified() && preview().length > 1) {
            <details class="posting-preview">
              <summary>Accounting entry this will post</summary>
              <table class="data-table">
                <thead>
                  <tr>
                    <th scope="col">Account</th>
                    <th scope="col" class="num">Debit</th>
                    <th scope="col" class="num">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of preview(); track $index) {
                    <tr>
                      <td>{{ accountName(row.account) }}</td>
                      <td class="num">{{ row.debit ? (row.debit | number: '1.2-2') : '' }}</td>
                      <td class="num">{{ row.credit ? (row.credit | number: '1.2-2') : '' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </details>
          }

          @if (problem(); as message) {
            <p class="hint problem" role="status"><mat-icon>info</mat-icon> {{ message }}</p>
          }

          <div class="form-actions">
            <button mat-flat-button type="submit" [disabled]="!canSave()">
              <mat-icon>check</mat-icon> {{ saving() ? 'Saving…' : 'Save' }}
            </button>
            <button mat-stroked-button type="button" (click)="save('new')" [disabled]="!canSave()">
              Save &amp; new
            </button>
            <button
              mat-stroked-button
              type="button"
              (click)="save('print')"
              [disabled]="!canSave()"
            >
              <mat-icon>print</mat-icon> Save &amp; print
            </button>
            <button mat-button type="button" (click)="addLine()" [disabled]="saving()">
              <mat-icon>add</mat-icon> Add row
            </button>
            <button mat-button type="button" (click)="clear()" [disabled]="saving()">Clear</button>
            @if (!auth.canEdit()) {
              <span class="hint">Your role can view vouchers but not enter them.</span>
            } @else {
              <span class="hint shortcut-hint">Ctrl + S saves and starts the next voucher</span>
            }
          </div>
        </div>
      </form>

      @if (saved(); as voucher) {
        <section class="panel saved-banner" role="status">
          <div class="panel-body">
            <p>
              <mat-icon>task_alt</mat-icon>
              <strong>{{ voucherRef(voucher.voucher_type, voucher.voucher_no) }}</strong> saved for
              {{ voucher.total_amount | number: '1.2-2' }}.
            </p>
            <div class="form-actions">
              <button mat-stroked-button type="button" (click)="print()">
                <mat-icon>print</mat-icon> Print
              </button>
              <a mat-button routerLink="/transactions/vouchers">Open the register</a>
            </div>
          </div>
        </section>
      }
    </div>

    @if (saved(); as voucher) {
      <section class="voucher-slip print-only" aria-hidden="true">
        <header>
          <h1>{{ company.settings()?.name || 'Merchant Accounts' }}</h1>
          <p>{{ company.settings()?.place }}</p>
          <h2>{{ type().label }} voucher</h2>
        </header>
        <dl class="slip-meta">
          <div>
            <dt>Voucher no.</dt>
            <dd>{{ voucherRef(voucher.voucher_type, voucher.voucher_no) }}</dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>{{ voucher.voucher_date | date: 'dd-MMM-yyyy' }}</dd>
          </div>
          @if (voucher.reference_no) {
            <div>
              <dt>Reference</dt>
              <dd>{{ voucher.reference_no }}</dd>
            </div>
          }
          @if (printedParty()) {
            <div>
              <dt>{{ type().partyLabel }}</dt>
              <dd>{{ printedParty() }}</dd>
            </div>
          }
        </dl>
        <table class="data-table">
          <thead>
            <tr>
              <th scope="col">Account</th>
              <th scope="col">Description</th>
              <th scope="col" class="num">Debit</th>
              <th scope="col" class="num">Credit</th>
            </tr>
          </thead>
          <tbody>
            @for (row of printedLines(); track $index) {
              <tr>
                <td>{{ accountName(row.account) }}</td>
                <td>{{ row.description }}</td>
                <td class="num">{{ row.debit ? (row.debit | number: '1.2-2') : '' }}</td>
                <td class="num">{{ row.credit ? (row.credit | number: '1.2-2') : '' }}</td>
              </tr>
            }
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colspan="2">Total</th>
              <td class="num">{{ voucher.total_amount | number: '1.2-2' }}</td>
              <td class="num">{{ voucher.total_amount | number: '1.2-2' }}</td>
            </tr>
          </tfoot>
        </table>
        <p class="slip-narration">{{ voucher.narration }}</p>
        <div class="slip-signatures">
          <span>Prepared by</span><span>Received / paid by</span><span>Authorised</span>
        </div>
      </section>
    }
  `,
  styles: `
    .type-switch {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 0 0 16px;
    }
    .type-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      border: 1px solid var(--app-border);
      border-radius: 999px;
      color: inherit;
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
    }
    .type-link mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
    .type-link.current {
      background: var(--app-surface-muted);
      border-color: currentColor;
    }
    .voucher-number {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }
    .voucher-number strong {
      font-size: 18px;
      font-variant-numeric: tabular-nums;
    }
    .header-grid {
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    }
    .span-all {
      grid-column: 1 / -1;
    }
    .lines-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
      margin: 4px 0 12px;
    }
    .lines-header h2 {
      margin: 0;
      font-size: 15px;
    }
    .lines-header .hint {
      margin: 4px 0 0;
    }
    .entry-grid {
      min-width: 720px;
    }
    .entry-grid td {
      vertical-align: top;
    }
    .entry-grid .account-col {
      min-width: 220px;
    }
    .entry-grid td.num mat-form-field {
      width: 130px;
    }
    .entry-grid mat-form-field {
      width: 100%;
    }
    .totals {
      display: flex;
      flex-wrap: wrap;
      gap: 24px;
      justify-content: flex-end;
      margin: 14px 0 0;
      padding: 12px 14px;
      border-radius: 8px;
      background: var(--app-surface-muted);
      font-variant-numeric: tabular-nums;
    }
    .totals strong {
      margin-left: 6px;
      font-size: 15px;
    }
    .total-main strong {
      font-size: 19px;
    }
    .posting-preview {
      margin-top: 14px;
    }
    .posting-preview summary {
      cursor: pointer;
      min-height: 32px;
      font-weight: 600;
    }
    .posting-preview .data-table {
      margin-top: 10px;
    }
    .problem {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 12px 0 0;
    }
    .problem mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
    .shortcut-hint {
      margin-left: auto;
    }
    .saved-banner {
      margin-top: 20px;
    }
    .saved-banner p {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 12px;
    }
    .print-only {
      display: none;
    }
    @media print {
      .print-only {
        display: block;
      }
      .voucher-slip header {
        text-align: center;
        margin-bottom: 18px;
      }
      .voucher-slip h1 {
        margin: 0;
        font-size: 18px;
      }
      .voucher-slip h2 {
        margin: 10px 0 0;
        font-size: 14px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .slip-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 32px;
        margin: 0 0 16px;
      }
      .slip-meta div {
        display: flex;
        gap: 8px;
      }
      .slip-meta dt {
        font-weight: 600;
      }
      .slip-meta dd {
        margin: 0;
      }
      .slip-narration {
        margin: 16px 0 40px;
      }
      .slip-signatures {
        display: flex;
        justify-content: space-between;
        gap: 24px;
      }
      .slip-signatures span {
        border-top: 1px solid currentColor;
        padding-top: 6px;
        flex: 1;
        text-align: center;
        font-size: 12px;
      }
    }
    @media (max-width: 700px) {
      .voucher-number {
        align-items: flex-start;
      }
    }
  `,
})
export class VoucherEntry {
  /** Route parameter: receipt, payment, contra or journal. */
  readonly typeSlug = input<string>('receipt', { alias: 'type' });

  protected readonly allTypes = VOUCHER_TYPES;
  protected readonly voucherRef = voucherRef;
  protected readonly auth = inject(AuthService);
  protected readonly company = inject(CompanyService);
  private readonly vouchers = inject(VoucherService);
  private readonly notify = inject(NotifyService);
  private readonly fy = inject(FinancialYearService);
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly grid = viewChild<ElementRef<HTMLElement>>('grid');

  protected readonly type = computed(() => voucherType(this.typeSlug()) ?? VOUCHER_TYPES[0]);
  protected readonly accounts = signal<AccountHead[]>([]);
  protected readonly parties = signal<Party[]>([]);
  protected readonly allowCashInJournal = signal(false);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly nextNo = signal<number | null>(null);
  protected readonly saved = signal<Voucher | null>(null);
  protected readonly lines = signal<VoucherEntryLine[]>(startingLines());
  private readonly advanced = signal(false);
  /** Journal screen, admins only: opening balances instead of an adjustment voucher. */
  protected readonly opening = signal(false);
  private requestId = crypto.randomUUID();
  /** The type the grid currently belongs to; see applyType. */
  private applied: string | null = null;

  protected readonly form = inject(FormBuilder).group({
    date: [this.fy.entryDate(), Validators.required],
    referenceNo: [''],
    partyCode: [null as number | null],
    cashAccount: [null as number | null],
    narration: [''],
  });

  /** The header as a signal, so the totals and the problem message track every edit. */
  private readonly header = toSignal(
    this.form.valueChanges as unknown as Observable<VoucherHeader>,
    { initialValue: this.form.getRawValue() as VoucherHeader },
  );

  /** Advanced mode is the only mode for contra and journal vouchers. */
  protected readonly simplified = computed(() => this.type().simplified && !this.advanced());

  protected readonly cashAccounts = computed(() =>
    this.accounts().filter((account) => account.is_cash_bank),
  );

  protected readonly lineAccounts = computed(() =>
    postableAccounts(this.accounts(), this.type(), {
      simplified: this.simplified(),
      allowCashInJournal: this.allowCashInJournal() || this.opening(),
    }),
  );

  protected readonly totals = computed(() =>
    voucherTotals(this.lines(), this.type(), this.simplified()),
  );

  protected readonly preview = computed(() =>
    previewPostings(this.lines(), this.type(), this.header().cashAccount),
  );

  protected readonly problem = computed(() =>
    voucherProblem({
      type: this.type(),
      simplified: this.simplified(),
      date: this.header().date,
      cashAccount: this.header().cashAccount,
      lines: this.lines(),
      accounts: this.lineAccounts(),
    }),
  );

  protected readonly printedLines = signal<
    { account: number | null; description: string; debit: number; credit: number }[]
  >([]);
  protected readonly printedParty = signal('');

  constructor() {
    void this.loadReferenceData();
    effect(() => {
      const type = this.type();
      untracked(() => void this.applyType(type));
    });
  }

  /**
   * The four types share this component, so moving between them changes a route
   * parameter rather than the page: Angular keeps the instance alive and the
   * unsaved-changes guard never runs. The grid has to be cleared anyway, because
   * each type has its own rules and account list, so ask first when there is work
   * in it and return to the type the entry was started on if the answer is no.
   */
  private async applyType(type: VoucherTypeConfig): Promise<void> {
    const previous = this.applied;
    if (previous === type.slug) return;
    if (previous && this.hasPendingChanges()) {
      const discard = await confirmAction(this.dialog, {
        title: `Leave this ${voucherType(previous)?.label.toLowerCase()} without saving?`,
        message: 'The lines you entered have not been saved and will be lost.',
        confirmLabel: 'Discard and switch',
        cancelLabel: 'Stay here',
        destructive: true,
      });
      if (!discard) {
        await this.router.navigate(['/transactions/voucher', previous]);
        return;
      }
    }
    this.applied = type.slug;
    this.advanced.set(false);
    this.opening.set(false);
    this.saved.set(null);
    this.requestId = crypto.randomUUID();
    this.reset();
    void this.loadNextNumber(type.code);
  }

  hasPendingChanges(): boolean {
    if (this.saving()) return false;
    const { referenceNo, narration } = this.form.getRawValue();
    return (
      !!referenceNo?.trim() ||
      !!narration?.trim() ||
      this.lines().some((line) => !isBlank(line, this.simplified()))
    );
  }

  protected accountName(code: number | null): string {
    if (code === null) return '—';
    return this.accounts().find((account) => account.code === code)?.name ?? String(code);
  }

  protected setSimplified(value: boolean): void {
    if (value === this.simplified()) return;
    // Carry the amounts across so switching view does not lose typed work.
    this.lines.update((lines) =>
      lines.map((line) =>
        value
          ? { ...line, amount: line.debit || line.credit || null, debit: null, credit: null }
          : {
              ...line,
              debit: this.type().simplifiedSide === 'debit' ? line.amount : null,
              credit: this.type().simplifiedSide === 'credit' ? line.amount : null,
              amount: null,
            },
      ),
    );
    this.advanced.set(!value);
  }

  protected patch(index: number, change: Partial<VoucherEntryLine>): void {
    this.lines.update((lines) =>
      lines.map((line, i) => (i === index ? { ...line, ...change } : line)),
    );
    // Typing in the last row opens the next one, as in a spreadsheet.
    const last = this.lines().at(-1);
    if (last && !isBlank(last, this.simplified()) && this.lines().length < 200) this.addLine();
  }

  protected addLine(): void {
    this.lines.update((lines) => [...lines, emptyLine()]);
  }

  protected removeLine(index: number): void {
    this.lines.update((lines) => lines.filter((_, i) => i !== index));
    if (!this.lines().length) this.addLine();
  }

  protected canSave(): boolean {
    return (
      !this.saving() &&
      this.auth.canEdit() &&
      !this.fy.closed() &&
      !this.form.invalid &&
      this.problem() === null
    );
  }

  /** Ctrl/Cmd + S saves without leaving the keyboard, like the desktop app. */
  protected onSaveShortcut(event: KeyboardEvent): void {
    if (
      event.defaultPrevented ||
      event.repeat ||
      !(event.ctrlKey || event.metaKey) ||
      event.altKey ||
      event.key.toLowerCase() !== 's'
    ) {
      return;
    }
    event.preventDefault();
    if (this.canSave()) void this.save('stay');
  }

  protected print(): void {
    window.print();
  }

  protected async save(then: 'stay' | 'new' | 'print'): Promise<void> {
    if (!this.canSave()) return;
    const type = this.type();
    const simplified = this.simplified();
    const { date, referenceNo, partyCode, cashAccount, narration } = this.form.getRawValue();
    this.saving.set(true);
    try {
      if (this.opening()) {
        const id = await this.vouchers.postOpening(
          date!,
          narration?.trim() ?? '',
          requestLines(this.lines(), false),
          this.requestId,
        );
        this.notify.success(`Opening balances posted as journal J-${id}`);
        this.requestId = crypto.randomUUID();
        this.saved.set(null);
        this.reset();
        return;
      }
      const voucher = await this.vouchers.post({
        type: type.code,
        date: date!,
        referenceNo: referenceNo?.trim() || null,
        partyCode,
        narration: narration?.trim() ?? '',
        cashAccount,
        lines: requestLines(this.lines(), simplified),
        simplified,
        requestId: this.requestId,
      });
      this.notify.success(
        `${type.label} ${voucherRef(voucher.voucher_type, voucher.voucher_no)} saved`,
      );
      this.capturePrintable(voucher, simplified);
      this.saved.set(voucher);
      // A new identity only after the server confirmed; a retry must reuse the old one.
      this.requestId = crypto.randomUUID();
      this.reset({ keepHeader: then !== 'new' });
      void this.loadNextNumber(type.code);
      if (then === 'print') afterNextRender(() => window.print(), { injector: this.injector });
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.saving.set(false);
    }
  }

  protected clear(): void {
    this.requestId = crypto.randomUUID();
    this.saved.set(null);
    this.reset();
  }

  /** Keeps the cash account and party so repeated entries need only the lines. */
  private reset(options: { keepHeader?: boolean } = {}): void {
    const { cashAccount, partyCode } = this.form.getRawValue();
    this.form.reset({
      date: this.fy.entryDate(),
      referenceNo: '',
      partyCode: options.keepHeader ? partyCode : null,
      cashAccount: options.keepHeader ? cashAccount : null,
      narration: '',
    });
    this.form.markAsPristine();
    this.lines.set(startingLines());
    this.focusGrid();
  }

  private capturePrintable(voucher: Voucher, simplified: boolean): void {
    const rows = simplified
      ? this.preview()
      : this.lines()
          .filter((line) => !isBlank(line, false))
          .map((line) => ({
            account: line.account,
            description: line.description,
            debit: Number(line.debit ?? 0),
            credit: Number(line.credit ?? 0),
          }));
    this.printedLines.set(rows);
    this.printedParty.set(
      this.parties().find((party) => party.code === voucher.party_code)?.name ?? '',
    );
  }

  private focusGrid(): void {
    afterNextRender(
      () => this.grid()?.nativeElement.querySelector('input')?.focus({ preventScroll: true }),
      { injector: this.injector },
    );
  }

  private async loadReferenceData(): Promise<void> {
    try {
      const data = await this.vouchers.referenceData();
      this.accounts.set(data.accounts);
      this.parties.set(data.parties);
      this.allowCashInJournal.set(data.allowCashInJournal);
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadNextNumber(code: number): Promise<void> {
    try {
      this.nextNo.set(await this.vouchers.nextNumber(code as 1 | 2 | 3 | 4));
    } catch {
      // A preview only; the number is allocated by the database when the voucher saves.
      this.nextNo.set(null);
    }
  }
}

interface VoucherHeader {
  date: string | null;
  referenceNo: string | null;
  partyCode: number | null;
  cashAccount: number | null;
  narration: string | null;
}

function startingLines(): VoucherEntryLine[] {
  return Array.from({ length: STARTING_LINES }, emptyLine);
}
