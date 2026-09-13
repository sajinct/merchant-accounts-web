// Supabase project settings (Dashboard → Project Settings → API).
// The publishable / anon key is safe to ship in the browser: access is enforced by RLS.
// Never put the service_role / secret key here.
export const environment = {
  supabaseUrl: 'https://YOUR-PROJECT-REF.supabase.co',
  supabaseKey: 'YOUR-PUBLISHABLE-OR-ANON-KEY',
};
