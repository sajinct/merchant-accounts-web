import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../core/auth.service';
import { FinancialYear, FinancialYearService } from '../core/financial-year.service';
import { NotifyService } from '../core/notify.service';
import { FinancialYearBanner } from './financial-year-banner';
import { FinancialYearSelector } from './financial-year-selector';

function year(startYear: number, closed = false): FinancialYear {
  return {
    start_year: startYear,
    starts_on: `${startYear}-04-01`,
    ends_on: `${startYear + 1}-03-31`,
    closed_at: closed ? `${startYear + 1}-04-02` : null,
    closing_journal_id: closed ? 1 : null,
    equity_account_code: closed ? 300 : null,
  };
}

describe('Financial year selector', () => {
  function fyStub(selected = 2026, years = [year(2026), year(2025, true)]) {
    const selectedSignal = signal(selected);
    const yearsSignal = signal(years);
    return {
      years: yearsSignal,
      selected: selectedSignal,
      label: () => `${selectedSignal()}-${String(selectedSignal() + 1).slice(2)}`,
      closed: () => !!yearsSignal().find((y) => y.start_year === selectedSignal())?.closed_at,
      start: () => `${selectedSignal()}-04-01`,
      end: () => `${selectedSignal() + 1}-03-31`,
      entryDate: () => `${selectedSignal()}-09-16`,
      contains: (date: string) =>
        date >= `${selectedSignal()}-04-01` && date <= `${selectedSignal() + 1}-03-31`,
      load: vi.fn(async () => {}),
    };
  }

  async function setup(component: unknown, fy = fyStub(), isAdmin = true) {
    await TestBed.configureTestingModule({
      imports: [component as never],
      providers: [
        provideRouter([]),
        { provide: FinancialYearService, useValue: fy },
        { provide: NotifyService, useValue: { success: vi.fn(), error: vi.fn() } },
        { provide: AuthService, useValue: { isAdmin: () => isAdmin } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(component as never);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, fy, text: () => fixture.nativeElement.textContent as string };
  }

  function openMenu(fixture: { nativeElement: HTMLElement; detectChanges: () => void }) {
    fixture.nativeElement.querySelector<HTMLButtonElement>('.year-control')!.click();
    fixture.detectChanges();
    return Array.from(
      document.querySelectorAll<HTMLButtonElement>('.cdk-overlay-container button[mat-menu-item]'),
    );
  }

  it('lists every year and marks closed ones', async () => {
    const { fixture, text } = await setup(FinancialYearSelector);
    expect(text()).toContain('2026-27');
    const items = openMenu(fixture).map((b) => b.textContent?.replace(/\s+/g, ' ').trim());
    expect(items).toHaveLength(2);
    expect(items[0]).toContain('2026-27');
    expect(items[0]).toContain('check');
    expect(items[1]).toContain('2025-26');
    expect(items[1]).toContain('Closed');
  });

  it('switches the selected year from the menu', async () => {
    const { fixture, fy } = await setup(FinancialYearSelector);
    openMenu(fixture)[1].click();
    expect(fy.selected()).toBe(2025);
  });

  it('marks the control when the selected year is closed', async () => {
    const { fixture } = await setup(FinancialYearSelector, fyStub(2025));
    const control = fixture.nativeElement.querySelector('.year-control') as HTMLElement;
    expect(control.classList).toContain('is-closed');
    expect(control.textContent).toContain('Closed');
  });

  it('loads the years once shown', async () => {
    const { fy } = await setup(FinancialYearSelector);
    expect(fy.load).toHaveBeenCalled();
  });
});

describe('Financial year banner', () => {
  function stub(selected: number, years: FinancialYear[]) {
    const selectedSignal = signal(selected);
    const yearsSignal = signal(years);
    return {
      years: yearsSignal,
      selected: selectedSignal,
      label: () => `${selectedSignal()}-${String(selectedSignal() + 1).slice(2)}`,
      closed: () => !!yearsSignal().find((y) => y.start_year === selectedSignal())?.closed_at,
      start: () => `${selectedSignal()}-04-01`,
      end: () => `${selectedSignal() + 1}-03-31`,
      entryDate: () => `${selectedSignal()}-09-16`,
      contains: () => false,
      load: vi.fn(async () => {}),
    };
  }

  async function render(fy: unknown, isAdmin = true) {
    await TestBed.configureTestingModule({
      imports: [FinancialYearBanner],
      providers: [
        provideRouter([]),
        { provide: FinancialYearService, useValue: fy },
        { provide: AuthService, useValue: { isAdmin: () => isAdmin } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(FinancialYearBanner);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('warns that a closed year is locked, with an admin link', async () => {
    const element = await render(stub(2025, [year(2025, true)]));
    expect(element.textContent).toContain('Financial year 2025-26 is closed.');
    expect(element.querySelector('a')?.getAttribute('href')).toContain('/admin/financial-years');
  });

  it('hides the admin link from other roles', async () => {
    const element = await render(stub(2025, [year(2025, true)]), false);
    expect(element.querySelector('a')).toBeNull();
  });

  it('notes when the open year does not include today', async () => {
    const element = await render(stub(2024, [year(2024)]));
    expect(element.textContent).toContain('does not include today');
    expect(element.querySelector('.year-banner')?.classList).toContain('subtle');
  });
});
