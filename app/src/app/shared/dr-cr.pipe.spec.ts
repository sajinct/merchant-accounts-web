import { registerLocaleData } from '@angular/common';
import localeEnIn from '@angular/common/locales/en-IN';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DrCrPipe } from './dr-cr.pipe';

describe('DrCrPipe', () => {
  let pipe: DrCrPipe;

  beforeEach(() => {
    registerLocaleData(localeEnIn);
    TestBed.configureTestingModule({ providers: [{ provide: LOCALE_ID, useValue: 'en-IN' }] });
    pipe = TestBed.runInInjectionContext(() => new DrCrPipe());
  });

  it('labels credit - debit balances', () => {
    expect(pipe.transform(123456.5)).toBe('1,23,456.50 Cr');
    expect(pipe.transform(-250)).toBe('250.00 Dr');
  });

  it('supports debit - credit balances', () => {
    expect(pipe.transform(250, false)).toBe('250.00 Dr');
    expect(pipe.transform('-10', false)).toBe('10.00 Cr');
  });

  it('shows zero without a side', () => {
    expect(pipe.transform(0)).toBe('0.00');
    expect(pipe.transform(null)).toBe('0.00');
  });
});
