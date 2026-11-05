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
import {
  KuriCollectionRow,
  KuriMember,
  KuriMemberLedgerRow,
  KuriSchemeDetail as Scheme,
} from './kuri.models';

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
  head_code: 205,
  head_name: 'Kuri Daily 1000',
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

async function setup<T>(component: Type<T>, receiptEntry = false) {
  const params = new BehaviorSubject(convertToParamMap({ id: '1', no: '1' }));
  const kuri = {
    getAccounts: vi.fn().mockResolvedValue([
      { code: 101, name: 'Cash on Hand', account_type: 'asset', is_cash_bank: true },
      { code: 102, name: 'SBI Current Account', account_type: 'asset', is_cash_bank: true },
      { code: 205, name: 'Kuri Daily 1000', account_type: 'liability', is_cash_bank: false },
    ]),
    listSchemes: vi.fn().mockResolvedValue([scheme, { ...scheme, id: 2, name: 'Other scheme' }]),
    getSchemeDetail: vi.fn().mockResolvedValue([scheme]),
    getCollectionStatus: vi.fn().mockResolvedValue([collection]),
    getMembers: vi.fn().mockResolvedValue([member]),
    getPayoutSchedule: vi.fn().mockResolvedValue([]),
    getInstallmentAmounts: vi.fn().mockResolvedValue([
      {
        installment_no: 1,
        base_amount: 1000,
        amount_due: 1000,
        is_custom: false,
        can_edit: false,
        notes: null,
        updated_at: null,
      },
      {
        installment_no: 2,
        base_amount: 1000,
        amount_due: 1000,
        is_custom: false,
        can_edit: true,
        notes: null,
        updated_at: null,
      },
      {
        installment_no: 3,
        base_amount: 1000,
        amount_due: 1000,
        is_custom: false,
        can_edit: true,
        notes: null,
        updated_at: null,
      },
    ]),
    setInstallmentAmount: vi.fn().mockResolvedValue({}),
    setPayoutAmount: vi.fn().mockResolvedValue({}),
    getLots: vi.fn().mockResolvedValue([]),
    getDefaulters: vi.fn().mockResolvedValue([collection]),
    getMemberLedger: vi
      .fn()
      .mockResolvedValue([
        { installment_no: 1, amount_due: 1000, amount_paid: 0, balance: 1000, last_paid_on: null },
      ]),
    getPaymentHistory: vi.fn().mockResolvedValue([]),
    recordPayment: vi.fn().mockResolvedValue({}),
    recordReceipt: vi.fn().mockResolvedValue({}),
    getReceiptTickets: vi.fn().mockResolvedValue([collection]),
    recordBulkPayment: vi.fn().mockResolvedValue(1),
    createScheme: vi.fn().mockResolvedValue({}),
    setSchemeAccount: vi.fn().mockResolvedValue({}),
    markPayout: vi.fn().mockResolvedValue({}),
    addMember: vi.fn().mockResolvedValue({}),
    updateMember: vi.fn().mockResolvedValue({}),
    getCustomer: vi.fn().mockResolvedValue({
      code: 1,
      name: 'Test member',
      addr1: '12 Main St',
      addr2: 'Kochi',
      addr3: null,
      addr4: null,
      phone: '9876543210',
    }),
    searchCustomers: vi.fn().mockResolvedValue([
      {
        code: 1,
        name: 'Test member',
        addr1: '12 Main St',
        addr2: 'Kochi',
        addr3: null,
        addr4: null,
        phone: '9876543210',
      },
      {
        code: 5,
        name: 'Anand Kumar',
        addr1: 'MG Road',
        addr2: 'Thrissur',
        addr3: null,
        addr4: null,
        phone: '9447000000',
      },
    ]),
  };
  const notify = { error: vi.fn(), success: vi.fn() };
  const auth = { canEdit: () => true, isAdmin: () => true };
  await TestBed.configureTestingModule({
    imports: [component],
    providers: [
      provideRouter([]),
      provideIsoDateAdapter(),
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: params,
          snapshot: { data: { receiptEntry }, queryParamMap: convertToParamMap({ scheme: '1' }) },
        },
      },
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

describe('Kuri simple receipt entry', () => {
  async function choose() {
    const result = await setup(KuriInstallment, true);
    result.component['paymentForm'].controls.member_id.setValue(1);
    await result.component['onMemberSelect'](1);
    return result;
  }

  it('starts on Scheme and advances to Ticket when Scheme is confirmed', async () => {
    const { host, fixture } = await setup(KuriInstallment, true);
    await fixture.whenStable();
    const scheme = host.querySelector<HTMLElement>('mat-select')!;
    expect(document.activeElement).toBe(scheme);
    scheme.dispatchEvent(new CustomEvent('app-field-advance', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).toBe(host.querySelector('[data-kuri-ticket]'));
  });

  it('selects amount and date on Enter navigation and skips Refresh balances', async () => {
    const { host, fixture } = await choose();
    fixture.detectChanges();
    const cash = host.querySelector<HTMLElement>(
      'mat-select[formControlName="cash_account_code"]',
    )!;
    const amount = host.querySelector<HTMLInputElement>('[formControlName="amount"]')!;
    const date = host.querySelector<HTMLInputElement>('[formControlName="paid_on"]')!;
    cash.focus();
    cash.dispatchEvent(new CustomEvent('app-field-advance', { bubbles: true }));
    expect(document.activeElement).toBe(amount);
    expect(amount.selectionStart).toBe(0);
    expect(amount.selectionEnd).toBe(amount.value.length);
    amount.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(date);
    expect(date.selectionStart).toBe(0);
    expect(date.selectionEnd).toBe(date.value.length);
    const notes = host.querySelector<HTMLInputElement>('[formControlName="notes"]')!;
    const refresh = host.querySelector<HTMLButtonElement>('.allocation-preview button')!;
    expect(refresh.tabIndex).toBe(-1);
    for (const key of ['Enter', 'ArrowDown']) {
      notes.focus();
      notes.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      expect(document.activeElement).toBe(host.querySelector('button[type="submit"]'));
    }
  });

  it('returns to Ticket after saving and posts a typed decimal as a number', async () => {
    const { component, kuri, fixture, host } = await choose();
    fixture.detectChanges();
    const amount = host.querySelector<HTMLInputElement>('[formControlName="amount"]')!;
    amount.value = '500.25';
    amount.dispatchEvent(new Event('input', { bubbles: true }));
    await component['onSubmitPayment']();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(kuri.recordReceipt).toHaveBeenCalledWith(expect.objectContaining({ p_amount: 500.25 }));
    expect(document.activeElement).toBe(host.querySelector('[data-kuri-ticket]'));
  });

  it('does not advance to Ticket or clear entry values when saving fails', async () => {
    const { component, kuri, fixture, host } = await choose();
    fixture.detectChanges();
    const amount = host.querySelector<HTMLInputElement>('[formControlName="amount"]')!;
    amount.focus();
    kuri.recordReceipt.mockRejectedValueOnce(new Error('Offline'));
    await component['onSubmitPayment']();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).not.toBe(host.querySelector('[data-kuri-ticket]'));
    expect(component['paymentForm'].controls.member_id.value).toBe(1);
    expect(component['paymentForm'].controls.amount.value).toBe(1000);
  });

  it('opens a searchable form without requiring an installment', async () => {
    const { component, host } = await choose();
    expect(host.textContent).toContain('Installment receipts');
    expect(host.querySelector('#kuri-payment-form')).not.toBeNull();
    expect(host.querySelector('.payment-toggle')).toBeNull();
    expect(host.querySelector('.summary-grid')).toBeNull();
    expect(
      Array.from(host.querySelectorAll('mat-label'), (el) => el.textContent?.trim()),
    ).not.toContain('Installment');
    component['collections'].set([
      { ...collection, holder_name: 'Ticket holder' },
      { ...collection, member_id: 2, ticket_no: 2, balance: 0 },
    ]);
    component['memberQuery'].set('holder');
    expect(component['matchingMembers']().map((m) => m.member_id)).toEqual([1]);
  });

  it('splits a 500 receipt into 200 arrears and 300 next installment with one RPC', async () => {
    const { component, kuri, fixture, host } = await choose();
    component['collections'].set([{ ...collection, balance: 4200 }]);
    kuri.getMemberLedger.mockResolvedValueOnce([
      { installment_no: 1, amount_due: 4000, amount_paid: 3800, balance: 200, last_paid_on: null },
      { installment_no: 2, amount_due: 4000, amount_paid: 0, balance: 4000, last_paid_on: null },
    ]);
    await component['refreshAllocation']();
    component['paymentForm'].patchValue({
      amount: 500,
      cash_account_code: 102,
      paid_on: '2026-10-02',
    });
    const split = [
      { installment_no: 1, amount: 200 },
      { installment_no: 2, amount: 300 },
    ];
    expect(component['allocationPreview']()).toEqual(split);
    fixture.detectChanges();
    expect(host.querySelector('.allocation-preview')?.textContent).toContain('300.00');
    await component['onSubmitPayment']();
    expect(kuri.recordReceipt).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        p_scheme_id: 1,
        p_member_id: 1,
        p_amount: 500,
        p_paid_on: '2026-10-02',
        p_cash_account_code: 102,
        p_expected_allocations: split,
        p_request_id: expect.any(String),
      }),
    );
    expect(kuri.recordReceipt.mock.calls[0][0]).not.toHaveProperty('p_installment_no');
    expect(kuri.recordPayment).not.toHaveBeenCalled();
    expect(component['paymentForm'].getRawValue()).toMatchObject({
      member_id: null,
      amount: null,
      paid_on: '2026-10-02',
      cash_account_code: 102,
    });
  });

  it('requires a bank/cash account and refuses overpayment or excessive decimals', async () => {
    const { component, kuri } = await choose();
    component['paymentForm'].controls.cash_account_code.setValue(null);
    await component['onSubmitPayment']();
    component['paymentForm'].controls.cash_account_code.setValue(101);
    for (const amount of [1001, 0, -1, 1.001]) {
      component['paymentForm'].controls.amount.setValue(amount);
      await component['onSubmitPayment']();
    }
    expect(kuri.recordReceipt).not.toHaveBeenCalled();
  });

  it('keeps an unchanged request ID on retry and prevents duplicate saves', async () => {
    const { component, kuri } = await choose();
    kuri.recordReceipt.mockRejectedValueOnce(new Error('Response lost'));
    await component['onSubmitPayment']();
    const first = kuri.recordReceipt.mock.calls[0][0];
    const response = deferred<object>();
    kuri.recordReceipt.mockReturnValueOnce(response.promise);
    const saving = component['onSubmitPayment']();
    await component['onSubmitPayment']();
    await component['selectReceiptScheme'](2);
    expect(component['schemeId']()).toBe(1);
    expect(kuri.recordReceipt).toHaveBeenCalledTimes(2);
    expect(kuri.recordReceipt.mock.calls[1][0]).toEqual(first);
    response.resolve({});
    await saving;
  });

  it('discards a slow ticket ledger after another ticket is selected', async () => {
    const { component, kuri } = await choose();
    component['collections'].set([collection, { ...collection, member_id: 2, ticket_no: 2 }]);
    const old = deferred<KuriMemberLedgerRow[]>();
    kuri.getMemberLedger.mockReturnValueOnce(old.promise);
    const first = component['onMemberSelect'](1);
    component['paymentForm'].controls.member_id.setValue(2);
    kuri.getMemberLedger.mockResolvedValueOnce([
      { installment_no: 2, amount_due: 1000, amount_paid: 500, balance: 500, last_paid_on: null },
    ]);
    await component['onMemberSelect'](2);
    old.resolve([
      { installment_no: 1, amount_due: 1000, amount_paid: 0, balance: 1000, last_paid_on: null },
    ]);
    await first;
    expect(component['allocationPreview']()).toEqual([{ installment_no: 2, amount: 500 }]);
  });

  it('blocks saving on a failed balance load and supports refresh', async () => {
    const { component, kuri } = await choose();
    kuri.getMemberLedger.mockRejectedValueOnce(new Error('Offline'));
    await component['refreshAllocation']();
    await component['onSubmitPayment']();
    expect(kuri.recordReceipt).not.toHaveBeenCalled();
    await component['refreshAllocation']();
    expect(component['allocationFailed']()).toBe(false);
    expect(component['allocationPreview']().length).toBe(1);
  });

  it('clears submitted errors after saving and protects unfinished entry', async () => {
    const { component, host, fixture } = await choose();
    component['paymentForm'].markAsDirty();
    await component['selectReceiptScheme'](2);
    expect(component['schemeId']()).toBe(1);
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await vi.waitFor(() => expect(component['isSubmitting']()).toBe(false));
    fixture.detectChanges();
    expect(component.hasPendingChanges()).toBe(false);
    expect(host.querySelector('mat-error')).toBeNull();
  });
});

