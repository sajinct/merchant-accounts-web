import { DaybookRow } from '../../core/models';
import { addDays } from '../../shared/dates';

export interface DayFlow {
  date: string;
  /** Money into cash and bank accounts. */
  received: number;
  /** Money out of cash and bank accounts. */
  paid: number;
}

export interface CashSummary {
  closing: number;
  days: DayFlow[];
  today: DayFlow;
}

/**
 * Summarises an rpt_daybook result into one entry per day ending on `asOn`.
 * rpt_daybook reports cash/bank inflows as `credit` and outflows as `debit`,
 * matching the Receipt and Payment columns of the Day Book.
 */
export function summariseCash(rows: DaybookRow[], asOn: string, dayCount: number): CashSummary {
  const days: DayFlow[] = Array.from({ length: dayCount }, (_, index) => ({
    date: addDays(asOn, index - dayCount + 1),
    received: 0,
    paid: 0,
  }));
  const byDate = new Map(days.map((day) => [day.date, day]));
  let closing = 0;
  for (const row of [...rows].sort((a, b) => Number(a.seq) - Number(b.seq))) {
    closing = Number(row.balance);
    if (row.row_kind !== 'entry' || !row.tran_date) continue;
    const day = byDate.get(row.tran_date);
    if (!day) continue;
    day.received += Number(row.credit);
    day.paid += Number(row.debit);
  }
  for (const day of days) {
    day.received = roundMoney(day.received);
    day.paid = roundMoney(day.paid);
  }
  return { closing: roundMoney(closing), days, today: days[days.length - 1] };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** A "nice" axis maximum and tick step covering `max` with about `ticks` intervals. */
export function niceScale(max: number, ticks = 4): { max: number; step: number } {
  if (!(max > 0)) return { max: ticks, step: 1 };
  const rough = max / ticks;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough)!;
  return { max: step * Math.ceil(max / step), step };
}
