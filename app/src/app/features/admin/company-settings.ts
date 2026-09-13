import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { CompanyService } from '../../core/company.service';
import { NotifyService } from '../../core/notify.service';
import { EnterToNext } from '../../shared/enter-to-next.directive';

@Component({
  selector: 'app-company-settings',
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, EnterToNext],
  template: `
    <div class="page narrow-page">
      <div class="page-header"><h1>Company Settings</h1></div>
      <p class="hint">Shown in the header and on every printed report.</p>
      <form [formGroup]="form" (ngSubmit)="save()" appEnterToNext>
        <mat-form-field class="full"><mat-label>Company name</mat-label><input matInput formControlName="name" /></mat-form-field>
        <mat-form-field class="full"><mat-label>Place</mat-label><input matInput formControlName="place" /></mat-form-field>
        <mat-form-field class="full"><mat-label>Phone</mat-label><input matInput type="tel" formControlName="phone" /></mat-form-field>
        <mat-form-field class="full"><mat-label>GSTIN</mat-label><input matInput formControlName="gstin" maxlength="15" /></mat-form-field>
        <div class="form-actions">
          <button mat-flat-button type="submit" [disabled]="form.invalid || saving()">Save</button>
        </div>
      </form>
    </div>
  `,
})
export class CompanySettingsPage implements OnInit {
  private readonly company = inject(CompanyService);
  private readonly notify = inject(NotifyService);

  protected readonly saving = signal(false);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.pattern(/\S/)]],
    place: [''],
    phone: [''],
    gstin: [''],
  });

  async ngOnInit(): Promise<void> {
    try {
      await this.company.load();
      const s = this.company.settings();
      if (s) {
        this.form.reset({ name: s.name, place: s.place, phone: s.phone ?? '', gstin: s.gstin ?? '' });
      }
    } catch (err) {
      this.notify.error(err);
    }
  }

  protected async save(): Promise<void> {
    const v = this.form.getRawValue();
    this.saving.set(true);
    try {
      await this.company.save({
        name: v.name.trim(),
        place: v.place.trim(),
        phone: v.phone.trim() || null,
        gstin: v.gstin.trim().toUpperCase() || null,
      });
      this.notify.success('Company settings saved');
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.saving.set(false);
    }
  }
}