describe('Kuri scheme controls', () => {
  it('opens the member editor from an active ticket and keeps its ticket number read-only', async () => {
    const { component, fixture, host } = await setup(KuriSchemeDetail);
    host.querySelector<HTMLElement>('[role="tab"][id$="label-2"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(host.querySelector('[aria-label="Edit ticket 1 member"]')).not.toBeNull();
    });
    host.querySelector<HTMLButtonElement>('[aria-label="Edit ticket 1 member"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component['editingMember']()?.id).toBe(1);
    expect(host.querySelector<HTMLInputElement>('[formControlName="ticketNo"]')!.readOnly).toBe(
      true,
    );
    expect(host.textContent).toContain('Save member');
    expect(host.textContent).toContain('Existing accounting vouchers keep their recorded member');
    component['cancelEditMember']();
    fixture.detectChanges();
    expect(component['editingMember']()).toBeNull();
  });

  it('updates an active ticket member while retaining the ticket identity', async () => {
    const { component, kuri } = await setup(KuriSchemeDetail);
    component['editMember']({ ...member, revision: 3 });
    expect(component['memberForm'].controls.ticketNo.value).toBe(1);
    component['onSelectCustomer']({ code: 5, name: 'New member', phone: null });
    await component['saveMember']();
    expect(kuri.updateMember).toHaveBeenCalledWith(1, 5, 3, {
      holderName: null,
      holderAddress: null,
      holderPhone: null,
    });
    expect(kuri.addMember).not.toHaveBeenCalled();
    expect(component['editingMember']()).toBeNull();
  });

  it('prefills custom ticket holder details and allows clearing them', async () => {
    const { component, kuri } = await setup(KuriSchemeDetail);
    component['editMember']({
      ...member,
      holder_name: 'Ticket holder',
      holder_phone: '12345',
      holder_address: 'Kochi',
    });
    expect(component['memberForm'].controls.holderName.value).toBe('Ticket holder');
    expect(component['memberForm'].controls.useCustomHolder.value).toBe(true);
    await component['saveMember']();
    expect(kuri.updateMember).toHaveBeenLastCalledWith(1, 1, 0, {
      holderName: 'Ticket holder',
      holderAddress: 'Kochi',
      holderPhone: '12345',
    });
    component['editMember']({ ...member, holder_name: 'Ticket holder' });
    component['memberForm'].controls.useCustomHolder.setValue(false);
    await component['saveMember']();
    expect(kuri.updateMember).toHaveBeenLastCalledWith(1, 1, 0, {
      holderName: null,
      holderAddress: null,
      holderPhone: null,
    });
  });

  it('keeps a failed member edit and prevents duplicate submissions', async () => {
    const { component, kuri } = await setup(KuriSchemeDetail);
    component['editMember'](member);
    kuri.updateMember.mockRejectedValueOnce(new Error('Ticket member changed'));
    await component['saveMember']();
    expect(component['editingMember']()?.id).toBe(1);
    const response = deferred<object>();
    kuri.updateMember.mockReturnValueOnce(response.promise);
    const saving = component['saveMember']();
    await component['saveMember']();
    expect(kuri.updateMember).toHaveBeenCalledTimes(2);
    response.resolve({});
    await saving;
    expect(component['busy']()).toBe(false);
  });

  it('cancels editing on navigation and blocks completed schemes', async () => {
    const { component, params, kuri } = await setup(KuriSchemeDetail);
    component['editMember'](member);
    params.next(convertToParamMap({ id: '2' }));
    expect(component['editingMember']()).toBeNull();
    await vi.waitFor(() => expect(component['loading']()).toBe(false));
    component['scheme'].set({ ...scheme, status: 'completed' });
    component['editMember'](member);
    expect(component['editingMember']()).toBeNull();
    expect(kuri.updateMember).not.toHaveBeenCalled();
  });

  it('keeps a newly selected member when an older code lookup finishes', async () => {
    const { component, kuri } = await setup(KuriSchemeDetail);
    const response = deferred<{ code: number; name: string; phone: null }>();
    kuri.getCustomer.mockReturnValueOnce(response.promise);
    component['editMember'](member);
    component['onSelectCustomer']({ code: 5, name: 'New member', phone: null });
    response.resolve({ code: 1, name: 'Old member', phone: null });
    await Promise.resolve();
    expect(component['selectedCustomer']()?.code).toBe(5);
    expect(component['memberForm'].controls.customerCode.value).toBe(5);
  });

  it('edits a future installment without changing the base scheme terms', async () => {
    const { component, kuri } = await setup(KuriSchemeDetail);
    const row = component['installmentAmounts']()[1];
    component['editInstallmentAmount'](row);
    component['installmentAmountForm'].patchValue({
      amount: 1250,
      notes: '  Adjusted collection  ',
    });
    await component['saveInstallmentAmount']();
    expect(kuri.setInstallmentAmount).toHaveBeenCalledWith(1, 2, 1250, 'Adjusted collection', 1000);
    expect(component['editingInstallment']()).toBeNull();
    expect(component['scheme']()?.installment_amount).toBe(1000);
  });

  it('restores a custom future installment to its base amount', async () => {
    const { component, kuri } = await setup(KuriSchemeDetail);
    const row = { ...component['installmentAmounts']()[1], amount_due: 1250, is_custom: true };
    component['editInstallmentAmount'](row);
    await component['saveInstallmentAmount'](true);
    expect(kuri.setInstallmentAmount).toHaveBeenCalledWith(1, 2, null, null, 1250);
  });

  it('saves zero as a custom installment amount and can reset it to the base', async () => {
    const { component, kuri } = await setup(KuriSchemeDetail);
    component['editInstallmentAmount'](component['installmentAmounts']()[1]);
    component['installmentAmountForm'].controls.amount.setValue(0);
    expect(component['installmentAmountForm'].valid).toBe(true);
    await component['saveInstallmentAmount']();
    expect(kuri.setInstallmentAmount).toHaveBeenCalledWith(1, 2, 0, null, 1000);
    component['editInstallmentAmount']({
      ...component['installmentAmounts']()[1],
      amount_due: 0,
      is_custom: true,
    });
    expect(component['installmentAmountForm'].controls.amount.value).toBe(0);
    await component['saveInstallmentAmount'](true);
    expect(kuri.setInstallmentAmount).toHaveBeenLastCalledWith(1, 2, null, null, 0);
  });

  it('refuses locked installments and invalid custom amounts', async () => {
    const { component, kuri } = await setup(KuriSchemeDetail);
    component['editInstallmentAmount'](component['installmentAmounts']()[0]);
    expect(component['editingInstallment']()).toBeNull();
    component['editInstallmentAmount'](component['installmentAmounts']()[1]);
    for (const amount of [-1, 1.001, 10000000000]) {
      component['installmentAmountForm'].controls.amount.setValue(amount);
      await component['saveInstallmentAmount']();
    }
    expect(kuri.setInstallmentAmount).not.toHaveBeenCalled();
  });

  it('keeps the edit on failure and prevents duplicate saves', async () => {
    const { component, kuri } = await setup(KuriSchemeDetail);
    component['editInstallmentAmount'](component['installmentAmounts']()[1]);
    component['installmentAmountForm'].controls.amount.setValue(1250);
    kuri.setInstallmentAmount.mockRejectedValueOnce(new Error('Balance changed'));
    await component['saveInstallmentAmount']();
    expect(component['installmentAmountForm'].controls.amount.value).toBe(1250);
    expect(component['editingInstallment']()).not.toBeNull();
    const response = deferred<object>();
    kuri.setInstallmentAmount.mockReturnValueOnce(response.promise);
    const saving = component['saveInstallmentAmount']();
    expect(component['installmentAmountForm'].disabled).toBe(true);
    await component['saveInstallmentAmount']();
    expect(kuri.setInstallmentAmount).toHaveBeenCalledTimes(2);
    response.resolve({});
    await saving;
  });

  it('discards an unfinished amount edit when navigating to another scheme', async () => {
    const { component, params } = await setup(KuriSchemeDetail);
    component['editInstallmentAmount'](component['installmentAmounts']()[1]);
    params.next(convertToParamMap({ id: '2' }));
    expect(component['editingInstallment']()).toBeNull();
  });
  it('saves a future payout override with the displayed amount as a concurrency check', async () => {
    const { component, kuri } = await setup(KuriSchemeDetail);
    component['slots'].set([
      {
        installment_no: 2,
        lot_number: 1,
        payout_amount: 1592,
        calculated_amount: 1592,
        can_edit: true,
        is_custom: false,
      },
    ]);
    component['editPayoutAmount'](2);
    component['payoutAmountForm'].patchValue({ amount: 1700, notes: ' Agreed payout ' });
    await component['savePayoutAmount']();
    expect(kuri.setPayoutAmount).toHaveBeenCalledWith(1, 2, 1700, 'Agreed payout', 1592);
    expect(component['editingPayout']()).toBeNull();
  });

  it('restores a custom payout to its calculated amount', async () => {
    const { component, kuri } = await setup(KuriSchemeDetail);
    component['slots'].set([
      {
        installment_no: 3,
        lot_number: 2,
        payout_amount: 1900,
        calculated_amount: 2000,
        can_edit: true,
        is_custom: true,
      },
    ]);
    component['editPayoutAmount'](3);
    await component['savePayoutAmount'](true);
    expect(kuri.setPayoutAmount).toHaveBeenCalledWith(1, 3, null, null, 1900);
  });

  it('rejects invalid payouts and retains the edit when saving fails', async () => {
    const { component, kuri, notify } = await setup(KuriSchemeDetail);
    component['slots'].set([
      { installment_no: 3, lot_number: 2, payout_amount: 2000, can_edit: true },
    ]);
    component['editPayoutAmount'](3);
    for (const amount of [0, -1, 1.001, 10000000000]) {
      component['payoutAmountForm'].controls.amount.setValue(amount);
      await component['savePayoutAmount']();
    }
    expect(kuri.setPayoutAmount).not.toHaveBeenCalled();
    kuri.setPayoutAmount.mockRejectedValueOnce(new Error('Payout amount changed'));
    component['payoutAmountForm'].controls.amount.setValue(2100);
    await component['savePayoutAmount']();
    expect(component['editingPayout']()?.installment_no).toBe(3);
    expect(component['payoutAmountForm'].controls.amount.value).toBe(2100);
    expect(component['busy']()).toBe(false);
    expect(notify.error).toHaveBeenCalled();
  });

  it('locks drawn payouts and displays the recorded award even with a stale schedule', async () => {
    const { component } = await setup(KuriSchemeDetail);
    component['slots'].set([
      { installment_no: 2, lot_number: 1, payout_amount: 1592, can_edit: true },
    ]);
    component['lots'].set([
      {
        id: 1,
        scheme_id: 1,
        installment_no: 2,
        winner_member_id: 1,
        payout_amount: 1700,
        payout_status: 'pending',
        drawn_at: '',
        payout_date: null,
        member: null,
      },
    ]);
    component['editPayoutAmount'](1);
    component['editPayoutAmount'](2);
    expect(component['editingPayout']()).toBeNull();
    expect(component['combinedSchedule']()[1].payout_amount).toBe(1700);
    expect(component['combinedSchedule']()[1].can_edit).toBe(false);
    component['lots'].set([]);
    component['scheme'].set({ ...scheme, status: 'completed' });
    component['editPayoutAmount'](2);
    expect(component['editingPayout']()).toBeNull();
  });

  it('previews the saved PSP7 scheme with 25 tickets and 26 installments correctly', async () => {
    const { component } = await setup(KuriSchemeForm);
    component['form'].patchValue({
      name: 'PSP7',
      installment_amount: 4000,
      num_members: 25,
      max_deduction_pct: 20.4,
      head_code: 1069,
    });
    expect(component['totalValue']()).toBe(100000);
    expect(component['firstLotPayout']()).toBeCloseTo(79600, 2);
    expect(component['lastLotPayout']()).toBe(100000);
    expect(component['incrementPerLot']()).toBeCloseTo(850, 2);
    expect(component['numInstallments']()).toBe(26);
  });
  it('uses the same day-first ISO date adapter as the rest of the app and requires an account head', async () => {
    const { component, fixture, host, kuri } = await setup(KuriSchemeForm);
    component['form'].patchValue({
      name: 'Test scheme',
      installment_amount: 0.5,
      num_members: 2,
    });
    expect(component['form'].valid).toBe(false);
    component['form'].patchValue({ head_code: 205 });
    const date = host.querySelector<HTMLInputElement>('[formControlName="start_date"]')!;
    date.value = '23/09/2026';
    date.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(component['form'].valid).toBe(true);
    await component['save']();
    expect(kuri.createScheme).toHaveBeenCalledWith(
      expect.objectContaining({
        p_head_code: 205,
        p_start_date: '2026-09-23',
        p_installment_amount: 0.5,
      }),
    );
  });

  it('links or updates a scheme account head on the scheme detail page before transactions are posted', async () => {
    const { component, kuri } = await setup(KuriSchemeDetail);
    expect(component['canChangeAccount']()).toBe(true);
    component['startEditAccount']();
    component['accountForm'].controls.headCode.setValue(205);
    await component['saveSchemeAccount']();
    expect(kuri.setSchemeAccount).toHaveBeenCalledWith(1, 205);
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

  it('assigns a ticket using the linked member details by default or custom ticket holder details when enabled', async () => {
    const { component, kuri } = await setup(KuriSchemeDetail);
    component['memberForm'].patchValue({ customerCode: 1, ticketNo: 2 });
    await vi.waitFor(() => expect(component['selectedCustomer']()?.code).toBe(1));

    await component['addMember']();
    expect(kuri.addMember).toHaveBeenCalledWith(1, 1, 2);

    component['memberForm'].patchValue({ customerCode: 1, ticketNo: 2 });
    await vi.waitFor(() => expect(component['selectedCustomer']()?.code).toBe(1));
    component['memberForm'].controls.useCustomHolder.setValue(true);

    // Pre-fills with the member's details when toggled on
    expect(component['memberForm'].controls.holderName.value).toBe('Test member');
    expect(component['memberForm'].controls.holderAddress.value).toBe('12 Main St, Kochi');
    expect(component['memberForm'].controls.holderPhone.value).toBe('9876543210');

    // Requires a non-empty ticket holder name when custom details are enabled
    component['memberForm'].controls.holderName.setValue('   ');
    expect(component['memberForm'].invalid).toBe(true);

    component['memberForm'].patchValue({
      holderName: 'Ticket Holder B',
      holderAddress: '45 Market Road',
      holderPhone: '9123456789',
    });
    expect(component['memberForm'].valid).toBe(true);
    await component['addMember']();
    expect(kuri.addMember).toHaveBeenLastCalledWith(1, 1, 2, {
      holderName: 'Ticket Holder B',
      holderAddress: '45 Market Road',
      holderPhone: '9123456789',
    });
  });

  it('lets the user search and select a member by name and pre-fills the next available ticket number', async () => {
    const { component, kuri } = await setup(KuriSchemeDetail);
    // Ticket #1 is already taken by `member`, so next available ticket is #2
    expect(component['availableTickets']()).toEqual([2]);
    expect(component['memberForm'].controls.ticketNo.value).toBe(2);

    component['onSelectCustomer']({
      code: 5,
      name: 'Anand Kumar',
      addr1: 'MG Road',
      addr2: 'Thrissur',
      addr3: null,
      addr4: null,
      phone: '9447000000',
    });
    expect(component['memberForm'].controls.customerCode.value).toBe(5);
    expect(component['selectedCustomer']()?.name).toBe('Anand Kumar');

    await component['addMember']();
    expect(kuri.addMember).toHaveBeenCalledWith(1, 5, 2);
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
