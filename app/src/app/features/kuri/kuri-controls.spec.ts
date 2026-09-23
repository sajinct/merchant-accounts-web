import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { BehaviorSubject, of } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth.service';
import { CompanyService } from '../../core/company.service';
import { NotifyService } from '../../core/notify.service';
import { provideIsoDateAdapter } from '../../shared/iso-date-adapter';
import { isoDate } from '../../shared/dates';
import { KuriInstallment } from './kuri-installment';
import { KuriSchemeForm } from './kuri-scheme-form';
import { KuriSchemeDetail } from './kuri-scheme-detail';
import { KuriDefaulters } from './kuri-defaulters';
import { KuriMemberLedger } from './kuri-member-ledger';
import { KuriService } from './kuri.service';
import { KuriCollectionRow, KuriMember, KuriSchemeDetail as Scheme } from './kuri.models';

const scheme: Scheme = {
  id: 1,
  name: 'Test scheme',
  installment_amount: 1000,
  num_members: 2,
  num_installments: 3,
  max_deduction_pct: 20.4,
  total_value: 2000,
  start_date: '2026-09-01',
  status: 'active',
  notes: null,
  enrolled_count: 2,
  lots_drawn: 0,
  lots_paid_out: 0,
  total_collected: 0,
  total_paid_out: 0,
  created_at: '',
};
const collection: KuriCollectionRow = {
  member_id: 1,
  ticket_no: 1,
  customer_code: 1,
  customer_name: 'Test member',
  phone: null,
  amount_due: 1000,
  amount_paid: 0,
  balance: 1000,
  last_paid_on: null,
  has_won_lot: false,
  won_installment: null,
};
const member: KuriMember = {
  id: 1,
  scheme_id: 1,
  customer_code: 1,
  ticket_no: 1,
  notes: null,
  created_at: '',
  customer: { code: 1, name: 'Test member', phone: null },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function setup<T>(component: Type<T>) {
  const params = new BehaviorSubject(convertToParamMap({ id: '1', no: '1' }));
  const kuri = {
    listSchemes: vi.fn().mockResolvedValue([scheme, { ...scheme, id: 2, name: 'Other scheme' }]),
    getSchemeDetail: vi.fn().mockResolvedValue([scheme]),
    getCollectionStatus: vi.fn().mockResolvedValue([collection]),
    getMembers: vi.fn().mockResolvedValue([member]),
    getPayoutSchedule: vi.fn().mockResolvedValue([]),
    getLots: vi.fn().mockResolvedValue([]),
    getDefaulters: vi.fn().mockResolvedValue([collection]),
    getMemberLedger: vi
      .fn()
      .mockResolvedValue([
        { installment_no: 1, amount_due: 1000, amount_paid: 0, balance: 1000, last_paid_on: null },
      ]),
    getPaymentHistory: vi.fn().mockResolvedValue([]),
    recordPayment: vi.fn().mockResolvedValue({}),
    recordBulkPayment: vi.fn().mockResolvedValue(1),
    createScheme: vi.fn().mockResolvedValue({}),
    addMember: vi.fn().mockResolvedValue({}),
  };
  const notify = { error: vi.fn(), success: vi.fn() };
  const auth = { canEdit: () => true, isAdmin: () => true };
  await TestBed.configureTestingModule({
    imports: [component],
    providers: [
      provideRouter([]),
      provideIsoDateAdapter(),
      { provide: ActivatedRoute, useValue: { paramMap: params } },
      { provide: KuriService, useValue: kuri },
      { provide: AuthService, useValue: auth },
      { provide: NotifyService, useValue: notify },
      { provide: CompanyService, useValue: { settings: () => null } },
      { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(null) }) } },
    ],
  }).compileComponents();
  vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  await fixture.whenStable();
  const instance = fixture.componentInstance;
  if (instance instanceof KuriInstallment || instance instanceof KuriSchemeDetail) {
    const isLoading = (instance as KuriInstallment)['loading'];
    await vi.waitFor(() => expect(isLoading()).toBe(false));
  }
  fixture.detectChanges();
  return {
    fixture,
    component: fixture.componentInstance,
    host: fixture.nativeElement as HTMLElement,
    kuri,
    notify,
    params,
  };
}

