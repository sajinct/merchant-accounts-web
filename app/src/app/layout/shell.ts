import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver } from '@angular/cdk/layout';
import { Location } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatDividerModule } from '@angular/material/divider';
import { AuthService } from '../core/auth.service';
import { CompanyService } from '../core/company.service';
import { NotifyService } from '../core/notify.service';
import { SUPPORT } from '../core/support';

interface NavItem {
  shortcut: string;
  label: string;
  link: string;
  icon: string;
  editorsOnly?: boolean;
  adminOnly?: boolean;
}

interface NavGroup {
  heading: string;
  icon: string;
  shortcut: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    heading: 'Transactions',
    icon: 'swap_horiz',
    shortcut: 'T',
    items: [
      {
        label: 'Payments / Receipts',
        shortcut: 'P',
        link: '/transactions/vouchers',
        icon: 'receipt_long',
      },
      {
        label: 'Day Book Posting',
        shortcut: 'D',
        link: '/transactions/daybook-posting',
        icon: 'publish',
        editorsOnly: true,
      },
      {
        label: 'Day Closing Balance',
        shortcut: 'C',
        link: '/transactions/day-closing',
        icon: 'event_available',
      },
    ],
  },
  {
    heading: 'Reports',
    icon: 'bar_chart',
    shortcut: 'R',
    items: [
      { label: 'Day Book', shortcut: 'D', link: '/reports/daybook', icon: 'menu_book' },
      { label: 'Ledger', shortcut: 'L', link: '/reports/ledger', icon: 'account_balance_wallet' },
      { label: 'Trial Balance', shortcut: 'T', link: '/reports/trial-balance', icon: 'balance' },
    ],
  },
  {
    heading: 'Membership',
    icon: 'groups',
    shortcut: 'M',
    items: [
      { label: 'Members', shortcut: 'M', link: '/masters/members', icon: 'group' },
      {
        label: 'Subscriptions',
        shortcut: 'S',
        link: '/membership/subscriptions',
        icon: 'card_membership',
      },
      {
        label: 'Subscription Fees',
        shortcut: 'F',
        link: '/membership/fees',
        icon: 'price_change',
        adminOnly: true,
      },
    ],
  },
  {
    heading: 'Masters',
    icon: 'folder_open',
    shortcut: 'A',
    items: [
      { label: 'Account Heads', shortcut: 'A', link: '/masters/account-heads', icon: 'list_alt' },
    ],
  },
  {
    heading: 'Utilities',
    icon: 'settings',
    shortcut: 'U',
    items: [
      {
        label: 'Company Settings',
        shortcut: 'C',
        link: '/admin/settings',
        icon: 'business',
        adminOnly: true,
      },
      {
        label: 'Users',
        shortcut: 'U',
        link: '/admin/users',
        icon: 'manage_accounts',
        adminOnly: true,
      },
      { label: 'Change Password', shortcut: 'P', link: '/account/password', icon: 'lock' },
    ],
  },
];

