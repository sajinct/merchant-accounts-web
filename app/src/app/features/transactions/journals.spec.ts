import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Journals } from './journals';
import { AuthService } from '../../core/auth.service';
import { SupabaseService } from '../../core/supabase.service';
import { NotifyService } from '../../core/notify.service';
import { provideIsoDateAdapter } from '../../shared/iso-date-adapter';

describe('Journal entry', () => {
  async function setup() {
    const rpc = vi.fn().mockResolvedValue({ data: 12, error: null });
    const query: any = {
      select: () => query,
      gte: () => query,
      lte: () => query,
      not: () => query,
      order: () => query,
      limit: () => query,
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve),
    };
    await TestBed.configureTestingModule({
      imports: [Journals],
      providers: [
        { provide: AuthService, useValue: { canEdit: () => true, isAdmin: () => true } },
        { provide: SupabaseService, useValue: { client: { from: () => query, rpc } } },
        { provide: NotifyService, useValue: { success: vi.fn(), error: vi.fn() } },
        provideIsoDateAdapter(),
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(Journals);
    fixture.detectChanges();
    await fixture.whenStable();
    const page = fixture.componentInstance as any;
    page.lines = [
      { account: 1, debit: 0.3, credit: 0 },
      { account: 2, debit: 0, credit: 0.1 },
      { account: 3, debit: 0, credit: 0.2 },
    ];
    return { fixture, page, rpc };
  }
  it('accepts balanced fractional amounts without a floating-point difference', async () => {
    const { page } = await setup();
    expect(page.valid()).toBe(true);
  });
  it('rejects unbalanced amounts and excess decimal precision', async () => {
    const { page } = await setup();
    page.lines[0].debit = 0.31;
    expect(page.valid()).toBe(false);
    page.lines = [
      { account: 1, debit: 1.001, credit: 0 },
      { account: 2, debit: 0, credit: 1.001 },
    ];
    expect(page.valid()).toBe(false);
  });
  it('rejects a line containing both a debit and a credit', async () => {
    const { page } = await setup();
    page.lines = [
      { account: 1, debit: 10, credit: 10 },
      { account: 2, debit: 10, credit: 10 },
    ];
    expect(page.valid()).toBe(false);
  });
  it('retains the request identity on a failed response so retry cannot duplicate posting', async () => {
    const { page, rpc } = await setup();
    rpc.mockResolvedValueOnce({ data: null, error: new Error('Connection lost') });
    await page.post();
    const first = rpc.mock.calls[0][1].p_request_id;
    await page.post();
    expect(rpc.mock.calls[1][1].p_request_id).toBe(first);
    expect(page.lines.every((line: any) => line.account === null)).toBe(true);
  });
});
