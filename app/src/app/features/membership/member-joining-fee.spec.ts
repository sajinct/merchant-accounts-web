import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { afterAll, beforeAll, vi } from 'vitest';
import { AuthService } from '../../core/auth.service';
import { NotifyService } from '../../core/notify.service';
import { SupabaseService } from '../../core/supabase.service';
import { provideIsoDateAdapter } from '../../shared/iso-date-adapter';
import { MemberJoiningFee } from './member-joining-fee';

describe('Historical member joining-fee payments', () => {
  const scrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
  });
  afterAll(() => {
    if (scrollIntoView)
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollIntoView);
    else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  });

  const historical = {
    id: 10,
    member_code: 42,
    paid_on: '2018-07-01',
    amount: 100,
    voucher_id: null,
    voucher: null,
    notes: 'Old receipt 123',
    cancelled_at: null,
    cancel_reason: null,
  };

  async function setup(options: { canEdit?: boolean; isAdmin?: boolean; history?: boolean } = {}) {
    const rpc = vi
      .fn()
      .mockImplementation((name: string) =>
        Promise.resolve({ data: name === 'member_joining_fee' ? 500 : null, error: null }),
      );
    const from = vi.fn((table: string) => {
      const result = Promise.resolve({
        data: table === 'joining_fee_payments' && options.history ? [{ ...historical }] : [],
        error: null,
      });
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        then: result.then.bind(result),
      };
      return query;
    });
    const dialog = {
      open: vi.fn().mockReturnValue({ afterClosed: () => of({ reason: 'Correction' }) }),
    };
    const notify = { success: vi.fn(), error: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [MemberJoiningFee],
      providers: [
        provideIsoDateAdapter(),
        { provide: SupabaseService, useValue: { client: { rpc, from } } },
        {
          provide: AuthService,
          useValue: {
            canEdit: () => options.canEdit ?? true,
            isAdmin: () => options.isAdmin ?? true,
          },
        },
        { provide: NotifyService, useValue: notify },
        { provide: MatDialog, useValue: dialog },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(MemberJoiningFee);
    fixture.componentRef.setInput('memberCode', 42);
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance['loading']()).toBe(false));
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const host = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    return { fixture, component, host, settle, rpc, from, dialog, notify };
  }

  it('shows the balance and opens a keyboard-accessible history form without querying accounts', async () => {
    const { component, host, settle, from } = await setup({ history: true });
    expect(component['fee']()).toBe(500);
    expect(component['paid']()).toBe(100);
    expect(component['balance']()).toBe(400);
    expect(host.textContent).toContain('Historical record');
    expect(host.textContent).toContain('No receipt voucher or daybook entry is created.');
    expect(host.querySelector('form')).toBeNull();
    host.querySelector<HTMLButtonElement>('.panel-header button')!.click();
    await settle();
    expect(document.activeElement).toBe(host.querySelector('input[formControlName="amount"]'));
    expect(component['form'].controls.amount.value).toBe(400);
    expect(host.querySelector('app-cash-account-field')).toBeNull();
    expect(host.querySelector('[appFinancialYearScope]')).toBeNull();
    expect(from.mock.calls.map(([table]) => table)).toEqual(['joining_fee_payments']);
    component['closePayment']();
    await settle();
    expect(host.querySelector('form')).toBeNull();
    expect(document.activeElement?.id).toBe('joining-fee-heading');
  });

  it('records a payment from an old financial year with only membership parameters and returns focus', async () => {
    const { component, host, settle, rpc } = await setup();
    component['startPayment']();
    await settle();
    component['form'].patchValue({ amount: 250, paid_on: '2010-05-06', notes: 'Already posted' });
    await component['record']();
    await settle();
    expect(rpc).toHaveBeenCalledWith('record_joining_fee_payment', {
      p_member_code: 42,
      p_amount: 250,
      p_paid_on: '2010-05-06',
      p_notes: 'Already posted',
      p_request_id: expect.any(String),
    });
    expect(host.querySelector('form')).toBeNull();
    expect(document.activeElement?.id).toBe('joining-fee-heading');
  });

  it.each([0, -1, 501, NaN])('does not record an invalid amount %s', async (amount) => {
    const { component, settle, rpc } = await setup();
    component['startPayment']();
    await settle();
    component['form'].controls.amount.setValue(amount);
    await component['record']();
    expect(rpc.mock.calls.some(([name]) => name === 'record_joining_fee_payment')).toBe(false);
  });

  it('rejects an invalid payment date', async () => {
    const { component, settle, rpc } = await setup();
    component['startPayment']();
    await settle();
    component['form'].controls.paid_on.setValue('2020-02-31');
    await settle();
    await component['record']();
    expect(component['form'].invalid).toBe(true);
    expect(rpc.mock.calls.some(([name]) => name === 'record_joining_fee_payment')).toBe(false);
  });

  it('retains the request ID and entered values for a failed save, then renews it after success', async () => {
    const { component, settle, rpc, notify } = await setup();
    component['startPayment']();
    await settle();
    component['form'].patchValue({ amount: 100, paid_on: '2018-07-01' });
    rpc.mockResolvedValueOnce({ data: null, error: new Error('Connection lost') });
    await component['record']();
    const firstRequest = rpc.mock.calls.find(([name]) => name === 'record_joining_fee_payment')![1];
    expect(notify.error).toHaveBeenCalledOnce();
    expect(component['paymentOpen']()).toBe(true);
    expect(component['form'].controls.amount.value).toBe(100);
    await component['record']();
    const requests = rpc.mock.calls.filter(([name]) => name === 'record_joining_fee_payment');
    expect(requests[1][1]).toEqual(firstRequest);
    component['startPayment']();
    await settle();
    await component['record']();
    const finalRequests = rpc.mock.calls.filter(([name]) => name === 'record_joining_fee_payment');
    expect(finalRequests[2][1].p_request_id).not.toBe(firstRequest.p_request_id);
  });

  it.each([false, true])(
    'explains the accounting impact for linked=%s and restores focus on cancellation',
    async (linked) => {
      const { component, settle, rpc, dialog, notify } = await setup({ history: true });
      const payment = {
        ...historical,
        voucher_id: linked ? 101 : null,
        voucher: linked ? { voucher_no: 23 } : null,
      };
      await component['cancel'](payment);
      await settle();
      const confirmation = dialog.open.mock.calls[0][1].data;
      expect(confirmation.message).toContain(
        linked
          ? 'reverses that voucher in the accounts and daybook'
          : 'Accounts and daybook entries are unchanged',
      );
      expect(rpc).toHaveBeenCalledWith('cancel_joining_fee_payment', {
        p_id: 10,
        p_reason: 'Correction',
      });
      expect(notify.success).toHaveBeenCalledWith(
        linked
          ? 'Payment cancelled with a balancing reversal.'
          : 'Historical payment record cancelled.',
      );
      expect(document.activeElement?.id).toBe('joining-fee-heading');
    },
  );

  it('retains legacy receipt numbers and excludes cancelled records from the paid amount', async () => {
    const { component, host, settle } = await setup({ history: true });
    component['payments'].set([
      { ...historical },
      { ...historical, id: 11, amount: 200, voucher_id: 23, voucher: { voucher_no: 45 } },
      {
        ...historical,
        id: 12,
        amount: 500,
        cancelled_at: '2026-09-17',
        cancel_reason: 'Duplicate',
      },
    ]);
    await settle();
    expect(component['paid']()).toBe(300);
    expect(component['balance']()).toBe(200);
    expect(host.textContent).toContain('R-45');
    expect(host.textContent).toContain('Cancelled');
  });

  it('hides editing for viewers and guards direct record and cancellation calls', async () => {
    const { component, host, rpc, dialog } = await setup({
      canEdit: false,
      isAdmin: false,
      history: true,
    });
    component['startPayment']();
    component['form'].patchValue({ amount: 100 });
    await component['record']();
    await component['cancel'](historical);
    expect(component['paymentOpen']()).toBe(false);
    expect(host.querySelector('button')).toBeNull();
    expect(dialog.open).not.toHaveBeenCalled();
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(['member_joining_fee']);
  });

  it('reloads the fee after the parent saves changes to the same member', async () => {
    const { fixture, component, settle, rpc } = await setup();
    rpc.mockResolvedValueOnce({ data: 750, error: null });
    fixture.componentRef.setInput('refreshKey', 1);
    await settle();
    await vi.waitFor(() => expect(component['fee']()).toBe(750));
    expect(rpc.mock.calls.filter(([name]) => name === 'member_joining_fee')).toHaveLength(2);
  });
});
