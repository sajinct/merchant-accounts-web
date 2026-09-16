import { AccountHead } from './models';
import { VoucherTypeConfig } from './voucher-types';

/** One row of the entry grid. Simplified mode fills `amount`, advanced fills the sides. */
export interface VoucherEntryLine {
  account: number | null;
  description: string;
  amount: number | null;
  debit: number | null;
  credit: number | null;
}

export function emptyLine(): VoucherEntryLine {
  return { account: null, description: '', amount: null, debit: null, credit: null };
}

/**
 * Money in whole paise. Amounts arrive from number inputs as binary floats, where
 * 0.1 + 0.2 is not 0.3, so every comparison and total here is made on integers.
 * Returns null for anything that is not a two-decimal amount of zero or more.
 */
export function paise(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return 0;
  const amount = Number(value);
  if (Number.isNaN(amount)) return 0;
  if (!Number.isFinite(amount) || amount < 0) return null;
  const cents = amount * 100;
  return Math.abs(cents - Math.round(cents)) < 1e-6 ? Math.round(cents) : null;
}

export interface VoucherTotals {
  debit: number;
  credit: number;
  difference: number;
  /** What the voucher is worth: its total debits. */
  total: number;
}

/** Totals in paise, with simplified amounts placed on the side the type posts to. */
export function voucherTotals(
  lines: readonly VoucherEntryLine[],
  type: VoucherTypeConfig,
  simplified: boolean,
): VoucherTotals {
  let debit = 0;
  let credit = 0;
  for (const line of lines) {
    if (simplified) {
      const amount = paise(line.amount) ?? 0;
      // The engine posts the cash counterpart, so both sides move by the same total.
      debit += amount;
      credit += amount;
    } else {
      debit += paise(line.debit) ?? 0;
      credit += paise(line.credit) ?? 0;
    }
  }
  return { debit, credit, difference: debit - credit, total: debit };
}

export interface VoucherDraft {
  type: VoucherTypeConfig;
  simplified: boolean;
  date: string | null;
  cashAccount: number | null;
  lines: readonly VoucherEntryLine[];
  accounts: readonly AccountHead[];
}

/**
 * The first thing wrong with the draft, in the words the user needs, or null when it
 * is ready to send. The database re-checks all of this; failing here only saves a
 * round trip and points at the row to fix.
 */
export function voucherProblem(draft: VoucherDraft): string | null {
  const { type, simplified, lines, accounts } = draft;
  const byCode = new Map(accounts.map((account) => [account.code, account]));
  const filled = lines.filter((line) => !isBlank(line, simplified));

  if (!draft.date) return 'Enter the voucher date.';
  if (simplified && !draft.cashAccount)
    return `Choose the ${type.primaryLabel?.toLowerCase()} account.`;
  if (!filled.length) return 'Add at least one transaction line.';

  for (const [index, line] of filled.entries()) {
    const row = `Line ${index + 1}`;
    if (!line.account) return `${row}: choose an account.`;
    if (!byCode.has(line.account))
      return `${row}: that account cannot be used on a ${type.label.toLowerCase()}.`;
    if (simplified) {
      const amount = paise(line.amount);
      if (amount === null) return `${row}: enter an amount with at most two decimals.`;
      if (amount <= 0) return `${row}: enter an amount greater than zero.`;
      continue;
    }
    const debit = paise(line.debit);
    const credit = paise(line.credit);
    if (debit === null || credit === null)
      return `${row}: enter amounts with at most two decimals.`;
    if (debit > 0 && credit > 0) return `${row}: a line is either a debit or a credit, not both.`;
    if (debit === 0 && credit === 0) return `${row}: enter a debit or a credit.`;
  }

  if (!simplified && filled.length < 2) return 'A voucher needs at least two entries.';

  const totals = voucherTotals(filled, type, simplified);
  if (totals.total <= 0) return 'Enter an amount greater than zero.';
  if (totals.difference !== 0)
    return `Debits and credits differ by ${(Math.abs(totals.difference) / 100).toFixed(2)}.`;

  if (!simplified) {
    const cash = (side: 'debit' | 'credit') =>
      filled.some(
        (line) => byCode.get(line.account!)?.is_cash_bank && (paise(line[side]) ?? 0) > 0,
      );
    if (type.code === 1 && !cash('debit')) return 'A receipt must debit a cash or bank account.';
    if (type.code === 2 && !cash('credit')) return 'A payment must credit a cash or bank account.';
  }
  return null;
}

/** True while a row holds nothing the user typed, so trailing blank rows are ignored. */
export function isBlank(line: VoucherEntryLine, simplified: boolean): boolean {
  const amounts = simplified ? [line.amount] : [line.debit, line.credit];
  return line.account === null && !line.description.trim() && amounts.every((value) => !value);
}

/**
 * The `p_lines` payload. Simplified rows send an amount and let the posting engine
 * decide the side; advanced rows send the debit and credit as entered.
 */
export function requestLines(
  lines: readonly VoucherEntryLine[],
  simplified: boolean,
): Record<string, unknown>[] {
  return lines
    .filter((line) => !isBlank(line, simplified))
    .map((line) =>
      simplified
        ? { account: line.account, amount: line.amount, description: line.description.trim() }
        : {
            account: line.account,
            debit: Number(line.debit ?? 0),
            credit: Number(line.credit ?? 0),
            description: line.description.trim(),
          },
    );
}

/**
 * The debits and credits a simplified voucher will produce, for the advanced preview.
 * It mirrors post_voucher: the cash line leads a receipt and closes a payment.
 */
export function previewPostings(
  lines: readonly VoucherEntryLine[],
  type: VoucherTypeConfig,
  cashAccount: number | null,
): { account: number | null; description: string; debit: number; credit: number }[] {
  const heads = lines
    .filter((line) => !isBlank(line, true))
    .map((line) => ({
      account: line.account,
      description: line.description,
      debit: type.simplifiedSide === 'debit' ? Number(line.amount ?? 0) : 0,
      credit: type.simplifiedSide === 'credit' ? Number(line.amount ?? 0) : 0,
    }));
  const total = heads.reduce((sum, line) => sum + line.debit + line.credit, 0);
  const cash = {
    account: cashAccount,
    description: '',
    debit: type.code === 1 ? total : 0,
    credit: type.code === 2 ? total : 0,
  };
  return type.code === 1 ? [cash, ...heads] : [...heads, cash];
}
