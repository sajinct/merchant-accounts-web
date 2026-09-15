import { DaybookRow } from '../../core/models';
import { niceScale, summariseCash } from './dashboard-data';

function row(partial: Partial<DaybookRow>): DaybookRow {
  return {
    seq: 0,
    row_kind: 'entry',
    tran_date: null,
    voucher_ref: null,
    head_code: null,
    head_name: null,
    narration: '',
    debit: 0,
    credit: 0,
    balance: 0,
    ...partial,
  } as DaybookRow;
}

describe('summariseCash', () => {
  it('groups inflows and outflows per day and keeps empty days', () => {
    const summary = summariseCash(
      [
        row({ seq: 0, row_kind: 'opening', tran_date: '2026-09-14', balance: 1000 }),
        row({ seq: 2, tran_date: '2026-09-16', debit: 250.1, balance: 1499.9 }),
        row({ seq: 1, tran_date: '2026-09-14', credit: 500, balance: 1500 }),
        row({ seq: 3, tran_date: '2026-09-16', credit: 0.2, balance: 1500.1 }),
      ],
      '2026-09-16',
      3,
    );
    expect(summary.days).toEqual([
      { date: '2026-09-14', received: 500, paid: 0 },
      { date: '2026-09-15', received: 0, paid: 0 },
      { date: '2026-09-16', received: 0.2, paid: 250.1 },
    ]);
    expect(summary.today.date).toBe('2026-09-16');
    expect(summary.closing).toBe(1500.1);
  });

  it('uses the opening balance when the period has no entries', () => {
    const summary = summariseCash(
      [row({ row_kind: 'opening', tran_date: '2026-09-10', balance: -42 })],
      '2026-09-16',
      7,
    );
    expect(summary.closing).toBe(-42);
    expect(summary.days.every((day) => day.received === 0 && day.paid === 0)).toBe(true);
  });
});

describe('niceScale', () => {
  it('rounds the maximum up to clean tick steps', () => {
    expect(niceScale(0)).toEqual({ max: 4, step: 1 });
    expect(niceScale(9300)).toEqual({ max: 10000, step: 2500 });
    expect(niceScale(123456)).toEqual({ max: 150000, step: 50000 });
    expect(niceScale(80)).toEqual({ max: 80, step: 20 });
  });
});
