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

type MemberSummary = Pick<Customer, 'code' | 'name' | 'addr1' | 'addr2' | 'addr3' | 'addr4' | 'phone'>;

@Component({
  selector: 'app-members',
  imports: [RouterLink, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Members</h1>
        @if (auth.canEdit()) {
          <a mat-flat-button routerLink="/masters/members/new"><mat-icon>person_add</mat-icon> New member</a>
        }
      </div>

      <mat-form-field class="search-field" subscriptSizing="dynamic">
        <mat-label>Search by name, code or phone</mat-label>
        <input matInput [value]="query()" (input)="onQuery($any($event.target).value)" />
        <mat-icon matSuffix>search</mat-icon>
      </mat-form-field>

      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th class="num">Code</th><th>Name</th><th>Address</th><th>Phone</th></tr></thead>
          <tbody>
            @for (m of members(); track m.code) {
              <tr class="clickable" (click)="open(m.code)">
                <td class="num">{{ m.code }}</td>
                <td>{{ m.name }}</td>
                <td>{{ address(m) }}</td>
                <td>{{ m.phone }}</td>
              </tr>
            } @empty {
              <tr><td colspan="4" class="empty">{{ loading() ? 'Loading…' : 'No members found.' }}</td></tr>
            }
          </tbody>
        </table>
      </div>
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
