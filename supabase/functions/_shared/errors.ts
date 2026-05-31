import { corsHeaders } from './cors.ts';

const JSON_HEADERS = {
  ...corsHeaders,
  'Content-Type': 'application/json',
} as const;

/** Successful JSON response. */
export function ok<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS,
  });
}

/**
 * Error JSON response.
 *
 * The `message` MUST be safe to show to clients — never include stack traces,
 * SQL error details, or internal identifiers.
 */
export function err(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: JSON_HEADERS,
  });
}
