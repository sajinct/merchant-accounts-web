import { computed, inject, Injectable, signal } from '@angular/core';
import { Session } from '@supabase/supabase-js';
import { Profile } from './models';
import { must, SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly sb = inject(SupabaseService).client;

  readonly session = signal<Session | null>(null);
  readonly profile = signal<Profile | null>(null);
  readonly role = computed(() => this.profile()?.role ?? null);
  readonly isAdmin = computed(() => this.role() === 'admin');
  readonly canEdit = computed(() => this.role() === 'admin' || this.role() === 'accountant');

  private readonly ready = this.init();

  constructor() {
    // Supabase warns against awaiting other client calls inside this callback.
    this.sb.auth.onAuthStateChange((event, session) => {
      this.session.set(session);
      if (event === 'SIGNED_OUT') {
        this.profile.set(null);
      }
    });
  }

  whenReady(): Promise<void> {
    return this.ready;
  }

  async signIn(email: string, password: string): Promise<void> {
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) {
      throw error;
    }
    this.session.set(data.session);
    await this.loadProfile();
    if (!this.profile()?.is_active) {
      await this.signOut();
      throw new Error('Your account is disabled. Contact the administrator.');
    }
  }

  async signOut(): Promise<void> {
    await this.sb.auth.signOut();
    this.session.set(null);
    this.profile.set(null);
  }

  async changePassword(password: string): Promise<void> {
    const { error } = await this.sb.auth.updateUser({ password });
    if (error) {
      throw error;
    }
  }

  private async init(): Promise<void> {
    const { data } = await this.sb.auth.getSession();
    this.session.set(data.session);
    if (data.session) {
      await this.loadProfile().catch(() => this.profile.set(null));
    }
  }

  private async loadProfile(): Promise<void> {
    const userId = this.session()?.user.id;
    if (!userId) {
      this.profile.set(null);
      return;
    }
    const profile = await must(
      this.sb
        .from('profiles')
        .select('user_id, username, full_name, role, is_active')
        .eq('user_id', userId)
        .maybeSingle<Profile>(),
    );
    this.profile.set(profile);
  }
}
