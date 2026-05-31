import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Creates a Supabase client with the service-role key.
 * This client BYPASSES Row Level Security — all ownership checks must be
 * performed explicitly in the Edge Function before calling data operations.
 *
 * Never expose the service-role key to the mobile app.
 * It is only available server-side via Supabase Edge Function environment.
 */
export function createAdminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('PROJECT_URL')!,
    Deno.env.get('SERVICE_ROLE_KEY')!,
    {
      auth: {
        // No token refresh or session persistence needed in a stateless function
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
