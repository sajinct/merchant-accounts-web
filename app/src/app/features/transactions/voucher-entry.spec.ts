import { registerLocaleData } from '@angular/common';
import localeEnIn from '@angular/common/locales/en-IN';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth.service';
import { CompanyService } from '../../core/company.service';
import { NotifyService } from '../../core/notify.service';
import { VoucherService } from '../../core/voucher.service';
import { voucherType } from '../../core/voucher-types';
import { provideIsoDateAdapter } from '../../shared/iso-date-adapter';
import { VoucherEntry } from './voucher-entry';

const ACCOUNTS = [
  { code: 1001, name: 'Cash in hand', account_type: 'asset', is_cash_bank: true },
  { code: 4001, name: 'Membership fee', account_type: 'income', is_cash_bank: false },
  { code: 4002, name: 'Donation', account_type: 'income', is_cash_bank: false },
  { code: 2001, name: 'Salary payable', account_type: 'liability', is_cash_bank: false },
];

describe('Voucher entry', () => {
  async function setup(slug: 'receipt' | 'payment' | 'contra' | 'journal' = 'receipt') {
    registerLocaleData(localeEnIn);
    const post = vi.fn().mockResolvedValue({
      id: 5,
      voucher_type: 1,
      voucher_no: 7,
      voucher_date: '2026-09-16',
      total_amount: 1300,
      narration: 'Annual dues',
      reference_no: null,
      party_code: null,
    });
    const vouchers = {
      post,
      postOpening: vi.fn().mockResolvedValue(12),
      nextNumber: vi.fn().mockResolvedValue(7),
      referenceData: vi
        .fn()
        .mockResolvedValue({ accounts: ACCOUNTS, parties: [], allowCashInJournal: false }),
      cancel: vi.fn(),
    };
    const notify = { success: vi.fn(), error: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [VoucherEntry],
      providers: [
        provideRouter([]),
        provideIsoDateAdapter(),
        { provide: LOCALE_ID, useValue: 'en-IN' },
        { provide: AuthService, useValue: { canEdit: () => true, isAdmin: () => true } },
        { provide: VoucherService, useValue: vouchers },
        { provide: CompanyService, useValue: { settings: () => null } },
        { provide: NotifyService, useValue: notify },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(VoucherEntry);
    fixture.componentRef.setInput('type', slug);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = fixture.componentInstance as any;
    return { fixture, page, vouchers, notify, text: () => fixture.nativeElement.textContent };
  }

  it('labels itself from the voucher type in the route', async () => {
    const { text } = await setup('receipt');
    expect(text()).toContain('Receipt voucher');
    expect(text()).toContain('Received into');
    expect(text()).toContain('R-7');
  });

  it('drops the cash and party fields for a contra, which has neither', async () => {
    const { text } = await setup('contra');
    expect(text()).toContain('Contra voucher');
    expect(text()).not.toContain('Received into');
    expect(text()).toContain('Debit');
    expect(text()).toContain('Credit');
  });

  it('posts a simplified receipt of several heads with one cash account', async () => {
    const { fixture, page, vouchers } = await setup('receipt');
    page.form.patchValue({ cashAccount: 1001, narration: 'Annual dues' });
    page.patch(0, { account: 4001, amount: 1000, description: 'Membership' });
    page.patch(1, { account: 4002, amount: 300, description: 'Donation' });
    fixture.detectChanges();
    await page.save('stay');

    expect(vouchers.post).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 1,
        simplified: true,
        cashAccount: 1001,
        lines: [
          { account: 4001, amount: 1000, description: 'Membership' },
          { account: 4002, amount: 300, description: 'Donation' },
        ],
      }),
    );
  });

  it('shows the total and the accounting entry the engine will post', async () => {
    const { fixture, page } = await setup('receipt');
    page.form.patchValue({ cashAccount: 1001 });
    page.patch(0, { account: 4001, amount: 1000 });
    page.patch(1, { account: 4002, amount: 300 });
    fixture.detectChanges();
    expect(page.totals().total).toBe(130000);
    expect(page.preview()[0]).toMatchObject({ account: 1001, debit: 1300 });
  });

  it('blocks saving until debits equal credits in the advanced view', async () => {
    const { fixture, page } = await setup('journal');
    page.patch(0, { account: 2001, debit: 250 });
    page.patch(1, { account: 4001, credit: 240 });
    fixture.detectChanges();
    expect(page.canSave()).toBe(false);
    expect(page.problem()).toContain('10.00');
    page.patch(1, { credit: 250 });
    fixture.detectChanges();
    expect(page.problem()).toBeNull();
    expect(page.canSave()).toBe(true);
  });

  it('carries amounts across when the accountant opens the advanced view', async () => {
    const { fixture, page } = await setup('receipt');
    page.form.patchValue({ cashAccount: 1001 });
    page.patch(0, { account: 4001, amount: 1000 });
    fixture.detectChanges();
    page.setSimplified(false);
    fixture.detectChanges();
    expect(page.simplified()).toBe(false);
    expect(page.lines()[0]).toMatchObject({ account: 4001, credit: 1000, amount: null });
  });

  it('keeps the request identity after a failure so a retry cannot post twice', async () => {
    const { fixture, page, vouchers } = await setup('receipt');
    vouchers.post.mockRejectedValueOnce(new Error('Connection lost'));
    page.form.patchValue({ cashAccount: 1001 });
    page.patch(0, { account: 4001, amount: 1000 });
    fixture.detectChanges();
    await page.save('stay');
    await page.save('stay');
    expect(vouchers.post.mock.calls[1][0].requestId).toBe(vouchers.post.mock.calls[0][0].requestId);
  });

  it('sends opening balances through the journal path, with no voucher number', async () => {
    const { fixture, page, vouchers } = await setup('journal');
    page.opening.set(true);
    page.patch(0, { account: 1001, debit: 500 });
    page.patch(1, { account: 2001, credit: 500 });
    fixture.detectChanges();
    expect(page.lineAccounts().some((a: { code: number }) => a.code === 1001)).toBe(true);
    await page.save('stay');
    expect(vouchers.postOpening).toHaveBeenCalled();
    expect(vouchers.post).not.toHaveBeenCalled();
  });

  // Declining the switch navigates back, which re-applies the type it started on.
  it('keeps the grid when the type it already holds is applied again', async () => {
    const { fixture, page } = await setup('receipt');
    page.patch(0, { account: 4001, amount: 1000 });
    fixture.detectChanges();
    await page.applyType(voucherType('receipt'));
    expect(page.lines()[0].account).toBe(4001);
  });

  it('saves with Ctrl+S and clears the lines for the next voucher', async () => {
    const { fixture, page, vouchers } = await setup('receipt');
    page.form.patchValue({ cashAccount: 1001 });
    page.patch(0, { account: 4001, amount: 1000 });
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }));
    await fixture.whenStable();
    expect(vouchers.post).toHaveBeenCalledTimes(1);
    expect(page.lines().every((line: { account: number | null }) => line.account === null)).toBe(
      true,
    );
    expect(page.hasPendingChanges()).toBe(false);
  });
});
