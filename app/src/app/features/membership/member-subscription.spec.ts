import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth.service';
import { NotifyService } from '../../core/notify.service';
import { SupabaseService } from '../../core/supabase.service';
import { provideIsoDateAdapter } from '../../shared/iso-date-adapter';
import { fyStart } from '../../shared/fy';
import { MemberSubscription } from './member-subscription';

describe('Member subscription payment disclosure', { timeout: 30000 }, () => {
  async function setup() {
    const year = fyStart();
    const rpc = vi.fn().mockImplementation((name: string) =>
      Promise.resolve({
        data:
          name === 'member_subscription_years'
            ? [
                { fy_start: year - 1, fee: 500, paid: 100, balance: 400, last_paid_on: null },
                { fy_start: year, fee: 600, paid: 0, balance: 600, last_paid_on: null },
              ]
            : null,
        error: null,
      }),
    );
    const client = {
      rpc,
      from: (table: string) => {
        const result = Promise.resolve({
          data: table === 'account_heads' ? [{ code: 1001, name: 'Cash' }] : [],
          error: null,
        });
        const query = {
          select: () => query,
          eq: () => query,
          order: () => query,
          maybeSingle: () => Promise.resolve({ data: table === 'customers' ? { joining_fee: 100 } : null, error: null }),
          then: result.then.bind(result),
        };
        return query;
      },
    };
    await TestBed.configureTestingModule({
      imports: [MemberSubscription],
      providers: [
        provideRouter([]),
        provideIsoDateAdapter(),
        { provide: SupabaseService, useValue: { client } },
        { provide: AuthService, useValue: { canEdit: () => true, isAdmin: () => true } },
        { provide: NotifyService, useValue: { success: vi.fn(), error: vi.fn() } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(MemberSubscription);
    fixture.componentRef.setInput('memberCode', 42);
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance['years']()).toHaveLength(2));
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      fixture.detectChanges();
      const form = host.querySelector('form');
      if (form) form.scrollIntoView = vi.fn();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    return { fixture, host, settle, rpc, year };
  }

  it('keeps entry out of the overview and opens the selected year without posting', async () => {
    const { fixture, host, settle, rpc, year } = await setup();
    expect(host.querySelector('form')).toBeNull();
    const pay = host.querySelectorAll<HTMLButtonElement>('tbody button')[1];
    pay.click();
    await settle();
    expect(host.querySelector<HTMLInputElement>('input[formControlName="amount"]')?.value).toBe(
      '600',
    );
    expect(fixture.componentInstance['form'].controls.fy_start.value).toBe(year);
    const cancel = Array.from(host.querySelectorAll<HTMLButtonElement>('form button')).find(
      (button) => button.textContent?.trim() === 'Cancel',
    )!;
    cancel.click();
    await settle();
    expect(host.querySelector('form')).toBeNull();
    expect(document.activeElement?.id).toBe('subscription-heading');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('records the selected payment and returns to the overview after success', async () => {
    const { fixture, host, settle, rpc, year } = await setup();
    host.querySelector<HTMLButtonElement>('.subscription-actions button')!.click();
    await settle();
    fixture.componentInstance['form'].controls.cash.setValue(1001);
    await fixture.componentInstance['record']();
    await settle();
    expect(rpc).toHaveBeenCalledWith(
      'record_subscription_payment',
      expect.objectContaining({
        p_member_code: 42,
        p_fy_start: year - 1,
        p_amount: 400,
        p_cash_account_code: 1001,
      }),
    );
    expect(host.querySelector('form')).toBeNull();
  });
});
