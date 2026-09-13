import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AuthService } from '../../core/auth.service';
import { NotifyService } from '../../core/notify.service';

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  return group.get('password')?.value === group.get('confirm')?.value ? null : { mismatch: true };
}

@Component({
  selector: 'app-change-password',
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <div class="page narrow-page">
      <div class="page-header"><h1>Change Password</h1></div>
      <form [formGroup]="form" (ngSubmit)="save()">
        <mat-form-field class="full">
          <mat-label>New password</mat-label>
          <input matInput type="password" formControlName="password" autocomplete="new-password" />
          <mat-hint>At least 8 characters</mat-hint>
        </mat-form-field>
        <mat-form-field class="full">
          <mat-label>Confirm new password</mat-label>
          <input matInput type="password" formControlName="confirm" autocomplete="new-password" />
        </mat-form-field>
        @if (form.hasError('mismatch') && form.controls.confirm.touched) {
          <p class="form-error" role="alert">The passwords do not match.</p>
        }
        <div class="form-actions">
          <button mat-flat-button type="submit" [disabled]="form.invalid || saving()">Change password</button>
        </div>
      </form>
    </div>
  `,
})
export class ChangePassword {
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotifyService);

  protected readonly saving = signal(false);
  protected readonly form = inject(FormBuilder).nonNullable.group(
    {
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirm: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );

  protected async save(): Promise<void> {
    this.saving.set(true);
    try {
      await this.auth.changePassword(this.form.controls.password.value);
      this.notify.success('Password changed');
      this.form.reset();
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.saving.set(false);
    }
  }
}
