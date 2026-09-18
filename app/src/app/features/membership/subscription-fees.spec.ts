import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { SubscriptionFees } from './subscription-fees';
import { SupabaseService } from '../../core/supabase.service';
import { NotifyService } from '../../core/notify.service';
import { provideIsoDateAdapter } from '../../shared/iso-date-adapter';

describe('Inline fee keyboard editing', () => {
  it('consumes Escape without forwarding it to the navigation handler', async () => {
    vi.spyOn(SubscriptionFees.prototype, 'ngOnInit').mockResolvedValue();
    await TestBed.configureTestingModule({
      imports: [SubscriptionFees],
      providers: [
        provideIsoDateAdapter(),
        { provide: SupabaseService, useValue: { client: {} } },
        { provide: NotifyService, useValue: { error: vi.fn(), success: vi.fn() } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(SubscriptionFees);
    fixture.componentInstance['years'].set([{ fy_start: 2026, fee: 500 }]);
    fixture.componentInstance['loading'].set(false);
    fixture.componentInstance['startEdit']({ fy_start: 2026, fee: 500 });
    fixture.detectChanges();
    await fixture.whenStable();
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      'input[aria-label^="Fee for"]',
    )!;
    const bubbled = vi.fn();
    document.addEventListener('keydown', bubbled);
    try {
      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      input.dispatchEvent(event);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(document.activeElement?.getAttribute('aria-label')).toBe('Change fee for 2026-27');
      expect(event.defaultPrevented).toBe(true);
      expect(bubbled).not.toHaveBeenCalled();
      expect(fixture.componentInstance['editing']()).toBeNull();
    } finally {
      document.removeEventListener('keydown', bubbled);
    }
  });

  it.each(['subscription', 'joining'] as const)(
    'returns focus to the row Edit button after saving a %s fee and refreshing its data',
    async (kind) => {
      vi.spyOn(SubscriptionFees.prototype, 'ngOnInit').mockResolvedValue();
      const update = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      });
      await TestBed.configureTestingModule({
        imports: [SubscriptionFees],
        providers: [
          provideIsoDateAdapter(),
          { provide: SupabaseService, useValue: { client: { from: () => ({ update }) } } },
          { provide: NotifyService, useValue: { error: vi.fn(), success: vi.fn() } },
        ],
      }).compileComponents();
      const fixture = TestBed.createComponent(SubscriptionFees);
      const component = fixture.componentInstance;
      const year = { fy_start: 2026, fee: 500 };
      const rate = { effective_from: '2026-04-01', fee: 250, head_code: 100, note: null };
      component['years'].set([year]);
      component['joiningFees'].set([rate]);
      component['loading'].set(false);
      // Refresh with new objects, as a successful database reload does.
      component['load'] = vi.fn(async () => {
        component['years'].set([{ ...year, fee: 600 }]);
        component['joiningFees'].set([{ ...rate, fee: 600 }]);
      });

      if (kind === 'joining') component['startJoiningEdit'](rate);
      else component['startEdit'](year);
      fixture.detectChanges();
      await fixture.whenStable();
      const row =
        kind === 'joining' ? '[data-joining-rate="2026-04-01"]' : '[data-fee-year="2026"]';
      const host = fixture.nativeElement as HTMLElement;
      expect(document.activeElement).toBe(host.querySelector(`${row} input`));

      if (kind === 'joining') await component['updateJoiningFee'](rate, 600);
      else await component['updateFee'](year, 600);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(update).toHaveBeenCalledWith({ fee: 600 });
      expect(component['load']).toHaveBeenCalledOnce();
      expect(host.querySelector(`${row} input`)).toBeNull();
      expect(document.activeElement).toBe(
        host.querySelector(
          `${row} button[aria-label^="${kind === 'joining' ? 'Correct' : 'Change'} fee"]`,
        ),
      );
    },
  );
});
