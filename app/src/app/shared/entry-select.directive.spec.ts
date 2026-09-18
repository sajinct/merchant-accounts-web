import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelect, MatSelectModule } from '@angular/material/select';
import { By } from '@angular/platform-browser';
import { EnterToNext } from './enter-to-next.directive';
import { EntrySelect } from './entry-select.directive';

@Component({
  imports: [ReactiveFormsModule, MatFormFieldModule, MatSelectModule, EntrySelect, EnterToNext],
  template: `
    <form appEnterToNext>
      <input id="previous-field" aria-label="Description" />
      <mat-form-field>
        <mat-label>Payment mode</mat-label>
        <mat-select appEntrySelect [formControl]="control">
          <mat-option value="cash">Cash</mat-option>
          <mat-option value="bank">Bank</mat-option>
        </mat-select>
      </mat-form-field>
      <input id="next-field" aria-label="Amount" />
    </form>
  `,
})
class Host {
  readonly control = new FormControl('cash');
}

describe('EntrySelect', () => {
  async function setup() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
    const select = fixture.debugElement.query(By.directive(MatSelect))
      .componentInstance as MatSelect;
    const element = fixture.nativeElement.querySelector('mat-select') as HTMLElement;
    element.focus();
    return { fixture, select, element, control: fixture.componentInstance.control };
  }

  function key(
    target: HTMLElement,
    value: string,
    keyCode: number,
    options: KeyboardEventInit = {},
  ) {
    target.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: value,
        keyCode,
        bubbles: true,
        cancelable: true,
        ...options,
      }),
    );
  }

  it('opens with an arrow and advances after Enter commits the highlighted option', async () => {
    const { fixture, select, element, control } = await setup();
    key(element, 'ArrowDown', 40);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(select.panelOpen).toBe(true);
    expect(control.value).toBe('cash');
    const panel = select.panel.nativeElement as HTMLElement;
    key(panel, 'ArrowDown', 40);
    key(panel, 'Enter', 13);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(control.value).toBe('bank');
    expect(select.panelOpen).toBe(false);
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('#next-field'));
  });

  it('advances when Enter confirms the already selected option', async () => {
    const { fixture, select, element, control } = await setup();
    key(element, 'Enter', 13);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(select.panelOpen).toBe(true);
    key(select.panel.nativeElement, 'Enter', 13);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(control.value).toBe('cash');
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('#next-field'));
  });

  it('advances when the open select keeps keyboard focus on its trigger', async () => {
    const { fixture, select, element, control } = await setup();
    key(element, 'ArrowDown', 40);
    fixture.detectChanges();
    await fixture.whenStable();
    key(element, 'ArrowDown', 40);
    key(element, 'Enter', 13);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(control.value).toBe('bank');
    expect(select.panelOpen).toBe(false);
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('#next-field'));
  });

  it('does not advance when the selected option was clicked', async () => {
    const { fixture, select, element, control } = await setup();
    key(element, 'Enter', 13);
    fixture.detectChanges();
    await fixture.whenStable();
    (select.panel.nativeElement.querySelectorAll('mat-option')[1] as HTMLElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(control.value).toBe('bank');
    expect(select.panelOpen).toBe(false);
    expect(document.activeElement).toBe(element);
  });

  it('closes on Escape without selecting or advancing', async () => {
    const { fixture, select, element, control } = await setup();
    key(element, 'Enter', 13);
    fixture.detectChanges();
    await fixture.whenStable();
    key(select.panel.nativeElement, 'ArrowDown', 40);
    key(select.panel.nativeElement, 'Escape', 27);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(control.value).toBe('cash');
    expect(select.panelOpen).toBe(false);
    expect(document.activeElement).toBe(element);
  });

  it('moves backwards from a closed select with Shift+Enter without changing its value', async () => {
    const { fixture, select, element, control } = await setup();
    key(element, 'Enter', 13, { shiftKey: true });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(select.panelOpen).toBe(false);
    expect(control.value).toBe('cash');
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('#previous-field'));
  });

  it('moves backwards out of an open select without committing the highlighted option', async () => {
    const { fixture, select, element, control } = await setup();
    key(element, 'Enter', 13);
    fixture.detectChanges();
    await fixture.whenStable();
    key(select.panel.nativeElement, 'ArrowDown', 40);
    key(select.panel.nativeElement, 'Enter', 13, { shiftKey: true });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(select.panelOpen).toBe(false);
    expect(control.value).toBe('cash');
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('#previous-field'));
  });
});
