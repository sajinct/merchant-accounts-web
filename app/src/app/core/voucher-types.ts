import { AccountHead } from './models';

/** Matches vouchers.voucher_type in the database. */
export type VoucherTypeCode = 1 | 2 | 3 | 4;
export type VoucherSlug = 'receipt' | 'payment' | 'contra' | 'journal';

/**
 * Everything that differs between the four vouchers. One entry screen reads this
 * and changes its labels, its account lists and its rules; nothing else branches
 * on the voucher type.
 */
export interface VoucherTypeConfig {
  code: VoucherTypeCode;
  slug: VoucherSlug;
  label: string;
  /** Leading letter of the voucher reference (R-14, P-3, C-1, V-9). */
  prefix: 'R' | 'P' | 'C' | 'V';
  icon: string;
  description: string;
  /** Simplified entry exists where a single cash/bank side can be inferred. */
  simplified: boolean;
  /** Caption of the cash/bank field, or null when the type has no primary account. */
  primaryLabel: string | null;
  /** Caption of the party field, or null when the type has no counterparty. */
  partyLabel: string | null;
  /** The side simplified amounts post to; the cash counterpart takes the other. */
  simplifiedSide: 'debit' | 'credit' | null;
  amountLabel: string;
  totalLabel: string;
  linesHeading: string;
  linesHint: string;
}

export const VOUCHER_TYPES: readonly VoucherTypeConfig[] = [
  {
    code: 1,
    slug: 'receipt',
    label: 'Receipt',
    prefix: 'R',
    icon: 'south_west',
    description: 'Money received into a cash or bank account.',
    simplified: true,
    primaryLabel: 'Received into',
    partyLabel: 'Received from',
    simplifiedSide: 'credit',
    amountLabel: 'Amount',
    totalLabel: 'Total received',
    linesHeading: 'What the money is for',
    linesHint: 'One line per account head. The cash or bank debit is written for you.',
  },
  {
    code: 2,
    slug: 'payment',
    label: 'Payment',
    prefix: 'P',
    icon: 'north_east',
    description: 'Money paid out of a cash or bank account.',
    simplified: true,
    primaryLabel: 'Paid from',
    partyLabel: 'Paid to',
    simplifiedSide: 'debit',
    amountLabel: 'Amount',
    totalLabel: 'Total payment',
    linesHeading: 'What the money was spent on',
    linesHint: 'One line per account head. The cash or bank credit is written for you.',
  },
  {
    code: 3,
    slug: 'contra',
    label: 'Contra',
    prefix: 'C',
    icon: 'swap_horiz',
    description: 'A transfer between your own cash and bank accounts.',
    simplified: false,
    primaryLabel: null,
    partyLabel: null,
    simplifiedSide: null,
    amountLabel: 'Amount',
    totalLabel: 'Total transferred',
    linesHeading: 'Transfer',
    linesHint: 'Debit the account receiving the money and credit the one it leaves.',
  },
  {
    code: 4,
    slug: 'journal',
    label: 'Journal',
    prefix: 'V',
    icon: 'balance',
    description: 'A general accounting adjustment with no money moving.',
    simplified: false,
    primaryLabel: null,
    partyLabel: null,
    simplifiedSide: null,
    amountLabel: 'Amount',
    totalLabel: 'Total',
    linesHeading: 'Entries',
    linesHint: 'Enter each account with its debit or its credit. Totals must agree.',
  },
];

export function voucherType(slug: string | null | undefined): VoucherTypeConfig | null {
  return VOUCHER_TYPES.find((type) => type.slug === slug) ?? null;
}

export function voucherTypeByCode(code: number): VoucherTypeConfig | null {
  return VOUCHER_TYPES.find((type) => type.code === code) ?? null;
}

/** `R-14` for voucher 14 of type 1. */
export function voucherRef(code: number, no: number): string {
  return `${voucherTypeByCode(code)?.prefix ?? 'V'}-${no}`;
}

export interface AccountFilterOptions {
  /** Simplified receipts and payments keep the cash side in its own field. */
  simplified: boolean;
  /** Company setting: whether a plain journal may touch cash and bank accounts. */
  allowCashInJournal: boolean;
}

/**
 * The accounts a line of this voucher may use. The database enforces the same rules;
 * this only keeps accounts that would be rejected out of the list in the first place.
 */
export function postableAccounts(
  accounts: readonly AccountHead[],
  type: VoucherTypeConfig,
  options: AccountFilterOptions,
): AccountHead[] {
  return accounts.filter((account) => {
    const cash = !!account.is_cash_bank;
    switch (type.code) {
      case 3:
        return cash;
      case 4:
        return !cash || options.allowCashInJournal;
      default:
        // The cash/bank side of a simplified receipt or payment is a separate field.
        return !options.simplified || !cash;
    }
  });
}
