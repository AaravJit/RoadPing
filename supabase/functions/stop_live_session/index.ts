// POST /stop_live_session
// Ends the active session and deletes the presence row — hidden immediately.
import { callRpc, serveJson } from "../_shared/mod.ts";

Deno.serve(serveJson(async ({ supabase }) => {
  return await callRpc(supabase, "stop_live_session", {});
}));
