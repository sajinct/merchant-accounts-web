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

/** Turn Supabase / Postgres errors into messages a user can act on. */
export function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const { message, code } = err as { message: string; code?: string };
    switch (code) {
      case '42501':
        return 'You are not allowed to do this.';
      case '23505':
        return 'A record with this code already exists. Refresh and try again.';
      case '23503':
        return 'This record is linked to other data.';
      default:
        return message;
    }
  }
  return String(err);
}
