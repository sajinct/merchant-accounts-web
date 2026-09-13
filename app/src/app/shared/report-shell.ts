import { Component, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { CompanyService } from '../core/company.service';

/** Filters + Print/CSV toolbar + printable page with the company header. */
@Component({
  selector: 'app-report-shell',
  imports: [MatButtonModule, MatIconModule, MatProgressBarModule],
  template: `
    <div class="report-toolbar no-print">
      <div class="report-filters"><ng-content select="[filters]" /></div>
      <div class="report-actions">
        <button mat-stroked-button type="button" (click)="print()" [disabled]="!hasData()">
          <mat-icon>print</mat-icon> Print / PDF
        </button>
        <button mat-stroked-button type="button" (click)="csv.emit()" [disabled]="!hasData()">
          <mat-icon>download</mat-icon> CSV
        </button>
      </div>
    </div>
    @if (loading()) {
      <mat-progress-bar mode="indeterminate" class="no-print" />
    }
    <section class="report-page">
      <header class="report-header">
        <div class="report-company">{{ company.settings()?.name }}</div>
        <div>{{ company.settings()?.place }}</div>
        <h2>{{ title() }}</h2>
        @if (subtitle()) {
          <div class="report-subtitle">{{ subtitle() }}</div>
        }
      </header>
      <ng-content />
    </section>
  `,
})
export class ReportShell {
  protected readonly company = inject(CompanyService);

  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
  readonly loading = input(false);
  readonly hasData = input(false);
  readonly csv = output<void>();

  print(): void {
    window.print();
  }
}
