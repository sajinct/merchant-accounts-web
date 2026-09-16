import { AccountHead } from './models';
import {
  emptyLine,
  paise,
  previewPostings,
  requestLines,
  VoucherEntryLine,
  voucherProblem,
  voucherTotals,
} from './voucher-rules';
import { postableAccounts, VOUCHER_TYPES, voucherType } from './voucher-types';

const RECEIPT = voucherType('receipt')!;
const PAYMENT = voucherType('payment')!;
const CONTRA = voucherType('contra')!;
const JOURNAL = voucherType('journal')!;

const ACCOUNTS: AccountHead[] = [
  { code: 1001, name: 'Cash in hand', account_type: 'asset', is_cash_bank: true },
  { code: 1002, name: 'Bank', account_type: 'asset', is_cash_bank: true },
  { code: 4001, name: 'Membership fee', account_type: 'income', is_cash_bank: false },
  { code: 4002, name: 'Donation', account_type: 'income', is_cash_bank: false },
  { code: 5001, name: 'Electricity', account_type: 'expense', is_cash_bank: false },
  { code: 2001, name: 'Salary payable', account_type: 'liability', is_cash_bank: false },
];

function line(values: Partial<VoucherEntryLine>): VoucherEntryLine {
  return { ...emptyLine(), ...values };
}

describe('Voucher amounts', () => {
  it('reads two-decimal amounts as whole paise', () => {
    expect(paise(1500)).toBe(150000);
    expect(paise(0.1)).toBe(10);
    expect(paise(null)).toBe(0);
  });

  it('rejects more than two decimals and negative amounts', () => {
    expect(paise(1.001)).toBeNull();
    expect(paise(-5)).toBeNull();
  });

  it('adds fractional amounts without a floating-point difference', () => {
    const lines = [line({ debit: 0.3 }), line({ credit: 0.1 }), line({ credit: 0.2 })];
    expect(voucherTotals(lines, JOURNAL, false).difference).toBe(0);
  });
});

describe('Simplified receipts and payments', () => {
  const heads = [
    line({ account: 4001, amount: 1000, description: 'Annual membership' }),
    line({ account: 4002, amount: 300, description: 'Donation' }),
  ];

  it('totals the heads the user entered', () => {
    expect(voucherTotals(heads, RECEIPT, true).total).toBe(130000);
  });

  it('shows the cash debit it will post, first, for a receipt', () => {
    const preview = previewPostings(heads, RECEIPT, 1001);
    expect(preview[0]).toMatchObject({ account: 1001, debit: 1300, credit: 0 });
    expect(preview[1]).toMatchObject({ account: 4001, debit: 0, credit: 1000 });
  });

  it('shows the cash credit last for a payment', () => {
    const preview = previewPostings([line({ account: 5001, amount: 4000 })], PAYMENT, 1002);
    expect(preview.at(-1)).toMatchObject({ account: 1002, debit: 0, credit: 4000 });
  });

  it('sends amounts and lets the engine choose the side', () => {
    expect(requestLines(heads, true)).toEqual([
      { account: 4001, amount: 1000, description: 'Annual membership' },
      { account: 4002, amount: 300, description: 'Donation' },
    ]);
  });

  it('accepts a complete receipt and ignores trailing blank rows', () => {
    const draft = {
      type: RECEIPT,
      simplified: true,
      date: '2026-09-16',
      cashAccount: 1001,
      lines: [...heads, emptyLine()],
      accounts: ACCOUNTS,
    };
    expect(voucherProblem(draft)).toBeNull();
  });

  it('asks for the cash account, an account on every line and a positive amount', () => {
    const base = {
      type: RECEIPT,
      simplified: true,
      date: '2026-09-16',
      cashAccount: null as number | null,
      lines: heads,
      accounts: ACCOUNTS,
    };
    expect(voucherProblem(base)).toContain('received into');
    expect(
      voucherProblem({ ...base, cashAccount: 1001, lines: [line({ amount: 100 })] }),
    ).toContain('choose an account');
    expect(
      voucherProblem({ ...base, cashAccount: 1001, lines: [line({ account: 4001, amount: 0 })] }),
    ).toContain('greater than zero');
    expect(
      voucherProblem({
        ...base,
        cashAccount: 1001,
        lines: [line({ account: 4001, amount: 1.005 })],
      }),
    ).toContain('two decimals');
  });
});

