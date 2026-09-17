import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { AuthService } from '../core/auth.service';
import { ShortcutsService } from '../core/shortcuts.service';
import { NAV, NavItem } from '../layout/navigation';

@Component({
  selector: 'app-shortcuts-dialog',
  imports: [MatButtonModule, MatDialogModule, MatIconModule, MatSlideToggleModule],
  template: `
    <h2 mat-dialog-title>Keyboard shortcuts</h2>
    <mat-dialog-content>
      <dl class="rules">
        <div>
          <dt><kbd>Esc</kbd></dt>
          <dd>Opens the menu from a page, closes an open group, then returns to the Dashboard.</dd>
        </div>
        <div>
          <dt><kbd>D</kbd></dt>
          <dd>Opens the Dashboard while the menu is showing.</dd>
        </div>
        <div>
          <dt><kbd>Enter</kbd></dt>
          <dd>
            Moves to the next entry field, then to Save. Press Enter on a button to activate it.
          </dd>
        </div>
        <div>
          <dt><kbd>Shift</kbd> + <kbd>Enter</kbd></dt>
          <dd>Returns to the previous entry field.</dd>
        </div>
        <div>
          <dt><kbd>↑</kbd> / <kbd>↓</kbd></dt>
          <dd>
            Moves between controls. In voucher lines, moves to the same column in the previous or
            next row.
          </dd>
        </div>
        <div>
          <dt><kbd>←</kbd> / <kbd>→</kbd></dt>
          <dd>
            Moves between controls at the start or end of text. Within text, moves the cursor.
          </dd>
        </div>
        <div>
          <dt><kbd>Tab</kbd></dt>
          <dd>
            Moves through all controls; Shift + Tab goes back. Use this for calendar buttons and
            other extra actions.
          </dd>
        </div>
        <div>
          <dt><kbd>Ctrl</kbd> + <kbd>S</kbd></dt>
          <dd>Saves the voucher you are entering.</dd>
        </div>
      </dl>
      <p class="hint">
        In a dropdown, use the arrows to choose and Enter to confirm and continue. Escape closes it.
        Text areas keep normal text editing and newlines.
      </p>

      <h3>Menu letters</h3>
      <p class="hint">
        With the menu open, press a group letter, then the letter beside the page you want.
      </p>
      @for (group of groups; track group.heading) {
        <div class="group">
          <div class="group-head">
            <kbd>{{ group.shortcut }}</kbd>
            <strong>{{ group.heading }}</strong>
          </div>
          <ul>
            @for (item of group.items; track item.link) {
              @if (visible(item)) {
                <li>
                  <kbd>{{ item.shortcut }}</kbd>
                  <span>{{ item.label }}</span>
                </li>
              }
            }
          </ul>
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <mat-slide-toggle
        class="toggle"
        [checked]="shortcuts.letterShortcuts()"
        (change)="shortcuts.toggle()"
        >Letter shortcuts</mat-slide-toggle
      >
      <button mat-flat-button mat-dialog-close>Close</button>
    </mat-dialog-actions>
  `,
  styles: `
    .rules {
      margin: 0 0 20px;
    }
    .rules div {
      display: flex;
      gap: 12px;
      padding: 5px 0;
    }
    .rules dt {
      flex: 0 0 112px;
      white-space: nowrap;
    }
    .rules dd {
      margin: 0;
      color: var(--app-muted);
      font-size: 12px;
      line-height: 1.6;
    }
    @media (max-width: 420px) {
      .rules div {
        flex-direction: column;
        gap: 4px;
        padding: 7px 0;
      }
      .rules dt {
        flex-basis: auto;
      }
    }
    h3 {
      margin: 0 0 4px;
      font-size: 13px;
      font-weight: 650;
    }
    .hint {
      margin: 0 0 14px;
    }
    .group {
      padding: 10px 0;
      border-top: 1px solid var(--app-border);
    }
    .group-head {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
      font-size: 12px;
    }
    .group ul {
      display: grid;
      gap: 4px;
      margin: 0;
      padding: 0 0 0 26px;
      list-style: none;
    }
    .group li {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--app-muted);
      font-size: 12px;
    }
    kbd {
      display: inline-grid;
      place-items: center;
      min-width: 22px;
      padding: 2px 5px;
      border: 1px solid var(--app-border);
      border-radius: 5px;
      background: var(--app-surface-muted);
      color: var(--app-ink);
      font: inherit;
      font-size: 11px;
      font-weight: 600;
    }
    mat-dialog-actions {
      justify-content: space-between;
      gap: 12px;
      padding: 12px 24px 20px;
    }
    .toggle {
      margin-right: auto;
      font-size: 12px;
    }
  `,
})
export class ShortcutsDialog {
  protected readonly shortcuts = inject(ShortcutsService);
  private readonly auth = inject(AuthService);
  protected readonly groups = NAV;

  protected visible(item: NavItem): boolean {
    if (item.adminOnly) return this.auth.isAdmin();
    if (item.editorsOnly) return this.auth.canEdit();
    return true;
  }
}

export function openShortcuts(dialog: MatDialog): void {
  if (!dialog.getDialogById('shortcuts')) {
    dialog.open(ShortcutsDialog, {
      id: 'shortcuts',
      width: '480px',
      maxWidth: 'calc(100vw - 32px)',
    });
  }
}
