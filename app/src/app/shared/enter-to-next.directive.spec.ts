import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EnterToNext } from './enter-to-next.directive';

@Component({ imports: [EnterToNext], template: '<form appEnterToNext></form>' })
class TestForm {}

async function render(fields: string) {
  TestBed.overrideComponent(TestForm, {
    set: { template: `<form appEnterToNext>${fields}</form>` },
  });
  const fixture = TestBed.createComponent(TestForm);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}
function enter(target: HTMLElement, options: KeyboardEventInit = {}) {
  target.focus();
  const event = new KeyboardEvent('keydown', {
    key: 'Enter',
    bubbles: true,
    cancelable: true,
    ...options,
  });
  target.dispatchEvent(event);
  return event;
}

describe('Enter to next field', () => {
  it('skips hidden, disabled-fieldset and untabbable fields', async () => {
    const root = await render(
      '<input id="first"><input hidden><div style="display:none"><input></div><fieldset disabled><input></fieldset><input tabindex="-1"><input id="next"><button type="submit">Save</button>',
    );
    const first = root.querySelector<HTMLElement>('#first')!;
    expect(enter(first).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(root.querySelector('#next'));
    enter(root.querySelector<HTMLElement>('#next')!);
    expect(document.activeElement).toBe(root.querySelector('button'));
  });

  it('does not implicitly submit when the last field has no enabled submit button', async () => {
    const root = await render('<input><button type="submit" disabled>Save</button>');
    const input = root.querySelector('input')!;
    expect(enter(input).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input);
  });

  it('leaves composition and modified Enter alone and prevents repeated focus jumps', async () => {
    const root = await render('<input id="first"><input>');
    const first = root.querySelector<HTMLElement>('#first')!;
    for (const options of [
      { isComposing: true },
      { ctrlKey: true },
      { altKey: true },
      { metaKey: true },
    ]) {
      expect(enter(first, options).defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(first);
    }
    expect(enter(first, { repeat: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
  });

  it('preserves textarea, select, and button Enter behavior', async () => {
    const root = await render(
      '<textarea></textarea><select><option>A</option></select><button type="submit">Save</button>',
    );
    for (const control of root.querySelectorAll<HTMLElement>('textarea,select,button')) {
      expect(enter(control).defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(control);
    }
  });

  it('keeps focus in an open autocomplete until it has handled the selection', async () => {
    const root = await render('<input role="combobox" aria-expanded="true"><input id="next">');
    const combo = root.querySelector('input')!;
    expect(enter(combo).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(combo);
    combo.setAttribute('aria-expanded', 'false');
    enter(combo);
    expect(document.activeElement).toBe(root.querySelector('#next'));
  });

  it('moves backwards with Shift+Enter without submitting from the first field', async () => {
    const root = await render('<input id="first"><input id="second"><button type="submit">Save</button>');
    const first = root.querySelector<HTMLInputElement>('#first')!;
    enter(root.querySelector<HTMLInputElement>('#second')!, { shiftKey: true });
    expect(document.activeElement).toBe(first);
    expect(enter(first, { shiftKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
  });

  it('moves up and down without changing number values or wrapping at a boundary', async () => {
    const root = await render('<input id="name"><input type="number" value="125.50"><button type="submit">Save</button>');
    const amount = root.querySelector<HTMLInputElement>('input[type="number"]')!;
    expect(enter(amount, { key: 'ArrowUp' }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(root.querySelector('#name'));
    enter(amount, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(root.querySelector('button'));
    expect(amount.value).toBe('125.50');
    const first = root.querySelector<HTMLInputElement>('#name')!;
    enter(first, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(first);
  });

  it('preserves text editing and selection and exits horizontally only at the caret boundary', async () => {
    const root = await render('<input id="first"><input id="middle" value="Merchant"><input id="last">');
    const middle = root.querySelector<HTMLInputElement>('#middle')!;
    middle.setSelectionRange(3, 3);
    expect(enter(middle, { key: 'ArrowRight' }).defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(middle);
    middle.setSelectionRange(0, 8);
    expect(enter(middle, { key: 'ArrowLeft' }).defaultPrevented).toBe(false);
    middle.setSelectionRange(0, 0);
    enter(middle, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(root.querySelector('#first'));
    middle.setSelectionRange(8, 8);
    enter(middle, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(root.querySelector('#last'));
  });

  it('retains native caret, multiline, choice and modified arrow behavior', async () => {
    const root = await render('<input type="number" value="25"><textarea>Notes</textarea><select><option>A</option></select><input type="radio"><input type="range"><input id="last">');
    for (const field of root.querySelectorAll<HTMLElement>('textarea,select,input[type="radio"],input[type="range"]')) {
      expect(enter(field, { key: 'ArrowDown' }).defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(field);
    }
    const amount = root.querySelector<HTMLInputElement>('input[type="number"]')!;
    expect(enter(amount, { key: 'ArrowLeft' }).defaultPrevented).toBe(false);
    expect(enter(amount, { key: 'ArrowUp', altKey: true }).defaultPrevented).toBe(false);
    expect(enter(amount, { key: 'ArrowDown', shiftKey: true }).defaultPrevented).toBe(false);
  });

  it('keeps optional sections keyboard reachable while skipping their collapsed fields', async () => {
    const root = await render('<input id="first"><details><summary>Optional</summary><input id="optional"></details><input id="last">');
    const summary = root.querySelector('summary')!;
    enter(root.querySelector<HTMLInputElement>('#first')!);
    expect(document.activeElement).toBe(summary);
    expect(enter(summary).defaultPrevented).toBe(false);
    enter(summary, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(root.querySelector('#last'));
    root.querySelector('details')!.open = true;
    enter(summary, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(root.querySelector('#optional'));
  });

  it('skips auxiliary buttons during entry and keeps their native activation', async () => {
    const root = await render('<input id="first"><button type="button">Remove</button><input id="last"><button type="submit">Save</button>');
    enter(root.querySelector<HTMLInputElement>('#first')!);
    expect(document.activeElement).toBe(root.querySelector('#last'));
    enter(root.querySelector<HTMLInputElement>('#last')!);
    expect(document.activeElement).toBe(root.querySelector('[type="submit"]'));
    expect(enter(root.querySelector<HTMLButtonElement>('[type="submit"]')!).defaultPrevented).toBe(false);
    enter(root.querySelector<HTMLInputElement>('#first')!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(root.querySelector('[type="button"]'));
  });

  it('moves vertically by grid column and leaves the grid at its boundaries', async () => {
    const root = await render(`<input id="before"><table><tbody>
      <tr data-entry-row><td data-entry-column="account"><input id="account1"></td><td data-entry-column="amount"><input id="amount1" type="number"></td><td><button type="button">Remove</button></td></tr>
      <tr data-entry-row><td data-entry-column="account"><input></td><td data-entry-column="amount"><input disabled></td></tr>
      <tr data-entry-row><td data-entry-column="account"><input id="account3"></td><td data-entry-column="amount"><input id="amount3" type="number"></td></tr>
      </tbody></table><button type="button" id="add">Add row</button><button type="submit">Save</button>`);
    const amount1 = root.querySelector<HTMLInputElement>('#amount1')!;
    const amount3 = root.querySelector<HTMLInputElement>('#amount3')!;
    enter(amount1, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(amount3);
    enter(amount3, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(amount1);
    enter(amount1, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(root.querySelector('#before'));
    enter(amount3, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(root.querySelector('#add'));
  });

  it('advances after a committed selection only while its control still has focus', async () => {
    const root = await render('<input id="picker"><input id="next"><input id="elsewhere">');
    const picker = root.querySelector<HTMLInputElement>('#picker')!;
    picker.focus();
    picker.dispatchEvent(new CustomEvent('app-field-advance', { bubbles: true }));
    expect(document.activeElement).toBe(root.querySelector('#next'));
    const elsewhere = root.querySelector<HTMLInputElement>('#elsewhere')!;
    elsewhere.focus();
    picker.dispatchEvent(new CustomEvent('app-field-advance', { bubbles: true }));
    expect(document.activeElement).toBe(elsewhere);
  });
});
