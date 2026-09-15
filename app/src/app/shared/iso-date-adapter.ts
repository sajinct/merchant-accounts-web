import { inject, Injectable, Provider } from '@angular/core';
import {
  DateAdapter,
  MAT_DATE_FORMATS,
  MAT_DATE_LOCALE,
  MatDateFormats,
  NativeDateAdapter,
} from '@angular/material/core';
import { isoDate } from './dates';

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Day first, as typed in India: 5/9/2026, 05-09-26, 05.09.2026. */
const DAY_FIRST = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/;
const INVALID = 'invalid-date';

/** Display token for the text inside date inputs. */
const INPUT_FORMAT = 'dd/MM/yyyy';

export const ISO_DATE_FORMATS: MatDateFormats = {
  parse: { dateInput: INPUT_FORMAT },
  display: {
    dateInput: INPUT_FORMAT,
    monthYearLabel: { year: 'numeric', month: 'short' },
    dateA11yLabel: { year: 'numeric', month: 'long', day: 'numeric' },
    monthYearA11yLabel: { year: 'numeric', month: 'long' },
  },
};

function parts(date: string): [number, number, number] | null {
  const match = ISO.exec(date);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(year, month - 1, day);
  return check.getFullYear() === year && check.getMonth() === month - 1 && check.getDate() === day
    ? [year, month - 1, day]
    : null;
}

function toDate(date: string): Date {
  const [year, month, day] = parts(date)!;
  const value = new Date(year, month, day);
  value.setFullYear(year);
  return value;
}

/**
 * Datepicker adapter whose model values are `YYYY-MM-DD` strings, so date form controls
 * keep the format Postgres and the financial-year validators already use.
 */
@Injectable()
export class IsoDateAdapter extends DateAdapter<string> {
  private readonly native = new NativeDateAdapter();

  constructor() {
    super();
    this.setLocale(inject(MAT_DATE_LOCALE, { optional: true }));
  }

  override setLocale(locale: unknown): void {
    this.native.setLocale(locale);
    super.setLocale(locale);
  }

  getYear(date: string): number {
    return parts(date)![0];
  }
  getMonth(date: string): number {
    return parts(date)![1];
  }
  getDate(date: string): number {
    return parts(date)![2];
  }
  getDayOfWeek(date: string): number {
    return toDate(date).getDay();
  }
  getMonthNames(style: 'long' | 'short' | 'narrow'): string[] {
    return this.native.getMonthNames(style);
  }
  getDateNames(): string[] {
    return this.native.getDateNames();
  }
  getDayOfWeekNames(style: 'long' | 'short' | 'narrow'): string[] {
    return this.native.getDayOfWeekNames(style);
  }
  getYearName(date: string): string {
    return String(this.getYear(date));
  }
  getFirstDayOfWeek(): number {
    return this.native.getFirstDayOfWeek();
  }
  getNumDaysInMonth(date: string): number {
    return this.native.getNumDaysInMonth(toDate(date));
  }
  clone(date: string): string {
    return date;
  }
  createDate(year: number, month: number, date: number): string {
    return isoDate(this.native.createDate(year, month, date));
  }
  today(): string {
    return isoDate();
  }

  parse(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    if (!text) return null;
    if (ISO.test(text)) return parts(text) ? text : INVALID;
    const match = DAY_FIRST.exec(text);
    if (!match) return INVALID;
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
    const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return parts(iso) ? iso : INVALID;
  }

  format(date: string, displayFormat: unknown): string {
    if (!this.isValid(date)) throw new Error('IsoDateAdapter: Cannot format invalid date.');
    if (displayFormat === INPUT_FORMAT) {
      const [year, month, day] = date.split('-');
      return `${day}/${month}/${year}`;
    }
    return this.native.format(toDate(date), displayFormat as Intl.DateTimeFormatOptions);
  }

  addCalendarYears(date: string, years: number): string {
    return isoDate(this.native.addCalendarYears(toDate(date), years));
  }
  addCalendarMonths(date: string, months: number): string {
    return isoDate(this.native.addCalendarMonths(toDate(date), months));
  }
  addCalendarDays(date: string, days: number): string {
    return isoDate(this.native.addCalendarDays(toDate(date), days));
  }
  toIso8601(date: string): string {
    return date;
  }

  override deserialize(value: unknown): string | null {
    // Optional date columns arrive as '' or null; both mean "no date".
    if (value === '' || value == null) return null;
    return super.deserialize(value);
  }
  isDateInstance(obj: unknown): boolean {
    return typeof obj === 'string' && (obj === INVALID || ISO.test(obj));
  }
  isValid(date: string): boolean {
    return parts(date) !== null;
  }
  invalid(): string {
    return INVALID;
  }
}

export function provideIsoDateAdapter(): Provider[] {
  return [
    { provide: DateAdapter, useClass: IsoDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: ISO_DATE_FORMATS },
  ];
}