describe('Advanced entry', () => {
  const base = {
    simplified: false,
    date: '2026-09-16',
    cashAccount: null,
    accounts: ACCOUNTS,
  };

  it('accepts a balanced journal of two lines', () => {
    expect(
      voucherProblem({
        ...base,
        type: JOURNAL,
        lines: [line({ account: 5001, debit: 250 }), line({ account: 2001, credit: 250 })],
      }),
    ).toBeNull();
  });

  it('reports the difference when debits and credits disagree', () => {
    expect(
      voucherProblem({
        ...base,
        type: JOURNAL,
        lines: [line({ account: 5001, debit: 250 }), line({ account: 2001, credit: 240 })],
      }),
    ).toContain('10.00');
  });

  it('refuses a line carrying both a debit and a credit', () => {
    expect(
      voucherProblem({
        ...base,
        type: JOURNAL,
        lines: [
          line({ account: 5001, debit: 10, credit: 10 }),
          line({ account: 2001, credit: 10 }),
        ],
      }),
    ).toContain('not both');
  });

  it('needs at least two entries', () => {
    expect(
      voucherProblem({ ...base, type: JOURNAL, lines: [line({ account: 5001, debit: 10 })] }),
    ).toContain('at least two entries');
  });

  it('still requires the cash side of a receipt entered by hand', () => {
    expect(
      voucherProblem({
        ...base,
        type: RECEIPT,
        lines: [line({ account: 4001, debit: 10 }), line({ account: 4002, credit: 10 })],
      }),
    ).toContain('must debit a cash or bank account');
    expect(
      voucherProblem({
        ...base,
        type: RECEIPT,
        lines: [line({ account: 1001, debit: 10 }), line({ account: 4002, credit: 10 })],
      }),
    ).toBeNull();
  });
});

describe('Accounts offered per voucher type', () => {
  it('keeps the cash side out of the simplified receipt lines', () => {
    const codes = postableAccounts(ACCOUNTS, RECEIPT, {
      simplified: true,
      allowCashInJournal: false,
    }).map((account) => account.code);
    expect(codes).not.toContain(1001);
    expect(codes).toContain(4001);
  });

  it('offers every account once the accountant switches to the advanced view', () => {
    expect(
      postableAccounts(ACCOUNTS, RECEIPT, { simplified: false, allowCashInJournal: false }),
    ).toHaveLength(ACCOUNTS.length);
  });

  it('limits a contra to cash and bank accounts', () => {
    expect(
      postableAccounts(ACCOUNTS, CONTRA, { simplified: false, allowCashInJournal: false }).map(
        (account) => account.code,
      ),
    ).toEqual([1001, 1002]);
  });

  it('hides cash from a journal until an admin enables it', () => {
    const without = postableAccounts(ACCOUNTS, JOURNAL, {
      simplified: false,
      allowCashInJournal: false,
    });
    expect(without.some((account) => account.is_cash_bank)).toBe(false);
    expect(
      postableAccounts(ACCOUNTS, JOURNAL, { simplified: false, allowCashInJournal: true }),
    ).toHaveLength(ACCOUNTS.length);
  });

  it('gives every type a distinct route and reference prefix', () => {
    expect(VOUCHER_TYPES.map((type) => type.slug)).toEqual([
      'receipt',
      'payment',
      'contra',
      'journal',
    ]);
    expect(new Set(VOUCHER_TYPES.map((type) => type.prefix)).size).toBe(4);
  });
});
