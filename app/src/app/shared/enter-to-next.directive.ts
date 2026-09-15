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
    if (!(event instanceof KeyboardEvent)) return;
    const target = event.target;
    // Let composition, modified shortcuts, and controls with their own Enter behavior finish.
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.keyCode === 229 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      !(target instanceof HTMLElement)
    ) {
      return;
    }
    if (event.repeat) {
      event.preventDefault();
      return;
    }
    if (
      target.closest(
        'textarea, button, select, mat-select, a[href], [contenteditable]:not([contenteditable="false"]), ' +
          '[role="button"], input[type="submit"], input[type="button"], input[type="reset"]',
      )
    ) {
      return;
    }
    // An open autocomplete must retain focus even when no option can be selected.
    if (
      target.getAttribute('role') === 'combobox' &&
      target.getAttribute('aria-expanded') === 'true'
    ) {
      event.preventDefault();
      return;
    }
    const fields = Array.from(
      this.host.nativeElement.querySelectorAll<HTMLElement>(
        'input:not([disabled]):not([type=hidden]):not([readonly]), select:not([disabled]), ' +
          'textarea:not([disabled]):not([readonly]), mat-select:not(.mat-mdc-select-disabled), ' +
          'button[type=submit]:not([disabled]), button:not([type]):not([disabled])',
      ),
    ).filter((field) => this.canFocus(field));
    const index = fields.indexOf(target);
    if (index >= 0) {
      // Never implicitly submit from a field, including when the submit button is disabled.
      event.preventDefault();
      fields[index + 1]?.focus();
    }
  }

  private canFocus(field: HTMLElement): boolean {
    if (
      field.matches(':disabled, [aria-disabled="true"]') ||
      field.tabIndex < 0 ||
      field.closest('[hidden], [inert]')
    ) {
      return false;
    }
    for (let element: HTMLElement | null = field; element; element = element.parentElement) {
      const style = getComputedStyle(element);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.visibility === 'collapse'
      ) {
        return false;
      }
    }
    return true;
  }
}
