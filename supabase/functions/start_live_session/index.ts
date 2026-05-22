// POST /start_live_session
// Body: { lat, lng, range_m?, vehicle_id?, heading?, speed?, accuracy? }
// Goes live. Fails with 409 TOO_CLOSE_TO_ZONE if inside a Private Zone,
// 403 USER_BANNED if the account is blocked from going live.
import { callRpc, clampRange, numOrNull, requireLatLng, serveJson } from "../_shared/mod.ts";

Deno.serve(serveJson(async ({ supabase, body }) => {
  const { lat, lng } = requireLatLng(body);
  const session = await callRpc(supabase, "start_live_session", {
    p_lat: lat,
    p_lng: lng,
    p_range_m: clampRange(body.range_m),
    p_vehicle_id: (body.vehicle_id as string) ?? null,
    p_heading: numOrNull(body.heading),
    p_speed: numOrNull(body.speed),
    p_accuracy: numOrNull(body.accuracy),
  });
  return { live: true, session };
}));
