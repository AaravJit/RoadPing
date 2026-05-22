// POST /create_private_zone
// Body: { name, lat, lng, radius_m?, kind? }
// Creates an owner-only Private Zone. Never visible to other users.
import { clampRadius, HttpError, mapPostgresError, requireLatLng, serveJson, str } from "../_shared/mod.ts";

Deno.serve(serveJson(async ({ supabase, user, body }) => {
  const { lat, lng } = requireLatLng(body);
  const name = str(body.name);
  if (!name) throw new HttpError(400, "INVALID_INPUT", "Zone name is required.");

  const kind = ["home", "work", "custom"].includes(body.kind as string)
    ? (body.kind as string)
    : "custom";

  const { data, error } = await supabase
    .from("private_zones")
    .insert({
      user_id: user.id,
      name,
      center: `SRID=4326;POINT(${lng} ${lat})`, // PostGIS parses EWKT for geography
      radius_m: clampRadius(body.radius_m),
      kind,
    })
    .select("id, name, radius_m, kind, created_at")
    .single();

  if (error) throw mapPostgresError(error);
  return { zone: data };
}));
