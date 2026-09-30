/**
 * Nearby drivers service.
 *
 * All proximity data comes through the get-nearby-drivers Edge Function; the
 * client never reads location_presence. Phase 2: the server uses the caller's
 * stored live session for both position and range, so the request carries
 * nothing, and each driver comes back with a distance band only (parsed and
 * validated in src/services/proximity.ts).
 */
import { supabase } from './supabase';
import { edgeFnUrl } from './api';
import { SCREENSHOT_MODE } from './env';
import { parseNearbyDrivers } from './proximity';
import { DEMO_DRIVERS } from './screenshotMode';
import type { GetNearbyDriversResponse } from './api';

export const NEARBY_POLL_INTERVAL_MS = 5_000;

export async function getNearbyDrivers(): Promise<GetNearbyDriversResponse> {
  // Screenshot/demo mode short-circuit — never touches the network.
  // Disabled by default; only `.env`-controlled. See src/services/env.ts.
  if (SCREENSHOT_MODE) {
    return { drivers: parseNearbyDrivers({ drivers: DEMO_DRIVERS }) };
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
    body: '{}',
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
  return { drivers: parseNearbyDrivers(json) };
}
