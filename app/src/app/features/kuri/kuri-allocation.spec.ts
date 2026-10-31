import { allocateKuriReceipt } from './kuri-allocation';
import { KuriMemberLedgerRow } from './kuri.models';

const row = (installment_no: number, balance: number): KuriMemberLedgerRow => ({
  installment_no,
  amount_due: 4000,
  amount_paid: 4000 - balance,
  balance,
  last_paid_on: null,
});
describe('oldest-first Kuri receipt allocation', () => {
  it('clears 200 arrears and applies 300 to the next installment', () => {
    expect(allocateKuriReceipt(500, [row(1, 200), row(2, 4000)])).toEqual([
      { installment_no: 1, amount: 200 },
      { installment_no: 2, amount: 300 },
    ]);
  });
  it('sorts installments and skips paid ones without modifying the ledger', () => {
    const ledger = [row(3, 4000), row(1, 0), row(2, 200)];
    expect(allocateKuriReceipt(450, [...ledger])).toEqual([
      { installment_no: 2, amount: 200 },
      { installment_no: 3, amount: 250 },
    ]);
    expect(ledger[0].installment_no).toBe(3);
  });
  it('handles partial amounts, exact boundaries and multiple future installments', () => {
    expect(allocateKuriReceipt(100, [row(1, 200)])).toEqual([{ installment_no: 1, amount: 100 }]);
    expect(allocateKuriReceipt(200, [row(1, 200), row(2, 4000)])).toEqual([
      { installment_no: 1, amount: 200 },
    ]);
    expect(allocateKuriReceipt(8200, [row(1, 200), row(2, 4000), row(3, 4000)])).toHaveLength(3);
  });
  it('skips zero-dues installments when allocating a receipt across installments', () => {
    expect(
      allocateKuriReceipt(500, [
        row(1, 200),
        { ...row(2, 0), amount_due: 0, amount_paid: 0 },
        row(3, 4000),
      ]),
    ).toEqual([
      { installment_no: 1, amount: 200 },
      { installment_no: 3, amount: 300 },
    ]);
  });
  it('preserves decimal amounts exactly in paise', () => {
    expect(allocateKuriReceipt(0.3, [row(1, 0.1), row(2, 0.2)])).toEqual([
      { installment_no: 1, amount: 0.1 },
      { installment_no: 2, amount: 0.2 },
    ]);
  });
  it('refuses invalid amounts and amounts beyond the remaining schedule', () => {
    for (const amount of [0, -1, 1.001, NaN, Infinity, 201])
      expect(allocateKuriReceipt(amount, [row(1, 200)])).toEqual([]);
  });
});
