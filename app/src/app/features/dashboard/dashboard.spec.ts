import { registerLocaleData } from '@angular/common';
import localeEnIn from '@angular/common/locales/en-IN';
import { LOCALE_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth.service';
import { FinancialYearService } from '../../core/financial-year.service';
import { NotifyService } from '../../core/notify.service';
import { SupabaseService } from '../../core/supabase.service';
import { isoDate } from '../../shared/dates';
import { Dashboard } from './dashboard';

describe('Dashboard', () => {
  async function setup(failing: string[] = []) {
    registerLocaleData(localeEnIn);
    const today = isoDate();
    const results: Record<string, unknown> = {
      rpt_daybook: [
        { seq: 0, row_kind: 'opening', tran_date: today, debit: 0, credit: 0, balance: 1000 },
        { seq: 1, row_kind: 'entry', tran_date: today, debit: 0, credit: 2500, balance: 3500 },
        { seq: 2, row_kind: 'entry', tran_date: today, debit: 400, credit: 0, balance: 3100 },
      ],
      financial_year_summary: [{ income: 9000, expense: 12000, net_result: -3000 }],
      subscription_dues_summary: [{ total: 750, members: 2 }],
    };
    const rpc = vi.fn((name: string) =>
      Promise.resolve(
        failing.includes(name)
          ? { data: null, error: new Error(`${name} failed`) }
          : { data: results[name], error: null },
      ),
    );
    const query: any = {
      select: () => query,
      gte: () => query,
      lte: () => query,
      is: () => query,
      order: () => query,
      limit: () => query,
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({
          data: [
            {
              id: 7,
              voucher_type: 1,
              voucher_no: 42,
              voucher_date: today,
              amount: 2500,
              description: 'Rent',
              head: { name: 'Rent received' },
            },
          ],
          error: null,
        }).then(resolve),
    };
    const notify = { success: vi.fn(), error: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'en-IN' },
        {
          provide: AuthService,
          useValue: {
            canEdit: () => true,
            profile: signal({ full_name: 'Asha Menon', username: 'asha' }),
          },
        },
        { provide: SupabaseService, useValue: { client: { rpc, from: () => query } } },
        { provide: NotifyService, useValue: notify },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
    const page = fixture.componentInstance as unknown as { loading: () => boolean };
    await vi.waitFor(() => expect(page.loading()).toBe(false));
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, rpc, notify, text: () => fixture.nativeElement.textContent as string };
  }

  it('shows cash, dues, year result and recent vouchers', async () => {
    const { fixture, text, rpc } = await setup();
    expect(text()).toContain('Welcome back, Asha');
    const values = Array.from(
      fixture.nativeElement.querySelectorAll('.kpi-value') as NodeListOf<HTMLElement>,
    ).map((el) => el.textContent?.trim());
    expect(values).toEqual(['3,100.00', '2,500.00', '400.00', '750.00']);
    expect(text()).toContain('2 members owe');
    expect(text()).toContain('Net deficit');
    expect(text()).toContain('R-42');
    expect(text()).toContain('Rent received');
    expect(fixture.nativeElement.querySelectorAll('app-cash-flow-chart path.bar').length).toBe(2);
    const fy = TestBed.inject(FinancialYearService);
    expect(rpc).toHaveBeenCalledWith('financial_year_summary', { p_start_year: fy.selected() });
  });

  it('keeps the other sections when one query fails', async () => {
    const { fixture, notify, text } = await setup(['subscription_dues_summary']);
    const values = Array.from(
      fixture.nativeElement.querySelectorAll('.kpi-value') as NodeListOf<HTMLElement>,
    ).map((el) => el.textContent?.trim());
    expect(values).toEqual(['3,100.00', '2,500.00', '400.00', '—']);
    expect(text()).toContain('R-42');
    expect(notify.error).toHaveBeenCalledTimes(1);
  });
});
