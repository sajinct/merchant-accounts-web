import { registerLocaleData } from '@angular/common';
import localeEnIn from '@angular/common/locales/en-IN';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth.service';
import { NotifyService } from '../../core/notify.service';
import { SupabaseService } from '../../core/supabase.service';
import { provideIsoDateAdapter } from '../../shared/iso-date-adapter';
import { Vouchers } from './vouchers';

const HEADS = [
  { code: 1001, name: 'Cash in hand' },
  { code: 4001, name: 'Hall rent' },
];

describe('Voucher entry', () => {
  async function setup() {
    registerLocaleData(localeEnIn);
    let vouchers: unknown[] = [];
    const query: any = {
      select: () => query,
      not: () => query,
      eq: () => query,
      gte: () => query,
      lte: () => query,
      is: () => query,
      order: () => query,
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: query.__rows, error: null }).then(resolve),
    };
    const from = vi.fn((table: string) => {
      query.__rows = table === 'account_heads' ? HEADS : vouchers;
      return query;
    });
    const rpc = vi.fn(() => ({
      single: () => Promise.resolve({ data: { voucher_no: 7, voucher_type: 1 }, error: null }),
    }));
    const notify = { success: vi.fn(), error: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [Vouchers],
      providers: [
        provideIsoDateAdapter(),
        { provide: LOCALE_ID, useValue: 'en-IN' },
        { provide: AuthService, useValue: { canEdit: () => true, isAdmin: () => true } },
        { provide: SupabaseService, useValue: { client: { from, rpc } } },
        { provide: NotifyService, useValue: notify },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(Vouchers);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const page = fixture.componentInstance as any;
    const fill = async () => {
      page.form.patchValue({ cash: 1001, account: 4001, amount: 250, description: 'Hall booking' });
      await page.loadAccount(HEADS[1]);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const setLedger = (rows: unknown[]) => (vouchers = rows);
    return { fixture, page, rpc, notify, fill, setLedger };
  }

  it('saves with Ctrl+S and keeps the account for the next entry', async () => {
    const { fixture, page, rpc, fill } = await setup();
    await fill();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }));
    await fixture.whenStable();
    expect(rpc).toHaveBeenCalledWith('create_voucher', expect.objectContaining({ p_amount: 250 }));
    expect(page.selectedHead()?.code).toBe(4001);
    expect(page.form.controls.amount.value).toBeNull();
    expect(page.form.controls.description.value).toBe('');
    expect(page.form.controls.cash.value).toBe(1001);
  });

  it('ignores the shortcut when the entry is incomplete', async () => {
    const { fixture, rpc } = await setup();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }));
    await fixture.whenStable();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('shows the balance for the selected account', async () => {
    const { fixture, fill, setLedger } = await setup();
    setLedger([
      { id: 1, voucher_type: 1, voucher_no: 1, voucher_date: '2026-09-01', amount: 1000 },
      { id: 2, voucher_type: 2, voucher_no: 1, voucher_date: '2026-09-02', amount: 250.5 },
    ]);
    await fill();
    const balance = fixture.nativeElement.querySelector('.account-balance') as HTMLElement;
    expect(balance.textContent).toContain('Balance for Hall rent');
    expect(balance.textContent).toContain('749.50');
  });
});
