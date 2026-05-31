/**
 * CORS headers for Supabase Edge Functions.
 *
 * 'Access-Control-Allow-Origin': '*' is safe here because all authentication
 * is via JWT bearer tokens, not cookies. A wildcard CORS policy with
 * cookie-based auth would be dangerous; with JWT bearer tokens it is fine.
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
} as const;
