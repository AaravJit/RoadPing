/**
 * ptt-token
 *
 * Registers or removes the caller's Apple PushToTalk ephemeral APNs token.
 * See handler.ts and docs/PHASE3_VOICE_PTT.md.
 */

import { createAdminClient } from '../_shared/client.ts';
import { getAuthUser } from '../_shared/auth.ts';
import { isRateLimited } from '../_shared/rateLimit.ts';
import { handlePttToken } from './handler.ts';

Deno.serve((req: Request) => handlePttToken(req, { getAuthUser, createAdminClient, isRateLimited }));
