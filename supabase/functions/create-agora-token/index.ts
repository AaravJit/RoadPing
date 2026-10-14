/**
 * create-agora-token (RETIRED in Phase 3)
 *
 * This used to mint a one-hour token for a shared channel per room
 * (roadping-room-{room_id}) or per caller session. Phase 3 replaces shared
 * channels with one opaque channel per push-to-talk press, authorized per
 * listener and per renewal by voice-transmission (docs/PHASE3_VOICE_PTT.md).
 *
 * Kept deployed only so builds from before Phase 3 get a clear, permanent
 * answer instead of a 404. They treat any error as "room audio unavailable"
 * and keep the talk-status-only behaviour. Production Agora is disabled on
 * those builds by EXPO_PUBLIC_DISABLE_AGORA anyway.
 *
 * Redeploy this AFTER the Phase 3 voice-test build is the only build that
 * should have audio (deployment order in docs/PHASE3_VOICE_PTT.md).
 */

import { corsHeaders } from '../_shared/cors.ts';
import { err } from '../_shared/errors.ts';

Deno.serve((req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return err(410, 'Update RoadPing to use voice');
});
