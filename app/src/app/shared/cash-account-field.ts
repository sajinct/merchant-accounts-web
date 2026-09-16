import { Component, inject, input, OnInit, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { AccountHead } from '../core/models';
import { must, SupabaseService } from '../core/supabase.service';
import { NotifyService } from '../core/notify.service';

@Component({
  selector: 'app-cash-account-field',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatSelectModule],
  template: `<mat-form-field subscriptSizing="dynamic">
    <mat-label>Cash / bank account</mat-label>
    <mat-select [formControl]="control()">
      @for (account of accounts(); track account.code) {
        <mat-option [value]="account.code">{{ account.name }}</mat-option>
      }
    </mat-select>
    <mat-hint class="cash-hint">{{
      loading()
        ? 'Loading accounts…'
        : !accounts().length
          ? 'Create a cash/bank asset in Account heads.'
          : 'Account receiving or paying the money'
    }}</mat-hint>
    <mat-error>Select a cash or bank account.</mat-error>
  </mat-form-field>`,
  styles: `
    :host,
    mat-form-field {
      display: block;
      width: 100%;
    }
    /* Dynamic sizing keeps the wrapped hint inside the field's own row. */
    .cash-hint {
      line-height: 1.5;
    }
  `,
})
export class CashAccountField implements OnInit {
  readonly control = input.required<FormControl<number | null>>();
  protected readonly accounts = signal<AccountHead[]>([]);
  protected readonly loading = signal(true);
  private readonly sb = inject(SupabaseService).client;
  private readonly notify = inject(NotifyService);
  async ngOnInit() {
    try {
      this.accounts.set(
        await must(
          this.sb.from('account_heads').select('code,name').eq('is_cash_bank', true).order('name'),
        ),
      );
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.loading.set(false);
    }
  }
}
