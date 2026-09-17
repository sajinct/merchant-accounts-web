import { Directive, ElementRef, inject } from '@angular/core';

const FOCUSABLE =
  'input:not([type="hidden"]):not([readonly]), textarea:not([readonly]), select, mat-select, ' +
  'button, summary, [data-entry-focus]';

/** Shared field navigation. Controls retain their own editing and popup keys. */
@Directive({
  selector: 'form[appEnterToNext]',
  host: {
    '(keydown)': 'navigate($event)',
    '(app-field-advance)': 'advance($event)',
  },
})
export class EnterToNext {
  private readonly host = inject<ElementRef<HTMLFormElement>>(ElementRef);

  navigate(event: KeyboardEvent): void {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.keyCode === 229 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      !(event.target instanceof HTMLElement) ||
      !['Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) ||
      (event.shiftKey && event.key !== 'Enter')
    ) {
      return;
    }
    const target = event.target;
    if (target.closest('[contenteditable]:not([contenteditable="false"]), [data-entry-native]')) {
      return;
    }
    // These controls own their option-selection keys. Keyboard selections explicitly
    // request an advance after committing, including selections in Material overlays.
    if (
      target.closest('select, mat-select, mat-button-toggle-group, [role="radiogroup"]') ||
      target.matches('input[type="radio"], input[type="range"]')
    ) {
      return;
    }
    if (target.matches('[role="combobox"][aria-expanded="true"]')) {
      if (event.key === 'Enter') event.preventDefault();
      return;
    }
    // Multiline text keeps its newline/caret keys; Shift+Enter exits backwards.
    if (target instanceof HTMLTextAreaElement && !(event.key === 'Enter' && event.shiftKey)) {
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && target.closest('button, summary, a[href]')) {
      return;
    }
    if (
      event.key === 'Enter' &&
      target.matches('input[type="submit"], input[type="button"], input[type="reset"]')
    ) {
      return;
    }
    // Never steal left/right while editing text. Number/date inputs do not expose
    // caret positions, so their horizontal keys always retain native behavior.
    if (
      (event.key === 'ArrowLeft' || event.key === 'ArrowRight') &&
      !this.atHorizontalBoundary(target, event.key === 'ArrowLeft' ? -1 : 1)
    ) {
      return;
    }
    const fields = this.fields(event.key !== 'Enter');
    const index = fields.indexOf(target);
    if (index < 0) return;
    // Suppress implicit submission and number spinners even at the form boundary.
    event.preventDefault();
    if (event.repeat) return;
    const direction =
      event.shiftKey || event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1;
    const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown';
    const next = vertical
      ? this.verticalTarget(target, fields, direction)
      : fields[index + direction];
    next?.focus();
  }

  advance(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.closest('form') !== this.host.nativeElement) {
      return;
    }
    const fields = this.fields(false);
    const index = fields.indexOf(target);
    if (index < 0 || document.activeElement !== target) return;
    event.stopPropagation();
    fields[index + 1]?.focus();
  }

  private fields(includeActions: boolean): HTMLElement[] {
    // Grid rows share nearly all of their ancestors, so each one is resolved once per query.
    const resolved = new Map<HTMLElement, boolean>();
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (field) => {
        if (field.closest('form') !== this.host.nativeElement || !this.canFocus(field, resolved)) {
          return false;
        }
        // Calendar/password helper buttons remain available through normal Tab navigation.
        if (field.matches('button') && field.closest('mat-form-field, mat-button-toggle-group')) {
          return false;
        }
        if (field.matches('button') && !includeActions) {
          return field.matches('[type="submit"], :not([type]), [data-entry-focus]');
        }
        return true;
      },
    );
  }

  private verticalTarget(
    target: HTMLElement,
    fields: HTMLElement[],
    direction: number,
  ): HTMLElement | undefined {
    const row = target.closest('[data-entry-row]');
    const column = target.closest('[data-entry-column]')?.getAttribute('data-entry-column');
    if (!row || !column) return fields[fields.indexOf(target) + direction];
    const rows = Array.from(row.parentElement?.children ?? []).filter((el) =>
      el.matches('[data-entry-row]'),
    );
    for (let i = rows.indexOf(row) + direction; i >= 0 && i < rows.length; i += direction) {
      const candidate = fields.find(
        (field) =>
          field.closest('[data-entry-row]') === rows[i] &&
          field.closest('[data-entry-column]')?.getAttribute('data-entry-column') === column,
      );
      if (candidate) return candidate;
    }
    // At a grid boundary leave the grid, rather than jumping sideways to another amount.
    for (let i = fields.indexOf(target) + direction; i >= 0 && i < fields.length; i += direction) {
      if (fields[i].closest('[data-entry-row]')?.parentElement !== row.parentElement) {
        return fields[i];
      }
    }
    return undefined;
  }

  private atHorizontalBoundary(target: HTMLElement, direction: number): boolean {
    if (!(target instanceof HTMLInputElement)) return true;
    try {
      const start = target.selectionStart;
      const end = target.selectionEnd;
      return start !== null && start === end && start === (direction < 0 ? 0 : target.value.length);
    } catch {
      // Inputs like type="number" or type="email" may throw InvalidStateError on selectionStart
      return true;
    }
  }

  private canFocus(field: HTMLElement, resolved: Map<HTMLElement, boolean>): boolean {
    if (
      field.matches(':disabled, [aria-disabled="true"], [tabindex="-1"]') ||
      (field.tabIndex < 0 && !field.matches('summary')) ||
      field.closest('[hidden], [inert]')
    ) {
      return false;
    }
    // Fields reaching an ancestor share its verdict, so each one is walked once per query.
    const path: HTMLElement[] = [];
    let shown = true;
    for (let element: HTMLElement | null = field; element; element = element.parentElement) {
      // A collapsed <details> answers by which child the walk arrived through, so its own
      // verdict is never reused. Everything below it still resolves to one shared answer.
      const collapsed = element instanceof HTMLDetailsElement && !element.open;
      if (collapsed) {
        if (!element.querySelector(':scope > summary')?.contains(field)) {
          shown = false;
          break;
        }
      } else {
        const cached = resolved.get(element);
        if (cached !== undefined) {
          shown = cached;
          break;
        }
        path.push(element);
      }
      const style = getComputedStyle(element);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.visibility === 'collapse'
      ) {
        shown = false;
        break;
      }
    }
    for (const element of path) resolved.set(element, shown);
    return shown;
  }
}
