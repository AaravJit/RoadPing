// POST /check_private_zone_block
// Body: { lat, lng }
// Live "Safe to Start / Too close" preview. This is UX only — start_live_session
// re-validates the gate authoritatively on the server.
import { callRpc, requireLatLng, serveJson } from "../_shared/mod.ts";

type ZoneRow = {
  blocked: boolean;
  zone_id: string | null;
  zone_name: string | null;
  distance_m: number | null;
};

Deno.serve(serveJson(async ({ supabase, body }) => {
  const { lat, lng } = requireLatLng(body);
  const rows = await callRpc<ZoneRow[]>(supabase, "inside_private_zone", {
    p_lat: lat,
    p_lng: lng,
  });
  const row = Array.isArray(rows) ? rows[0] : (rows as unknown as ZoneRow);
  const blocked = !!row?.blocked;
  return {
    blocked,
    status: blocked ? "too_close" : "safe",
    zone: blocked
      ? { id: row.zone_id, name: row.zone_name, distance_m: row.distance_m }
      : null,
  };
}));
