import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { AuthService } from '../../core/auth.service';
import { Customer } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { must, SupabaseService } from '../../core/supabase.service';

type MemberSummary = Pick<
  Customer,
  'code' | 'name' | 'addr1' | 'addr2' | 'addr3' | 'addr4' | 'phone'
>;

@Component({
  selector: 'app-members',
  imports: [RouterLink, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="page-heading">
          <span class="eyebrow">Member directory</span>
          <h1>Members</h1>
          <p class="page-description">
            Manage member details, contact information and identification.
          </p>
        </div>
        @if (auth.canEdit()) {
          <a mat-flat-button routerLink="/masters/members/new"
            ><mat-icon>person_add</mat-icon> New member</a
          >
        }
      </div>

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
          <span class="toolbar-count" aria-live="polite">{{
            loading() ? 'Loading members…' : members().length + ' members shown'
          }}</span>
        </div>
        <div
          class="table-wrap"
          tabindex="0"
          role="region"
          aria-label="Members table"
          [attr.aria-busy]="loading()"
        >
          <table class="data-table">
            <thead>
              <tr>
                <th scope="col" class="num">Member code</th>
                <th scope="col">Member name</th>
                <th scope="col">Address</th>
                <th scope="col">Phone</th>
                <th scope="col"><span class="sr-only">Open member</span></th>
              </tr>
            </thead>
            <tbody>
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
                  <td class="row-actions">
                    <a
                      mat-icon-button
                      [routerLink]="['/masters/members', m.code]"
                      (click)="$event.stopPropagation()"
                      [attr.aria-label]="'View ' + m.name"
                      ><mat-icon>chevron_right</mat-icon></a
                    >
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="5">
                    <div class="empty-state" role="status">
                      <mat-icon class="empty-icon">{{
                        loading() ? 'hourglass_empty' : 'group'
                      }}</mat-icon>
                      <h3>{{ loading() ? 'Loading members' : 'No members found' }}</h3>
                      <p>
                        {{
                          loading()
                            ? 'Your member directory will appear here.'
                            : query()
                              ? 'Try a different name, member code or phone number.'
                              : 'Add your first member to start building your directory.'
                        }}
                      </p>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
      @if (members().length === limit) {
        <p class="hint">Showing the first {{ limit }} matches. Refine the search to see more.</p>
      }
    </div>
  `,
})
export class Members implements OnInit, OnDestroy {
  protected readonly auth = inject(AuthService);
  private readonly sb = inject(SupabaseService).client;
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);

  protected readonly limit = 100;
  protected readonly query = signal('');
  protected readonly members = signal<MemberSummary[]>([]);
  protected readonly loading = signal(true);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private requestId = 0;

  ngOnInit(): void {
    this.search();
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }

  protected onQuery(value: string): void {
    this.query.set(value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.search(), 250);
  }

  protected open(code: number): void {
    this.router.navigate(['/masters/members', code]);
  }

  protected address(m: MemberSummary): string {
    return [m.addr1, m.addr2, m.addr3, m.addr4].filter(Boolean).join(', ');
  }

  private async search(): Promise<void> {
    const id = ++this.requestId;
    const q = this.query().trim();
    this.loading.set(true);
    try {
      let request = this.sb
        .from('customers')
        .select('code, name, addr1, addr2, addr3, addr4, phone')
        .order('name')
        .limit(this.limit);
      if (q) {
        // PostgREST `or` filter syntax: strip characters that would break it.
        const safe = q.replace(/[,()*%\\]/g, ' ').trim();
        const filters = [`name.ilike.*${safe}*`, `phone.ilike.*${safe}*`];
        if (/^\d+$/.test(safe)) {
          filters.push(`code.eq.${safe}`);
        }
        request = request.or(filters.join(','));
      }
      const rows = await must(request);
      if (id === this.requestId) {
        this.members.set(rows);
      }
    } catch (err) {
      this.notify.error(err);
    } finally {
      if (id === this.requestId) {
        this.loading.set(false);
      }
    }
  }
}
