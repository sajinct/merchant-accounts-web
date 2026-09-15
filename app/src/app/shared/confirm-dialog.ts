import { Component, inject } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { firstValueFrom } from 'rxjs';

export interface ConfirmField {
  key: string;
  label: string;
  type?: 'text' | 'password' | 'date';
  value?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  /** Inclusive YYYY-MM-DD bounds for date fields. */
  min?: string;
  max?: string;
  hint?: string;
}

export interface ConfirmOptions {
  title: string;
  message?: string;
  /** Label/value pairs that identify the record being acted on. */
  details?: { label: string; value: string }[];
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as a destructive action. */
  destructive?: boolean;
  fields?: ConfirmField[];
}

function withinDates(min?: string, max?: string): ValidatorFn {
  return (control) => {
    const value = control.value as string;
    if (!value) return null;
    if ((min && value < min) || (max && value > max)) return { range: true };
    return null;
  };
}

@Component({
  selector: 'app-confirm-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  template: `
    <form [formGroup]="form" (ngSubmit)="confirm()">
      <h2 mat-dialog-title>
        @if (data.destructive) {
          <mat-icon class="title-icon">warning_amber</mat-icon>
        }
        {{ data.title }}
      </h2>
      <mat-dialog-content>
        @if (data.message) {
          <p class="message">{{ data.message }}</p>
        }
        @if (data.details?.length) {
          <dl class="details">
            @for (detail of data.details; track detail.label) {
              <div>
                <dt>{{ detail.label }}</dt>
                <dd>{{ detail.value }}</dd>
              </div>
            }
          </dl>
        }
        @for (field of fields; track field.key) {
          <mat-form-field class="full">
            <mat-label>{{ field.label }}</mat-label>
            <input
              matInput
              [type]="field.type ?? 'text'"
              [formControlName]="field.key"
              [attr.min]="field.min ?? null"
              [attr.max]="field.max ?? null"
              [attr.maxlength]="field.maxLength ?? null"
              [attr.autocomplete]="field.type === 'password' ? 'new-password' : 'off'"
            />
            @if (field.hint) {
              <mat-hint>{{ field.hint }}</mat-hint>
            }
            <mat-error>{{ errorFor(field) }}</mat-error>
          </mat-form-field>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" [mat-dialog-close]="null">
          {{ data.cancelLabel ?? 'Cancel' }}
        </button>
        <button mat-flat-button type="submit" [class.destructive]="data.destructive">
          {{ data.confirmLabel ?? 'Confirm' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    h2 {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .title-icon {
      flex-shrink: 0;
      color: var(--mat-sys-error);
    }
    .message {
      margin: 0 0 16px;
      line-height: 1.7;
    }
    .details {
      margin: 0 0 16px;
      padding: 10px 12px;
      border-radius: 8px;
      background: var(--mat-sys-surface-container-low);
    }
    .details div {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 3px 0;
      font-size: 12px;
    }
    .details dt {
      color: var(--app-muted);
    }
    .details dd {
      margin: 0;
      font-weight: 600;
      text-align: right;
      font-variant-numeric: tabular-nums;
      overflow-wrap: anywhere;
    }
    mat-form-field + mat-form-field {
      margin-top: 4px;
    }
    mat-dialog-actions {
      gap: 4px;
      padding: 12px 24px 20px;
    }
    .destructive {
      --mat-button-filled-container-color: var(--mat-sys-error);
      --mat-button-filled-label-text-color: var(--mat-sys-on-error);
    }
  `,
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmOptions>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<ConfirmDialog, Record<string, string>>>(MatDialogRef);
  protected readonly fields = this.data.fields ?? [];
  protected readonly form = new FormGroup(
    Object.fromEntries(
      this.fields.map((field) => {
        const validators: ValidatorFn[] = [];
        if (field.required) validators.push(Validators.required, Validators.pattern(/\S/));
        if (field.minLength) validators.push(Validators.minLength(field.minLength));
        if (field.type === 'date') validators.push(withinDates(field.min, field.max));
        return [field.key, new FormControl(field.value ?? '', { nonNullable: true, validators })];
      }),
    ),
  );

  protected errorFor(field: ConfirmField): string {
    const control = this.form.controls[field.key];
    if (control.hasError('required') || control.hasError('pattern'))
      return `${field.label} is required.`;
    if (control.hasError('minlength')) return `Use at least ${field.minLength} characters.`;
    if (control.hasError('range')) return 'Choose a date within the selected financial year.';
    return '';
  }

  protected confirm(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const values = this.form.getRawValue() as Record<string, string>;
    for (const field of this.fields) {
      if (field.type !== 'password') values[field.key] = values[field.key].trim();
    }
    this.ref.close(values);
  }
}

/**
 * Opens a confirmation dialog. Resolves to the entered field values when confirmed
 * (an empty object when there are no fields), or `null` when dismissed.
 */
export async function confirmAction(
  dialog: MatDialog,
  options: ConfirmOptions,
): Promise<Record<string, string> | null> {
  const ref = dialog.open<ConfirmDialog, ConfirmOptions, Record<string, string>>(ConfirmDialog, {
    data: options,
    width: '440px',
    maxWidth: 'calc(100vw - 32px)',
    autoFocus: 'first-tabbable',
    restoreFocus: true,
  });
  return (await firstValueFrom(ref.afterClosed())) ?? null;
}
