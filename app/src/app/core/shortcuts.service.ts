import { effect, Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'merchant-accounts.letter-shortcuts';

/** Whether single-letter navigation shortcuts are active, remembered per browser. */
@Injectable({ providedIn: 'root' })
export class ShortcutsService {
  readonly letterShortcuts = signal(read());

  constructor() {
    effect(() => {
      const enabled = this.letterShortcuts();
      try {
        localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
      } catch {
        // Private windows and blocked site data: the preference just does not persist.
      }
    });
  }

  toggle(): void {
    this.letterShortcuts.update((enabled) => !enabled);
  }
}

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}
