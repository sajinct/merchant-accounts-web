const fs = require('fs');
let content = fs.readFileSync('app/src/app/features/membership/subscription-fees.ts', 'utf8');

const joinPanel = `
      <form
        class="panel"
        aria-labelledby="join-head-heading"
        appEnterToNext
        (submit)="$event.preventDefault(); saveJoiningFee()"
      >
        <div class="panel-header">
          <h2 id="join-head-heading">Joining fee</h2>
          <span class="hint">Default fee for new members and receipt account</span>
        </div>
        <div class="panel-body">
          <div class="form-grid">
            <mat-form-field>
              <mat-label>Joining fee amount</mat-label>
              <input matInput type="number" min="0" step="0.01" [value]="joiningFee()" (change)="joiningFee.set($any($event.target).valueAsNumber || 0)" />
            </mat-form-field>
            <mat-form-field class="wide">
              <mat-label>Account head</mat-label>
              <mat-select
                appEntrySelect
                [value]="joiningHeadCode()"
                (selectionChange)="joiningHeadCode.set($event.value)"
              >
                @for (head of heads(); track head.code) {
                  <mat-option [value]="head.code">{{ head.code }} – {{ head.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>
          <div class="form-actions">
            <button
              mat-stroked-button
              type="submit"
              [disabled]="saving() || (joiningFee() === savedJoiningFee() && joiningHeadCode() === savedJoiningHeadCode())"
            >
              <mat-icon>save</mat-icon> Save joining fee
            </button>
          </div>
        </div>
      </form>
`;

content = content.replace('</app-page-header>', '</app-page-header>\n' + joinPanel);

content = content.replace(
  'protected readonly headCode = signal<number | null>(null);',
  'protected readonly headCode = signal<number | null>(null);\n  protected readonly joiningHeadCode = signal<number | null>(null);\n  protected readonly joiningFee = signal<number>(0);'
);

content = content.replace(
  'protected readonly savedHeadCode = signal<number | null>(null);',
  'protected readonly savedHeadCode = signal<number | null>(null);\n  protected readonly savedJoiningHeadCode = signal<number | null>(null);\n  protected readonly savedJoiningFee = signal<number>(0);'
);

const saveFunc = `
  protected async saveJoiningFee(): Promise<void> {
    const code = this.joiningHeadCode();
    const fee = this.joiningFee();
    if (!code) return;
    this.saving.set(true);
    try {
      await must(
        this.sb.from('company_settings').update({ joining_fee: fee, joining_fee_head_code: code }).eq('id', true),
      );
      this.savedJoiningHeadCode.set(code);
      this.savedJoiningFee.set(fee);
      this.notify.success('Joining fee settings saved');
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.saving.set(false);
    }
  }
`;

content = content.replace('private async load(): Promise<void> {', saveFunc + '\n  private async load(): Promise<void> {');

content = content.replace(
  ".select('subscription_head_code')",
  ".select('subscription_head_code, joining_fee, joining_fee_head_code')"
);

content = content.replace(
  ".maybeSingle<{ subscription_head_code: number | null }>()",
  ".maybeSingle<{ subscription_head_code: number | null, joining_fee: number, joining_fee_head_code: number | null }>()"
);

content = content.replace(
  "this.headCode.set(settings?.subscription_head_code ?? null);",
  "this.headCode.set(settings?.subscription_head_code ?? null);\n      this.joiningHeadCode.set(settings?.joining_fee_head_code ?? null);\n      this.joiningFee.set(settings?.joining_fee ?? 0);"
);

content = content.replace(
  "this.savedHeadCode.set(settings?.subscription_head_code ?? null);",
  "this.savedHeadCode.set(settings?.subscription_head_code ?? null);\n      this.savedJoiningHeadCode.set(settings?.joining_fee_head_code ?? null);\n      this.savedJoiningFee.set(settings?.joining_fee ?? 0);"
);

fs.writeFileSync('app/src/app/features/membership/subscription-fees.ts', content);
