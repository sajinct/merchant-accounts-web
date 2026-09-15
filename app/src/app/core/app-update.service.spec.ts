import { TestBed } from '@angular/core/testing';
import { SwUpdate, UnrecoverableStateEvent, VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { vi } from 'vitest';
import { APP_UPDATE_BROWSER, APP_UPDATE_MANIFEST, AppUpdateService } from './app-update.service';

describe('AppUpdateService', () => {
  let versions: Subject<VersionEvent>;
  let unrecoverable: Subject<UnrecoverableStateEvent>;
  let checkForUpdate: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
  let online: ReturnType<typeof vi.fn<() => boolean>>;
  let reload: ReturnType<typeof vi.fn<() => void>>;

  const currentVersion = { hash: 'current-version' };
  const latestVersion = { hash: 'latest-version' };

  beforeEach(() => {
    versions = new Subject<VersionEvent>();
    unrecoverable = new Subject<UnrecoverableStateEvent>();
    checkForUpdate = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);
    online = vi.fn<() => boolean>().mockReturnValue(true);
    reload = vi.fn<() => void>();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createService(enabled = true, provideWorker = true): AppUpdateService {
    TestBed.configureTestingModule({
      providers: [
        { provide: APP_UPDATE_BROWSER, useValue: { online, reload } },
        { provide: APP_UPDATE_MANIFEST, useValue: async () => '2026.09.15.v2' },
        ...(provideWorker
          ? [
              {
                provide: SwUpdate,
                useValue: {
                  isEnabled: enabled,
                  versionUpdates: versions.asObservable(),
                  unrecoverable: unrecoverable.asObservable(),
                  checkForUpdate,
                },
              },
            ]
          : []),
      ],
    });
    return TestBed.inject(AppUpdateService);
  }

  function deferredCheck() {
    let resolve!: (found: boolean) => void;
    const promise = new Promise<boolean>((complete) => {
      resolve = complete;
    });
    checkForUpdate.mockReturnValue(promise);
    return resolve;
  }

  function reportReady() {
    versions.next({ type: 'VERSION_READY', currentVersion, latestVersion });
  }

  function reportNoNewVersion() {
    versions.next({ type: 'NO_NEW_VERSION_DETECTED', version: currentVersion });
  }

  function reportFailure() {
    versions.next({
      type: 'VERSION_INSTALLATION_FAILED',
      version: latestVersion,
      error: 'Download failed',
    });
  }

  it('explains availability without checking or reloading when service workers are disabled', async () => {
    const service = createService(false);
    await service.check();
    service.reload();

    expect(service.enabled).toBe(false);
    expect(service.message()).toContain('published app');
    expect(checkForUpdate).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('also works when no service worker provider is available', async () => {
    const service = createService(false, false);
    await service.check();

    expect(service.enabled).toBe(false);
    expect(checkForUpdate).not.toHaveBeenCalled();
  });

  it('reports offline status without attempting to download an update', async () => {
    online.mockReturnValue(false);
    const service = createService();
    await service.check();

    expect(service.phase()).toBe('error');
    expect(service.message()).toContain('offline');
    expect(service.checkedAt()).toBeNull();
    expect(checkForUpdate).not.toHaveBeenCalled();
  });

  it('shows the server build even when the worker cannot complete its check', async () => {
    const service = createService();
    await service.check();
    expect(service.latestVersion()).toBe('2026.09.15.v2');
    expect(service.phase()).toBe('error');
    expect(service.ready()).toBe(false);
  });

  it('offers reload when a different published build is already cached', async () => {
    const service = createService();
    versions.next({
      type: 'NO_NEW_VERSION_DETECTED',
      version: { hash: 'cached', appData: { version: '2026.09.15.v2' } },
    });
    expect(service.ready()).toBe(true);
    expect(service.latestVersion()).toBe('2026.09.15.v2');
    expect(reload).not.toHaveBeenCalled();
  });

  it('ignores repeated requests while waiting for the worker or an existing download', async () => {
    const finish = deferredCheck();
    const service = createService();
    const firstCheck = service.check();

    expect(service.phase()).toBe('checking');
    expect(service.busy()).toBe(true);
    await service.check();
    versions.next({ type: 'VERSION_DETECTED', version: latestVersion });
    expect(service.phase()).toBe('downloading');
    await service.check();

    reportReady();
    finish(true);
    await firstCheck;
    expect(checkForUpdate).toHaveBeenCalledTimes(1);
    expect(service.phase()).toBe('ready');
    expect(service.busy()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('only reports the latest version after the worker confirms a successful server check', async () => {
    const finish = deferredCheck();
    const service = createService();
    const checking = service.check();
    reportNoNewVersion();
    finish(false);
    await checking;

    expect(service.phase()).toBe('latest');
    expect(service.checkedAt()).toBeInstanceOf(Date);
    expect(service.ready()).toBe(false);
  });

  it('does not claim the app is current when Angular silently returns false on a server error', async () => {
    const service = createService();
    // The worker also resolves false when a manifest fetch fails while the browser is online.
    await service.check();

    expect(service.phase()).toBe('error');
    expect(service.message()).toContain('Could not verify');
    expect(service.checkedAt()).toBeNull();
  });

  it('does not reuse an earlier successful check to validate a later failed check', async () => {
    const service = createService();
    reportNoNewVersion();
    await service.check();

    expect(service.phase()).toBe('error');
    expect(service.checkedAt()).toBeNull();
  });

  it('preserves the download failure when the check subsequently resolves false', async () => {
    const finish = deferredCheck();
    const service = createService();
    const checking = service.check();
    reportFailure();
    const failureMessage = service.message();
    finish(false);
    await checking;

    expect(service.phase()).toBe('error');
    expect(service.message()).toBe(failureMessage);
    expect(service.message()).toContain('could not be downloaded');
    expect(service.checkedAt()).toBeNull();
  });

  it('allows a new check after an error and recognizes a completed download', async () => {
    checkForUpdate
      .mockRejectedValueOnce(new Error('Worker unavailable'))
      .mockResolvedValueOnce(true);
    const service = createService();
    await service.check();
    expect(service.phase()).toBe('error');
    expect(service.busy()).toBe(false);

    await service.check();
    expect(checkForUpdate).toHaveBeenCalledTimes(2);
    expect(service.phase()).toBe('ready');
    expect(service.ready()).toBe(true);
  });

  it('bounds registration and update waiting, while accepting a download that finishes later', async () => {
    vi.useFakeTimers();
    const finish = deferredCheck();
    const service = createService();
    const checking = service.check();
    await vi.advanceTimersByTimeAsync(30_000);
    await checking;

    expect(service.phase()).toBe('error');
    expect(service.busy()).toBe(false);
    expect(service.message()).toContain('did not finish');

    reportReady();
    finish(true);
    expect(service.ready()).toBe(true);
    expect(service.phase()).toBe('ready');
    expect(reload).not.toHaveBeenCalled();
  });

  it('keeps a downloaded update available across later worker events and manual checks', async () => {
    const service = createService();
    reportReady();
    reportNoNewVersion();
    reportFailure();
    versions.next({ type: 'VERSION_DETECTED', version: latestVersion });
    await service.check();

    expect(service.ready()).toBe(true);
    expect(service.phase()).toBe('ready');
    expect(service.busy()).toBe(false);
    expect(checkForUpdate).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('preserves a ready event when the in-progress check later rejects', async () => {
    let reject!: (error: Error) => void;
    checkForUpdate.mockReturnValue(
      new Promise<boolean>((_, fail) => {
        reject = fail;
      }),
    );
    const service = createService();
    const checking = service.check();
    reportReady();
    reject(new Error('Worker response lost'));
    await checking;

    expect(service.phase()).toBe('ready');
    expect(service.ready()).toBe(true);
  });

  it('reloads only after an explicit action when an update is ready', () => {
    const service = createService();
    service.reload();
    expect(reload).not.toHaveBeenCalled();

    reportReady();
    expect(reload).not.toHaveBeenCalled();
    service.reload();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('offers recovery without automatically reloading or checking for further updates', async () => {
    const service = createService();
    unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'An old chunk is unavailable' });
    await service.check();

    expect(service.needsReload()).toBe(true);
    expect(service.phase()).toBe('recovery');
    expect(service.message()).toContain('unfinished work');
    expect(checkForUpdate).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();

    service.reload();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('preserves recovery instructions through later version events and check completion', async () => {
    const finish = deferredCheck();
    const service = createService();
    const checking = service.check();
    unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'An old chunk is unavailable' });
    const recoveryMessage = service.message();

    versions.next({ type: 'VERSION_DETECTED', version: latestVersion });
    expect(service.phase()).toBe('recovery');
    expect(service.busy()).toBe(false);
    reportNoNewVersion();
    reportFailure();
    reportReady();
    finish(true);
    await checking;

    expect(service.phase()).toBe('recovery');
    expect(service.message()).toBe(recoveryMessage);
    expect(service.needsReload()).toBe(true);
    expect(reload).not.toHaveBeenCalled();
  });
});
