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

/** Codes from 9000 up are reserved for system heads (as in the desktop app). */
const SYSTEM_CODE_START = 9000;

@Component({
  selector: 'app-account-heads',
  imports: [
    MatSelectModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    EnterToNext,
  ],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="page-heading">
          <span class="eyebrow">Accounting setup</span>
          <h1>Account heads</h1>
          <p class="page-description">
            Organize the accounts used across your transactions and reports.
          </p>
        </div>
        @if (auth.canEdit()) {
          <button mat-flat-button type="button" (click)="startNew()">
            <mat-icon>add</mat-icon> New head
          </button>
        }
      </div>

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
                      <span
                        class="status-badge"
                        [class.neutral]="head.code >= systemCodeStart"
                        [class.success]="head.code < systemCodeStart"
                        >{{ head.account_type || 'Needs classification'
                        }}{{ head.is_cash_bank ? ' · Cash/bank' : '' }}</span
                      >
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="3">
                      <div class="empty-state" role="status">
                        <mat-icon class="empty-icon">{{
                          loading() ? 'hourglass_empty' : 'account_tree'
                        }}</mat-icon>
                        <h3>
                          {{ loading() ? 'Loading account heads' : 'No account heads found' }}
                        </h3>
                        <p>
                          {{
                            loading()
                              ? 'Your accounts will appear here.'
                              : filter()
                                ? 'Try another account name or code.'
                                : 'Create an account head to organize your transactions.'
                          }}
                        </p>
                      </div>
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
                <mat-select formControlName="account_type">
                  @for (type of ['asset', 'liability', 'equity', 'income', 'expense']; track type) {
                    <mat-option [value]="type">{{ type }}</mat-option>
                  }</mat-select
                ><mat-error>Select an account classification.</mat-error>
              </mat-form-field>
              <mat-form-field
                ><mat-label>Cash / bank account</mat-label>
                <mat-select formControlName="is_cash_bank"
                  ><mat-option [value]="false">No</mat-option
                  ><mat-option [value]="true">Yes (asset only)</mat-option></mat-select
                >
              </mat-form-field>
              <p class="hint">Classification is locked after the first posted entry.</p>
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
      min-width: 340px;
    }
  `,
})
export class AccountHeads implements OnInit {
  protected readonly systemCodeStart = SYSTEM_CODE_START;
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
  });

  ngOnInit(): void {
    this.load();
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
    const { code, name, account_type, is_cash_bank } = this.form.getRawValue();
    if (this.form.invalid || code === null || !name) {
      return;
    }
    this.saving.set(true);
    try {
      const editing = this.editingCode();
      if (editing) {
        await must(
          this.sb
            .from('account_heads')
            .update({ name: name.trim(), account_type, is_cash_bank })
            .eq('code', editing),
        );
        this.form.markAsPristine();
        this.notify.success('Account head updated');
      } else {
        await must(
          this.sb
            .from('account_heads')
            .insert({ code, name: name.trim(), account_type, is_cash_bank }),
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
            .select('code, name, account_type, is_cash_bank')
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
