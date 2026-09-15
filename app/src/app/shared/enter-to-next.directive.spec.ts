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
      { shiftKey: true },
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
});
