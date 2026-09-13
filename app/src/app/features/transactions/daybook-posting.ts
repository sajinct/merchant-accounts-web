import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { NotifyService } from '../../core/notify.service';
import { must, SupabaseService } from '../../core/supabase.service';
import { addDays, isoDate } from '../../shared/dates';

@Component({
  selector: 'app-daybook-posting',
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  template: `
    <div class="page narrow-page">
      <div class="page-header"><h1>Day Book Posting</h1></div>
      <p>
        Copies vouchers into the day book for the chosen dates. Automatic entries already in the range are
        replaced, so posting the same dates again is safe. Manual day book entries are not touched.
      </p>
      <form [formGroup]="form" (ngSubmit)="post()">
        <div class="form-grid">
          <mat-form-field>
            <mat-label>From</mat-label>
            <input matInput type="date" formControlName="from" />
          </mat-form-field>
          <mat-form-field>
            <mat-label>To</mat-label>
            <input matInput type="date" formControlName="to" />
          </mat-form-field>
        </div>
        @if (lastDate()) {
          <p class="hint">Day book currently runs to {{ lastDate() }}.</p>
        }
        <div class="form-actions">
          <button mat-flat-button type="submit" [disabled]="form.invalid || busy()">
            <mat-icon>publish</mat-icon> {{ busy() ? 'Posting…' : 'Post' }}
          </button>
        </div>
      </form>
    </div>
  `,
})
export class DaybookPosting implements OnInit {
  private readonly sb = inject(SupabaseService).client;
  private readonly notify = inject(NotifyService);

  protected readonly busy = signal(false);
  protected readonly lastDate = signal<string | null>(null);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    from: [isoDate(), Validators.required],
    to: [isoDate(), Validators.required],
  });

  async ngOnInit(): Promise<void> {
    try {
      const last = await must(this.sb.rpc('daybook_last_date'));
      this.lastDate.set(last as string | null);
      if (last) {
        const next = addDays(last as string, 1);
        this.form.patchValue({ from: next <= isoDate() ? next : isoDate() });
      }
    } catch (err) {
      this.notify.error(err);
    }
  }

  protected async post(): Promise<void> {
    const { from, to } = this.form.getRawValue();
    if (from > to) {
      this.notify.error(new Error('"From" date must not be after "To" date.'));
      return;
    }
    this.busy.set(true);
    try {
      const count = await must(this.sb.rpc('post_daybook', { p_from: from, p_to: to }));
      this.notify.success(`Day book posting completed: ${count} entries.`);
      this.lastDate.set((await must(this.sb.rpc('daybook_last_date'))) as string | null);
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.busy.set(false);
    }
  }
}
