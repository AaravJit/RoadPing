/**
 * Nearby drivers service — Phase 7, real Edge Function.
 *
 * All proximity data comes through the get-nearby-drivers Edge Function
 * (SECURITY DEFINER). The client never reads location_presence directly.
 * Only approximate_distance_m (rounded to 50 m) is included in the response.
 */
import { supabase } from './supabase';
import { edgeFnUrl } from './api';
import { SCREENSHOT_MODE } from './env';
import { DEMO_DRIVERS } from './screenshotMode';
import type { GetNearbyDriversRequest, GetNearbyDriversResponse } from './api';

export const NEARBY_POLL_INTERVAL_MS = 5_000;

export async function getNearbyDrivers(
  req: GetNearbyDriversRequest,
): Promise<GetNearbyDriversResponse> {
  // Screenshot/demo mode short-circuit — never touches the network.
  // Disabled by default; only `.env`-controlled. See src/services/env.ts.
  if (SCREENSHOT_MODE) {
    return { drivers: DEMO_DRIVERS };
  }

  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) {
    throw new Error('Not authenticated');
  }
  const res = await fetch(edgeFnUrl('get-nearby-drivers'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(req),
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
  return json as GetNearbyDriversResponse;
}
