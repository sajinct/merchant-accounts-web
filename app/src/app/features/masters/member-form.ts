import { Component, inject, input, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { AuthService } from '../../core/auth.service';
import { Customer } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { must, SupabaseService } from '../../core/supabase.service';
import { EnterToNext } from '../../shared/enter-to-next.directive';
import { WebcamCapture } from '../../shared/webcam-capture';

const PHOTO_BUCKET = 'customer-photos';
const TEXT_FIELDS = [
  'salutation',
  'addr1',
  'addr2',
  'addr3',
  'addr4',
  'phone',
  'aadhaar',
  'pan',
  'id_type',
  'id_no',
] as const;

@Component({
  selector: 'app-member-form',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    EnterToNext,
    WebcamCapture,
  ],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="page-heading">
          <span class="eyebrow">Member directory</span>
          <h1>
            {{
              isNew()
                ? 'New member'
                : form.controls.name.value || 'Member ' + form.controls.code.value
            }}
          </h1>
          <p class="page-description">
            {{
              isNew()
                ? 'Create a member profile with contact and identity details.'
                : 'View and maintain this member’s profile.'
            }}
          </p>
        </div>
        <a mat-stroked-button routerLink="/masters/members"
          ><mat-icon>arrow_back</mat-icon> All members</a
        >
      </div>

      <form class="member-form" [formGroup]="form" (ngSubmit)="save()" appEnterToNext>
        <div class="form-section-stack">
          <section class="panel" aria-labelledby="member-details-heading">
            <div class="panel-header">
              <h2 id="member-details-heading">Member details</h2>
              <span class="status-badge neutral">{{
                isNew() ? 'New profile' : '#' + form.controls.code.value
              }}</span>
            </div>
            <div class="panel-body form-grid">
              <mat-form-field>
                <mat-label>Member code</mat-label>
                <input matInput type="number" formControlName="code" [readonly]="!isNew()" />
                <mat-error>Enter a code greater than zero.</mat-error>
              </mat-form-field>
              <mat-form-field>
                <mat-label>Salutation</mat-label>
                <input
                  matInput
                  formControlName="salutation"
                  maxlength="10"
                  placeholder="Mr, Mrs, Ms…"
                  autocomplete="honorific-prefix"
                />
              </mat-form-field>
              <mat-form-field class="wide">
                <mat-label>Full name</mat-label>
                <input matInput formControlName="name" maxlength="100" autocomplete="name" />
                <mat-error>Enter the member’s name.</mat-error>
              </mat-form-field>
              <mat-form-field class="wide"
                ><mat-label>Phone</mat-label
                ><input matInput type="tel" formControlName="phone" autocomplete="tel"
              /></mat-form-field>
            </div>
          </section>

          <section class="panel" aria-labelledby="member-address-heading">
            <div class="panel-header">
              <h2 id="member-address-heading">Address</h2>
              <span class="hint">Optional</span>
            </div>
            <div class="panel-body form-grid">
              <mat-form-field
                ><mat-label>Address line 1</mat-label><input matInput formControlName="addr1"
              /></mat-form-field>
              <mat-form-field
                ><mat-label>Address line 2</mat-label><input matInput formControlName="addr2"
              /></mat-form-field>
              <mat-form-field
                ><mat-label>Address line 3</mat-label><input matInput formControlName="addr3"
              /></mat-form-field>
              <mat-form-field
                ><mat-label>Address line 4</mat-label><input matInput formControlName="addr4"
              /></mat-form-field>
            </div>
          </section>

          <section class="panel" aria-labelledby="member-identity-heading">
            <div class="panel-header">
              <h2 id="member-identity-heading">Identity details</h2>
              <span class="hint">Optional</span>
            </div>
            <div class="panel-body form-grid">
              <mat-form-field
                ><mat-label>Aadhaar</mat-label
                ><input matInput formControlName="aadhaar" maxlength="14"
              /></mat-form-field>
              <mat-form-field
                ><mat-label>PAN</mat-label
                ><input matInput formControlName="pan" maxlength="10" /><mat-error
                  >Enter a valid PAN, such as ABCDE1234F.</mat-error
                ></mat-form-field
              >
              <mat-form-field
                ><mat-label>Other ID type</mat-label><input matInput formControlName="id_type"
              /></mat-form-field>
              <mat-form-field
                ><mat-label>Other ID number</mat-label><input matInput formControlName="id_no"
              /></mat-form-field>
            </div>
          </section>
        </div>

        <section class="member-photo panel" aria-labelledby="member-photo-heading">
          <div class="panel-header"><h2 id="member-photo-heading">Profile photo</h2></div>
          <div class="panel-body">
            <app-webcam-capture
              [src]="photoUrl()"
              [disabled]="!auth.canEdit()"
              (captured)="photoChange = $event"
            />
            <p class="hint">Use the camera to add a photo for easy identification.</p>
          </div>
        </section>

        <div class="form-actions full">
          <button
            mat-flat-button
            type="submit"
            [disabled]="form.invalid || saving() || !auth.canEdit()"
          >
            <mat-icon>check</mat-icon>
            {{ saving() ? 'Saving…' : isNew() ? 'Create member' : 'Save changes' }}
          </button>
          <a mat-button routerLink="/masters/members">Cancel</a>
          @if (!isNew() && auth.isAdmin()) {
            <button
              mat-button
              type="button"
              class="danger"
              (click)="remove()"
              [disabled]="saving()"
            >
              <mat-icon>delete_outline</mat-icon> Delete member
            </button>
          }
        </div>
      </form>
    </div>
  `,
})
export class MemberForm implements OnInit {
  /** Route parameter; absent for /masters/members/new. */
  readonly code = input<string>();

  protected readonly auth = inject(AuthService);
  private readonly sb = inject(SupabaseService).client;
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);

  protected readonly isNew = signal(true);
  protected readonly saving = signal(false);
  protected readonly photoUrl = signal<string | null>(null);
  /** undefined = unchanged, null = remove, Blob = new photo. */
  protected photoChange: Blob | null | undefined;
  private photoPath: string | null = null;

  protected readonly form = inject(FormBuilder).nonNullable.group({
    code: [0, [Validators.required, Validators.min(1)]],
    name: ['', [Validators.required, Validators.pattern(/\S/)]],
    salutation: [''],
    addr1: [''],
    addr2: [''],
    addr3: [''],
    addr4: [''],
    phone: [''],
    aadhaar: [''],
    pan: ['', Validators.pattern(/^[A-Za-z]{5}\d{4}[A-Za-z]$|^$/)],
    id_type: [''],
    id_no: [''],
  });

  async ngOnInit(): Promise<void> {
    const code = Number(this.code());
    try {
      if (code) {
        await this.loadMember(code);
      } else {
        const last = await must(
          this.sb
            .from('customers')
            .select('code')
            .order('code', { ascending: false })
            .limit(1)
            .maybeSingle<{ code: number }>(),
        );
        this.form.controls.code.setValue((last?.code ?? 0) + 1);
      }
    } catch (err) {
      this.notify.error(err);
    }
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      return;
    }
    this.saving.set(true);
    const value = this.form.getRawValue();
    const record: Record<string, string | number | null> = { name: value.name.trim() };
    for (const field of TEXT_FIELDS) {
      record[field] = value[field].trim() || null;
    }
    if (record['pan']) {
      record['pan'] = String(record['pan']).toUpperCase();
    }
    try {
      if (this.isNew()) {
        await must(this.sb.from('customers').insert({ code: value.code, ...record }));
      } else {
        await must(this.sb.from('customers').update(record).eq('code', value.code));
      }
      await this.savePhoto(value.code);
      this.notify.success(this.isNew() ? 'Member added' : 'Member updated');
      if (this.isNew()) {
        await this.router.navigate(['/masters/members', value.code], { replaceUrl: true });
      }
      await this.loadMember(value.code);
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const code = this.form.controls.code.value;
    if (
      !confirm(`Delete member ${code} (${this.form.controls.name.value})? This cannot be undone.`)
    ) {
      return;
    }
    this.saving.set(true);
    try {
      await must(this.sb.from('customers').delete().eq('code', code));
      if (this.photoPath) {
        await this.sb.storage.from(PHOTO_BUCKET).remove([this.photoPath]);
      }
      this.notify.success('Member deleted');
      await this.router.navigate(['/masters/members']);
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.saving.set(false);
    }
  }

  private async savePhoto(code: number): Promise<void> {
    if (this.photoChange === undefined) {
      return;
    }
    if (this.photoChange === null) {
      await must(this.sb.from('customers').update({ photo_path: null }).eq('code', code));
      // Only admins may delete storage objects; for others the file is simply unlinked.
      if (this.photoPath && this.auth.isAdmin()) {
        await this.sb.storage.from(PHOTO_BUCKET).remove([this.photoPath]);
      }
    } else {
      const path = `${code}.jpg`;
      const { error } = await this.sb.storage
        .from(PHOTO_BUCKET)
        .upload(path, this.photoChange, { contentType: 'image/jpeg', upsert: true });
      if (error) {
        throw error;
      }
      await must(this.sb.from('customers').update({ photo_path: path }).eq('code', code));
    }
    this.photoChange = undefined;
  }

  private async loadMember(code: number): Promise<void> {
    const member = await must(
      this.sb.from('customers').select('*').eq('code', code).maybeSingle<Customer>(),
    );
    if (!member) {
      this.notify.error(new Error(`Member ${code} not found`));
      await this.router.navigate(['/masters/members']);
      return;
    }
    this.isNew.set(false);
    this.form.reset({
      code: member.code,
      name: member.name,
      ...Object.fromEntries(TEXT_FIELDS.map((f) => [f, member[f] ?? ''])),
    });
    this.photoPath = member.photo_path;
    this.photoChange = undefined;
    if (member.photo_path) {
      const { data } = await this.sb.storage
        .from(PHOTO_BUCKET)
        .createSignedUrl(member.photo_path, 3600);
      // Cache-bust so a replaced photo shows immediately.
      this.photoUrl.set(data?.signedUrl ? `${data.signedUrl}&t=${Date.now()}` : null);
    } else {
      this.photoUrl.set(null);
    }
  }
}
