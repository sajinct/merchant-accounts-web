import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
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
import { confirmAction } from '../../shared/confirm-dialog';
import { PageHeader } from '../../shared/page-header';
import { EmptyState } from '../../shared/empty-state';
import { EnterToNext } from '../../shared/enter-to-next.directive';
import { EntrySelect } from '../../shared/entry-select.directive';

const ROLES: Role[] = ['admin', 'accountant', 'viewer'];

@Component({
  selector: 'app-users',
  imports: [
    EnterToNext,
    EntrySelect,
    EmptyState,
    PageHeader,
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
      <app-page-header
        eyebrow="Administration"
        heading="Users & access"
        description="Manage your team’s accounts, roles and access to the workspace."
      >
        <button mat-flat-button type="button" (click)="showForm.set(!showForm())">
          <mat-icon>{{ showForm() ? 'close' : 'person_add' }}</mat-icon>
          {{ showForm() ? 'Close form' : 'Add user' }}
        </button>
      </app-page-header>

      @if (showForm()) {
        <form
          appEnterToNext
          class="panel new-user-panel"
          [formGroup]="form"
          (ngSubmit)="create()"
          aria-labelledby="new-user-heading"
        >
          <div class="panel-header">
            <h2 id="new-user-heading">Add a team member</h2>
            <span class="hint">Account details</span>
          </div>
          <div class="panel-body">
            <div class="form-grid">
              <mat-form-field
                ><mat-label>Email address</mat-label
                ><input
                  matInput
                  type="email"
                  formControlName="email"
                  autocomplete="off"
                /><mat-error>Enter a valid email address.</mat-error></mat-form-field
              >
              <mat-form-field
                ><mat-label>Full name</mat-label><input matInput formControlName="full_name"
              /></mat-form-field>
              <mat-form-field>
                <mat-label>Initial password</mat-label>
                <input
                  matInput
                  type="password"
                  formControlName="password"
                  autocomplete="new-password"
                />
                <mat-hint>At least 8 characters</mat-hint>
                <mat-error>Use at least 8 characters.</mat-error>
              </mat-form-field>
              <mat-form-field>
                <mat-label>Access role</mat-label>
                <mat-select appEntrySelect formControlName="role">
                  @for (role of roles; track role) {
                    <mat-option [value]="role">{{ roleLabels[role] }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            </div>
            <div class="form-actions">
              <button mat-flat-button type="submit" [disabled]="form.invalid || busy()">
                <mat-icon>check</mat-icon> {{ busy() ? 'Creating…' : 'Create user' }}
              </button>
              <button mat-button type="button" (click)="showForm.set(false)">Cancel</button>
            </div>
          </div>
        </form>
      }

      <section class="panel" aria-labelledby="team-access-heading">
        <div class="panel-header">
          <h2 id="team-access-heading">Team access</h2>
          <span class="status-badge neutral" aria-live="polite">{{
            loading() ? 'Loading…' : users().length + ' users'
          }}</span>
        </div>
        <div
          class="table-wrap"
          tabindex="0"
          role="region"
          aria-label="Users table"
          [attr.aria-busy]="loading()"
        >
          <table class="data-table">
            <thead>
              <tr>
                <th scope="col">User account</th>
                <th scope="col">Full name</th>
                <th scope="col">Access role</th>
                <th scope="col">Status</th>
                <th scope="col"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              @for (user of users(); track user.user_id) {
                <tr>
                  <td>
                    <span class="table-primary">{{ user.username }}</span>
                    @if (isSelf(user)) {
                      <span class="status-badge neutral self-badge">You</span>
                    }
                  </td>
                  <td class="table-secondary">{{ user.full_name || '—' }}</td>
                  <td>
                    <mat-form-field subscriptSizing="dynamic" class="compact">
                      <mat-select
                        [value]="user.role"
                        (selectionChange)="update(user, { role: $event.value })"
                        [disabled]="isSelf(user)"
                        [aria-label]="'Access role for ' + user.username"
                      >
                        <mat-select-trigger
                          ><span
                            class="status-badge"
                            [class.success]="user.role === 'admin'"
                            [class.neutral]="user.role !== 'admin'"
                            >{{ roleLabels[user.role] }}</span
                          ></mat-select-trigger
                        >
                        @for (role of roles; track role) {
                          <mat-option [value]="role">{{ roleLabels[role] }}</mat-option>
                        }
                      </mat-select>
                    </mat-form-field>
                  </td>
                  <td>
                    <div class="status-control">
                      <mat-slide-toggle
                        [checked]="user.is_active"
                        [disabled]="isSelf(user)"
                        [aria-label]="'Active account for ' + user.username"
                        (change)="update(user, { is_active: $event.checked })"
                      />
                      <span
                        class="status-badge"
                        [class.success]="user.is_active"
                        [class.neutral]="!user.is_active"
                        >{{ user.is_active ? 'Active' : 'Inactive' }}</span
                      >
                    </div>
                  </td>
                  <td class="row-actions">
                    <button
                      mat-icon-button
                      type="button"
                      (click)="resetPassword(user)"
                      matTooltip="Set a new password"
                      [attr.aria-label]="'Set a new password for ' + user.username"
                    >
                      <mat-icon>key</mat-icon>
                    </button>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="5">
                    <app-empty-state
                      [icon]="loading() ? 'hourglass_empty' : 'manage_accounts'"
                      [heading]="loading() ? 'Loading your team' : 'No users found'"
                      [message]="
                        loading()
                          ? 'User accounts and access roles will appear here.'
                          : 'Add a user to give your team access to the workspace.'
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
      <p class="hint">
        You cannot change your own role or deactivate yourself, so there is always an admin.
      </p>
    </div>
  `,
  styles: `
    .new-user-panel {
      margin-bottom: 20px;
    }
    .self-badge {
      margin-left: 6px;
    }
  `,
})
export class Users implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly sb = inject(SupabaseService).client;
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);

  protected readonly roles = ROLES;
  protected readonly roleLabels: Record<Role, string> = {
    admin: 'Admin',
    accountant: 'Accountant',
    viewer: 'Viewer',
  };
  protected readonly users = signal<Profile[]>([]);
  protected readonly loading = signal(true);
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

  protected async update(
    user: Profile,
    change: Partial<Pick<Profile, 'role' | 'is_active'>>,
  ): Promise<void> {
    try {
      await must(this.sb.from('profiles').update(change).eq('user_id', user.user_id));
      this.notify.success(`Updated ${user.username}`);
    } catch (err) {
      this.notify.error(err);
    }
    await this.load();
  }

  protected async resetPassword(user: Profile): Promise<void> {
    const result = await confirmAction(this.dialog, {
      title: 'Set a new password',
      message: `${user.username} signs in with this password from now on. Share it with them securely.`,
      fields: [
        {
          key: 'password',
          label: 'New password',
          type: 'password',
          required: true,
          minLength: 8,
          hint: 'At least 8 characters',
        },
      ],
      confirmLabel: 'Set password',
    });
    if (!result) {
      return;
    }
    const password = result['password'];
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
    this.loading.set(true);
    try {
      this.users.set(
        await must(
          this.sb
            .from('profiles')
            .select('user_id, username, full_name, role, is_active')
            .order('username'),
        ),
      );
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.loading.set(false);
    }
  }
}
