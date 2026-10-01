/**
 * Live session service — Phase 7, real Edge Functions.
 *
 * Calls start-live-session / stop-live-session / update-live-location via
 * authenticated fetch. The JWT comes from supabase.auth.getSession() — never
 * a service-role key.
 *
 * stop() is fire-and-forget safe: it swallows network errors so the caller
 * can always force the UI to offline state even if the server is unreachable.
 */
import { supabase } from './supabase';
import { edgeFnUrl } from './api';
import type {
  StartSessionRequest,
  StartSessionResponse,
  StopSessionRequest,
  StopSessionResponse,
  UpdateLocationRequest,
  UpdateLocationResponse,
} from './api';

export const HEARTBEAT_INTERVAL_MS = 12_000;
export const SESSION_EXPIRY_SECONDS = 25;

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) {
    throw new Error('Not authenticated');
  }
  return data.session.access_token;
}

async function post<Req, Res>(name: string, body: Req): Promise<Res> {
  const token = await accessToken();
  const res = await fetch(edgeFnUrl(name), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error(`Server error (${res.status})`);
  }
  if (!res.ok) {
    throw new Error(
      (json as { error?: string }).error ?? `Server error (${res.status})`,
    );
  }
  return json as Res;
}

export async function startLiveSession(
  req: StartSessionRequest,
): Promise<StartSessionResponse> {
  return post<StartSessionRequest, StartSessionResponse>(
    'start-live-session',
    req,
  );
}

/**
 * Ends the live session. session_id limits it to that session (cold-launch
 * cleanup must not end a session started since on another device); reason is
 * recorded server-side.
 */
export async function stopLiveSession(
  req: StopSessionRequest = {},
): Promise<StopSessionResponse> {
  return post<StopSessionRequest, StopSessionResponse>('stop-live-session', req);
}

export async function updateLiveLocation(
  req: UpdateLocationRequest,
): Promise<UpdateLocationResponse> {
  return post<UpdateLocationRequest, UpdateLocationResponse>(
    'update-live-location',
    req,
  );
}
