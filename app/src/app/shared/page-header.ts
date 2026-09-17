import { Component, input } from '@angular/core';

/** Page title block: eyebrow, heading, description, and optional actions on the right. */
@Component({
  selector: 'app-page-header',
  host: { class: 'page-header' },
  template: `
    <div class="page-heading">
      @if (eyebrow()) {
        <span class="eyebrow">{{ eyebrow() }}</span>
      }
      <h1>{{ heading() }}</h1>
      @if (description()) {
        <p class="page-description">{{ description() }}</p>
      }
      <ng-content select="[description]" />
    </div>
    <div class="page-header-actions"><ng-content /></div>
  `,
})
export class PageHeader {
  readonly eyebrow = input('');
  readonly heading = input.required<string>();
  readonly description = input('');
}
