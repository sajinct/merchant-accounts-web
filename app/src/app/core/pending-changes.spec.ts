import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { vi } from 'vitest';
import { pendingChangesGuard } from './pending-changes';

describe('pendingChangesGuard', () => {
  function run(component: unknown) {
    return TestBed.runInInjectionContext(() =>
      pendingChangesGuard(
        component,
        {} as ActivatedRouteSnapshot,
        {} as RouterStateSnapshot,
        {} as RouterStateSnapshot,
      ),
    ) as Promise<boolean>;
  }

  function answer(button: 'Stay on page' | 'Discard changes') {
    TestBed.tick();
    const buttons = document.querySelectorAll<HTMLButtonElement>('mat-dialog-actions button');
    Array.from(buttons)
      .find((b) => b.textContent?.trim() === button)!
      .click();
  }

  afterEach(() => TestBed.inject(MatDialog).closeAll());

  it('allows leaving pages without pending changes', async () => {
    const open = vi.spyOn(TestBed.inject(MatDialog), 'open');
    expect(await run({})).toBe(true);
    expect(await run({ hasPendingChanges: () => false })).toBe(true);
    expect(await run(null)).toBe(true);
    expect(open).not.toHaveBeenCalled();
  });

  it('keeps the user on the page when they choose to stay', async () => {
    const result = run({ hasPendingChanges: () => true });
    answer('Stay on page');
    expect(await result).toBe(false);
  });

  it('leaves when the user discards changes', async () => {
    const result = run({ hasPendingChanges: () => true });
    answer('Discard changes');
    expect(await result).toBe(true);
  });

  it('blocks a second navigation while the question is open', async () => {
    const first = run({ hasPendingChanges: () => true });
    TestBed.tick();
    expect(await run({ hasPendingChanges: () => true })).toBe(false);
    answer('Discard changes');
    expect(await first).toBe(true);
  });
});
