/**
 * Best-effort removal of one listener from one per-press Agora channel, used
 * when a block lands mid-transmission. Without it the blocked pair is
 * separated when the listener's token lapses (<= 45 s) or the press ends.
 *
 * Agora RESTful "Create a banning rule" (kicking-rule):
 *   POST https://api.sd-rtn.com/dev/v1/kicking-rule
 *   Authorization: Basic base64(customer_id:customer_secret)
 *   { appid, cname, uid, time_in_seconds, privileges: ["join_channel"] }
 * A rule with cname + uid applies to that user in that channel only.
 * time_in_seconds is clamped to [10, 86430]; 90 s outlives any press (70 s).
 *
 * Optional secrets: AGORA_CUSTOMER_ID, AGORA_CUSTOMER_SECRET. When absent this
 * does nothing; failures are logged and never fail the caller's request.
 */

export interface KickTarget {
  channel: string;
  listener_uid: number;
}

export async function kickListeners(
  appId: string,
  targets: KickTarget[],
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  const id = Deno.env.get('AGORA_CUSTOMER_ID');
  const secret = Deno.env.get('AGORA_CUSTOMER_SECRET');
  if (!id || !secret || targets.length === 0) return 0;
  const auth = `Basic ${btoa(`${id}:${secret}`)}`;
  let done = 0;
  await Promise.all(
    targets.map(async (t) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      try {
        const res = await fetchImpl('https://api.sd-rtn.com/dev/v1/kicking-rule', {
          method: 'POST',
          headers: { authorization: auth, 'content-type': 'application/json' },
          body: JSON.stringify({
            appid: appId,
            cname: t.channel,
            uid: t.listener_uid,
            time_in_seconds: 90,
            privileges: ['join_channel'],
          }),
          signal: ctrl.signal,
        });
        if (res.ok) done++;
        else console.error('agora kicking-rule failed:', res.status);
        await res.body?.cancel();
      } catch (e) {
        console.error('agora kicking-rule error:', e instanceof Error ? e.name : 'unknown');
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  return done;
}
