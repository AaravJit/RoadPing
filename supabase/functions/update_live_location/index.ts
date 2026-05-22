// POST /update_live_location  (heartbeat)
// Body: { lat, lng, heading?, speed?, accuracy? }
// Refreshes the single presence row and extends the session TTL. If the user
// has driven into a Private Zone, the session is force-ended ({ live: false }).
import { callRpc, numOrNull, requireLatLng, serveJson } from "../_shared/mod.ts";

Deno.serve(serveJson(async ({ supabase, body }) => {
  const { lat, lng } = requireLatLng(body);
  return await callRpc(supabase, "heartbeat", {
    p_lat: lat,
    p_lng: lng,
    p_heading: numOrNull(body.heading),
    p_speed: numOrNull(body.speed),
    p_accuracy: numOrNull(body.accuracy),
  });
}));
