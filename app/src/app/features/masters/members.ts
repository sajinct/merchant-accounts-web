import { Location } from '@angular/common';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSortModule, Sort, SortDirection } from '@angular/material/sort';
import { AuthService } from '../../core/auth.service';
import { Customer } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { SupabaseService } from '../../core/supabase.service';
import { PageHeader } from '../../shared/page-header';
import { EmptyState } from '../../shared/empty-state';

type MemberSummary = Pick<
  Customer,
  'code' | 'name' | 'addr1' | 'addr2' | 'addr3' | 'addr4' | 'phone'
>;

const SORTABLE = ['code', 'name', 'phone'] as const;
type SortColumn = (typeof SORTABLE)[number];
export const PAGE_SIZES = [25, 50, 100];

@Component({
  selector: 'app-members',
  imports: [
    EmptyState,
    PageHeader,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatSortModule,
  ],
  template: `
    <div class="page">
      <app-page-header
        eyebrow="Member directory"
        heading="Members"
        description="Manage member details, contact information and identification."
      >
        @if (auth.canEdit()) {
          <a mat-flat-button routerLink="/masters/members/new"
            ><mat-icon>person_add</mat-icon> New member</a
          >
        }
      </app-page-header>

      <section class="panel" aria-label="Member directory">
        <div class="toolbar-panel">
          <mat-form-field class="search-field" subscriptSizing="dynamic">
            <mat-label>Search members</mat-label>
            <mat-icon matPrefix>search</mat-icon>
            <input
              matInput
              placeholder="Name, code or phone"
              [value]="query()"
              (input)="onQuery($any($event.target).value)"
            />
          </mat-form-field>
          <span class="toolbar-count" aria-live="polite">{{ countLabel() }}</span>
        </div>
        <div
          class="table-wrap"
          tabindex="0"
          role="region"
          aria-label="Members table"
          [attr.aria-busy]="loading()"
        >
          <table
            class="data-table"
            [class.refreshing]="loading() && loaded()"
            matSort
            [matSortActive]="sortColumn()"
            [matSortDirection]="sortDirection()"
            matSortDisableClear
            (matSortChange)="onSort($event)"
          >
            <thead>
              <tr>
                <th scope="col" class="num" mat-sort-header="code" arrowPosition="before">
                  Member code
                </th>
                <th scope="col" mat-sort-header="name">Member name</th>
                <th scope="col">Address</th>
                <th scope="col" mat-sort-header="phone">Phone</th>
              </tr>
            </thead>
            <tbody>
              @if (!loaded()) {
                @for (row of placeholders; track row) {
                  <tr class="placeholder-row" aria-hidden="true">
                    <td class="num"><span class="skeleton short"></span></td>
                    <td><span class="skeleton"></span></td>
                    <td><span class="skeleton wide"></span></td>
                    <td><span class="skeleton"></span></td>
                  </tr>
                }
              } @else {
                @for (m of members(); track m.code) {
                  <tr class="clickable" (click)="open(m.code)">
                    <td class="num">{{ m.code }}</td>
                    <td>
                      <a
                        class="table-link"
                        [routerLink]="['/masters/members', m.code]"
                        (click)="$event.stopPropagation()"
                        >{{ m.name }}</a
                      >
                    </td>
                    <td class="table-secondary">{{ address(m) || '—' }}</td>
                    <td>{{ m.phone || '—' }}</td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="4">
                      <app-empty-state
                        icon="group"
                        heading="No members found"
                        [message]="
                          query()
                            ? 'Try a different name, member code or phone number.'
                            : 'Add your first member to start building your directory.'
                        "
                        status
                      />
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
        @if (total() > pageSize()) {
          <mat-paginator
            [length]="total()"
            [pageIndex]="pageIndex()"
            [pageSize]="pageSize()"
            [pageSizeOptions]="pageSizes"
            [disabled]="loading()"
            (page)="onPage($event)"
            aria-label="Member pages"
          />
        }
      </section>
    </div>
  `,
  styles: `
    mat-paginator {
      border-top: 1px solid var(--app-border);
      border-radius: 0 0 var(--app-radius) var(--app-radius);
    }
    .data-table th[mat-sort-header] {
      cursor: pointer;
    }
  `,
})
export class Members implements OnInit, OnDestroy {
  protected readonly auth = inject(AuthService);
  private readonly sb = inject(SupabaseService).client;
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);

  protected readonly pageSizes = PAGE_SIZES;
  protected readonly placeholders = [1, 2, 3, 4, 5, 6];
  protected readonly query = signal('');
  protected readonly members = signal<MemberSummary[]>([]);
  protected readonly total = signal(0);
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(PAGE_SIZES[0]);
  protected readonly sortColumn = signal<SortColumn>('name');
  protected readonly sortDirection = signal<SortDirection>('asc');
  protected readonly loading = signal(true);
  protected readonly loaded = signal(false);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private requestId = 0;

  ngOnInit(): void {
    // Restore the list position when returning from a member's details.
    const params = this.route.snapshot.queryParamMap;
    this.query.set(params.get('q') ?? '');
    const size = Number(params.get('size'));
    if (PAGE_SIZES.includes(size)) this.pageSize.set(size);
    const page = Number(params.get('page'));
    if (Number.isInteger(page) && page > 1) this.pageIndex.set(page - 1);
    const [column, direction] = (params.get('sort') ?? '').split('.');
    if ((SORTABLE as readonly string[]).includes(column)) {
      this.sortColumn.set(column as SortColumn);
      this.sortDirection.set(direction === 'desc' ? 'desc' : 'asc');
    }
    void this.search();
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }

  protected countLabel(): string {
    if (!this.loaded()) return 'Loading members…';
    const total = this.total();
    if (!total) return 'No members';
    const first = this.pageIndex() * this.pageSize() + 1;
    const last = Math.min(total, first + this.members().length - 1);
    const noun = total === 1 ? 'member' : 'members';
    return total <= this.pageSize() ? `${total} ${noun}` : `${first}–${last} of ${total} ${noun}`;
  }

  protected onQuery(value: string): void {
    this.query.set(value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.pageIndex.set(0);
      void this.search();
    }, 250);
  }

  protected onSort(sort: Sort): void {
    this.sortColumn.set(sort.active as SortColumn);
    this.sortDirection.set(sort.direction || 'asc');
    this.pageIndex.set(0);
    void this.search();
  }

  protected onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageSize === this.pageSize() ? event.pageIndex : 0);
    this.pageSize.set(event.pageSize);
    void this.search();
  }

  protected open(code: number): void {
    this.router.navigate(['/masters/members', code]);
  }

  protected address(m: MemberSummary): string {
    return [m.addr1, m.addr2, m.addr3, m.addr4].filter(Boolean).join(', ');
  }

  private rememberPosition(): void {
    const params = new URLSearchParams();
    const q = this.query().trim();
    if (q) params.set('q', q);
    if (this.pageIndex()) params.set('page', String(this.pageIndex() + 1));
    if (this.pageSize() !== PAGE_SIZES[0]) params.set('size', String(this.pageSize()));
    if (this.sortColumn() !== 'name' || this.sortDirection() !== 'asc') {
      params.set('sort', `${this.sortColumn()}.${this.sortDirection()}`);
    }
    // replaceState keeps focus and history untouched; a router navigation would re-enter the page.
    this.location.replaceState('/masters/members', params.toString());
  }

  private async search(): Promise<void> {
    const id = ++this.requestId;
    const q = this.query().trim();
    const from = this.pageIndex() * this.pageSize();
    this.loading.set(true);
    this.rememberPosition();
    try {
      let request = this.sb
        .from('customers')
        .select('code, name, addr1, addr2, addr3, addr4, phone', { count: 'exact' })
        .order(this.sortColumn(), { ascending: this.sortDirection() !== 'desc', nullsFirst: false })
        .order('code')
        .range(from, from + this.pageSize() - 1);
      if (q) {
        // PostgREST `or` filter syntax: strip characters that would break it.
        const safe = q.replace(/[,()*%\\]/g, ' ').trim();
        const filters = [`name.ilike.*${safe}*`, `phone.ilike.*${safe}*`];
        if (/^\d+$/.test(safe)) {
          filters.push(`code.eq.${safe}`);
        }
        request = request.or(filters.join(','));
      }
      const { data, error, count } = await request;
      if (error) throw error;
      if (id !== this.requestId) return;
      const total = count ?? 0;
      // A page past the end (e.g. after members were deleted) falls back to the last page.
      if (!data?.length && total && from >= total) {
        this.pageIndex.set(Math.max(0, Math.ceil(total / this.pageSize()) - 1));
        void this.search();
        return;
      }
      this.members.set(data ?? []);
      this.total.set(total);
      this.loaded.set(true);
    } catch (err) {
      if (id === this.requestId) {
        this.loaded.set(true);
        this.notify.error(err);
      }
    } finally {
      if (id === this.requestId) {
        this.loading.set(false);
      }
    }
  }
}
