import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { confirmAction, ConfirmOptions } from './confirm-dialog';

describe('confirmAction', () => {
  function open(options: ConfirmOptions) {
    const result = confirmAction(TestBed.inject(MatDialog), options);
    TestBed.tick();
    const pane = document.querySelector('.cdk-overlay-pane') as HTMLElement;
    const buttons = pane.querySelectorAll<HTMLButtonElement>('mat-dialog-actions button');
    return { result, pane, cancel: buttons[0], confirm: buttons[1] };
  }

  function type(pane: HTMLElement, index: number, value: string) {
    const input = pane.querySelectorAll('input')[index];
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  afterEach(() => TestBed.inject(MatDialog).closeAll());

  it('resolves to null when cancelled', async () => {
    const { result, cancel } = open({ title: 'Delete?' });
    cancel.click();
    expect(await result).toBeNull();
  });

  it('resolves to an empty object when confirmed without fields', async () => {
    const { result, confirm } = open({ title: 'Delete?' });
    confirm.click();
    expect(await result).toEqual({});
  });

  it('requires a non-blank reason and returns it trimmed', async () => {
    const { result, pane, confirm } = open({
      title: 'Cancel voucher?',
      fields: [{ key: 'reason', label: 'Reason', required: true }],
    });
    type(pane, 0, '   ');
    confirm.click();
    TestBed.tick();
    expect(pane.textContent).toContain('Reason is required.');
    type(pane, 0, '  Duplicate entry ');
    confirm.click();
    expect(await result).toEqual({ reason: 'Duplicate entry' });
  });

  it('moves Enter from a reason field to the explicit confirmation without confirming', async () => {
    const { result, pane, confirm } = open({
      title: 'Cancel voucher?',
      destructive: true,
      fields: [{ key: 'reason', label: 'Reason', required: true }],
    });
    type(pane, 0, 'Duplicate entry');
    const input = pane.querySelector('input')!;
    input.focus();
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(event);
    TestBed.tick();
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(confirm);
    expect(TestBed.inject(MatDialog).openDialogs.length).toBe(1);

    confirm.click();
    expect(await result).toEqual({ reason: 'Duplicate entry' });
  });

  it('rejects dates outside the allowed range', async () => {
    const { result, pane, confirm } = open({
      title: 'Reverse?',
      fields: [{ key: 'date', label: 'Date', type: 'date', min: '2026-04-01', max: '2027-03-31' }],
    });
    type(pane, 0, '2026-03-31');
    confirm.click();
    TestBed.tick();
    expect(pane.textContent).toContain('within the selected financial year');
    type(pane, 0, '2026-04-01');
    confirm.click();
    expect(await result).toEqual({ date: '2026-04-01' });
  });
});
