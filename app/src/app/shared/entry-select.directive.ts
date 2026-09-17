import { DestroyRef, Directive, ElementRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatSelect } from '@angular/material/select';

/** Lets entry forms advance after an option is confirmed with Enter. */
@Directive({ selector: 'mat-select[appEntrySelect]' })
export class EntrySelect {
  private readonly select = inject(MatSelect);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly destroyRef = inject(DestroyRef);
  private confirmingWithEnter = false;
  private advanceAfterClose = false;

  constructor() {
    this.host.addEventListener('keydown', this.prepareKeyboard, true);
    this.host.ownerDocument.addEventListener('keydown', this.prepareKeyboard, true);
    
    this.select.optionSelectionChanges.pipe(takeUntilDestroyed()).subscribe((event) => {
      // optionSelectionChanges also emits when the existing value is confirmed;
      // selectionChange only covers changes in value.
      if (event.isUserInput && this.confirmingWithEnter && !this.select.multiple) {
        this.advanceAfterClose = true;
      }
    });
    this.select.openedChange.pipe(takeUntilDestroyed()).subscribe((open) => {
      if (!open) {
        const shouldAdvance = this.advanceAfterClose;
        this.advanceAfterClose = false;
        // openedChange runs after Material commits the value and restores focus.
        if (shouldAdvance && this.host.ownerDocument.activeElement === this.host) {
          this.host.dispatchEvent(new CustomEvent('app-field-advance', { bubbles: true }));
        }
      }
    });
    this.destroyRef.onDestroy(() => {
      this.host.removeEventListener('keydown', this.prepareKeyboard, true);
      this.host.ownerDocument.removeEventListener('keydown', this.prepareKeyboard, true);
    });
  }

  private readonly prepareKeyboard = (event: KeyboardEvent): void => {
    const plainKey =
      !event.defaultPrevented &&
      !event.repeat &&
      !event.isComposing &&
      event.keyCode !== 229 &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey;

    const target = event.target as HTMLElement;

    if (this.select.panelOpen) {
      // If panel is open, intercept Enter on options
      if (
        plainKey &&
        event.key === 'Enter' &&
        this.select.panel?.nativeElement.contains(target)
      ) {
        this.confirmingWithEnter = true;
        queueMicrotask(() => (this.confirmingWithEnter = false));
      }
    } else if (target === this.host || this.host.contains(target)) {
      // If panel is closed, intercept Arrow/Enter on the host itself
      if (
        plainKey &&
        !this.select.disabled &&
        (event.key === 'ArrowDown' || event.key === 'ArrowUp')
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.select.open();
      }
    }
  };
}
