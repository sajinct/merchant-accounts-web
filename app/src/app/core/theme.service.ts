import { computed, Injectable, signal } from '@angular/core';

/** 'system' follows the operating system; the other two override it. */
export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_STORAGE_KEY = 'merchant-accounts.theme';

/** Browser chrome colour per scheme, kept in step with --app-nav-bg. */
const THEME_COLOR: Record<'light' | 'dark', string> = {
  light: '#172c39',
  dark: '#101c25',
};

function isPreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

/**
 * Screen theme. The stylesheet holds both palettes and picks one from the OS
 * setting; this only writes `data-theme` on <html> when the user overrides it.
 * The same attribute is set by a small inline script in index.html, so the
 * first paint already carries the chosen theme.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly systemDark = signal(false);
  readonly preference = signal<ThemePreference>('system');

  /** What is actually on screen once 'system' is resolved. */
  readonly resolved = computed<'light' | 'dark'>(() => {
    const preference = this.preference();
    if (preference !== 'system') return preference;
    return this.systemDark() ? 'dark' : 'light';
  });

  constructor() {
    const stored = read();
    if (isPreference(stored)) this.preference.set(stored);

    const query = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (query) {
      this.systemDark.set(query.matches);
      query.addEventListener?.('change', (event) => {
        this.systemDark.set(event.matches);
        this.apply();
      });
    }
    this.apply();
  }

  set(preference: ThemePreference): void {
    this.preference.set(preference);
    write(preference);
    this.apply();
  }

  private apply(): void {
    const root = document.documentElement;
    // No attribute means "whatever the OS says", which is what the stylesheet
    // falls back to, so 'system' clears it rather than pinning a value.
    const preference = this.preference();
    if (preference === 'system') delete root.dataset['theme'];
    else root.dataset['theme'] = preference;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', THEME_COLOR[this.resolved()]);
  }
}

// Private browsing and blocked site data make localStorage throw on access,
// which must not stop the app from starting.
function read(): string | null {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function write(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // The theme still applies for this session; it just will not be remembered.
  }
}
