import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDatepickerInput, MatDatepickerModule } from '@angular/material/datepicker';
import { By } from '@angular/platform-browser';
import { FinancialYearScope } from './financial-year-scope';
import { provideIsoDateAdapter } from './iso-date-adapter';
import { FinancialYearService } from '../core/financial-year.service';
import { SupabaseService } from '../core/supabase.service';

@Component({
  imports: [ReactiveFormsModule, FinancialYearScope],
  template: `<form [formGroup]="form" [appFinancialYearScope]="mode">
    <input formControlName="date" />
  </form>`,
})
class TestForm {
  mode: 'entry' | 'report' = 'entry';
  form = new FormGroup({ date: new FormControl('2026-04-01', Validators.required) });
}
describe('Financial-year form scope', () => {
  async function setup(mode: 'entry' | 'report' = 'entry') {
    await TestBed.configureTestingModule({
      imports: [TestForm],
      providers: [{ provide: SupabaseService, useValue: { client: {} } }],
    }).compileComponents();
    const fy = TestBed.inject(FinancialYearService);
    fy.selected.set(2026);
    const fixture = TestBed.createComponent(TestForm);
    fixture.componentInstance.mode = mode;
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, fy, form: fixture.componentInstance.form };
  }
  it('defaults an untouched form to a date in the selected year', async () => {
    const { fixture, fy, form } = await setup();
    fy.selected.set(2025);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(form.controls.date.value).toBe('2026-03-31');
    expect(form.valid).toBe(true);
  });
  it('preserves unfinished dates and rejects dates outside a newly selected year', async () => {
    const { fixture, fy, form } = await setup();
    form.controls.date.setValue('2026-05-01');
    form.markAsDirty();
    fy.selected.set(2025);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(form.controls.date.value).toBe('2026-05-01');
    expect(form.controls.date.hasError('financialYear')).toBe(true);
  });
  it('allows March 31 and rejects April 1 of the following year', async () => {
    const { form } = await setup();
    form.controls.date.setValue('2027-03-31');
    expect(form.valid).toBe(true);
    form.controls.date.setValue('2027-04-01');
    expect(form.invalid).toBe(true);
  });
  it('blocks entry into a closed year', async () => {
    const { fixture, fy, form } = await setup();
    fy.years.set([
      {
        start_year: 2026,
        starts_on: '2026-04-01',
        ends_on: '2027-03-31',
        closed_at: '2027-04-01',
        closing_journal_id: 1,
        equity_account_code: 1,
      },
    ]);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(form.controls.date.hasError('yearClosed')).toBe(true);
  });
  it('keeps closed-year reports available', async () => {
    const { fixture, fy, form } = await setup('report');
    fy.years.set([
      {
        start_year: 2026,
        starts_on: '2026-04-01',
        ends_on: '2027-03-31',
        closed_at: '2027-04-01',
        closing_journal_id: 1,
        equity_account_code: 1,
      },
    ]);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(form.valid).toBe(true);
  });
});

@Component({
  imports: [ReactiveFormsModule, FinancialYearScope, MatDatepickerModule],
  template: `<form [formGroup]="form" appFinancialYearScope="report">
    <input [matDatepicker]="picker" formControlName="from" />
    <mat-datepicker #picker />
  </form>`,
})
class DatepickerForm {
  form = new FormGroup({ from: new FormControl('2026-04-01') });
}
describe('Financial-year datepicker bounds', () => {
  it('limits datepickers to the selected year', async () => {
    await TestBed.configureTestingModule({
      imports: [DatepickerForm],
      providers: [{ provide: SupabaseService, useValue: { client: {} } }, provideIsoDateAdapter()],
    }).compileComponents();
    const fy = TestBed.inject(FinancialYearService);
    fy.selected.set(2026);
    const fixture = TestBed.createComponent(DatepickerForm);
    fixture.detectChanges();
    await fixture.whenStable();
    const input = fixture.debugElement
      .query(By.directive(MatDatepickerInput))
      .injector.get(MatDatepickerInput);
    expect([input.min, input.max]).toEqual(['2026-04-01', '2027-03-31']);
    fy.selected.set(2025);
    fixture.detectChanges();
    await fixture.whenStable();
    expect([input.min, input.max]).toEqual(['2025-04-01', '2026-03-31']);
  });
});
