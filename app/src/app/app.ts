import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { AppUpdateService } from './core/app-update.service';
import { openAppUpdates } from './shared/app-update-dialog';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, MatButtonModule],
  template: `
    <router-outlet />
    @if (updates.ready() || updates.needsReload()) {
      <aside class="app-update-notice no-print" role="status" aria-live="polite">
        <span>{{ updates.ready() ? 'An app update is ready.' : 'The app needs a reload.' }}</span>
        <button mat-button type="button" (click)="openUpdates()">Review update</button>
      </aside>
    }
  `,
  styles: `
    .app-update-notice {
      position: fixed;
      bottom: max(16px, env(safe-area-inset-bottom));
      left: 50%;
      transform: translateX(-50%);
      z-index: 10;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 12px 8px 16px;
      border: 1px solid #b9d8cf;
      border-radius: 10px;
      background: #f1fbf6;
      color: #174b40;
      box-shadow: 0 4px 18px #172c3920;
      max-width: calc(100vw - 32px);
      width: max-content;
      font-size: 12px;
    }
    .app-update-notice button {
      flex-shrink: 0;
      min-height: 44px;
    }
    @media (max-width: 400px) {
      .app-update-notice {
        gap: 4px;
        padding-left: 12px;
      }
    }
  `,
})
export class App {
  protected readonly updates = inject(AppUpdateService);
  private readonly dialog = inject(MatDialog);
  protected openUpdates(): void {
    openAppUpdates(this.dialog);
  }
}
