import { computed, inject, Injectable, InjectionToken, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate } from '@angular/service-worker';
import { firstValueFrom, from, timeout } from 'rxjs';

export const APP_UPDATE_BROWSER = new InjectionToken('APP_UPDATE_BROWSER', {
  providedIn: 'root',
  factory: () => ({
    online: () => navigator.onLine,
    reload: () => location.reload(),
  }),
});

type UpdatePhase = 'idle' | 'checking' | 'downloading' | 'latest' | 'ready' | 'error' | 'recovery';

@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly updates = inject(SwUpdate, { optional: true });
  private readonly browser = inject(APP_UPDATE_BROWSER);
  readonly enabled = this.updates?.isEnabled === true;
  readonly phase = signal<UpdatePhase>('idle');
  readonly ready = signal(false);
  readonly needsReload = signal(false);
  readonly checkedAt = signal<Date | null>(null);
  readonly message = signal(
    this.enabled
      ? 'Check for the latest published version of Merchant Accounts.'
      : 'App updates are available in the published app. Open the installed app or the HTTPS website to check for updates.',
  );
  readonly busy = computed(() => this.phase() === 'checking' || this.phase() === 'downloading');
  private checking = false;
  private noNewVersionCount = 0;
  private failureCount = 0;

  constructor() {
    if (!this.enabled || !this.updates) return;
    this.updates.versionUpdates.pipe(takeUntilDestroyed()).subscribe((event) => {
      switch (event.type) {
        case 'VERSION_DETECTED':
          if (!this.ready() && !this.needsReload()) {
            this.phase.set('downloading');
            this.message.set('Downloading the latest app files. You can keep working.');
          }
          break;
        case 'VERSION_READY':
          this.markReady();
          break;
        case 'NO_NEW_VERSION_DETECTED':
          this.noNewVersionCount++;
          break;
        case 'VERSION_INSTALLATION_FAILED':
          this.failureCount++;
          this.fail(
            'The update could not be downloaded. Please try again when your connection is available.',
          );
          break;
      }
    });
    this.updates.unrecoverable.pipe(takeUntilDestroyed()).subscribe(() => {
      this.needsReload.set(true);
      this.phase.set('recovery');
      this.message.set(
        'This app version needs to be reloaded. Save or copy any unfinished work before continuing.',
      );
    });
  }

  async check(): Promise<void> {
    if (!this.enabled || !this.updates || this.checking || this.busy() || this.needsReload())
      return;
    if (this.ready()) {
      this.markReady();
      return;
    }
    if (!this.browser.online()) {
      this.fail('You are offline. Connect to the internet and try again.');
      return;
    }
    this.checking = true;
    this.phase.set('checking');
    this.message.set('Checking the server for updates…');
    const noNewBefore = this.noNewVersionCount;
    const failuresBefore = this.failureCount;
    try {
      // SwUpdate waits for a controlling worker; include registration in the time limit.
      const found = await firstValueFrom(from(this.updates.checkForUpdate()).pipe(timeout(90000)));
      if (this.needsReload()) return;
      if (found || this.ready()) {
        this.markReady();
      } else if (this.failureCount !== failuresBefore) {
        // Preserve the installation failure reported by the worker.
      } else if (this.noNewVersionCount > noNewBefore) {
        this.checkedAt.set(new Date());
        this.phase.set('latest');
        this.message.set('You are using the latest published version.');
      } else {
        // The Angular worker can return false on a network/server error too.
        this.fail('Could not verify the latest version. Check your connection and try again.');
      }
    } catch {
      if (!this.ready() && !this.needsReload()) {
        this.fail(
          'The update check did not finish. Check your connection and try again. If this is your first launch, close and reopen the app once.',
        );
      }
    } finally {
      this.checking = false;
    }
  }

  reload(): void {
    // Only the explicit action in the update dialog calls this. Keep the current URL.
    if (this.ready() || this.needsReload()) this.browser.reload();
  }

  private markReady(): void {
    this.ready.set(true);
    if (this.needsReload()) return;
    this.checkedAt.set(new Date());
    this.phase.set('ready');
    this.message.set('The latest app files are downloaded and ready to use.');
  }

  private fail(message: string): void {
    if (this.ready() || this.needsReload()) return;
    this.phase.set('error');
    this.message.set(message);
  }
}
