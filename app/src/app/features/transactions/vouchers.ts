import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../core/auth.service';
import { AccountHead, Voucher, VoucherType } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { must, SupabaseService } from '../../core/supabase.service';
import { isoDate } from '../../shared/dates';
import { EnterToNext } from '../../shared/enter-to-next.directive';

interface VoucherLine extends Voucher {
  receipt: number;
  payment: number;
  balance: number;
}

function isHead(value: unknown): value is AccountHead {
  return !!value && typeof value === 'object' && 'code' in value;
}

@Component({
  selector: 'app-vouchers',
  imports: [
    DatePipe,
    DecimalPipe,
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatTooltipModule,
    EnterToNext,
  ],
  template: `
    <div class="page">
      <div class="page-header"><h1>Payments / Receipts</h1></div>

      <form class="voucher-form" [formGroup]="form" (ngSubmit)="save()" appEnterToNext>
        <mat-button-toggle-group formControlName="type" aria-label="Voucher type">
          <mat-button-toggle [value]="1">Receipt</mat-button-toggle>
          <mat-button-toggle [value]="2">Payment</mat-button-toggle>
        </mat-button-toggle-group>

        <div class="form-grid">
          <mat-form-field>
            <mat-label>Date</mat-label>
            <input matInput type="date" formControlName="date" />
          </mat-form-field>
          <mat-form-field class="wide">
            <mat-label>Account</mat-label>
            <input matInput formControlName="account" [matAutocomplete]="accountAuto" />
            <mat-autocomplete #accountAuto="matAutocomplete" [displayWith]="displayHead" autoActiveFirstOption
                              (optionSelected)="loadAccount($event.option.value)">
              @for (head of matchingHeads(); track head.code) {
                <mat-option [value]="head">{{ head.code }} – {{ head.name }}</mat-option>
              }
            </mat-autocomplete>
          </mat-form-field>
          <mat-form-field class="wide">
            <mat-label>Narration</mat-label>
            <input matInput formControlName="description" maxlength="200" />
          </mat-form-field>
          <mat-form-field>
            <mat-label>Amount</mat-label>
            <input matInput type="number" min="0.01" step="0.01" formControlName="amount" />
          </mat-form-field>
        </div>

        <div class="form-actions">
          <button mat-flat-button type="submit" [disabled]="form.invalid || !selectedHead() || saving() || !auth.canEdit()">
            Save {{ form.controls.type.value === 1 ? 'receipt' : 'payment' }}
          </button>
          <button mat-button type="button" (click)="clear()">Clear</button>
          @if (!auth.canEdit()) {
            <span class="hint">Your role can view vouchers but not enter them.</span>
          }
        </div>
      </form>

      @if (selectedHead(); as head) {
        <div class="section-header">
          <h2>{{ head.code }} – {{ head.name }}</h2>
          <div class="balance">Balance: <strong>{{ balance() | number: '1.2-2' }}</strong></div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Voucher</th><th>Date</th><th>Narration</th>
                <th class="num">Receipt</th><th class="num">Payment</th><th class="num">Balance</th>
                @if (auth.isAdmin()) { <th></th> }
              </tr>
            </thead>
            <tbody>
              @for (line of lines(); track line.id) {
                <tr>
                  <td>{{ line.voucher_type === 1 ? 'R' : 'P' }}-{{ line.voucher_no }}</td>
                  <td>{{ line.voucher_date | date: 'dd-MMM-yyyy' }}</td>
                  <td>{{ line.description }}</td>
                  <td class="num">{{ line.receipt | number: '1.2-2' }}</td>
                  <td class="num">{{ line.payment | number: '1.2-2' }}</td>
                  <td class="num">{{ line.balance | number: '1.2-2' }}</td>
                  @if (auth.isAdmin()) {
                    <td class="row-actions">
                      <button mat-icon-button type="button" (click)="cancel(line)" matTooltip="Cancel voucher" aria-label="Cancel voucher">
                        <mat-icon>block</mat-icon>
                      </button>
                    </td>
                  }
                </tr>
              } @empty {
                <tr><td [attr.colspan]="auth.isAdmin() ? 7 : 6" class="empty">No vouchers for this account yet.</td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class Vouchers implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly sb = inject(SupabaseService).client;
  private readonly notify = inject(NotifyService);

  protected readonly heads = signal<AccountHead[]>([]);
  protected readonly selectedHead = signal<AccountHead | null>(null);
  protected readonly lines = signal<VoucherLine[]>([]);
  protected readonly saving = signal(false);

  protected readonly form = inject(FormBuilder).group({
    type: [1 as VoucherType, Validators.required],
    date: [isoDate(), Validators.required],
    account: [null as AccountHead | string | null, Validators.required],
    description: [''],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
  });

  private readonly accountValue = toSignal(this.form.controls.account.valueChanges, { initialValue: null });

  protected readonly matchingHeads = computed(() => {
    const value = this.accountValue();
    const q = (typeof value === 'string' ? value : '').trim().toLowerCase();
    const heads = this.heads();
    return (q ? heads.filter((h) => h.name.toLowerCase().includes(q) || String(h.code).startsWith(q)) : heads).slice(0, 50);
  });

  protected readonly balance = computed(() => this.lines().at(-1)?.balance ?? 0);

  protected readonly displayHead = (head: AccountHead | string | null): string =>
    isHead(head) ? `${head.code} – ${head.name}` : (head ?? '');

  constructor() {
    // Typing over a chosen account clears the selection.
    this.form.controls.account.valueChanges.subscribe((value) => {
      if (!isHead(value) && this.selectedHead()) {
        this.selectedHead.set(null);
        this.lines.set([]);
      }
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      // Same range as the desktop app: 1001-9998 are user account heads.
      this.heads.set(
        await must(this.sb.from('account_heads').select('code, name').gt('code', 1000).lt('code', 9999).order('name')),
      );
    } catch (err) {
      this.notify.error(err);
    }
  }

  protected async loadAccount(head: AccountHead): Promise<void> {
    this.selectedHead.set(head);
    try {
      const vouchers = await must(
        this.sb
          .from('vouchers')
          .select('id, voucher_type, voucher_no, voucher_date, head_code, description, amount, cancelled_at')
          .eq('head_code', head.code)
          .is('cancelled_at', null)
          .order('voucher_date')
          .order('id'),
      );
      let balance = 0;
      this.lines.set(
        (vouchers as Voucher[]).map((v) => {
          const receipt = v.voucher_type === 1 ? Number(v.amount) : 0;
          const payment = v.voucher_type === 2 ? Number(v.amount) : 0;
          balance += receipt - payment;
          return { ...v, receipt, payment, balance };
        }),
      );
    } catch (err) {
      this.notify.error(err);
    }
  }

  protected async save(): Promise<void> {
    const head = this.selectedHead();
    const { type, date, description, amount } = this.form.getRawValue();
    if (this.form.invalid || !head || !type || !date || !amount) {
      return;
    }
    this.saving.set(true);
    try {
      const voucher = await must(
        this.sb
          .rpc('create_voucher', {
            p_type: type,
            p_date: date,
            p_head_code: head.code,
            p_description: description ?? '',
            p_amount: amount,
          })
          .single<Voucher>(),
      );
      this.notify.success(`${type === 1 ? 'Receipt R' : 'Payment P'}-${voucher.voucher_no} saved`);
      this.form.patchValue({ description: '', amount: null });
      this.form.controls.amount.markAsUntouched();
      await this.loadAccount(head);
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.saving.set(false);
    }
  }

  protected async cancel(line: VoucherLine): Promise<void> {
    const ref = `${line.voucher_type === 1 ? 'R' : 'P'}-${line.voucher_no}`;
    const reason = prompt(`Cancel voucher ${ref} (${line.amount})?\nEnter a reason:`);
    if (reason === null) {
      return;
    }
    try {
      await must(this.sb.rpc('cancel_voucher', { p_id: line.id, p_reason: reason }));
      this.notify.success(`Voucher ${ref} cancelled. Re-post the day book for ${line.voucher_date}.`);
      const head = this.selectedHead();
      if (head) {
        await this.loadAccount(head);
      }
    } catch (err) {
      this.notify.error(err);
    }
  }

  protected clear(): void {
    this.form.reset({ type: 1, date: isoDate(), account: null, description: '', amount: null });
    this.selectedHead.set(null);
    this.lines.set([]);
  }
}
