/**
 * get-nearby-drivers
 *
 * Returns the nearby live drivers for the authenticated, live caller, each
 * with a fixed distance band only. See handler.ts for the privacy contract
 * and docs/PHASE2_PROXIMITY_PRIVACY.md for the design.
 */

import { createAdminClient } from '../_shared/client.ts';
import { getAuthUser } from '../_shared/auth.ts';
import { isRateLimited } from '../_shared/rateLimit.ts';
import { handleGetNearbyDrivers } from './handler.ts';

Deno.serve((req: Request) =>
  handleGetNearbyDrivers(req, { getAuthUser, createAdminClient, isRateLimited }),
);