describe('Kuri payment controls', () => {
  async function payment() {
    const result = await setup(KuriInstallment);
    result.host.querySelector<HTMLButtonElement>('.payment-toggle')!.click();
    result.fixture.detectChanges();
    result.component['paymentForm'].controls.member_id.setValue(1);
    result.component['onMemberSelect'](1);
    result.component['paymentForm'].controls.amount.setValue(200);
    result.fixture.detectChanges();
    return result;
  }

  it('opens with a valid ISO date and accepts day-first typing', async () => {
    const { component, host, fixture, kuri, notify } = await payment();
    expect(component['paymentForm'].controls.paid_on.value).toBe(isoDate());
    expect(component['paymentForm'].controls.paid_on.errors).toBeNull();
    const input = host.querySelector<HTMLInputElement>('[formControlName="paid_on"]')!;
    input.value = '22/09/2026';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    await component['onSubmitPayment']();
    expect(notify.error).not.toHaveBeenCalled();
    expect(kuri.recordPayment).toHaveBeenCalledWith(
      expect.objectContaining({ p_paid_on: '2026-09-22' }),
    );
    expect(component['paymentForm'].controls.paid_on.value).toBe(isoDate());
  });

  it('preserves the request ID and values when an unchanged payment is retried', async () => {
    const { component, kuri } = await payment();
    kuri.recordPayment.mockRejectedValueOnce(new Error('Response lost'));
    const before = component['paymentForm'].getRawValue();
    await component['onSubmitPayment']();
    expect(component['paymentForm'].getRawValue()).toEqual(before);
    await component['onSubmitPayment']();
    expect(kuri.recordPayment.mock.calls[1][0]).toEqual(kuri.recordPayment.mock.calls[0][0]);
  });

  it('gives a changed payment a new request ID after an error', async () => {
    const { component, kuri } = await payment();
    kuri.recordPayment.mockRejectedValueOnce(new Error('Rejected'));
    await component['onSubmitPayment']();
    component['paymentForm'].controls.amount.setValue(250);
    await component['onSubmitPayment']();
    expect(kuri.recordPayment.mock.calls[1][0].p_request_id).not.toBe(
      kuri.recordPayment.mock.calls[0][0].p_request_id,
    );
  });

  it('rejects excessive or overprecise amounts before the RPC', async () => {
    const { component, kuri } = await payment();
    for (const amount of [1001, 1.001, 0, -1]) {
      component['paymentForm'].controls.amount.setValue(amount);
      await component['onSubmitPayment']();
    }
    expect(kuri.recordPayment).not.toHaveBeenCalled();
  });

  it('freezes input during a save and prevents duplicate submissions', async () => {
    const { component, kuri } = await payment();
    const response = deferred<object>();
    kuri.recordPayment.mockReturnValueOnce(response.promise);
    const saving = component['onSubmitPayment']();
    expect(component['paymentForm'].disabled).toBe(true);
    await component['onSubmitPayment']();
    expect(kuri.recordPayment).toHaveBeenCalledTimes(1);
    response.resolve({});
    await saving;
    expect(component['paymentForm'].enabled).toBe(true);
  });

  it('moves from amount to date and from notes to Save using Enter', async () => {
    const { host, kuri } = await payment();
    for (const [from, to] of [
      ['amount', 'paid_on'],
      ['notes', null],
    ]) {
      const input = host.querySelector<HTMLInputElement>(`[formControlName="${from}"]`)!;
      input.focus();
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
      expect(document.activeElement).toBe(
        to
          ? host.querySelector(`[formControlName="${to}"]`)
          : host.querySelector('button[type="submit"]'),
      );
    }
    expect(kuri.recordPayment).not.toHaveBeenCalled();
  });

  it('exposes an accessible disclosure and named navigation controls', async () => {
    const { host, fixture } = await payment();
    const toggle = host.querySelector<HTMLButtonElement>('.payment-toggle')!;
    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('[aria-label="Previous installment"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Next installment"]')).not.toBeNull();
  });

  it('discards a slow response for the previous installment', async () => {
    const { component, kuri, params } = await setup(KuriInstallment);
    const old = deferred<KuriCollectionRow[]>();
    kuri.getCollectionStatus.mockReturnValueOnce(old.promise);
    params.next(convertToParamMap({ id: '1', no: '2' }));
    kuri.getCollectionStatus.mockResolvedValueOnce([{ ...collection, balance: 500 }]);
    params.next(convertToParamMap({ id: '1', no: '3' }));
    await vi.waitFor(() => expect(component['collections']()[0]?.balance).toBe(500));
    old.resolve([{ ...collection, balance: 900 }]);
    await Promise.resolve();
    await Promise.resolve();
    expect(component['collections']()[0].balance).toBe(500);
  });

  it('shows a retry control after a failed collection load', async () => {
    const { component, kuri, host, fixture } = await setup(KuriInstallment);
    kuri.getCollectionStatus.mockRejectedValueOnce(new Error('Offline'));
    await component['loadData']();
    fixture.detectChanges();
    expect(host.textContent).toContain('Unable to load collections');
    expect(host.querySelector('.payment-toggle')).toBeNull();
    await component['loadData']();
    expect(component['loadFailed']()).toBe(false);
    expect(component['collections']()).toHaveLength(1);
  });
});

