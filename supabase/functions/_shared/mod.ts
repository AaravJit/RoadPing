// Shared helpers for all RoadPing Edge Functions.
// Auth is verified in code (each function calls requireUser), so deploy these
// with `verify_jwt = false` and let CORS preflight through.

import {
  createClient,
  type SupabaseClient,
  type User,
} from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Map a Postgres / PostgREST error (raised from our RPCs) to an HTTP envelope.
const KNOWN: Record<string, [number, string]> = {
  NOT_AUTHENTICATED: [401, "Authentication required."],
  USER_BANNED: [403, "This account is not allowed to go live."],
  TOO_CLOSE_TO_ZONE: [
    409,
    "You are too close to a Private Zone. Move farther away before going live.",
  ],
  NO_ACTIVE_SESSION: [409, "You are not currently live."],
};

export function mapPostgresError(error: { message?: string }): HttpError {
  const msg = error?.message ?? "";
  for (const key of Object.keys(KNOWN)) {
    if (msg.includes(key)) {
      const [status, friendly] = KNOWN[key];
      return new HttpError(status, key, friendly);
    }
  }
  return new HttpError(400, "DB_ERROR", msg || "Database error.");
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

// A Supabase client scoped to the CALLER's JWT, so RLS and auth.uid() apply.
export function userClient(req: Request): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export async function requireUser(supabase: SupabaseClient): Promise<User> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new HttpError(401, "NOT_AUTHENTICATED", "Authentication required.");
  }
  return data.user;
}

export async function callRpc<T = unknown>(
  supabase: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw mapPostgresError(error);
  return data as T;
}

// ── Input helpers ────────────────────────────────────────────────────────────
async function safeJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? b as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function requireLatLng(body: Record<string, unknown>): { lat: number; lng: number } {
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (
    !Number.isFinite(lat) || !Number.isFinite(lng) ||
    lat < -90 || lat > 90 || lng < -180 || lng > 180
  ) {
    throw new HttpError(400, "INVALID_INPUT", "Valid lat and lng are required.");
  }
  return { lat, lng };
}

export function clampRange(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 100 && n <= 5000 ? Math.round(n) : 500;
}

export function clampRadius(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 50 && n <= 5000 ? Math.round(n) : 300;
}

export function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// ── Handler wrapper ──────────────────────────────────────────────────────────
type Ctx = {
  req: Request;
  supabase: SupabaseClient;
  user: User;
  body: Record<string, unknown>;
};

export function serveJson(fn: (ctx: Ctx) => Promise<unknown>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }
    try {
      if (req.method !== "POST") {
        throw new HttpError(405, "METHOD_NOT_ALLOWED", "Use POST.");
      }
      const supabase = userClient(req);
      const user = await requireUser(supabase);
      const body = await safeJson(req);
      const data = await fn({ req, supabase, user, body });
      return json({ ok: true, data });
    } catch (e) {
      const err = e instanceof HttpError
        ? e
        : new HttpError(500, "INTERNAL", (e as Error)?.message ?? "Unexpected error.");
      return json({ ok: false, error: { code: err.code, message: err.message } }, err.status);
    }
  };
}
