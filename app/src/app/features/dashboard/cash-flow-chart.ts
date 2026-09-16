import { DatePipe, DecimalPipe, formatDate } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  LOCALE_ID,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { DayFlow, niceScale } from './dashboard-data';

const HEIGHT = 236;
const TOP = 22;
const AXIS_BAND = 42;
const LEFT = 52;
const RIGHT = 8;
const PLOT = HEIGHT - TOP - AXIS_BAND;
const MAX_BAR = 24;
const GAP = 2;
const RADIUS = 4;

interface DayLayout extends DayFlow {
  bandX: number;
  bandWidth: number;
  center: number;
  receivedPath: string;
  paidPath: string;
  receivedTop: number;
  paidTop: number;
  receivedX: number;
  paidX: number;
  barWidth: number;
}

/** Column path with a rounded data end and a square baseline. */
function column(x: number, top: number, width: number, baseline: number): string {
  const height = baseline - top;
  if (height <= 0) return '';
  const r = Math.min(RADIUS, height, width / 2);
  return (
    `M${x},${baseline}V${top + r}Q${x},${top} ${x + r},${top}` +
    `H${x + width - r}Q${x + width},${top} ${x + width},${top + r}V${baseline}Z`
  );
}

/** Daily money in and out of cash and bank accounts, as grouped columns. */
@Component({
  selector: 'app-cash-flow-chart',
  imports: [DatePipe, DecimalPipe, MatButtonModule, MatIconModule],
  template: `
    <div class="chart-head">
      <ul class="legend" aria-label="Legend">
        <li><span class="swatch in"></span>Money in</li>
        <li><span class="swatch out"></span>Money out</li>
      </ul>
      <button mat-button type="button" (click)="showTable.set(!showTable())">
        <mat-icon>{{ showTable() ? 'bar_chart' : 'table_rows' }}</mat-icon>
        {{ showTable() ? 'Show chart' : 'Show table' }}
      </button>
    </div>

    @if (showTable()) {
      <div class="table-wrap" tabindex="0" role="region" aria-label="Money in and out by day">
        <table class="data-table">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col" class="num">Money in</th>
              <th scope="col" class="num">Money out</th>
            </tr>
          </thead>
          <tbody>
            @for (day of days(); track day.date) {
              <tr>
                <td>{{ day.date | date: 'EEE, dd-MMM-yyyy' }}</td>
                <td class="num">{{ day.received | number: '1.2-2' }}</td>
                <td class="num">{{ day.paid | number: '1.2-2' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <div class="plot" #plot (pointerleave)="active.set(null)">
        <svg
          [attr.width]="width()"
          [attr.height]="height"
          [attr.viewBox]="'0 0 ' + width() + ' ' + height"
          role="group"
          aria-label="Money in and out by day. Focus a day for its values, or show the table."
        >
          @for (tick of ticks(); track tick) {
            <line
              class="grid"
              [class.baseline]="tick === 0"
              [attr.x1]="left"
              [attr.x2]="width() - right"
              [attr.y1]="y(tick)"
              [attr.y2]="y(tick)"
            />
            <text class="tick" [attr.x]="left - 8" [attr.y]="y(tick)" dy="0.32em">
              {{ compact(tick) }}
            </text>
          }
          @for (day of layout(); track day.date; let i = $index; let last = $last) {
            @if (active() === i) {
              <rect
                class="band"
                [attr.x]="day.bandX"
                [attr.y]="top"
                [attr.width]="day.bandWidth"
                [attr.height]="plotHeight"
                rx="6"
              />
            }
            @if (day.receivedPath) {
              <path class="bar in" [attr.d]="day.receivedPath" />
            }
            @if (day.paidPath) {
              <path class="bar out" [attr.d]="day.paidPath" />
            }
            @if (last) {
              @if (day.received > 0) {
                <text
                  class="value"
                  [attr.x]="day.receivedX + day.barWidth / 2"
                  [attr.y]="day.receivedTop - 6"
                >
                  {{ compact(day.received) }}
                </text>
              }
              @if (day.paid > 0) {
                <text
                  class="value"
                  [attr.x]="day.paidX + day.barWidth / 2"
                  [attr.y]="day.paidTop - 6"
                >
                  {{ compact(day.paid) }}
                </text>
              }
            }
            <text
              class="axis"
              [class.today]="last"
              [attr.x]="day.center"
              [attr.y]="top + plotHeight + 17"
            >
              {{ last ? 'Today' : (day.date | date: 'EEE') }}
            </text>
            <text class="axis date" [attr.x]="day.center" [attr.y]="top + plotHeight + 33">
              {{ day.date | date: 'd MMM' }}
            </text>
            <rect
              class="hit"
              tabindex="0"
              role="img"
              [attr.x]="day.bandX"
              [attr.y]="0"
              [attr.width]="day.bandWidth"
              [attr.height]="height"
              [attr.aria-label]="describe(day)"
              (pointerenter)="active.set(i)"
              (focus)="active.set(i)"
              (blur)="active.set(null)"
            />
          }
        </svg>
        @if (activeDay(); as day) {
          <div class="tooltip" role="presentation" [style.left.px]="tooltipLeft()">
            <div class="tooltip-date">{{ day.date | date: 'EEE, d MMM yyyy' }}</div>
            <div class="tooltip-row">
              <span class="key in"></span><strong>{{ day.received | number: '1.2-2' }}</strong
              ><span>Money in</span>
            </div>
            <div class="tooltip-row">
              <span class="key out"></span><strong>{{ day.paid | number: '1.2-2' }}</strong
              ><span>Money out</span>
            </div>
          </div>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .chart-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 4px;
    }
    .legend {
      display: flex;
      gap: 16px;
      margin: 0;
      padding: 0;
      list-style: none;
      color: var(--app-muted);
      font-size: 12px;
    }
    .legend li {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .swatch {
      width: 10px;
      height: 10px;
      border-radius: 2px;
    }
    .swatch.in,
    .key.in {
      background: var(--app-flow-in);
    }
    .swatch.out,
    .key.out {
      background: var(--app-flow-out);
    }
    .plot {
      position: relative;
      min-width: 0;
    }
    svg {
      display: block;
      max-width: 100%;
      height: auto;
      overflow: visible;
    }
    .grid {
      stroke: var(--app-chart-grid);
      stroke-width: 1;
      shape-rendering: crispEdges;
    }
    .grid.baseline {
      stroke: var(--app-chart-axis);
    }
    text {
      fill: var(--app-muted);
      font-size: 11px;
    }
    .tick {
      text-anchor: end;
      font-variant-numeric: tabular-nums;
    }
    .axis {
      text-anchor: middle;
    }
    .axis.today {
      fill: var(--app-ink);
      font-weight: 600;
    }
    .axis.date {
      font-size: 10px;
    }
    .value {
      fill: var(--app-ink);
      font-size: 11px;
      font-weight: 600;
      text-anchor: middle;
    }
    .band {
      fill: var(--mat-sys-surface-container-low);
    }
    .bar.in {
      fill: var(--app-flow-in);
    }
    .bar.out {
      fill: var(--app-flow-out);
    }
    .hit {
      fill: transparent;
      cursor: default;
      outline: none;
    }
    .hit:focus-visible {
      stroke: var(--app-accent);
      stroke-width: 2;
    }
    .tooltip {
      position: absolute;
      top: 0;
      z-index: 2;
      min-width: 150px;
      padding: 8px 10px;
      border: 1px solid var(--app-border);
      border-radius: 8px;
      background: var(--app-surface);
      box-shadow: var(--app-shadow-pop);
      transform: translateX(-50%);
      pointer-events: none;
      font-size: 12px;
    }
    .tooltip-date {
      margin-bottom: 4px;
      color: var(--app-muted);
    }
    .tooltip-row {
      display: flex;
      align-items: center;
      gap: 8px;
      line-height: 1.8;
    }
    .tooltip-row strong {
      color: var(--app-ink);
      font-variant-numeric: tabular-nums;
    }
    .tooltip-row span:last-child {
      color: var(--app-muted);
    }
    .key {
      width: 12px;
      height: 2px;
      border-radius: 1px;
    }
    @media (forced-colors: active) {
      .bar.in {
        fill: CanvasText;
      }
      .bar.out {
        fill: GrayText;
      }
    }
  `,
})
export class CashFlowChart {
  readonly days = input.required<DayFlow[]>();

