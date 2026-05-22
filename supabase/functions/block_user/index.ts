// POST /block_user
// Body: { blocked_id }
// Idempotent. Once blocked, get_nearby_drivers hides the pair from each other
// in both directions (enforced via is_blocked in the SQL), and the block is
// silent — the blocked user never learns about it.
import { HttpError, mapPostgresError, serveJson, str } from "../_shared/mod.ts";

Deno.serve(serveJson(async ({ supabase, user, body }) => {
  const blockedId = str(body.blocked_id);
  if (!blockedId) throw new HttpError(400, "INVALID_INPUT", "blocked_id is required.");
  if (blockedId === user.id) throw new HttpError(400, "INVALID_INPUT", "You cannot block yourself.");

  const { error } = await supabase
    .from("blocks")
    .upsert(
      { blocker_id: user.id, blocked_id: blockedId },
      { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true },
    );

  if (error) throw mapPostgresError(error);
  return { blocked: true, blocked_id: blockedId };
}));
