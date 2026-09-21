import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { NotifyService } from '../../core/notify.service';
import { downloadCsv } from '../../shared/csv';
import { EmptyState } from '../../shared/empty-state';
import { EnterToNext } from '../../shared/enter-to-next.directive';
import { PageHeader } from '../../shared/page-header';
import { ReportShell } from '../../shared/report-shell';
import { KuriService } from './kuri.service';
import { KuriDefaulterRow, KuriSchemeListRow } from './kuri.models';

@Component({
  selector: 'app-kuri-defaulters',
  imports: [
    DecimalPipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    EnterToNext,
    EmptyState,
    PageHeader,
    ReportShell,
  ],
  template: `
    <div class="page">
      <app-page-header
        class="no-print"
        eyebrow="Kuri"
        heading="Defaulters"
        description="Who still owes money for an installment, with the phone numbers to chase it."
      />

      <app-report-shell
        title="Kuri Defaulters"
        [subtitle]="subtitle()"
        [loading]="loading()"
        [hasData]="rows().length > 0"
        (csv)="exportCsv()"
      >
        <form appEnterToNext filters [formGroup]="form" (ngSubmit)="run()" class="filter-row">
          <mat-form-field subscriptSizing="dynamic" class="scheme-select">
            <mat-label>Scheme</mat-label>
            <mat-select formControlName="scheme">
              @for (scheme of schemes(); track scheme.id) {
                <mat-option [value]="scheme.id">{{ scheme.name }}</mat-option>
              }
            </mat-select>
            @if (!loadingSchemes() && !schemes().length) {
              <mat-hint>No schemes have been created yet.</mat-hint>
            }
          </mat-form-field>

          <mat-form-field subscriptSizing="dynamic">
            <mat-label>Installment</mat-label>
            <mat-select formControlName="installment">
              @for (no of installments(); track no) {
                <mat-option [value]="no">{{ no }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <button mat-flat-button type="submit" [disabled]="form.invalid || loading()">
            <mat-icon>play_arrow</mat-icon>{{ loading() ? 'Loading…' : 'Run report' }}
          </button>
        </form>

        @if (ran() && !loading() && !rows().length) {
          <app-empty-state
            icon="task_alt"
            heading="Nobody is behind"
            message="Every ticket has paid this installment in full."
          />
        }

        @if (!loading() && rows().length) {
          <div class="table-wrap" role="region" tabindex="0" aria-label="Kuri defaulters">
            <table class="report-table">
              <thead>
                <tr>
                  <th scope="col">Tkt #</th>
                  <th scope="col">Member</th>
                  <th scope="col">Phone</th>
                  <th scope="col" class="num">Due</th>
                  <th scope="col" class="num">Paid</th>
                  <th scope="col" class="num">Balance</th>
                </tr>
              </thead>
              <tbody>
                @for (row of rows(); track row.member_id) {
                  <tr>
                    <td>{{ row.ticket_no }}</td>
                    <td>{{ row.customer_name }}</td>
                    <td>{{ row.phone || '—' }}</td>
                    <td class="num">{{ row.amount_due | number: '1.2-2' }}</td>
                    <td class="num">{{ row.amount_paid | number: '1.2-2' }}</td>
                    <td class="num">{{ row.balance | number: '1.2-2' }}</td>
                  </tr>
                }
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="3">Total ({{ rows().length }} tickets)</td>
                  <td class="num">{{ totals().due | number: '1.2-2' }}</td>
                  <td class="num">{{ totals().paid | number: '1.2-2' }}</td>
                  <td class="num">{{ totals().balance | number: '1.2-2' }}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        }

        @if (loading()) {
          <app-empty-state class="no-print" message="Preparing your report…" status />
        } @else if (!ran()) {
          <app-empty-state
            class="no-print"
            icon="groups"
            heading="Your report starts here"
            message="Pick a scheme and an installment, then run the report."
          />
        }
      </app-report-shell>
    </div>
  `,
  styles: `
    .scheme-select {
      min-width: 220px;
    }
    .report-table {
      min-width: 640px;
    }
    @media print {
      .report-table {
        min-width: 0;
      }
    }
  `,
})
export class KuriDefaulters implements OnInit {
  private readonly kuri = inject(KuriService);
  private readonly notify = inject(NotifyService);

  protected readonly schemes = signal<KuriSchemeListRow[]>([]);
  protected readonly loadingSchemes = signal(true);
  protected readonly rows = signal<KuriDefaulterRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly ran = signal(false);
  protected readonly subtitle = signal('');

  protected readonly form = inject(FormBuilder).nonNullable.group({
    scheme: [0, [Validators.required, Validators.min(1)]],
    installment: [1, [Validators.required, Validators.min(1)]],
  });

  private readonly formValue = signal(this.form.getRawValue());

  /** The installment picker only offers what the chosen scheme actually runs for. */
  protected readonly installments = computed(() => {
    const scheme = this.schemes().find((s) => s.id === this.formValue().scheme);
    if (!scheme) return [];
    return Array.from({ length: scheme.num_installments }, (_, i) => i + 1);
  });

  protected readonly totals = computed(() =>
    this.rows().reduce(
      (sum, row) => ({
        due: sum.due + Number(row.amount_due),
        paid: sum.paid + Number(row.amount_paid),
        balance: sum.balance + Number(row.balance),
      }),
      { due: 0, paid: 0, balance: 0 },
    ),
  );

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      const previous = this.formValue();
      const current = this.form.getRawValue();
      this.formValue.set(current);
      // A different scheme invalidates both the installment choice and the results on screen.
      if (current.scheme !== previous.scheme) {
        this.form.controls.installment.setValue(1, { emitEvent: false });
        this.formValue.set(this.form.getRawValue());
        this.invalidate();
      } else if (current.installment !== previous.installment) {
        this.invalidate();
      }
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      this.schemes.set(await this.kuri.listSchemes());
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.loadingSchemes.set(false);
    }
  }

  private invalidate(): void {
    this.ran.set(false);
    this.rows.set([]);
  }

  protected async run(): Promise<void> {
    if (this.form.invalid || this.loading()) return;
    const { scheme: schemeId, installment } = this.form.getRawValue();
    const scheme = this.schemes().find((s) => s.id === schemeId);
    this.loading.set(true);
    try {
      this.rows.set(await this.kuri.getDefaulters(schemeId, installment));
      this.subtitle.set(
        `${scheme?.name ?? 'Scheme ' + schemeId} — installment ${installment} of ${scheme?.num_installments ?? installment}`,
      );
      this.ran.set(true);
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  protected exportCsv(): void {
    downloadCsv(
      'kuri-defaulters.csv',
      ['Ticket', 'Member code', 'Member', 'Phone', 'Due', 'Paid', 'Balance'],
      this.rows().map((row) => [
        row.ticket_no,
        row.customer_code,
        row.customer_name,
        row.phone,
        row.amount_due,
        row.amount_paid,
        row.balance,
      ]),
    );
  }
}
