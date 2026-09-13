import { inject, Injectable, signal } from '@angular/core';
import { CompanySettings } from './models';
import { must, SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class CompanyService {
  private readonly sb = inject(SupabaseService).client;

  readonly settings = signal<CompanySettings | null>(null);

  async load(): Promise<void> {
    const settings = await must(
      this.sb.from('company_settings').select('name, place, phone, gstin').maybeSingle<CompanySettings>(),
    );
    this.settings.set(settings);
  }

  async save(settings: CompanySettings): Promise<void> {
    await must(this.sb.from('company_settings').update(settings).eq('id', true));
    this.settings.set(settings);
  }
}
