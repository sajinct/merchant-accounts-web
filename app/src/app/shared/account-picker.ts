import { Component, computed, effect, forwardRef, input, output, signal } from '@angular/core';
import {
  ControlValueAccessor,
  FormControl,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule,
} from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
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
        matInput
        [formControl]="search"
        [matAutocomplete]="auto"
        [placeholder]="placeholder()"
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
export class AccountPicker implements ControlValueAccessor {
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

  protected readonly search = new FormControl<AccountHead | string | null>(null);
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

  protected onType(text: string): void {
    this.query.set(text);
    if (this.code() !== null) this.update(null);
  }

  protected select(head: AccountHead): void {
    this.query.set('');
    if (this.code() !== head.code) this.update(head.code);
    this.accountSelected.emit(head);
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
