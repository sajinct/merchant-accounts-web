import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth.service';
import { NotifyService } from '../../core/notify.service';
import { SupabaseService } from '../../core/supabase.service';
import { provideIsoDateAdapter } from '../../shared/iso-date-adapter';
import { fyStart } from '../../shared/fy';
import { MemberSubscription } from './member-subscription';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';

describe('Member subscription payment disclosure', () => {
  async function setup() {
    const year = fyStart();
    const rpc = vi.fn().mockImplementation((name: string, _params?: Record<string, unknown>) =>
      Promise.resolve({
        data:
          name === 'member_subscription_years'
            ? [
                { fy_start: year - 1, fee: 500, paid: 100, balance: 400, last_paid_on: null },
                { fy_start: year, fee: 600, paid: 0, balance: 600, last_paid_on: null },
              ]
            : name === 'member_joining_fee'
              ? 100
              : null,
        error: null,
      }),
    );
    const from = vi.fn((table: string) => {
      if (table !== 'subscription_payments') throw new Error(`Unexpected table: ${table}`);
      const result = Promise.resolve({ data: [], error: null });
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        then: result.then.bind(result),
      };
      return query;
    });
    const notify = { success: vi.fn(), error: vi.fn() };
    const dialog = {
      open: vi.fn().mockReturnValue({ afterClosed: () => of({ reason: 'Wrong member' }) }),
    };
    const client = {
      rpc,
      from,
    };
    await TestBed.configureTestingModule({
      imports: [MemberSubscription],
      providers: [
        provideRouter([]),
        provideIsoDateAdapter(),
        { provide: SupabaseService, useValue: { client } },
        { provide: AuthService, useValue: { canEdit: () => true, isAdmin: () => true } },
        { provide: NotifyService, useValue: notify },
        { provide: MatDialog, useValue: dialog },
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
    return { fixture, host, settle, rpc, year, from, notify, dialog };
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
    expect(rpc.mock.calls.filter((call) => call[0] === 'member_subscription_years')).toHaveLength(
      1,
    );
  });

  it('records a past payment without accounts or a current-year date restriction', async () => {
    const { fixture, host, settle, rpc, year, from } = await setup();
    host.querySelector<HTMLButtonElement>('.subscription-actions button')!.click();
    await settle();
    fixture.componentInstance['form'].controls.paid_on.setValue('2004-05-15');
    expect(host.querySelector('app-cash-account-field')).toBeNull();
    expect(host.querySelector('[appFinancialYearScope]')).toBeNull();
    expect(host.textContent).toContain('No receipt voucher or daybook entry is created.');
    await fixture.componentInstance['record']();
    await settle();
    expect(rpc).toHaveBeenCalledWith('record_subscription_payment', {
      p_member_code: 42,
      p_fy_start: year - 1,
      p_amount: 400,
      p_paid_on: '2004-05-15',
      p_notes: '',
      p_request_id: expect.any(String),
    });
    expect(from.mock.calls.every(([table]) => table === 'subscription_payments')).toBe(true);
    expect(host.querySelector('form')).toBeNull();
    expect(document.activeElement?.id).toBe('subscription-heading');
  });

  it('refuses an amount over the member balance before calling the payment RPC', async () => {
    const { fixture, rpc } = await setup();
    fixture.componentInstance['form'].controls.amount.setValue(401);
    await fixture.componentInstance['record']();
    expect(rpc.mock.calls.some(([name]) => name === 'record_subscription_payment')).toBe(false);
  });

  it('retains the same request ID and entered values when a payment must be retried', async () => {
    const { fixture, rpc, notify, settle } = await setup();
    const component = fixture.componentInstance;
    component['startPayment']();
    await settle();
    const before = component['form'].getRawValue();
    rpc.mockResolvedValueOnce({ data: null, error: new Error('Connection interrupted') });
    await component['record']();
    expect(notify.error).toHaveBeenCalled();
    expect(component['paymentOpen']()).toBe(true);
    expect(component['form'].getRawValue()).toEqual(before);
    await component['record']();
    const records = rpc.mock.calls.filter(([name]) => name === 'record_subscription_payment');
    expect(records).toHaveLength(2);
    expect(records[0][1]).toEqual(records[1][1]);
  });

  it.each([null, 77])('describes cancellation correctly for voucher link %s', async (voucherId) => {
    const { fixture, rpc, year, notify, dialog } = await setup();
    const payment = {
      id: 1,
      member_code: 42,
      fy_start: year,
      paid_on: '2004-05-15',
      amount: 100,
      voucher_id: voucherId,
      voucher: voucherId === null ? null : { voucher_no: 10 },
      notes: null,
      cancelled_at: null,
      cancel_reason: null,
    };
    await fixture.componentInstance['cancel'](payment);
    expect(document.activeElement?.id).toBe('subscription-heading');
    expect(dialog.open).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        data: expect.objectContaining({
          message:
            voucherId === null
              ? 'Removes this past payment from the membership balance. Accounts and the daybook are unchanged.'
              : 'This payment has a linked receipt voucher. Cancelling also reverses that accounting entry.',
        }),
      }),
    );
    expect(rpc).toHaveBeenCalledWith('cancel_subscription_payment', {
      p_id: 1,
      p_reason: 'Wrong member',
    });
    expect(notify.success).toHaveBeenCalledWith(
      voucherId === null
        ? 'Past payment cancelled. Membership balance updated.'
        : 'Payment cancelled with a balancing reversal.',
    );
  });

  it('reloads membership balances after the parent saves a changed profile', async () => {
    const { fixture, rpc } = await setup();
    fixture.componentRef.setInput('refreshKey', 1);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(rpc.mock.calls.filter(([name]) => name === 'member_subscription_years')).toHaveLength(2);
  });
});
