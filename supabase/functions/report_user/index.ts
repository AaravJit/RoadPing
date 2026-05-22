// POST /report_user
// Body: { reported_id, reason, context?, session_id? }
import { HttpError, mapPostgresError, serveJson, str } from "../_shared/mod.ts";

Deno.serve(serveJson(async ({ supabase, user, body }) => {
  const reportedId = str(body.reported_id);
  if (!reportedId) throw new HttpError(400, "INVALID_INPUT", "reported_id is required.");
  if (reportedId === user.id) throw new HttpError(400, "INVALID_INPUT", "You cannot report yourself.");

  const reason = str(body.reason);
  if (!reason) throw new HttpError(400, "INVALID_INPUT", "reason is required.");

  const context = ["map", "room", "voice", "profile"].includes(body.context as string)
    ? (body.context as string)
    : null;

  const { data, error } = await supabase
    .from("reports")
    .insert({
      reporter_id: user.id,
      reported_id: reportedId,
      reason,
      context,
      session_id: (body.session_id as string) ?? null,
    })
    .select("id, status, created_at")
    .single();

  if (error) throw mapPostgresError(error);
  return { report: data };
}));
