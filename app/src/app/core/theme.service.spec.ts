import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ThemeService, THEME_STORAGE_KEY } from './theme.service';

describe('ThemeService', () => {
  let listener: ((event: { matches: boolean }) => void) | undefined;

  function setup(options: { stored?: string; systemDark?: boolean } = {}) {
    localStorage.clear();
    if (options.stored) localStorage.setItem(THEME_STORAGE_KEY, options.stored);
    delete document.documentElement.dataset['theme'];
    listener = undefined;
    // jsdom has no matchMedia, so it is installed rather than spied on.
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({
        media: query,
        matches: options.systemDark ?? false,
        addEventListener: (_: string, handler: (event: { matches: boolean }) => void) => {
          listener = handler;
        },
      }),
    });
    TestBed.resetTestingModule();
    return TestBed.inject(ThemeService);
  }

  function themeColor(): string | null {
    return document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null;
  }

  beforeEach(() => {
    document.head.insertAdjacentHTML('beforeend', '<meta name="theme-color" content="#172c39">');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, 'matchMedia');
    localStorage.clear();
    delete document.documentElement.dataset['theme'];
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.remove());
  });

  it('follows the system by default and leaves the stylesheet to decide', () => {
    const theme = setup({ systemDark: true });
    expect(theme.preference()).toBe('system');
    expect(theme.resolved()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBeUndefined();
    expect(themeColor()).toBe('#101c25');
  });

  it('pins the chosen theme on the document and remembers it', () => {
    const theme = setup({ systemDark: true });
    theme.set('light');
    expect(theme.resolved()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(themeColor()).toBe('#172c39');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('restores a stored preference over the system setting', () => {
    const theme = setup({ stored: 'dark', systemDark: false });
    expect(theme.preference()).toBe('dark');
    expect(theme.resolved()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('ignores a stored value that is not a theme', () => {
    const theme = setup({ stored: 'sepia' });
    expect(theme.preference()).toBe('system');
    expect(document.documentElement.dataset['theme']).toBeUndefined();
  });

  it('tracks the system while the preference is system, and stops once it is not', () => {
    const theme = setup({ systemDark: false });
    listener?.({ matches: true });
    expect(theme.resolved()).toBe('dark');
    expect(themeColor()).toBe('#101c25');

    theme.set('light');
    listener?.({ matches: false });
    expect(theme.resolved()).toBe('light');
    expect(themeColor()).toBe('#172c39');
  });

  it('still applies a theme when storage is unavailable', () => {
    const theme = setup();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => theme.set('dark')).not.toThrow();
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });
});
