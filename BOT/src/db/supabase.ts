import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, supabaseSecretKey } from '../config.js';

let client: SupabaseClient | undefined;

/**
 * Bot-side Supabase client. Always uses the server secret key
 * (SUPABASE_SECRET_KEY, or the legacy SUPABASE_SERVICE_ROLE_KEY).
 * The publishable/anon key must never be used here.
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  const e = env();
  client = createClient(e.SUPABASE_URL, supabaseSecretKey(e), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'X-Client-Info': 'ranksbot' } },
  });
  return client;
}