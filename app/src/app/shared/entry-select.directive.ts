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
    this.host.ownerDocument.addEventListener('keyup', this.clearKeyboardConfirmation, true);
    this.host.ownerDocument.addEventListener('pointerdown', this.clearKeyboardConfirmation, true);

    this.select.optionSelectionChanges.pipe(takeUntilDestroyed()).subscribe((event) => {
      // optionSelectionChanges also emits when the existing value is confirmed;
      // selectionChange only covers changes in value.
      if (event.isUserInput && this.confirmingWithEnter && !this.select.multiple) {
        this.advanceAfterClose = true;
      }
    });
    this.select.openedChange.pipe(takeUntilDestroyed()).subscribe((open) => {
      if (!open) {
        this.confirmingWithEnter = false;
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
      this.host.ownerDocument.removeEventListener('keyup', this.clearKeyboardConfirmation, true);
      this.host.ownerDocument.removeEventListener(
        'pointerdown',
        this.clearKeyboardConfirmation,
        true,
      );
    });
  }

  private readonly clearKeyboardConfirmation = (): void => {
    this.confirmingWithEnter = false;
  };

  private readonly prepareKeyboard = (event: KeyboardEvent): void => {
    const navigationKey =
      !event.defaultPrevented &&
      !event.repeat &&
      !event.isComposing &&
      event.keyCode !== 229 &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey;
    const plainKey = navigationKey && !event.shiftKey;

    const target = event.target as HTMLElement;
    const onHost = target === this.host || this.host.contains(target);
    const inPanel = this.select.panelOpen && this.select.panel?.nativeElement.contains(target);
    if (onHost || inPanel) this.confirmingWithEnter = false;

    if (
      navigationKey &&
      event.shiftKey &&
      event.key === 'Enter' &&
      (onHost || inPanel) &&
      this.host.closest('form[appEnterToNext]')
    ) {
      // Material interprets modified Enter as a selection too. Handle backwards
      // navigation before it can commit the highlighted option.
      event.preventDefault();
      event.stopImmediatePropagation();
      this.advanceAfterClose = false;
      this.select.close();
      this.select.focus();
      queueMicrotask(() => {
        if (!this.destroyRef.destroyed) {
          this.host.dispatchEvent(new CustomEvent('app-field-back', { bubbles: true }));
        }
      });
      return;
    }

    if (this.select.panelOpen) {
      // Material can keep DOM focus on the trigger while the list is open;
      // options may also receive focus in overlay implementations and tests.
      if (plainKey && event.key === 'Enter' && (onHost || inPanel)) {
        this.confirmingWithEnter = true;
        // Native browser events may flush microtasks between capture and target
        // listeners. Keep this flag until selection/keyup, not a microtask.
      }
    } else if (onHost) {
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
