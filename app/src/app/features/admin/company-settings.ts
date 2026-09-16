import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { CompanyService } from '../../core/company.service';
import { NotifyService } from '../../core/notify.service';
import { EnterToNext } from '../../shared/enter-to-next.directive';
import { PageHeader } from '../../shared/page-header';

@Component({
  selector: 'app-company-settings',
  imports: [
    PageHeader,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    EnterToNext,
  ],
  template: `
    <div class="page narrow-page">
      <app-page-header
        eyebrow="Administration"
        heading="Company settings"
        description="Keep your business identity and report details up to date."
      />
      <form [formGroup]="form" (ngSubmit)="save()" appEnterToNext>
        <section class="panel" aria-labelledby="company-details-heading">
          <div class="panel-header">
            <h2 id="company-details-heading">Business details</h2>
            <mat-icon>business</mat-icon>
          </div>
          <div class="panel-body">
            <div class="form-grid">
              <mat-form-field class="wide"
                ><mat-label>Company name</mat-label
                ><input matInput formControlName="name" autocomplete="organization" /><mat-error
                  >Enter your company name.</mat-error
                ></mat-form-field
              >
              <mat-form-field class="wide"
                ><mat-label>Place</mat-label
                ><input matInput formControlName="place" autocomplete="address-level2"
              /></mat-form-field>
              <mat-form-field
                ><mat-label>Phone</mat-label
                ><input matInput type="tel" formControlName="phone" autocomplete="tel"
              /></mat-form-field>
              <mat-form-field
                ><mat-label>GSTIN</mat-label><input matInput formControlName="gstin" maxlength="15"
              /></mat-form-field>
            </div>
            <p class="hint company-note">
              <mat-icon>info_outline</mat-icon
              ><span>These details appear in the workspace header and on printed reports.</span>
            </p>
          </div>
        </section>
        <div class="form-actions">
          <button mat-flat-button type="submit" [disabled]="form.invalid || saving()">
            <mat-icon>check</mat-icon> {{ saving() ? 'Saving…' : 'Save changes' }}
          </button>
        </div>
      </form>
    </div>
  `,
  styles: `
    .company-note {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin: 4px 0 0;
    }
    .company-note mat-icon {
      flex: 0 0 18px;
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
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

  hasPendingChanges(): boolean {
    return this.form.dirty && !this.saving();
  }

  async ngOnInit(): Promise<void> {
    try {
      await this.company.load();
      const s = this.company.settings();
      if (s) {
        this.form.reset({
          name: s.name,
          place: s.place,
          phone: s.phone ?? '',
          gstin: s.gstin ?? '',
        });
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
      this.form.markAsPristine();
      this.notify.success('Company settings saved');
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.saving.set(false);
    }
  }
}
