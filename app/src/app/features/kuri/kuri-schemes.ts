import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { AuthService } from '../../core/auth.service';
import { NotifyService } from '../../core/notify.service';
import { PageHeader } from '../../shared/page-header';
import { EmptyState } from '../../shared/empty-state';
import { StatCard } from '../../shared/stat-card';
import { KuriService } from './kuri.service';
import { KuriSchemeListRow } from './kuri.models';

type StatusFilter = 'all' | 'draft' | 'active' | 'completed';

@Component({
  selector: 'app-kuri-schemes',
  imports: [
    StatCard,
    EmptyState,
    PageHeader,
    DatePipe,
    DecimalPipe,
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  template: `
    <div class="page">
      <app-page-header class="no-print" eyebrow="Kuri" heading="Schemes">
        @if (auth.canEdit()) {
          <a mat-stroked-button routerLink="/kuri/schemes/new"
            ><mat-icon>add</mat-icon> New Scheme</a
          >
        }
      </app-page-header>

      <div class="filter-row no-print">
        <mat-button-toggle-group
          class="status-filter"
          hideSingleSelectionIndicator
          [value]="status()"
          (change)="status.set($event.value)"
          aria-label="Filter by status"
        >
          <mat-button-toggle value="all">All</mat-button-toggle>
          <mat-button-toggle value="draft">Draft</mat-button-toggle>
          <mat-button-toggle value="active">Active</mat-button-toggle>
          <mat-button-toggle value="completed">Completed</mat-button-toggle>
        </mat-button-toggle-group>
        <mat-form-field subscriptSizing="dynamic" class="search-field">
          <mat-label>Search</mat-label>
          <mat-icon matPrefix>search</mat-icon>
          <input
            matInput
            placeholder="Scheme name"
            [value]="query()"
            (input)="query.set($any($event.target).value)"
          />
        </mat-form-field>
      </div>

      @if (!loading() && !rows().length) {
        <app-empty-state
          icon="event_note"
          heading="No schemes found"
          message="Create a new Kuri scheme to get started."
        />
      } @else {
        <div class="summary-grid">
          <app-stat-card
            label="Active schemes"
            icon="event_available"
            [value]="totals().activeSchemes"
          />
          <app-stat-card
            label="Total kuri value"
            icon="account_balance"
            [value]="totals().totalValue | number: '1.2-2'"
          />
          <app-stat-card
            label="Total collected"
            icon="savings"
            [value]="totals().totalCollected | number: '1.2-2'"
          />
        </div>

        <div class="table-wrap" tabindex="0" role="region" aria-label="Kuri schemes">
          <table class="report-table">
            <thead>
              <tr>
                <th>Name</th>
                <th class="num">Installment</th>
                <th class="num">Total Value</th>
                <th class="num">Members</th>
                <th class="num">Lots Drawn</th>
                <th>Status</th>
                <th>Start Date</th>
              </tr>
            </thead>
            <tbody>
              @for (row of filtered(); track row.id) {
                <tr class="clickable" (click)="open(row.id)">
                  <td>
                    <a
                      class="table-link"
                      [routerLink]="['/kuri/schemes', row.id]"
                      (click)="$event.stopPropagation()"
                      >{{ row.name }}</a
                    >
                  </td>
                  <td class="num">{{ row.installment_amount | number: '1.2-2' }}</td>
                  <td class="num">{{ row.total_value | number: '1.2-2' }}</td>
                  <td class="num">{{ row.enrolled_count }} / {{ row.num_members }}</td>
                  <td class="num">{{ row.lots_drawn }} / {{ row.num_members }}</td>
                  <td>
                    @if (row.status === 'active') {
                      <span class="status-badge success">Active</span>
                    } @else if (row.status === 'completed') {
                      <span class="status-badge neutral">Completed</span>
                    } @else {
                      <span class="status-badge neutral">Draft</span>
                    }
                  </td>
                  <td>{{ row.start_date ? (row.start_date | date: 'dd MMM yyyy') : '—' }}</td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="7">
                    <app-empty-state
                      [heading]="loading() ? 'Loading…' : 'No schemes match'"
                      [message]="loading() ? '' : 'Try another status or search.'"
                      status
                    />
                  </td>
                </tr>
              }
            </tbody>
            @if (filtered().length) {
              <tfoot>
                <tr>
                  <td>Total ({{ filtered().length }} schemes)</td>
                  <td class="num"></td>
                  <td class="num">{{ shownTotals().totalValue | number: '1.2-2' }}</td>
                  <td class="num">{{ shownTotals().enrolled }} / {{ shownTotals().members }}</td>
                  <td class="num"></td>
                  <td colspan="2"></td>
                </tr>
              </tfoot>
            }
          </table>
        </div>
      }
    </div>
  `,
  styles: `
    .filter-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 16px;
      margin-bottom: 20px;
    }
    .search-field {
      flex: 1 1 240px;
    }
    .summary-grid {
      margin: 0 0 20px;
    }
    tr.clickable {
      cursor: pointer;
    }
    @media (max-width: 720px) {
      .filter-row {
        flex-direction: column;
        align-items: stretch;
      }
      .search-field {
        flex: none;
        width: 100%;
      }
      .status-filter {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `,
})
export class KuriSchemes implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly kuri = inject(KuriService);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);

  protected readonly rows = signal<KuriSchemeListRow[]>([]);
  protected readonly status = signal<StatusFilter>('all');
  protected readonly query = signal('');
  protected readonly loading = signal(true);

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const st = this.status();
    return this.rows().filter((row) => {
      if (st !== 'all' && row.status !== st) return false;
      return !q || row.name.toLowerCase().includes(q);
    });
  });

  protected readonly totals = computed(() => {
    const activeRows = this.rows().filter((r) => r.status === 'active');
    return {
      activeSchemes: activeRows.length,
      totalValue: activeRows.reduce((sum, r) => sum + Number(r.total_value), 0),
      totalCollected: activeRows.reduce((sum, r) => sum + Number(r.total_collected), 0),
    };
  });

  protected readonly shownTotals = computed(() => {
    const rows = this.filtered();
    return {
      totalValue: rows.reduce((sum, r) => sum + Number(r.total_value), 0),
      enrolled: rows.reduce((sum, r) => sum + r.enrolled_count, 0),
      members: rows.reduce((sum, r) => sum + r.num_members, 0),
    };
  });

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    try {
      this.rows.set(await this.kuri.listSchemes());
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  protected open(id: number): void {
    this.router.navigate(['/kuri/schemes', id]);
  }
}
