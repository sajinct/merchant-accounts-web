import { inject, Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({ providedIn: 'root' })
export class NotifyService {
  private readonly snackBar = inject(MatSnackBar);

  success(message: string): void {
    this.snackBar.open(message, 'OK', { duration: 3000 });
  }

  error(err: unknown): void {
    this.snackBar.open(errorMessage(err), 'Close', { duration: 8000, panelClass: 'snack-error' });
  }
}

/** Messages the database raises in its own words, rewritten for the people reading them. */
const REWRITTEN: [RegExp, string][] = [
  [/^not authorized$/i, 'You are not allowed to do this.'],
  [
    /request id was already used/i,
    'This entry has already been saved. Refresh the page to see it.',
  ],
  [
    /unbalanced journal detected/i,
    'A journal in this date range does not balance. Open Journals and correct it first.',
  ],
  [/please update the app/i, 'This page is out of date. Reload the app, then try again.'],
  [
    /double-entry requires an empty demo ledger/i,
    'The demo ledger must be reset before double-entry can be used. Ask your administrator.',
  ],
  [/^invalid voucher details$/i, 'Check the account, date and amount, then try again.'],
  [/^voucher journal is missing$/i, 'This voucher has no accounting entry. Contact support.'],
  [
    /^posted entries cannot be changed or deleted/i,
    'Posted entries cannot be edited. Cancel or reverse the entry instead.',
  ],
];

/** Turn Supabase / Postgres errors into messages a user can act on. */
export function errorMessage(err: unknown): string {
  if (isOffline()) {
    return 'You appear to be offline. Your work is not saved until the connection returns.';
  }
  if (err && typeof err === 'object' && 'message' in err) {
    const { message, code } = err as { message: string; code?: string };
    switch (code) {
      case '42501':
        return 'You are not allowed to do this.';
      case '23505':
        return 'A record with this code already exists. Refresh and try again.';
      case '23503':
        return 'This record is linked to other data.';
      case '23514':
        return 'Some of these values are not allowed. Check the amounts and dates.';
      case '57014':
        return 'That took too long to finish. Try a smaller date range.';
    }
    return friendly(message);
  }
  return friendly(String(err));
}

function friendly(message: string): string {
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return 'Could not reach the server. Check your connection and try again.';
  }
  if (/invalid login credentials/i.test(message)) {
    return 'That email or password is not correct.';
  }
  if (/jwt|refresh token|session (from session_id )?not found/i.test(message)) {
    return 'Your session has expired. Sign in again to continue.';
  }
  const rewritten = REWRITTEN.find(([pattern]) => pattern.test(message));
  if (rewritten) return rewritten[1];
  // The database writes its own messages for business rules; show them, but as a sentence.
  return sentence(message);
}

function sentence(message: string): string {
  const text = message.trim();
  if (!text) return 'Something went wrong. Try again.';
  return text[0].toUpperCase() + text.slice(1);
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}
