import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../core/auth.service';
import { Profile, Role } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { must, SupabaseService } from '../../core/supabase.service';

const ROLES: Role[] = ['admin', 'accountant', 'viewer'];

@Component({
  selector: 'app-users',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTooltipModule,
  ],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Users</h1>
        <button mat-flat-button type="button" (click)="showForm.set(!showForm())">
          <mat-icon>person_add</mat-icon> Add user
        </button>
      </div>

      @if (showForm()) {
        <form class="inline-form" [formGroup]="form" (ngSubmit)="create()">
          <mat-form-field><mat-label>Email</mat-label><input matInput type="email" formControlName="email" autocomplete="off" /></mat-form-field>
          <mat-form-field><mat-label>Full name</mat-label><input matInput formControlName="full_name" /></mat-form-field>
          <mat-form-field>
            <mat-label>Initial password</mat-label>
            <input matInput type="password" formControlName="password" autocomplete="new-password" />
            <mat-hint>At least 8 characters</mat-hint>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Role</mat-label>
            <mat-select formControlName="role">
              @for (role of roles; track role) { <mat-option [value]="role">{{ role }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <div class="form-actions">
            <button mat-flat-button type="submit" [disabled]="form.invalid || busy()">Create</button>
            <button mat-button type="button" (click)="showForm.set(false)">Cancel</button>
          </div>
        </form>
      }

      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>User</th><th>Full name</th><th>Role</th><th>Active</th><th></th></tr></thead>
          <tbody>
            @for (user of users(); track user.user_id) {
              <tr>
                <td>{{ user.username }}</td>
                <td>{{ user.full_name }}</td>
                <td>
                  <mat-form-field subscriptSizing="dynamic" class="compact">
                    <mat-select [value]="user.role" (selectionChange)="update(user, { role: $event.value })"
                                [disabled]="isSelf(user)">
                      @for (role of roles; track role) { <mat-option [value]="role">{{ role }}</mat-option> }
                    </mat-select>
                  </mat-form-field>
                </td>
                <td>
                  <mat-slide-toggle [checked]="user.is_active" [disabled]="isSelf(user)"
                                    (change)="update(user, { is_active: $event.checked })" />
                </td>
                <td class="row-actions">
                  <button mat-icon-button type="button" (click)="resetPassword(user)" matTooltip="Set a new password"
                          aria-label="Set a new password">
                    <mat-icon>key</mat-icon>
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <p class="hint">You cannot change your own role or deactivate yourself, so there is always an admin.</p>
    </div>
  `,
})
export class Users implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly sb = inject(SupabaseService).client;
  private readonly notify = inject(NotifyService);

  protected readonly roles = ROLES;
  protected readonly users = signal<Profile[]>([]);
  protected readonly showForm = signal(false);
  protected readonly busy = signal(false);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    full_name: [''],
    password: ['', [Validators.required, Validators.minLength(8)]],
    role: ['viewer' as Role, Validators.required],
  });

  ngOnInit(): void {
    this.load();
  }

  protected isSelf(user: Profile): boolean {
    return user.user_id === this.auth.profile()?.user_id;
  }

  protected async create(): Promise<void> {
    this.busy.set(true);
    try {
      const v = this.form.getRawValue();
      await this.invoke({ action: 'create', ...v, email: v.email.trim() });
      this.notify.success(`User ${v.email} created`);
      this.form.reset();
      this.showForm.set(false);
      await this.load();
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.busy.set(false);
    }
  }

  protected async update(user: Profile, change: Partial<Pick<Profile, 'role' | 'is_active'>>): Promise<void> {
    try {
      await must(this.sb.from('profiles').update(change).eq('user_id', user.user_id));
      this.notify.success(`Updated ${user.username}`);
    } catch (err) {
      this.notify.error(err);
    }
    await this.load();
  }

  protected async resetPassword(user: Profile): Promise<void> {
    const password = prompt(`New password for ${user.username} (at least 8 characters):`);
    if (!password) {
      return;
    }
    if (password.length < 8) {
      this.notify.error(new Error('Password must be at least 8 characters.'));
      return;
    }
    try {
      await this.invoke({ action: 'set_password', user_id: user.user_id, password });
      this.notify.success(`Password changed for ${user.username}`);
    } catch (err) {
      this.notify.error(err);
    }
  }

  private async invoke(body: Record<string, unknown>): Promise<void> {
    const { data, error } = await this.sb.functions.invoke('admin-users', { body });
    if (error) {
      // The function returns { error } with a 4xx status; surface that message.
      const context = (error as { context?: Response }).context;
      const detail = context ? await context.json().catch(() => null) : null;
      throw new Error(detail?.error ?? error.message);
    }
    if (data?.error) {
      throw new Error(data.error);
    }
  }

  private async load(): Promise<void> {
    try {
      this.users.set(
        await must(this.sb.from('profiles').select('user_id, username, full_name, role, is_active').order('username')),
      );
    } catch (err) {
      this.notify.error(err);
    }
  }
}
