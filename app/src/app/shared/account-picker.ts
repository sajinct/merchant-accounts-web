import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  ControlValueAccessor,
  FormControl,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule,
} from '@angular/forms';
import { MatAutocompleteModule, MatAutocompleteTrigger } from '@angular/material/autocomplete';
import { MatFormFieldModule, SubscriptSizing } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { AccountHead } from '../core/models';

const MAX_OPTIONS = 50;

function isHead(value: unknown): value is AccountHead {
  return !!value && typeof value === 'object' && 'code' in value;
}

/**
 * Searchable account field. Its form value is the selected account code, or `null`
 * while nothing is selected; typing over a selection clears it.
 */
@Component({
  selector: 'app-account-picker',
  imports: [
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => AccountPicker), multi: true },
  ],
  template: `
    <mat-form-field [subscriptSizing]="subscriptSizing()">
      <mat-label>{{ label() }}</mat-label>
      <mat-icon matPrefix>search</mat-icon>
      <input
        #searchInput
        matInput
        [formControl]="search"
        [matAutocomplete]="auto"
        [matAutocompleteDisabled]="!engaged()"
        [placeholder]="placeholder()"
        (pointerdown)="engaged.set(true)"
        (input)="onType($any($event.target).value)"
        (blur)="onTouched?.()"
      />
      <mat-autocomplete
        #auto="matAutocomplete"
        [displayWith]="display"
        autoActiveFirstOption
        requireSelection
        (optionSelected)="select($event.option.value)"
      >
        @for (head of matches(); track head.code) {
          <mat-option [value]="head">{{ display(head) }}</mat-option>
        } @empty {
          <mat-option disabled>{{
            loading() ? 'Loading accounts…' : 'No matching accounts'
          }}</mat-option>
        }
      </mat-autocomplete>
      @if (hint()) {
        <mat-hint>{{ hint() }}</mat-hint>
      }
    </mat-form-field>
  `,
  styles: `
    :host,
    mat-form-field {
      display: block;
      width: 100%;
      min-width: 0;
    }
  `,
})
export class AccountPicker implements ControlValueAccessor, AfterViewInit {
  readonly accounts = input<AccountHead[]>([]);
  readonly label = input('Account');
  readonly placeholder = input('Search by name or code');
  readonly hint = input('');
  readonly loading = input(false);
  /** When set, adds a first option with this label that selects `allValue`. */
  readonly allLabel = input('');
  readonly allValue = input(0);
  readonly subscriptSizing = input<SubscriptSizing>('fixed');
  readonly accountSelected = output<AccountHead>();

  private readonly searchInput = viewChild.required<ElementRef<HTMLInputElement>>('searchInput');
  private readonly autocompleteTrigger = viewChild.required(MatAutocompleteTrigger);
  private readonly destroyRef = inject(DestroyRef);
  private confirmingWithEnter = false;
  private closingWithEscape = false;

  protected readonly search = new FormControl<AccountHead | string | null>(null);
  /**
   * The list opens once the field is used, not when a page programmatically focuses it,
   * so arriving on a page does not drop a dropdown over it.
   */
  protected readonly engaged = signal(false);
  private readonly query = signal('');
  private readonly code = signal<number | null>(null);
  private onChange?: (code: number | null) => void;
  protected onTouched?: () => void;

  private readonly options = computed(() => {
    const all = this.allLabel();
    const accounts = this.accounts();
    return all ? [{ code: this.allValue(), name: all }, ...accounts] : accounts;
  });

  protected readonly matches = computed(() => {
    const q = this.query().trim().toLowerCase();
    const options = this.options();
    return (
      q
        ? options.filter((h) => h.name.toLowerCase().includes(q) || String(h.code).startsWith(q))
        : options
    ).slice(0, MAX_OPTIONS);
  });

  protected readonly display = (head: AccountHead | string | null): string => {
    if (!isHead(head)) return head ?? '';
    return this.allLabel() && head.code === this.allValue()
      ? head.name
      : `${head.code} – ${head.name}`;
  };

  constructor() {
    // requireSelection keeps typed text out of the control and resets it to null when the
    // panel closes without a choice; typing itself is handled by onType.
    this.search.valueChanges.subscribe((value) => {
      if (isHead(value)) return;
      this.query.set('');
      if (this.code() !== null) this.update(null);
    });
    // A value written before the accounts load is displayed once they arrive.
    effect(() => {
      const code = this.code();
      const head = this.options().find((h) => h.code === code);
      const current = this.search.value;
      if (head && !(isHead(current) && current.code === code)) {
        this.search.setValue(head, { emitEvent: false });
      }
    });
  }

