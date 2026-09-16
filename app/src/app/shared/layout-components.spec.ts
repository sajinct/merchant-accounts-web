import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EmptyState } from './empty-state';
import { PageHeader } from './page-header';
import { StatCard } from './stat-card';

async function render(component: unknown): Promise<HTMLElement> {
  await TestBed.configureTestingModule({ imports: [component as never] }).compileComponents();
  const fixture = TestBed.createComponent(component as never);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('PageHeader', () => {
  @Component({
    imports: [PageHeader],
    template: `<app-page-header
      eyebrow="Reports"
      heading="General ledger"
      description="Explore it."
    >
      <button>Run</button>
    </app-page-header>`,
  })
  class Full {}

  @Component({ imports: [PageHeader], template: `<app-page-header heading="Only" />` })
  class Bare {}

  it('lays out the eyebrow, heading, description and actions', async () => {
    const el = await render(Full);
    const header = el.querySelector('app-page-header')!;
    expect(header.classList).toContain('page-header');
    expect(header.querySelector('.eyebrow')!.textContent).toBe('Reports');
    expect(header.querySelector('h1')!.textContent).toBe('General ledger');
    expect(header.querySelector('.page-description')!.textContent).toBe('Explore it.');
    // Actions sit outside the heading block so they align to the right.
    expect(header.querySelector('.page-heading button')).toBeNull();
    expect(header.querySelector('button')!.textContent).toBe('Run');
  });

  it('omits the eyebrow and description when not given', async () => {
    const el = await render(Bare);
    expect(el.querySelector('.eyebrow')).toBeNull();
    expect(el.querySelector('.page-description')).toBeNull();
    expect(el.querySelector('h1')!.textContent).toBe('Only');
  });
});

describe('EmptyState', () => {
  @Component({
    imports: [EmptyState],
    template: `<app-empty-state icon="group" heading="No members" message="Add one." status>
      <button>Add</button>
    </app-empty-state>`,
  })
  class Full {}

  @Component({
    imports: [EmptyState],
    template: `<app-empty-state message="Loading…" />`,
  })
  class MessageOnly {}

  it('shows the icon, heading, message and any action', async () => {
    const el = await render(Full);
    const state = el.querySelector('app-empty-state')!;
    expect(state.classList).toContain('empty-state');
    expect(state.getAttribute('role')).toBe('status');
    expect(state.querySelector('.empty-icon mat-icon')!.textContent).toBe('group');
    expect(state.querySelector('h3')!.textContent).toBe('No members');
    expect(state.querySelector('p')!.textContent).toBe('Add one.');
    expect(state.querySelector('button')!.textContent).toBe('Add');
  });

  it('reads as a plain line when only a message is given', async () => {
    const el = await render(MessageOnly);
    const state = el.querySelector('app-empty-state')!;
    expect(state.querySelector('.empty-icon')).toBeNull();
    expect(state.querySelector('h3')).toBeNull();
    expect(state.getAttribute('role')).toBeNull();
    expect(state.textContent!.trim()).toBe('Loading…');
  });
});

describe('StatCard', () => {
  @Component({
    imports: [StatCard],
    template: `<app-stat-card
        label="Total payments"
        value="8,950.75"
        icon="north_east"
        tone="payment"
      />
      <app-stat-card label="Balance" value="-250.00" icon="wallet" [negative]="true" />
      <app-stat-card label="Days" [value]="7" />`,
  })
  class Cards {}

  it('renders label, value and icon, and marks negative figures', async () => {
    const el = await render(Cards);
    const cards = el.querySelectorAll('app-stat-card');
    expect(cards[0].classList).toContain('summary-card');
    expect(cards[0].querySelector('.summary-label')!.textContent).toBe('Total payments');
    expect(cards[0].querySelector('.summary-value')!.textContent).toBe('8,950.75');
    expect(cards[0].querySelector('.summary-icon')!.classList).toContain('payment-icon');
    expect(cards[1].querySelector('.summary-value')!.classList).toContain('danger');
    expect(cards[1].querySelector('.summary-icon')!.classList).not.toContain('payment-icon');
    // No icon given, so no icon box is drawn.
    expect(cards[2].querySelector('.summary-icon')).toBeNull();
    expect(cards[2].querySelector('.summary-value')!.textContent).toBe('7');
  });
});
