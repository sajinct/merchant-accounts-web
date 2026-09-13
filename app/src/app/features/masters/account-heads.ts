import { Component, computed, inject, OnInit, signal } from '@angular/core';
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
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, EnterToNext],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Account Heads</h1>
        @if (auth.canEdit()) {
          <button mat-flat-button type="button" (click)="startNew()"><mat-icon>add</mat-icon> New head</button>
        }
      </div>

      <div class="split">
        <div class="split-main">
          <mat-form-field class="search-field" subscriptSizing="dynamic">
            <mat-label>Search by code or name</mat-label>
            <input matInput [value]="filter()" (input)="filter.set($any($event.target).value)" />
            <mat-icon matSuffix>search</mat-icon>
          </mat-form-field>

          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th class="num">Code</th><th>Name</th></tr></thead>
              <tbody>
                @for (head of filtered(); track head.code) {
                  <tr class="clickable" [class.selected]="editingCode() === head.code" (click)="edit(head)">
                    <td class="num">{{ head.code }}</td>
                    <td>{{ head.name }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="2" class="empty">{{ loading() ? 'Loading…' : 'No account heads found.' }}</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        @if (formOpen()) {
          <form class="side-form" [formGroup]="form" (ngSubmit)="save()" appEnterToNext>
            <h2>{{ editingCode() ? 'Edit head ' + editingCode() : 'New head' }}</h2>
            <mat-form-field>
              <mat-label>Code</mat-label>
              <input matInput type="number" formControlName="code" [readonly]="!!editingCode()" />
            </mat-form-field>
            <mat-form-field>
              <mat-label>Name</mat-label>
              <input matInput formControlName="name" maxlength="100" />
            </mat-form-field>
            <div class="form-actions">
              <button mat-flat-button type="submit" [disabled]="form.invalid || saving() || !auth.canEdit()">
                {{ editingCode() ? 'Update' : 'Save' }}
              </button>
              <button mat-button type="button" (click)="close()">Close</button>
            </div>
          </form>
        }
      </div>
    </div>
  `,
})
export class AccountHeads implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly sb = inject(SupabaseService).client;
  private readonly notify = inject(NotifyService);

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
  });

  ngOnInit(): void {
    this.load();
  }

  protected startNew(): void {
    const userCodes = this.heads().map((h) => h.code).filter((c) => c < SYSTEM_CODE_START);
    this.editingCode.set(null);
    this.form.reset({ code: userCodes.length ? Math.max(...userCodes) + 1 : 1001, name: '' });
    this.formOpen.set(true);
  }

  protected edit(head: AccountHead): void {
    this.editingCode.set(head.code);
    this.form.reset({ code: head.code, name: head.name });
    this.formOpen.set(true);
  }

  protected close(): void {
    this.formOpen.set(false);
    this.editingCode.set(null);
  }

  protected async save(): Promise<void> {
    const { code, name } = this.form.getRawValue();
    if (this.form.invalid || code === null || !name) {
      return;
    }
    this.saving.set(true);
    try {
      const editing = this.editingCode();
      if (editing) {
        await must(this.sb.from('account_heads').update({ name: name.trim() }).eq('code', editing));
        this.notify.success('Account head updated');
      } else {
        await must(this.sb.from('account_heads').insert({ code, name: name.trim() }));
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
      this.heads.set(await must(this.sb.from('account_heads').select('code, name').order('name')));
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.loading.set(false);
    }
  }
}
