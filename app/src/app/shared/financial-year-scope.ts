import {
  contentChildren,
  DestroyRef,
  Directive,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  OnInit,
  output,
} from '@angular/core';
import { FormGroupDirective } from '@angular/forms';
import { MatDatepickerInput } from '@angular/material/datepicker';
import { FinancialYearService } from '../core/financial-year.service';

/** Applies the selected year to dates; never overwrites dates on a dirty entry form. */
@Directive({ selector: 'form[appFinancialYearScope]' })
export class FinancialYearScope implements OnInit {
  readonly appFinancialYearScope = input<'entry' | 'report'>('entry');
  readonly yearChanged = output<void>();
  private readonly host = inject(FormGroupDirective);
  private readonly fy = inject(FinancialYearService);
  private readonly injector = inject(Injector);
  private readonly element = inject<ElementRef<HTMLFormElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly datepickers = contentChildren(MatDatepickerInput, { descendants: true });
  ngOnInit() {
    const form = this.host.form;
    const names = ['date', 'paid_on', 'from', 'to', 'asOn'].filter((name) => !!form.get(name));
    const rangeValidator = () => {
      const from = form.get('from')?.value;
      const to = form.get('to')?.value;
      return from && to && from > to ? { dateRange: true } : null;
    };
    form.addValidators(rangeValidator);
    for (const name of names) {
      const validator = (control: import('@angular/forms').AbstractControl) => {
        if (!control.value) return null;
        if (!this.fy.contains(control.value)) return { financialYear: true };
        return this.appFinancialYearScope() === 'entry' && this.fy.closed()
          ? { yearClosed: true }
          : null;
      };
      form.get(name)!.addValidators(validator);
      this.destroyRef.onDestroy(() => form.get(name)?.removeValidators(validator));
    }
    this.destroyRef.onDestroy(() => form.removeValidators(rangeValidator));
    // Kept apart from the effect below so pickers appearing later never re-patch dates.
    effect(
      () => {
        for (const picker of this.datepickers()) {
          picker.min = this.fy.start();
          picker.max = this.fy.end();
        }
      },
      { injector: this.injector },
    );
    effect(
      () => {
        this.fy.selected();
        this.fy.closed();
        for (const field of this.element.nativeElement.querySelectorAll<HTMLInputElement>(
          'input[type="date"]',
        )) {
          field.min = this.fy.start();
          field.max = this.fy.end();
        }
        const entry = this.appFinancialYearScope() === 'entry';
        if (!entry || !form.dirty) {
          const dates: Record<string, string> = {};
          for (const name of names)
            dates[name] = name === 'from' ? this.fy.start() : this.fy.entryDate();
          form.patchValue(dates);
        }
        for (const name of names) form.get(name)!.updateValueAndValidity({ emitEvent: false });
        this.yearChanged.emit();
      },
      { injector: this.injector },
    );
  }
}