  protected readonly height = HEIGHT;
  protected readonly top = TOP;
  protected readonly plotHeight = PLOT;
  protected readonly left = LEFT;
  protected readonly right = RIGHT;
  protected readonly width = signal(640);
  protected readonly active = signal<number | null>(null);
  protected readonly showTable = signal(false);

  private readonly plotElement = viewChild<ElementRef<HTMLElement>>('plot');
  private readonly locale = inject(LOCALE_ID);
  private readonly compactFormat = new Intl.NumberFormat(this.locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  });
  private readonly decimalFormat = new Intl.NumberFormat(this.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  private readonly scale = computed(() =>
    niceScale(Math.max(0, ...this.days().flatMap((day) => [day.received, day.paid]))),
  );

  protected readonly ticks = computed(() => {
    const { max, step } = this.scale();
    return Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  });

  protected readonly layout = computed<DayLayout[]>(() => {
    const days = this.days();
    const plotWidth = Math.max(0, this.width() - LEFT - RIGHT);
    const bandWidth = days.length ? plotWidth / days.length : 0;
    const barWidth = Math.max(4, Math.min(MAX_BAR, (bandWidth * 0.62 - GAP) / 2));
    const baseline = TOP + PLOT;
    return days.map((day, index) => {
      const bandX = LEFT + index * bandWidth;
      const center = bandX + bandWidth / 2;
      const receivedX = center - GAP / 2 - barWidth;
      const paidX = center + GAP / 2;
      const receivedTop = this.barTop(day.received);
      const paidTop = this.barTop(day.paid);
      return {
        ...day,
        bandX,
        bandWidth,
        center,
        barWidth,
        receivedX,
        paidX,
        receivedTop,
        paidTop,
        receivedPath: column(receivedX, receivedTop, barWidth, baseline),
        paidPath: column(paidX, paidTop, barWidth, baseline),
      };
    });
  });

  protected readonly activeDay = computed(() => {
    const index = this.active();
    return index === null ? null : (this.layout()[index] ?? null);
  });

  protected readonly tooltipLeft = computed(() => {
    const day = this.activeDay();
    if (!day) return 0;
    const half = 85;
    return Math.min(Math.max(day.center, half), this.width() - half);
  });

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (typeof ResizeObserver === 'undefined') return;
      // The host is observed so the width is still tracked while the table view is shown.
      const observer = new ResizeObserver(() => {
        const width = this.plotElement()?.nativeElement.clientWidth || host.clientWidth;
        if (width) this.width.set(width);
      });
      observer.observe(host);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  protected y(value: number): number {
    return TOP + PLOT - (value / this.scale().max) * PLOT;
  }

  private barTop(value: number): number {
    if (!(value > 0)) return TOP + PLOT;
    // Keep the smallest non-zero amounts visible.
    return Math.min(this.y(value), TOP + PLOT - 2);
  }

  protected compact(value: number): string {
    return this.compactFormat.format(value);
  }

  protected describe(day: DayFlow): string {
    const date = formatDate(day.date, 'EEEE d MMMM', this.locale);
    return `${date}: money in ${this.decimalFormat.format(day.received)}, money out ${this.decimalFormat.format(day.paid)}`;
  }
}
