import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { AuthService } from '../../core/auth.service';
import { errorMessage } from '../../core/notify.service';
import { SUPPORT } from '../../core/support';

@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
  ],
  styleUrl: './login.scss',
  template: `
    <main class="login-page">
      <section class="login-brand" aria-label="Merchant Accounts">
        <div class="login-wordmark">
          <img class="login-mark" src="favicon.svg" alt="" width="46" height="46" />
          <span>Merchant<small>ACCOUNTS</small></span>
        </div>
        <div class="brand-message">
          <div class="brand-eyebrow">YOUR ACCOUNTING WORKSPACE</div>
          <h1>A clear view of<br />every transaction.</h1>
          <p>
            Bring your daily accounts, members, and financial reports together in one organized
            workspace.
          </p>
          <div class="brand-features">
            <div>
              <mat-icon>receipt_long</mat-icon
              ><span>Daily transactions<small>Keep payments and receipts in order</small></span>
            </div>
            <div>
              <mat-icon>insert_chart_outlined</mat-icon
              ><span>Meaningful reports<small>Follow every balance with confidence</small></span>
            </div>
            <div>
              <mat-icon>group</mat-icon
              ><span>Connected records<small>Manage your members and accounts</small></span>
            </div>
          </div>
        </div>
        <div class="brand-footer">Merchant Accounts <span>Clarity in every entry.</span></div>
      </section>
      <section class="login-form-area" aria-labelledby="login-heading">
        <div class="login-card">
          <span class="login-welcome">WELCOME BACK</span>
          <h2 id="login-heading">Sign in to your workspace</h2>
          <p class="login-description">Enter your credentials to access your accounts.</p>
          <form [formGroup]="form" (ngSubmit)="submit()" [attr.aria-busy]="busy()">
            <mat-form-field>
              <mat-label>Email address</mat-label>
              <input
                matInput
                type="email"
                formControlName="email"
                autocomplete="username"
                placeholder="you@company.com"
                required
              />
              @if (form.controls.email.hasError('email')) {
                <mat-error>Enter a valid email address</mat-error>
              }
            </mat-form-field>
            <mat-form-field>
              <mat-label>Password</mat-label>
              <input
                matInput
                [type]="showPassword() ? 'text' : 'password'"
                formControlName="password"
                autocomplete="current-password"
                required
              />
              <button
                mat-icon-button
                matSuffix
                type="button"
                (click)="showPassword.set(!showPassword())"
                [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
                [attr.aria-pressed]="showPassword()"
              >
                <mat-icon>{{ showPassword() ? 'visibility_off' : 'visibility' }}</mat-icon>
              </button>
            </mat-form-field>
            @if (error()) {
              <p class="form-error" role="alert">{{ error() }}</p>
            }
            <button mat-flat-button type="submit" [disabled]="form.invalid || busy()">
              {{ busy() ? 'Signing in…' : 'Sign in' }}
              <mat-icon iconPositionEnd>arrow_forward</mat-icon>
            </button>
          </form>
          <div class="login-help">
            <p>Need help? Contact Inzoft support.</p>
            <a [href]="'mailto:' + support.email">
              <mat-icon>mail_outline</mat-icon>{{ support.email }}
            </a>
            <a
              [href]="support.whatsapp"
              target="_blank"
              rel="noopener noreferrer"
              [attr.aria-label]="'WhatsApp support at ' + support.phone + ' (opens in a new tab)'"
            >
              <mat-icon>chat_bubble_outline</mat-icon>WhatsApp · {{ support.phone }}
            </a>
          </div>
        </div>
        <div class="login-footer">
          Powered by
          <a
            [href]="support.website"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Visit inzoft.com (opens in a new tab)"
            >{{ support.websiteLabel }}</a
          >
        </div>
      </section>
    </main>
  `,
})
export class Login {
  protected readonly support = SUPPORT;
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly showPassword = signal(false);

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const { email, password } = this.form.getRawValue();
      await this.auth.signIn(email.trim(), password);
      await this.router.navigate(['/']);
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
