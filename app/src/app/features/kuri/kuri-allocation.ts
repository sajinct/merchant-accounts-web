import { KuriMemberLedgerRow } from './kuri.models';

export interface KuriReceiptAllocation {
  installment_no: number;
  amount: number;
}

/** Work in whole paise so a receipt's allocations add up exactly. */
export function allocateKuriReceipt(
  amount: number,
  ledger: KuriMemberLedgerRow[],
): KuriReceiptAllocation[] {
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    Math.abs(amount * 100 - Math.round(amount * 100)) > 0.0001
  )
    return [];
  let remaining = Math.round(amount * 100);
  const allocations: KuriReceiptAllocation[] = [];
  for (const row of [...ledger].sort((a, b) => a.installment_no - b.installment_no)) {
    const balance = Math.round(Number(row.balance) * 100);
    if (balance <= 0 || !Number.isFinite(balance)) continue;
    const applied = Math.min(remaining, balance);
    allocations.push({ installment_no: row.installment_no, amount: applied / 100 });
    remaining -= applied;
    if (!remaining) return allocations;
  }
  return []; // Never silently discard an amount beyond the schedule balance.
}
