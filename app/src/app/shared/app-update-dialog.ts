import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { AppUpdateService } from '../core/app-update.service';

@Component({
  selector: 'app-update-dialog',
  imports: [DatePipe, MatButtonModule, MatDialogModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>App updates</h2>
    <mat-dialog-content>
      <dl class="versions">
        <div>
          <dt>Installed version</dt>
          <dd>{{ updates.currentVersion }}</dd>
        </div>
        <div>
          <dt>Latest on server</dt>
          <dd>{{ updates.latestVersion() || updates.versionStatus() }}</dd>
        </div>
      </dl>
      <div class="update-status" role="status" aria-live="polite" [attr.aria-busy]="updates.busy()">
        <mat-icon>{{
          updates.ready()
            ? 'download_done'
            : updates.phase() === 'error'
              ? 'cloud_off'
              : 'system_update'
        }}</mat-icon>
        <p>{{ updates.message() }}</p>
      </div>
      @if (updates.checkedAt(); as checkedAt) {
        <p class="update-time">Last verified: {{ checkedAt | date: 'd MMM, h:mm a' }}</p>
      }
      @if (updates.ready() || updates.needsReload()) {
        <p class="reload-note">
          Save any unfinished changes first. Reloading restarts this page and clears unsaved form
          entries.
        </p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ updates.ready() ? 'Later' : 'Close' }}</button>
      @if (updates.ready() || updates.needsReload()) {
        <button mat-flat-button (click)="updates.reload()">
          {{ updates.ready() ? 'Reload and update' : 'Reload app' }}
        </button>
      } @else if (updates.enabled) {
        <button mat-flat-button [disabled]="updates.busy()" (click)="updates.check()">
          {{
            updates.phase() === 'downloading'
              ? 'Downloading…'
              : updates.busy()
                ? 'Checking…'
                : updates.phase() === 'error'
                  ? 'Try again'
                  : 'Check for updates'
          }}
        </button>
      }
    </mat-dialog-actions>
  `,
  styles: `
    .versions {
      margin: 0 0 20px;
      padding: 12px;
      background: var(--app-surface-muted);
      border-radius: 8px;
    }
    .versions div {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 5px 0;
      font-size: 12px;
    }
    .versions dt {
      color: var(--app-muted);
    }
    .versions dd {
      margin: 0;
      text-align: right;
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .update-status {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }
    .update-status mat-icon {
      flex-shrink: 0;
      color: var(--app-accent);
      margin-top: 2px;
    }
    .update-status p {
      margin: 0;
      font-size: 14px;
      line-height: 1.7;
    }
    .update-time {
      font-size: 11px;
      color: var(--app-muted);
      margin-top: 16px;
    }
    .reload-note {
      background: var(--app-surface-muted);
      border-radius: 8px;
      padding: 12px;
      font-size: 12px;
      line-height: 1.7;
    }
    mat-dialog-actions {
      flex-wrap: wrap;
      gap: 4px;
      padding: 12px 24px 20px;
    }
    mat-dialog-actions button {
      min-height: 44px;
    }
  `,
})
export class AppUpdateDialog {
  protected readonly updates = inject(AppUpdateService);
  constructor() {
    void this.updates.check();
  }
}

export function openAppUpdates(dialog: MatDialog): void {
  if (!dialog.getDialogById('app-updates')) {
    dialog.open(AppUpdateDialog, {
      id: 'app-updates',
      width: '440px',
      maxWidth: 'calc(100vw - 32px)',
    });
  }
}