  ngAfterViewInit(): void {
    const input = this.searchInput().nativeElement;
    // Capture runs before Material's key handler. Updating only the signal in a
    // template listener leaves the trigger disabled for the first arrow press.
    input.addEventListener('keydown', this.prepareKeyboard, true);
    input.addEventListener('keydown', this.keepPanelKeys);
    input.ownerDocument.addEventListener('keyup', this.clearKeyboardConfirmation, true);
    input.ownerDocument.addEventListener('pointerdown', this.clearKeyboardConfirmation, true);
    this.destroyRef.onDestroy(() => {
      input.removeEventListener('keydown', this.prepareKeyboard, true);
      input.removeEventListener('keydown', this.keepPanelKeys);
      input.ownerDocument.removeEventListener('keyup', this.clearKeyboardConfirmation, true);
      input.ownerDocument.removeEventListener('pointerdown', this.clearKeyboardConfirmation, true);
    });
  }

  private readonly clearKeyboardConfirmation = (): void => {
    this.confirmingWithEnter = false;
  };

  private readonly prepareKeyboard = (event: KeyboardEvent): void => {
    const trigger = this.autocompleteTrigger();
    this.closingWithEscape = event.key === 'Escape' && trigger.panelOpen;
    if (
      event.key === 'Enter' &&
      event.shiftKey &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.isComposing &&
      event.keyCode !== 229 &&
      !event.defaultPrevented &&
      this.searchInput().nativeElement.closest('form[appEnterToNext]')
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.confirmingWithEnter = false;
      if (!event.repeat) {
        trigger.closePanel();
        this.writeValue(this.code());
        this.searchInput().nativeElement.dispatchEvent(
          new CustomEvent('app-field-back', { bubbles: true }),
        );
      }
      return;
    }
    this.engaged.set(true);
    trigger.autocompleteDisabled = false;
    this.confirmingWithEnter =
      event.key === 'Enter' &&
      trigger.panelOpen &&
      !!trigger.activeOption &&
      !trigger.activeOption.disabled &&
      !event.defaultPrevented &&
      !event.repeat &&
      !event.isComposing &&
      event.keyCode !== 229 &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey;
    // Clear on selection, keyup or pointerdown. A capture-listener microtask can
    // run before Material handles a native key event in the browser.
  };

  private readonly keepPanelKeys = (event: KeyboardEvent): void => {
    // The overlay is already gone when Escape bubbles to the shell. Consume the
    // closing key so it cannot also open the navigation menu and steal focus.
    if (this.closingWithEscape && event.key === 'Escape') {
      this.autocompleteTrigger().closePanel();
      this.writeValue(this.code());
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    // aria-expanded is rendered after this event bubbles. Keep the opening arrow
    // in the picker before the parent form can interpret it as field navigation.
    if (
      this.autocompleteTrigger().panelOpen &&
      (event.key === 'ArrowDown' || event.key === 'ArrowUp')
    ) {
      event.stopPropagation();
    }
  };

  protected onType(text: string): void {
    this.query.set(text);
    if (this.code() !== null) this.update(null);
  }

  protected select(head: AccountHead): void {
    this.query.set('');
    if (this.code() !== head.code) this.update(head.code);
    this.accountSelected.emit(head);
    if (this.confirmingWithEnter) {
      this.confirmingWithEnter = false;
      const input = this.searchInput().nativeElement;
      // Material restores input focus after optionSelected and then closes its
      // panel. Advance afterwards so that restoration cannot steal focus back.
      queueMicrotask(() => {
        if (!this.destroyRef.destroyed && input.ownerDocument.activeElement === input) {
          input.dispatchEvent(new CustomEvent('app-field-advance', { bubbles: true }));
        }
      });
    }
  }

  private update(code: number | null): void {
    this.code.set(code);
    this.onChange?.(code);
  }

  writeValue(code: number | null): void {
    this.code.set(code ?? null);
    this.query.set('');
    const head = this.options().find((h) => h.code === code);
    this.search.setValue(head ?? null, { emitEvent: false });
  }

  registerOnChange(fn: (code: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    if (disabled) this.search.disable({ emitEvent: false });
    else this.search.enable({ emitEvent: false });
  }
}
