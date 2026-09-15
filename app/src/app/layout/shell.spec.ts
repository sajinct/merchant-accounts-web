import { vi } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BreakpointObserver, BreakpointState } from '@angular/cdk/layout';
import { By } from '@angular/platform-browser';
import { MatSidenav } from '@angular/material/sidenav';
import { Router, provideRouter, withHashLocation } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { CompanyService } from '../core/company.service';
import { NotifyService } from '../core/notify.service';
import { Shell } from './shell';

@Component({ template: '<form><input aria-label="Test field" /></form>' })
class TestPage {}

describe('Shell navigation', () => {
  const mobileQuery = '(max-width: 959px)';
  let viewport: BehaviorSubject<BreakpointState>;
  const state = (matches: boolean): BreakpointState => ({
    matches,
    breakpoints: { [mobileQuery]: matches },
  });

  async function createShell(mobile: boolean, role = 'admin', hashRouting = false) {
    viewport = new BehaviorSubject(state(mobile));
    await TestBed.configureTestingModule({
      imports: [Shell],
      providers: [
        provideRouter(
          [{ path: '**', component: TestPage }],
          ...(hashRouting ? [withHashLocation()] : []),
        ),
        {
          provide: BreakpointObserver,
          useValue: { isMatched: () => mobile, observe: () => viewport.asObservable() },
        },
        {
          provide: AuthService,
          useValue: {
            profile: signal({ full_name: 'Alex Merchant', username: 'alex', role }),
            role: signal(role),
            isAdmin: () => role === 'admin',
            canEdit: () => role !== 'viewer',
          },
        },
        {
          provide: CompanyService,
          useValue: {
            settings: signal({ name: 'Merchant Cooperative', place: 'Kochi' }),
            load: async () => {},
          },
        },
        { provide: NotifyService, useValue: { error: () => {} } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  it('starts closed on mobile and closes after selecting a route', async () => {
    const fixture = await createShell(true);
    const drawer = fixture.debugElement.query(By.directive(MatSidenav))
      .componentInstance as MatSidenav;
    const element = fixture.nativeElement as HTMLElement;
    expect(drawer.mode).toBe('over');
    expect(drawer.opened).toBe(false);

    element
      .querySelector<HTMLButtonElement>('button[aria-controls="workspace-navigation"]')!
      .click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(drawer.opened).toBe(true);
    expect(
      element
        .querySelector('[aria-controls="workspace-navigation"]')!
        .getAttribute('aria-expanded'),
    ).toBe('true');

    element.querySelector<HTMLButtonElement>('[data-group="R"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    element.querySelector<HTMLAnchorElement>('a[href="/reports/daybook"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(drawer.opened).toBe(false);
    expect(element.querySelector('a[href="/reports/daybook"]')!.getAttribute('aria-current')).toBe(
      'page',
    );
  });

  it('keeps desktop navigation beside content and adapts when the viewport changes', async () => {
    const fixture = await createShell(false);
    const drawer = fixture.debugElement.query(By.directive(MatSidenav))
      .componentInstance as MatSidenav;
    expect(drawer.mode).toBe('side');
    expect(drawer.opened).toBe(true);

    viewport.next(state(true));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(drawer.mode).toBe('over');
    expect(drawer.opened).toBe(false);

    viewport.next(state(false));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(drawer.mode).toBe('side');
    expect(drawer.opened).toBe(true);
  });

  it('preserves role-based navigation visibility for viewers', async () => {
    const fixture = await createShell(false, 'viewer');
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('a[href="/admin/users"]')).toBeNull();
    expect(element.querySelector('a[href="/transactions/daybook-posting"]')).toBeNull();
    for (const key of ['t', 'r', 'u']) {
      if (element.querySelector('.nav-back'))
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();
      document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      fixture.detectChanges();
      await fixture.whenStable();
      expect(element.querySelector('a[href="/admin/users"]')).toBeNull();
      expect(element.querySelector('a[href="/transactions/daybook-posting"]')).toBeNull();
      if (key === 'r') expect(element.querySelector('a[href="/reports/daybook"]')).not.toBeNull();
      if (key === 'u') expect(element.querySelector('a[href="/account/password"]')).not.toBeNull();
    }
  });

  it('shows only groups initially and restores the group list with Escape and Back', async () => {
    const fixture = await createShell(false);
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('.nav-group').length).toBe(5);
    expect(element.querySelector('nav a')).toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(element.querySelectorAll('nav a').length).toBe(3);
    expect(element.querySelector('.nav-group')).toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(element.querySelectorAll('.nav-group').length).toBe(5);
    expect(document.activeElement).toBe(element.querySelector('[data-group="R"]'));
    element.querySelector<HTMLButtonElement>('[data-group="T"]')!.click();
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('.nav-back')!.click();
    fixture.detectChanges();
    expect(element.querySelectorAll('.nav-group').length).toBe(5);
  });

  it('ignores shortcuts while typing and keeps the mobile drawer open when Escape goes back', async () => {
    const fixture = await createShell(true);
    const element = fixture.nativeElement as HTMLElement;
    const input = document.createElement('input');
    element.append(input);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));
    fixture.detectChanges();
    expect(element.querySelector('.nav-back')).toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    const drawer = fixture.debugElement.query(By.directive(MatSidenav))
      .componentInstance as MatSidenav;
    expect(drawer.opened).toBe(true);
    element
      .querySelector<HTMLButtonElement>('.nav-back')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(drawer.opened).toBe(true);
    expect(element.querySelectorAll('.nav-group').length).toBe(5);
  });

  it('gives every visible item a unique letter and navigates to every child', async () => {
    const fixture = await createShell(false);
    const element = fixture.nativeElement as HTMLElement;
    const keys = Array.from(element.querySelectorAll('.nav-group'), (node) =>
      node.getAttribute('aria-keyshortcuts')!,
    );
    expect(new Set(keys).size).toBe(5);
    for (const groupKey of keys) {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: groupKey.toLowerCase(), bubbles: true }),
      );
      fixture.detectChanges();
      await fixture.whenStable();
      const links = Array.from(element.querySelectorAll<HTMLAnchorElement>('nav a'));
      const shortcuts = links.map((link) => link.getAttribute('aria-keyshortcuts'));
      expect(shortcuts.every((key) => /^[A-Z]$/.test(key!))).toBe(true);
      expect(new Set(shortcuts).size).toBe(links.length);
      for (const link of links) {
        document.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: link.getAttribute('aria-keyshortcuts')!.toLowerCase(),
            bubbles: true,
          }),
        );
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
        await fixture.whenStable();
        expect(TestBed.inject(Router).url).toBe(link.getAttribute('href'));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        fixture.detectChanges();
        await fixture.whenStable();
      }
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();
      await fixture.whenStable();
    }
  });

  it('does not activate hidden child shortcuts or modified keys and allows shortcuts to be disabled', async () => {
    const fixture = await createShell(false, 'viewer');
    const element = fixture.nativeElement as HTMLElement;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true }));
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    for (const modifiers of [{ altKey: true }, { ctrlKey: true }, { metaKey: true }]) {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'r', bubbles: true, ...modifiers }),
      );
      fixture.detectChanges();
      expect(element.querySelector('.nav-back')).toBeNull();
    }
    element.querySelector<HTMLInputElement>('.shortcut-toggle input')!.click();
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));
    fixture.detectChanges();
    expect(element.querySelector('.nav-back')).toBeNull();
  });

  for (const mobile of [false, true]) {
    it(
      'hides navigation, focuses the form, and restores shortcuts with Escape on ' +
        (mobile ? 'mobile' : 'desktop'),
      async () => {
        const fixture = await createShell(mobile);
        const element = fixture.nativeElement as HTMLElement;
        const drawer = fixture.debugElement.query(By.directive(MatSidenav))
          .componentInstance as MatSidenav;
        if (mobile) {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          fixture.detectChanges();
        }
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));
        fixture.detectChanges();
        await fixture.whenStable();
        element.querySelector<HTMLAnchorElement>('a[href="/reports/daybook"]')!.click();
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
        await fixture.whenStable();
        const input = element.querySelector<HTMLInputElement>('main input')!;
        expect(drawer.opened).toBe(false);
        expect(document.activeElement).toBe(input);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true }));
        fixture.detectChanges();
        expect(drawer.opened).toBe(false);
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        fixture.detectChanges();
        await fixture.whenStable();
        expect(drawer.opened).toBe(true);
        expect(element.querySelector('.nav-heading')!.textContent).toContain('Reports');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
        await fixture.whenStable();
        expect(drawer.opened).toBe(false);
        expect(document.activeElement).toBe(input);
      },
    );
  }

  it('uses hash-aware links and navigates only once per click', async () => {
    const fixture = await createShell(false, 'admin', true);
    const element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLButtonElement>('[data-group="R"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    const link = element.querySelector<HTMLAnchorElement>('nav a')!;
    expect(link.getAttribute('href')).toBe('#/reports/daybook');
    link.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(Router).url).toBe('/reports/daybook');
  });

  for (const mobile of [false, true]) {
    it(
      'returns to dashboard on the final Escape on ' + (mobile ? 'mobile' : 'desktop'),
      async () => {
        const fixture = await createShell(mobile);
        const element = fixture.nativeElement as HTMLElement;
        const drawer = fixture.debugElement.query(By.directive(MatSidenav))
          .componentInstance as MatSidenav;
        if (mobile) {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          fixture.detectChanges();
        }
        element.querySelector<HTMLButtonElement>('[data-group="R"]')!.click();
        fixture.detectChanges();
        await fixture.whenStable();
        element.querySelector<HTMLAnchorElement>('nav a')!.click();
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
        await fixture.whenStable();
        for (let step = 0; step < 3; step++) {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          fixture.detectChanges();
          await fixture.whenStable();
          fixture.detectChanges();
          await fixture.whenStable();
        }
        expect(TestBed.inject(Router).url).toBe('/dashboard');
        expect(drawer.opened).toBe(false);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        fixture.detectChanges();
        await fixture.whenStable();
        expect(element.querySelectorAll('.nav-group').length).toBe(5);
      },
    );
  }
});
