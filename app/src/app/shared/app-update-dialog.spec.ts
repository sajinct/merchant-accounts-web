import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { vi } from 'vitest';
import { AppUpdateService } from '../core/app-update.service';
import { AppUpdateDialog, openAppUpdates } from './app-update-dialog';

it('opens one update dialog and reloads only after the explicit update button', async () => {
  const updates = {
    enabled: true,
    ready: signal(true),
    needsReload: signal(false),
    busy: signal(false),
    phase: signal('ready'),
    checkedAt: signal<Date | null>(null),
    message: signal('The latest app files are downloaded and ready to use.'),
    check: vi.fn(),
    reload: vi.fn(),
  };
  await TestBed.configureTestingModule({
    imports: [AppUpdateDialog],
    providers: [{ provide: AppUpdateService, useValue: updates }],
  }).compileComponents();
  const dialog = TestBed.inject(MatDialog);
  try {
    openAppUpdates(dialog);
    openAppUpdates(dialog);
    TestBed.tick();
    expect(dialog.openDialogs.length).toBe(1);
    expect(updates.check).toHaveBeenCalledTimes(1);
    expect(updates.reload).not.toHaveBeenCalled();
    const element = document.querySelector('app-update-dialog')!;
    expect(element.textContent).toContain('unsaved form entries');
    const later = Array.from(element.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Later',
    )!;
    later.click();
    TestBed.tick();
    expect(updates.reload).not.toHaveBeenCalled();
    dialog.closeAll();
  } finally {
    dialog.closeAll();
  }
});
