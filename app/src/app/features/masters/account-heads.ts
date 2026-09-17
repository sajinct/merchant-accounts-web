import { MatSelectModule } from '@angular/material/select';
import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { AuthService } from '../../core/auth.service';
import { AccountHead } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { must, SupabaseService } from '../../core/supabase.service';
import { EnterToNext } from '../../shared/enter-to-next.directive';
import { EntrySelect } from '../../shared/entry-select.directive';
import { PageHeader } from '../../shared/page-header';
import { EmptyState } from '../../shared/empty-state';

/** Codes from 9000 up are reserved for system heads (as in the desktop app). */
const SYSTEM_CODE_START = 9000;

@Component({
  selector: 'app-account-heads',
  imports: [
    EmptyState,
    PageHeader,
    MatSelectModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    EnterToNext,
    EntrySelect,
  ],
  template: `
    <div class="page">
      <app-page-header
        eyebrow="Accounting setup"
        heading="Account heads"
        description="Organize the accounts used across your transactions and reports."
      >
        @if (auth.canEdit()) {
          <button mat-flat-button type="button" (click)="startNew()">
            <mat-icon>add</mat-icon> New head
          </button>
        }
      </app-page-header>

      <div class="split">
        <section class="split-main panel" aria-label="Account heads">
          <div class="toolbar-panel">
            <mat-form-field class="search-field" subscriptSizing="dynamic">
              <mat-label>Search account heads</mat-label>
              <mat-icon matPrefix>search</mat-icon>
              <input
                matInput
                placeholder="Code or account name"
                [value]="filter()"
                (input)="filter.set($any($event.target).value)"
              />
            </mat-form-field>
            <span class="toolbar-count" aria-live="polite">{{
              loading() ? 'Loading accounts…' : filtered().length + ' accounts'
            }}</span>
          </div>

          <div
            class="table-wrap"
            tabindex="0"
            role="region"
            aria-label="Account heads table"
            [attr.aria-busy]="loading()"
          >
            <table class="data-table">
              <thead>
                <tr>
                  <th scope="col" class="num">Code</th>
                  <th scope="col">Account name</th>
                  <th scope="col">Type</th>
                </tr>
              </thead>
              <tbody>
                @for (head of filtered(); track head.code) {
                  <tr
                    class="clickable"
                    [class.selected]="editingCode() === head.code"
                    (click)="edit(head)"
                  >
                    <td class="num">{{ head.code }}</td>
                    <td>
                      <button
                        class="table-link"
                        type="button"
                        (click)="$event.stopPropagation(); edit(head)"
                        [attr.aria-pressed]="editingCode() === head.code"
                      >
                        {{ head.name }}
                      </button>
                    </td>
                    <td>
                      <div class="account-tags">
                        <span class="status-badge neutral account-type">
                          {{ head.account_type || 'Needs classification' }}
                        </span>
                        @if (head.is_cash_bank) {
                          <span class="account-detail">Cash / bank</span>
                        }
                        @if (head.is_group) {
                          <span class="account-detail">Group</span>
                        }
                        @if (head.is_active === false) {
                          <span class="status-badge warning">Retired</span>
                        }
                      </div>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="3">
                      <app-empty-state
                        [icon]="loading() ? 'hourglass_empty' : 'account_tree'"
                        [heading]="loading() ? 'Loading account heads' : 'No account heads found'"
                        [message]="
                          loading()
                            ? 'Your accounts will appear here.'
                            : filter()
                              ? 'Try another account name or code.'
                              : 'Create an account head to organize your transactions.'
                        "
                        status
                      />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        @if (formOpen()) {
          <form
            #headForm
            class="side-form panel"
            [formGroup]="form"
            (ngSubmit)="save()"
            appEnterToNext
            aria-labelledby="account-head-form-heading"
          >
            <div class="panel-header">
              <h2 id="account-head-form-heading">
                {{ editingCode() ? 'Account details' : 'New account head' }}
              </h2>
              <button
                mat-icon-button
                type="button"
                (click)="close()"
                aria-label="Close account details"
              >
                <mat-icon>close</mat-icon>
              </button>
            </div>
            <div class="panel-body field-stack">
              <mat-form-field>
                <mat-label>Account code</mat-label>
                <input matInput type="number" formControlName="code" [readonly]="!!editingCode()" />
                <mat-error>Enter a code greater than zero.</mat-error>
              </mat-form-field>
              <mat-form-field>
                <mat-label>Account name</mat-label>
                <input matInput formControlName="name" maxlength="100" />
                <mat-error>Enter an account name.</mat-error>
              </mat-form-field>
              <mat-form-field
                ><mat-label>Classification</mat-label>
                <mat-select appEntrySelect formControlName="account_type">
                  @for (type of ['asset', 'liability', 'equity', 'income', 'expense']; track type) {
                    <mat-option [value]="type">{{ type }}</mat-option>
                  }</mat-select
                ><mat-error>Select an account classification.</mat-error>
              </mat-form-field>
              <mat-form-field
                ><mat-label>Cash / bank account</mat-label>
                <mat-select appEntrySelect formControlName="is_cash_bank"
                  ><mat-option [value]="false">No</mat-option
                  ><mat-option [value]="true">Yes (asset only)</mat-option></mat-select
                >
              </mat-form-field>
              <mat-form-field subscriptSizing="dynamic"
                ><mat-label>Posting</mat-label>
                <mat-select appEntrySelect formControlName="posting">
                  <mat-option value="ledger">Ledger</mat-option>
                  <mat-option value="group">Group</mat-option>
                  <mat-option value="retired">Retired</mat-option>
                </mat-select>
                <mat-hint>{{ postingHint() }}</mat-hint>
              </mat-form-field>
              <div class="form-actions">
                <button
                  mat-flat-button
                  type="submit"
                  [disabled]="form.invalid || saving() || !auth.canEdit()"
                >
                  <mat-icon>check</mat-icon>
                  {{ saving() ? 'Saving…' : editingCode() ? 'Save changes' : 'Create account' }}
                </button>
                <button mat-button type="button" (click)="close()">Cancel</button>
              </div>
            </div>
          </form>
        }
      </div>
    </div>
  `,
  styles: `
    .data-table {
      min-width: 420px;
    }
    .account-tags {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 10px;
      max-width: 260px;
    }
    .account-type {
      text-transform: capitalize;
    }
    .account-detail {
      color: var(--app-muted);
      font-size: 12px;
      white-space: nowrap;
    }
    .side-form {
      flex-basis: 340px;
    }
    .field-stack .form-actions {
      margin-top: 16px;
    }
    @media (max-width: 1199px) {
      .side-form {
        flex-basis: 100%;
      }
    }
    @media (max-width: 600px) {
      .side-form .field-stack {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
})
export class AccountHeads implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly sb = inject(SupabaseService).client;
  private readonly notify = inject(NotifyService);
  private readonly injector = inject(Injector);
  private readonly headForm = viewChild<ElementRef<HTMLFormElement>>('headForm');

  protected readonly heads = signal<AccountHead[]>([]);
  protected readonly filter = signal('');
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly editingCode = signal<number | null>(null);

  protected readonly filtered = computed(() => {
    const q = this.filter().trim().toLowerCase();
    return q
      ? this.heads().filter((h) => h.name.toLowerCase().includes(q) || String(h.code).startsWith(q))
      : this.heads();
  });

  protected readonly form = inject(FormBuilder).group({
    code: [null as number | null, [Validators.required, Validators.min(1)]],
    name: ['', [Validators.required, Validators.pattern(/\S/)]],
    account_type: ['asset', Validators.required],
    is_cash_bank: [false],
    posting: ['ledger'],
  });

  ngOnInit(): void {
    this.load();
  }

  protected postingHint(): string {
    switch (this.form.controls.posting.value) {
      case 'group':
        return 'Organizes the chart of accounts. Cannot receive voucher entries.';
      case 'retired':
        return 'Keeps historical entries. Cannot receive new voucher entries.';
      default:
        return 'Available when entering voucher lines.';
    }
  }

  hasPendingChanges(): boolean {
    return this.formOpen() && this.form.dirty && !this.saving();
  }

  protected startNew(): void {
    const userCodes = this.heads()
      .map((h) => h.code)
      .filter((c) => c < SYSTEM_CODE_START);
    this.editingCode.set(null);
    this.form.reset({
      code: userCodes.length ? Math.max(...userCodes) + 1 : 1001,
      name: '',
      account_type: 'asset',
      is_cash_bank: false,
      posting: 'ledger',
    });
    this.formOpen.set(true);
    this.focusForm();
  }

  protected edit(head: AccountHead): void {
    this.editingCode.set(head.code);
    this.form.reset({
      code: head.code,
      name: head.name,
      account_type: head.account_type ?? null,
      is_cash_bank: head.is_cash_bank ?? false,
      posting: head.is_group ? 'group' : head.is_active === false ? 'retired' : 'ledger',
    });
    this.formOpen.set(true);
    this.focusForm();
  }

  private focusForm(): void {
    afterNextRender(
      () => {
        const form = this.headForm()?.nativeElement;
        form?.scrollIntoView({ block: 'nearest' });
        form
          ?.querySelector<HTMLInputElement>('input:not([readonly])')
          ?.focus({ preventScroll: true });
      },
      { injector: this.injector },
    );
  }

  protected close(): void {
    this.formOpen.set(false);
    this.editingCode.set(null);
  }

  protected async save(): Promise<void> {
    const { code, name, account_type, is_cash_bank, posting } = this.form.getRawValue();
    if (this.form.invalid || code === null || !name) {
      return;
    }
    const flags = { is_group: posting === 'group', is_active: posting !== 'retired' };
    this.saving.set(true);
    try {
      const editing = this.editingCode();
      if (editing) {
        await must(
          this.sb
            .from('account_heads')
            .update({ name: name.trim(), account_type, is_cash_bank, ...flags })
            .eq('code', editing),
        );
        this.form.markAsPristine();
        this.notify.success('Account head updated');
      } else {
        await must(
          this.sb
            .from('account_heads')
            .insert({ code, name: name.trim(), account_type, is_cash_bank, ...flags }),
        );
        this.notify.success('Account head added');
        this.close();
      }
      await this.load();
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.saving.set(false);
    }
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.heads.set(
        await must(
          this.sb
            .from('account_heads')
            .select('code, name, account_type, is_cash_bank, is_group, is_active')
            .order('name'),
        ),
      );
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.loading.set(false);
    }
  }
}