@Component({
  selector: 'app-shell',
  host: { '(document:keydown)': 'onNavigationKey($event)' },
  imports: [
    RouterOutlet,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatSidenavModule,
    MatDividerModule,
  ],
  styleUrl: './shell.scss',
  template: `
    <a
      class="skip-link no-print"
      href="#main-content"
      (click)="$event.preventDefault(); main.focus()"
      >Skip to main content</a
    >
    <mat-sidenav-container class="workspace-shell" (backdropClick)="drawerOpen.set(false)">
      <mat-sidenav
        id="workspace-navigation"
        [mode]="isMobile() ? 'over' : 'side'"
        [opened]="drawerOpen()"
        [disableClose]="true"
        (closedStart)="drawerOpen.set(false)"
        class="workspace-nav no-print"
      >
        <a
          class="brand"
          routerLink="/"
          (click)="closeMobileNav()"
          aria-label="Merchant Accounts home"
        >
          <img class="brand-mark" src="favicon.svg" alt="" width="39" height="39" />
          <span class="brand-name">Merchant<span>ACCOUNTS</span></span>
        </a>
        <nav #navigation class="sidebar-links" aria-label="Main navigation">
          @if (selectedGroup(); as group) {
            <button type="button" class="nav-link nav-back" (click)="backToGroups()">
              <mat-icon>arrow_back</mat-icon><span>Back to all menus</span><kbd>Esc</kbd>
            </button>
            <div class="nav-heading" aria-live="polite">{{ group.heading }}</div>
            @for (item of group.items; track item.link) {
              @if (visible(item)) {
                <a
                  class="nav-link"
                  [href]="menuHref(item)"
                  [attr.aria-keyshortcuts]="item.shortcut"
                  [class.is-active]="itemActive(item)"
                  [attr.aria-current]="itemActive(item) ? 'page' : null"
                  (click)="selectItem($event, item)"
                >
                  <mat-icon>{{ item.icon }}</mat-icon>
                  <span>{{ item.label }}</span
                  ><kbd>{{ item.shortcut }}</kbd>
                </a>
              }
            }
          } @else {
            <div class="nav-heading" aria-live="polite">All menus</div>
            <button
              type="button"
              class="nav-link nav-home"
              (click)="goDashboard()"
              aria-keyshortcuts="D"
            >
              <mat-icon>space_dashboard</mat-icon><span>Dashboard</span><kbd>D</kbd>
            </button>
            @for (group of visibleGroups(); track group.heading) {
              <button
                type="button"
                class="nav-link nav-group"
                [class.is-active]="context().heading === group.heading"
                [attr.data-group]="group.shortcut"
                [attr.aria-keyshortcuts]="group.shortcut"
                [attr.aria-label]="group.heading + ', shortcut ' + group.shortcut"
                (click)="openGroup(group)"
              >
                <mat-icon>{{ group.icon }}</mat-icon
                ><span>{{ group.heading }}</span> <kbd>{{ group.shortcut }}</kbd
                ><mat-icon class="nav-chevron">chevron_right</mat-icon>
              </button>
            }
          }
          <p class="nav-hint">
            Press a letter shown in this menu.<br />Esc returns to all menus.
            <label class="shortcut-toggle"
              ><input
                type="checkbox"
                [checked]="letterShortcuts()"
                (change)="letterShortcuts.set(!letterShortcuts())"
              />
              Letter shortcuts</label
            >
          </p>
        </nav>
      </mat-sidenav>
      <mat-sidenav-content class="workspace-content">
        <header class="workspace-topbar no-print">
          <button
            mat-icon-button
            type="button"
            (click)="drawerOpen.set(!drawerOpen())"
            [attr.aria-label]="drawerOpen() ? 'Close navigation' : 'Open navigation'"
            [attr.aria-expanded]="drawerOpen()"
            aria-controls="workspace-navigation"
          >
            <mat-icon>menu</mat-icon>
          </button>
          <div class="topbar-company">
            <strong>{{ company.settings()?.name || 'Merchant Accounts' }}</strong>
            <span>{{ company.settings()?.place || 'Accounting workspace' }}</span>
          </div>
          <span class="spacer"></span>
          <button
            class="user-control"
            type="button"
            [matMenuTriggerFor]="userMenu"
            aria-label="Open account menu"
          >
            <span class="user-avatar">{{ initials() }}</span>
            <span class="user-details"
              ><strong>{{ userName() }}</strong
              ><span>{{ auth.role() || 'Account' }}</span></span
            >
            <mat-icon class="user-chevron">expand_more</mat-icon>
          </button>
          <mat-menu #userMenu="matMenu">
            <div mat-menu-item disabled>Signed in as {{ auth.role() }}</div>
            <a mat-menu-item routerLink="/account/password"
              ><mat-icon>lock_outline</mat-icon> Change password</a
            >
            <mat-divider />
            <div mat-menu-item disabled>Inzoft support</div>
            <a
              mat-menu-item
              [href]="support.website"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Visit inzoft.com (opens in a new tab)"
            >
              <mat-icon>language</mat-icon>{{ support.websiteLabel }}
            </a>
            <a mat-menu-item [href]="'mailto:' + support.email">
              <mat-icon>mail_outline</mat-icon>{{ support.email }}
            </a>
            <a
              mat-menu-item
              [href]="support.whatsapp"
              target="_blank"
              rel="noopener noreferrer"
              [attr.aria-label]="'WhatsApp support at ' + support.phone + ' (opens in a new tab)'"
            >
              <mat-icon>chat_bubble_outline</mat-icon>WhatsApp · {{ support.phone }}
            </a>
            <mat-divider />
            <button mat-menu-item type="button" (click)="signOut()">
              <mat-icon>logout</mat-icon> Sign out
            </button>
          </mat-menu>
        </header>
        <div class="workspace-breadcrumb no-print" aria-label="Current location">
          <mat-icon>grid_view</mat-icon><span>{{ context().heading }}</span
          ><mat-icon>chevron_right</mat-icon>
          <strong>{{ context().label }}</strong>
        </div>
        <main #main id="main-content" tabindex="-1"><router-outlet /></main>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
})
export class Shell implements OnInit {
  protected readonly support = SUPPORT;
  protected readonly auth = inject(AuthService);
  protected readonly company = inject(CompanyService);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly breakpoints = inject(BreakpointObserver);

  private readonly injector = inject(Injector);
  private readonly mainContent = viewChild<ElementRef<HTMLElement>>('main');
  private readonly navigation = viewChild<ElementRef<HTMLElement>>('navigation');
  protected readonly letterShortcuts = signal(true);
  protected readonly selectedGroup = signal<NavGroup | null>(null);
  protected readonly visibleGroups = computed(() =>
    NAV.filter((group) => group.items.some((item) => this.visible(item))),
  );

  protected openGroup(group: NavGroup): void {
    this.selectedGroup.set(group);
    this.drawerOpen.set(true);
    this.focusNavigation('.nav-back');
  }

  protected backToGroups(): void {
    const previous = this.selectedGroup();
    this.selectedGroup.set(null);
    if (previous) this.focusNavigation(`[data-group="${previous.shortcut}"]`);
  }

  private focusNavigation(selector: string): void {
    afterNextRender(
      () => this.navigation()?.nativeElement.querySelector<HTMLElement>(selector)?.focus(),
      { injector: this.injector },
    );
  }

  protected onNavigationKey(event: KeyboardEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    if (
      event.defaultPrevented ||
      event.repeat ||
      event.isComposing ||
      document.querySelector('.cdk-overlay-container .cdk-overlay-pane')
    )
      return;
    if (event.key === 'Escape' && !this.drawerOpen()) {
      event.preventDefault();
      this.drawerOpen.set(true);
      this.focusNavigation(this.selectedGroup() ? '.nav-back' : '.nav-group');
      return;
    }
    if (event.key === 'Escape' && this.drawerOpen() && this.selectedGroup()) {
      event.preventDefault();
      this.backToGroups();
      return;
    }
    if (event.key === 'Escape' && this.drawerOpen()) {
      event.preventDefault();
      this.goDashboard();
      return;
    }
    if (
      !this.drawerOpen() ||
      !this.letterShortcuts() ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      target?.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
      )
    )
      return;
    const key = event.key.toUpperCase();
    const selected = this.selectedGroup();
    if (!selected && key === 'D') {
      event.preventDefault();
      this.goDashboard();
      return;
    }
    // Letters are unique within each menu; hidden or unauthorized children cannot activate.
    if (selected && this.drawerOpen()) {
      const item = selected.items.find((entry) => entry.shortcut === key && this.visible(entry));
      if (item) {
        event.preventDefault();
        void this.activateItem(item);
      }
    } else {
      const group = this.visibleGroups().find((entry) => entry.shortcut === key);
      if (group) {
        event.preventDefault();
        this.openGroup(group);
      }
    }
  }
  protected selectItem(event: MouseEvent, item: NavItem): void {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    void this.activateItem(item);
  }
  protected goDashboard(): void {
    this.selectedGroup.set(null);
    void this.activateItem({
      label: 'Dashboard',
      link: '/dashboard',
      icon: 'space_dashboard',
      shortcut: 'D',
    });
  }

  protected menuHref(item: NavItem): string {
    return this.location.prepareExternalUrl(
      this.router.serializeUrl(this.router.createUrlTree([item.link])),
    );
  }

  protected itemActive(item: NavItem): boolean {
    const path = this.currentUrl().split('?')[0];
    return path === item.link || path.startsWith(item.link + '/');
  }

  private async activateItem(item: NavItem): Promise<void> {
    try {
      const samePage = this.router.url === item.link;
      const navigated = await this.router.navigateByUrl(item.link);
      if (!navigated && !samePage) return;
      this.drawerOpen.set(false);
      afterNextRender(
        () => {
          const main = this.mainContent()?.nativeElement;
          if (!main) return;
          const controls = main.querySelectorAll<HTMLElement>(
            'input:not([type="hidden"]):not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled]):not([readonly]), [role="combobox"][tabindex="0"]',
          );
          const first = Array.from(controls).find((control) => {
            for (
              let node: HTMLElement | null = control;
              node && node !== main;
              node = node.parentElement
            ) {
              if (
                node.matches('[hidden], [inert], [aria-hidden="true"]') ||
                getComputedStyle(node).display === 'none' ||
                getComputedStyle(node).visibility === 'hidden'
              )
                return false;
            }
            return true;
          });
          (first ?? main).focus();
        },
        { injector: this.injector },
      );
    } catch (err) {
      this.notify.error(err);
    }
  }
  protected readonly isMobile = signal(this.breakpoints.isMatched('(max-width: 959px)'));
  protected readonly drawerOpen = signal(!this.isMobile());
  protected readonly userName = computed(
    () => this.auth.profile()?.full_name || this.auth.profile()?.username || 'My account',
  );
  protected readonly initials = computed(() =>
    this.userName()
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase(),
  );
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  protected readonly context = computed(() => {
    const url = this.currentUrl().split('?')[0];
    if (url === '/dashboard') return { heading: 'Workspace', label: 'Dashboard' };
    for (const group of NAV) {
      const item = group.items.find(
        (entry) => url === entry.link || url.startsWith(entry.link + '/'),
      );
      if (item) return { heading: group.heading, label: item.label };
    }
    return { heading: 'Workspace', label: 'Overview' };
  });

  constructor() {
    this.breakpoints
      .observe('(max-width: 959px)')
      .pipe(takeUntilDestroyed())
      .subscribe(({ matches }) => {
        this.isMobile.set(matches);
        this.drawerOpen.set(!matches);
      });
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.closeMobileNav());
  }

  protected closeMobileNav(): void {
    if (this.isMobile()) this.drawerOpen.set(false);
  }

  ngOnInit(): void {
    this.company.load().catch((err) => this.notify.error(err));
  }

  protected visible(item: NavItem): boolean {
    if (item.adminOnly) {
      return this.auth.isAdmin();
    }
    if (item.editorsOnly) {
      return this.auth.canEdit();
    }
    return true;
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigate(['/login']);
  }
}
