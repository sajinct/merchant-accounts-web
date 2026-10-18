import {
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { CompanyService } from '../core/company.service';
import { NotifyService } from '../core/notify.service';

/** Filters + Print/CSV toolbar + printable page with the company header. */
@Component({
  selector: 'app-report-shell',
  imports: [MatButtonModule, MatIconModule, MatProgressBarModule],
  template: `
    <div class="report-toolbar no-print">
      <div class="report-filters"><ng-content select="[filters]" /></div>
      <div class="report-actions">
        <button
          mat-stroked-button
          type="button"
          (click)="print()"
          [disabled]="!hasData() || loading() || preparingPdf()"
        >
          <mat-icon>print</mat-icon>{{ preparingPdf() ? 'Preparing PDF…' : 'Print / PDF' }}
        </button>
        <button
          mat-stroked-button
          type="button"
          (click)="csv.emit()"
          [disabled]="!hasData() || loading()"
        >
          <mat-icon>download</mat-icon> Export CSV
        </button>
      </div>
      @if (appleMobile) {
        <p class="hint" role="status">
          Opens a PDF. Use Share to print or Save to Files.
          @if (pdfUrl()) {
            <a [href]="pdfUrl()" target="_blank" rel="noopener">Open PDF</a>
          }
        </p>
      }
    </div>
    @if (loading()) {
      <mat-progress-bar mode="indeterminate" class="no-print" aria-label="Loading report" />
    }
    <section #reportPage class="report-page" [attr.aria-busy]="loading()">
      <header class="report-header">
        <div class="report-company">{{ company.settings()?.name || 'Merchant Accounts' }}</div>
        <div class="report-place">{{ company.settings()?.place }}</div>
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
  private readonly notify = inject(NotifyService);
  private readonly reportPage = viewChild.required<ElementRef<HTMLElement>>('reportPage');
  protected readonly appleMobile =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  protected readonly preparingPdf = signal(false);
  protected readonly pdfUrl = signal<string | null>(null);
  private readonly pdfUrls: string[] = [];

  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
  readonly loading = input(false);
  readonly hasData = input(false);
  readonly csv = output<void>();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.pdfUrls.forEach((url) => URL.revokeObjectURL(url)));
  }

  async print(): Promise<void> {
    if (!this.hasData() || this.loading() || this.preparingPdf()) return;
    if (!this.appleMobile) {
      window.print();
      return;
    }

    // iOS Home Screen apps can silently ignore window.print(). Reserve the preview
    // during the tap, before the lazy import, so Safari does not block the popup.
    const preview = window.open('', '_blank');
    if (preview) {
      preview.opener = null;
      preview.document.title = 'Preparing report PDF';
      preview.document.body.textContent = 'Preparing your report PDF…';
    }
    const snapshot = this.reportPage().nativeElement.cloneNode(true) as HTMLElement;
    this.preparingPdf.set(true);
    this.pdfUrl.set(null);
    try {
      const { createReportPdf } = await import('./report-pdf');
      const url = URL.createObjectURL(createReportPdf(snapshot));
      this.pdfUrls.push(url);
      this.pdfUrl.set(url);
      if (preview && !preview.closed) preview.location.replace(url);
    } catch {
      preview?.close();
      this.notify.error(new Error('Could not prepare the PDF. Please try again.'));
    } finally {
      this.preparingPdf.set(false);
    }
  }
}
