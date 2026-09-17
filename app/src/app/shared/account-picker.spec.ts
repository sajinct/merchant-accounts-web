import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';
import { AccountHead } from '../core/models';
import { AccountPicker } from './account-picker';
import { EnterToNext } from './enter-to-next.directive';

@Component({
  imports: [AccountPicker, ReactiveFormsModule, EnterToNext],
  template: `<form appEnterToNext>
    <app-account-picker
      [formControl]="control"
      [accounts]="accounts()"
      [allLabel]="allLabel()"
      (accountSelected)="selected($event)"
    /><input id="next-field" aria-label="Amount" />
  </form>`,
})
class Host {
  readonly control = new FormControl<number | null>(null);
  readonly accounts = signal<AccountHead[]>([]);
  readonly allLabel = signal('');
  readonly selected = vi.fn();
}

describe('AccountPicker', () => {
  const heads: AccountHead[] = [
    { code: 101, name: 'Cash' } as AccountHead,
    { code: 205, name: 'Bank of India' } as AccountHead,
  ];

  async function setup() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
    const host = fixture.componentInstance;
    const picker = fixture.debugElement.query(By.directive(AccountPicker)).componentInstance as any;
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    return { fixture, host, picker, input };
  }

  function key(target: HTMLElement, value: string, keyCode: number) {
    target.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: value,
        keyCode,
        bubbles: true,
        cancelable: true,
      }),
    );
  }

  it('shows a value written before the accounts load', async () => {
    const { fixture, host, input } = await setup();
    host.control.setValue(205);
    fixture.detectChanges();
    expect(input.value).toBe('');
    host.accounts.set(heads);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(input.value).toBe('205 – Bank of India');
    expect(host.control.value).toBe(205);
  });

  it('filters by name or code prefix', async () => {
    const { fixture, host, picker, input } = await setup();
    host.accounts.set(heads);
    input.value = 'bank';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(picker.matches().map((h: AccountHead) => h.code)).toEqual([205]);
    input.value = '10';
    input.dispatchEvent(new Event('input'));
    expect(picker.matches().map((h: AccountHead) => h.code)).toEqual([101]);
  });

  it('sets the code on selection and clears it when the text is edited', async () => {
    const { fixture, host, picker, input } = await setup();
    host.accounts.set(heads);
    fixture.detectChanges();
    picker.select(heads[0]);
    expect(host.control.value).toBe(101);
    expect(host.selected).toHaveBeenCalledWith(heads[0]);
    input.value = 'Cas';
    input.dispatchEvent(new Event('input'));
    expect(host.control.value).toBeNull();
  });

  it('offers an "all" option that displays without a code', async () => {
    const { fixture, host, picker, input } = await setup();
    host.accounts.set(heads);
    host.allLabel.set('All accounts');
    host.control.setValue(0);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(picker.matches()[0]).toEqual({ code: 0, name: 'All accounts' });
    expect(input.value).toBe('All accounts');
  });

  it('opens on the first arrow press and advances after Enter selects an account', async () => {
    const { fixture, host, input } = await setup();
    host.accounts.set(heads);
    fixture.detectChanges();
    input.focus();
    expect(input.getAttribute('aria-expanded')).not.toBe('true');
    key(input, 'ArrowDown', 40);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(input);
    key(input, 'ArrowDown', 40);
    key(input, 'Enter', 13);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(host.control.value).toBe(205);
    expect(host.selected).toHaveBeenCalledWith(heads[1]);
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('#next-field'));
  });

  it('keeps focus on the picker after a mouse selection', async () => {
    const { fixture, host, input } = await setup();
    host.accounts.set(heads);
    fixture.detectChanges();
    input.focus();
    key(input, 'ArrowDown', 40);
    fixture.detectChanges();
    await fixture.whenStable();
    (document.querySelector('mat-option') as HTMLElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(host.control.value).toBe(101);
    expect(document.activeElement).toBe(input);
  });

  it('closes on Escape without selecting or advancing', async () => {
    const { fixture, host, input } = await setup();
    host.accounts.set(heads);
    fixture.detectChanges();
    input.focus();
    key(input, 'ArrowDown', 40);
    fixture.detectChanges();
    await fixture.whenStable();
    key(input, 'Escape', 27);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(host.control.value).toBeNull();
    expect(host.selected).not.toHaveBeenCalled();
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(input);
  });
});