describe('Kuri scheme controls', () => {
  it('uses the same day-first ISO date adapter as the rest of the app', async () => {
    const { component, fixture, host, kuri } = await setup(KuriSchemeForm);
    component['form'].patchValue({ name: 'Test scheme', installment_amount: 0.5, num_members: 2 });
    const date = host.querySelector<HTMLInputElement>('[formControlName="start_date"]')!;
    date.value = '23/09/2026';
    date.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(component['form'].valid).toBe(true);
    await component['save']();
    expect(kuri.createScheme).toHaveBeenCalledWith(
      expect.objectContaining({ p_start_date: '2026-09-23', p_installment_amount: 0.5 }),
    );
  });

  it('rejects fractional ticket counts and overprecise amounts', async () => {
    const { component } = await setup(KuriSchemeForm);
    component['form'].patchValue({ name: 'Test', installment_amount: 1.001, num_members: 2.5 });
    expect(component['form'].controls.installment_amount.invalid).toBe(true);
    expect(component['form'].controls.num_members.invalid).toBe(true);
    component['form'].controls.name.setValue('   ');
    expect(component['form'].controls.name.invalid).toBe(true);
  });

  it('bounds member codes and ticket numbers before enrollment', async () => {
    const { component, kuri } = await setup(KuriSchemeDetail);
    for (const ticketNo of [0, 1.5, 3]) {
      component['memberForm'].patchValue({ customerCode: 1, ticketNo });
      await component['addMember']();
    }
    expect(kuri.addMember).not.toHaveBeenCalled();
  });
});

describe('Kuri report selectors', () => {
  it('discards defaulters returned after the installment changes', async () => {
    const { component, kuri } = await setup(KuriDefaulters);
    component['form'].controls.scheme.setValue(1);
    const response = deferred<KuriCollectionRow[]>();
    kuri.getDefaulters.mockReturnValueOnce(response.promise);
    const running = component['run']();
    component['form'].controls.installment.setValue(2);
    response.resolve([collection]);
    await running;
    expect(component['rows']()).toEqual([]);
    expect(component['ran']()).toBe(false);
  });

  it('keeps the newest scheme tickets when requests resolve out of order', async () => {
    const { component, kuri } = await setup(KuriMemberLedger);
    const old = deferred<KuriMember[]>();
    kuri.getMembers.mockReturnValueOnce(old.promise);
    component['form'].controls.scheme.setValue(1);
    kuri.getMembers.mockResolvedValueOnce([{ ...member, id: 2, scheme_id: 2 }]);
    component['form'].controls.scheme.setValue(2);
    await vi.waitFor(() => expect(component['members']()[0]?.id).toBe(2));
    old.resolve([member]);
    await Promise.resolve();
    expect(component['members']()[0].id).toBe(2);
  });

  it('discards ledger results after selecting another ticket', async () => {
    const { component, kuri } = await setup(KuriMemberLedger);
    component['form'].controls.scheme.setValue(1);
    await vi.waitFor(() => expect(component['loadingMembers']()).toBe(false));
    component['form'].controls.member.setValue(1);
    const response = deferred<unknown[]>();
    kuri.getMemberLedger.mockReturnValueOnce(response.promise);
    const running = component['run']();
    component['form'].controls.member.setValue(2);
    response.resolve([{ installment_no: 1 }]);
    await running;
    expect(component['ledger']()).toEqual([]);
    expect(component['ran']()).toBe(false);
  });
});
