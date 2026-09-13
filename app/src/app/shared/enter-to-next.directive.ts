import { Directive, ElementRef, inject } from '@angular/core';

/**
 * Enter moves focus to the next field, like the desktop app. From the last field it
 * moves to the submit button; Enter there submits. Text areas keep their newline.
 */
@Directive({
  selector: 'form[appEnterToNext]',
  host: { '(keydown.enter)': 'next($event)' },
})
export class EnterToNext {
  private readonly host = inject<ElementRef<HTMLFormElement>>(ElementRef);

  next(event: Event): void {
    const target = event.target as HTMLElement;
    // Autocomplete panels use Enter to pick an option and prevent the default.
    if (event.defaultPrevented || target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') {
      return;
    }
    const fields = Array.from(
      this.host.nativeElement.querySelectorAll<HTMLElement>(
        'input:not([disabled]):not([type=hidden]):not([readonly]), select:not([disabled]), ' +
          'textarea:not([disabled]), mat-select:not(.mat-mdc-select-disabled), button[type=submit]:not([disabled])',
      ),
    );
    const index = fields.indexOf(target);
    if (index >= 0 && index < fields.length - 1) {
      event.preventDefault();
      fields[index + 1].focus();
    }
  }
}
