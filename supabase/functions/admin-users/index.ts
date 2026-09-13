// Admin-only user management. The service role key stays on the server.
//
// POST { action: 'create', email, password, full_name?, role }
// POST { action: 'set_password', user_id, password }
//
// Deploy: npx supabase functions deploy admin-users

import { createClient } from 'npm:@supabase/supabase-js@2';

const ROLES = ['admin', 'accountant', 'viewer'];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405);
  }

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Check the caller's role with their own token, so RLS and app_role() decide.
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: role, error: roleError } = await caller.rpc('app_role');
  if (roleError || role !== 'admin') {
    return json({ error: 'not authorized' }, 403);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }

  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < 8) {
    return json({ error: 'password must be at least 8 characters' }, 400);
  }

  switch (body.action) {
    case 'create': {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
      const newRole = typeof body.role === 'string' ? body.role : '';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return json({ error: 'a valid email is required' }, 400);
      }
      if (!ROLES.includes(newRole)) {
        return json({ error: 'invalid role' }, 400);
      }

      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username: email, full_name: fullName || null },
      });
      if (error || !data.user) {
        return json({ error: error?.message ?? 'could not create user' }, 400);
      }

      // The on_auth_user_created trigger made the profile as 'viewer'; apply the chosen role.
      const { error: profileError } = await admin
        .from('profiles')
        .update({ role: newRole, full_name: fullName || null })
        .eq('user_id', data.user.id);
      if (profileError) {
        return json({ error: profileError.message }, 500);
      }
      return json({ user_id: data.user.id });
    }

    case 'set_password': {
      const userId = typeof body.user_id === 'string' ? body.user_id : '';
      if (!userId) {
        return json({ error: 'user_id is required' }, 400);
      }
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) {
        return json({ error: error.message }, 400);
      }
      return json({ ok: true });
    }

    default:
      return json({ error: 'unknown action' }, 400);
  }
});
