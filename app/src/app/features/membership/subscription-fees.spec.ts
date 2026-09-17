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
});
