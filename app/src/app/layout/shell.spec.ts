import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BreakpointObserver, BreakpointState } from '@angular/cdk/layout';
import { By } from '@angular/platform-browser';
import { MatSidenav } from '@angular/material/sidenav';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { CompanyService } from '../core/company.service';
import { NotifyService } from '../core/notify.service';
import { Shell } from './shell';

@Component({ template: '' })
class TestPage {}

describe('Shell navigation', () => {
  const mobileQuery = '(max-width: 959px)';
  let viewport: BehaviorSubject<BreakpointState>;
  const state = (matches: boolean): BreakpointState => ({
    matches,
    breakpoints: { [mobileQuery]: matches },
  });

  async function createShell(mobile: boolean, role = 'admin') {
    viewport = new BehaviorSubject(state(mobile));
    await TestBed.configureTestingModule({
      imports: [Shell],
      providers: [
        provideRouter([{ path: 'reports/daybook', component: TestPage }]),
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
    expect(element.querySelector('a[href="/reports/daybook"]')).not.toBeNull();
    expect(element.querySelector('a[href="/account/password"]')).not.toBeNull();
  });
});
