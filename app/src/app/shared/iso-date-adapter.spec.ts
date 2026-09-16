import { TestBed } from '@angular/core/testing';
import { DateAdapter, MAT_DATE_LOCALE } from '@angular/material/core';
import { ISO_DATE_FORMATS, provideIsoDateAdapter } from './iso-date-adapter';

describe('IsoDateAdapter', () => {
  let adapter: DateAdapter<string>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideIsoDateAdapter(), { provide: MAT_DATE_LOCALE, useValue: 'en-IN' }],
    });
    adapter = TestBed.inject(DateAdapter<string>);
  });

  it('parses ISO and day-first input to YYYY-MM-DD', () => {
    expect(adapter.parse('2026-09-16', null)).toBe('2026-09-16');
    expect(adapter.parse('16/09/2026', null)).toBe('2026-09-16');
    expect(adapter.parse('5-9-26', null)).toBe('2026-09-05');
    expect(adapter.parse('05.09.2026', null)).toBe('2026-09-05');
    expect(adapter.parse('  ', null)).toBeNull();
  });

  it('rejects impossible or unrecognised dates', () => {
    for (const text of ['31/02/2026', '2026-13-01', 'yesterday', '09/2026']) {
      const parsed = adapter.parse(text, null);
      expect(adapter.getValidDateOrNull(parsed)).toBeNull();
    }
  });

  it('formats input text day first', () => {
    expect(adapter.format('2026-04-01', ISO_DATE_FORMATS.display.dateInput)).toBe('01/04/2026');
  });

  it('does calendar arithmetic across month and year ends', () => {
    expect(adapter.addCalendarDays('2027-03-31', 1)).toBe('2027-04-01');
    expect(adapter.addCalendarMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(adapter.addCalendarYears('2028-02-29', 1)).toBe('2029-02-28');
    expect(adapter.getNumDaysInMonth('2028-02-10')).toBe(29);
    expect(adapter.getDayOfWeek('2026-09-16')).toBe(3);
  });

  it('treats empty stored values as no date', () => {
    expect(adapter.deserialize('')).toBeNull();
    expect(adapter.deserialize(null)).toBeNull();
    expect(adapter.deserialize('2026-04-01')).toBe('2026-04-01');
    expect(adapter.isValid(adapter.deserialize('not a date')!)).toBe(false);
  });

  it('compares dates for min and max checks', () => {
    expect(adapter.compareDate('2026-03-31', '2026-04-01')).toBeLessThan(0);
    expect(adapter.sameDate('2026-04-01', '2026-04-01')).toBe(true);
  });
});
