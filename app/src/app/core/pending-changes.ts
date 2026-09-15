import { inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { CanDeactivateFn } from '@angular/router';
import { confirmAction } from '../shared/confirm-dialog';

/** Implemented by routed pages that can hold unfinished, unsaved entries. */
export interface HasPendingChanges {
  hasPendingChanges(): boolean;
}

export function hasPendingChanges(component: unknown): boolean {
  return (
    !!component &&
    typeof (component as Partial<HasPendingChanges>).hasPendingChanges === 'function' &&
    (component as HasPendingChanges).hasPendingChanges()
  );
}

/** Asks before leaving a page with unsaved changes. */
export const pendingChangesGuard: CanDeactivateFn<unknown> = async (component) => {
  if (!hasPendingChanges(component)) return true;
  const dialog = inject(MatDialog);
  // A second navigation while the question is open should not stack another dialog.
  if (dialog.getDialogById('pending-changes')) return false;
  const result = await confirmAction(
    dialog,
    {
      title: 'Leave without saving?',
      message: 'The changes you entered on this page have not been saved and will be lost.',
      confirmLabel: 'Discard changes',
      cancelLabel: 'Stay on page',
      destructive: true,
    },
    'pending-changes',
  );
  return result !== null;
};
