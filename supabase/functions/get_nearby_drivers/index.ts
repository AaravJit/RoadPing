// POST /get_nearby_drivers
// Body: { lat, lng }
// Returns live drivers within mutual range. Server-side filtering enforces:
// active + not stale, not blocked (either direction), not banned/suppressed,
// not self. Coordinates are coarsened. Talking state is NOT included (live-only).
import { callRpc, requireLatLng, serveJson } from "../_shared/mod.ts";

Deno.serve(serveJson(async ({ supabase, body }) => {
  const { lat, lng } = requireLatLng(body);
  const drivers = await callRpc<unknown[]>(supabase, "get_nearby_drivers", {
    p_lat: lat,
    p_lng: lng,
  });
  return { drivers: drivers ?? [] };
}));
