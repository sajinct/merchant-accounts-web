import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CompanyService } from '../core/company.service';
import { NotifyService } from '../core/notify.service';
import { ReportShell } from './report-shell';

describe('ReportShell printing', () => {
  const originalAgent = navigator.userAgent;
  const notify = { error: vi.fn() };
  const createUrl = vi.fn((_blob: Blob | MediaSource) => 'blob:report-pdf');
  const revokeUrl = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [ReportShell],
      providers: [
        { provide: CompanyService, useValue: { settings: signal({ name: 'Test Association' }) } },
        { provide: NotifyService, useValue: notify },
      ],
    });
    vi.spyOn(URL, 'createObjectURL').mockImplementation(createUrl);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeUrl);
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: originalAgent });
    vi.restoreAllMocks();
  });

  function render(iphone = false) {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: iphone ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' : originalAgent,
    });
    const fixture = TestBed.createComponent(ReportShell);
    fixture.componentRef.setInput('title', 'Trial Balance');
    fixture.componentRef.setInput('hasData', true);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.report-page').insertAdjacentHTML(
      'beforeend',
      `
      <table class="report-table"><thead><tr><th>Account</th><th>Credit</th></tr></thead>
      <tbody><tr><td>Subscriptions</td><td class="num">1,23,456.78</td></tr></tbody>
      <tfoot><tr><td>Total</td><td class="num">1,23,456.78</td></tr></tfoot></table>`,
    );
    return fixture;
  }

  it('reserves an iPhone preview during the tap and navigates it to a real PDF', async () => {
    const fixture = render(true);
    const preview = {
      opener: window,
      closed: false,
      document: { title: '', body: { textContent: '' } },
      location: { replace: vi.fn() },
      close: vi.fn(),
    };
    const open = vi.spyOn(window, 'open').mockReturnValue(preview as unknown as Window);
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const result = fixture.componentInstance.print();
    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(preview.location.replace).not.toHaveBeenCalled();
    await result;
    expect(createUrl.mock.calls[0][0]).toMatchObject({ type: 'application/pdf' });
    expect(preview.location.replace).toHaveBeenCalledWith('blob:report-pdf');
    expect(print).not.toHaveBeenCalled();
    fixture.destroy();
    expect(revokeUrl).toHaveBeenCalledWith('blob:report-pdf');
  });

  it('provides an explicit PDF link if a popup is blocked', async () => {
    const fixture = render(true);
    vi.spyOn(window, 'open').mockReturnValue(null);
    await fixture.componentInstance.print();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toBe('blob:report-pdf');
    expect(notify.error).not.toHaveBeenCalled();
  });

  it('ignores repeated taps while preparing a PDF', async () => {
    const fixture = render(true);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const result = fixture.componentInstance.print();
    await fixture.componentInstance.print();
    await result;
    expect(open).toHaveBeenCalledOnce();
  });

  it('reports generation failures and allows another attempt', async () => {
    const fixture = render(true);
    vi.spyOn(window, 'open').mockReturnValue(null);
    fixture.nativeElement.querySelector('.report-table').remove();
    await fixture.componentInstance.print();
    fixture.detectChanges();
    expect(notify.error).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.querySelector('.report-actions button').disabled).toBe(false);
    expect(fixture.nativeElement.querySelector('a')).toBeNull();
  });

  it('keeps browser printing on other devices', async () => {
    const fixture = render();
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const open = vi.spyOn(window, 'open');
    await fixture.componentInstance.print();
    expect(print).toHaveBeenCalledOnce();
    expect(open).not.toHaveBeenCalled();
  });

  it('does not open previews for loading or empty reports', async () => {
    const fixture = render(true);
    const open = vi.spyOn(window, 'open');
    fixture.componentRef.setInput('loading', true);
    await fixture.componentInstance.print();
    fixture.componentRef.setInput('loading', false);
    fixture.componentRef.setInput('hasData', false);
    await fixture.componentInstance.print();
    expect(open).not.toHaveBeenCalled();
  });
});
