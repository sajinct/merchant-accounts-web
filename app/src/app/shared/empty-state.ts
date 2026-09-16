import { booleanAttribute, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * Placeholder shown where content would be: nothing found, nothing yet, or a
 * failure. Without an icon or heading it reads as a plain status line.
 */
@Component({
  selector: 'app-empty-state',
  host: { class: 'empty-state', '[attr.role]': "status() ? 'status' : null" },
  imports: [MatIconModule],
  template: `
    @if (icon()) {
      <div class="empty-icon">
        <mat-icon>{{ icon() }}</mat-icon>
      </div>
    }
    @if (heading()) {
      <h3>{{ heading() }}</h3>
    }
    @if (message()) {
      <p>{{ message() }}</p>
    }
    <ng-content />
  `,
})
export class EmptyState {
  readonly icon = input('');
  readonly heading = input('');
  readonly message = input('');
  /** Announces the text to screen readers when it replaces content that was loading. */
  readonly status = input(false, { transform: booleanAttribute });
}
