import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterOutlet } from '@angular/router';
import { By } from '@angular/platform-browser';
import { Location } from '@angular/common';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth.service';
import { NotifyService } from '../../core/notify.service';
import { SupabaseService } from '../../core/supabase.service';
import { Members } from './members';

@Component({ template: 'member' })
class MemberStub {}

describe('Members list', () => {
  interface Call {
    order: [string, { ascending: boolean }][];
    range: [number, number];
    or?: string;
  }

  function setup(total = 120) {
    const calls: Call[] = [];
    const query: any = {};
    let current: Call;
    query.select = (_cols: string, _opts: unknown) => {
      current = { order: [], range: [0, 0] };
      calls.push(current);
      return query;
    };
    query.order = (column: string, options: { ascending: boolean }) => {
      current.order.push([column, options]);
      return query;
    };
    query.or = (filter: string) => {
      current.or = filter;
      return query;
    };
    query.range = (from: number, to: number) => {
      current.range = [from, to];
      return query;
    };
    query.then = (resolve: (value: unknown) => unknown) => {
      const [from, to] = current.range;
      const rows = Array.from({ length: Math.max(0, Math.min(total - from, to - from + 1)) }).map(
        (_, i) => ({ code: from + i + 1, name: `Member ${from + i + 1}`, phone: null }),
      );
      return Promise.resolve({ data: rows, error: null, count: total }).then(resolve);
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'masters/members', component: Members },
          { path: 'masters/members/:code', component: MemberStub },
        ]),
        { provide: AuthService, useValue: { canEdit: () => true } },
        { provide: SupabaseService, useValue: { client: { from: () => query } } },
        { provide: NotifyService, useValue: { success: vi.fn(), error: vi.fn() } },
      ],
    });
    return { calls };
  }

  async function open(url = '/masters/members') {
    const harness = TestBed.createComponent(MembersHost);
    await TestBed.inject(Router).navigateByUrl(url);
    harness.detectChanges();
    await harness.whenStable();
    harness.detectChanges();
    const page = harness.debugElement.query(By.directive(Members)).componentInstance as any;
    const settle = async () => {
      await vi.waitFor(() => expect(page.loading()).toBe(false));
      harness.detectChanges();
      await harness.whenStable();
    };
    await settle();
    return { harness, page, settle };
  }

  @Component({ imports: [RouterOutlet], template: '<router-outlet />' })
  class MembersHost {}

  it('requests one page at a time and counts the total', async () => {
    const { calls } = setup();
    const { harness, page } = await open();
    expect(calls.at(-1)!.range).toEqual([0, 24]);
    expect(calls.at(-1)!.order[0]).toEqual(['name_sort', { ascending: true, nullsFirst: false }]);
    expect(page.total()).toBe(120);
    expect(harness.nativeElement.textContent).toContain('1–25 of 120 members');
    expect(harness.nativeElement.querySelectorAll('tbody tr').length).toBe(25);
  });

  it('moves to the next page and remembers it in the URL', async () => {
    const { calls } = setup();
    const { harness, page, settle } = await open();
    page.onPage({ pageIndex: 2, pageSize: 25 });
    await settle();
    expect(calls.at(-1)!.range).toEqual([50, 74]);
    expect(harness.nativeElement.textContent).toContain('51–75 of 120');
    // replaceState updates the address bar without a router navigation.
    expect(TestBed.inject(Location).path()).toContain('page=3');
  });

  it('sorts by a chosen column and returns to the first page', async () => {
    const { calls } = setup();
    const { page, settle } = await open();
    page.onPage({ pageIndex: 2, pageSize: 25 });
    await settle();
    page.onSort({ active: 'code', direction: 'desc' });
    await settle();
    expect(calls.at(-1)!.order[0]).toEqual(['code', { ascending: false, nullsFirst: false }]);
    expect(calls.at(-1)!.range).toEqual([0, 24]);
    expect(page.pageIndex()).toBe(0);
  });

  it('sorts names on the case-insensitive column but keeps the URL readable', async () => {
    const { calls } = setup();
    const { page, settle } = await open();
    page.onSort({ active: 'name', direction: 'desc' });
    await settle();
    expect(calls.at(-1)!.order[0]).toEqual(['name_sort', { ascending: false, nullsFirst: false }]);
    expect(TestBed.inject(Location).path()).toContain('sort=name.desc');
  });

  it('restores the search, page and sort from the URL', async () => {
    const { calls } = setup();
    const { page } = await open('/masters/members?q=ravi&page=2&sort=code.desc&size=50');
    expect(page.query()).toBe('ravi');
    expect(calls.at(-1)!.range).toEqual([50, 99]);
    expect(calls.at(-1)!.or).toContain('name.ilike.*ravi*');
    expect(page.sortColumn()).toBe('code');
    expect(page.sortDirection()).toBe('desc');
  });

  it('falls back to the last page when the current one is past the end', async () => {
    const { calls } = setup(30);
    const { page } = await open('/masters/members?page=9');
    await vi.waitFor(() => expect(page.members().length).toBeGreaterThan(0));

    expect(page.pageIndex()).toBe(1);
    expect(calls.at(-1)!.range).toEqual([25, 49]);
  });
});
