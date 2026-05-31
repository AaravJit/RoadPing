import { useCallback, useEffect, useState } from 'react';
import {
  listBlockedUsers,
  unblockUser,
  type BlockedUserProfile,
} from '@/services/moderation';

export interface UseBlockedUsersResult {
  blockedUsers: BlockedUserProfile[];
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  unblock: (blockedId: string) => Promise<void>;
}

export function useBlockedUsers(): UseBlockedUsersResult {
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const list = await listBlockedUsers();
      setBlockedUsers(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load blocked users.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const unblock = useCallback(
    async (blockedId: string) => {
      setIsMutating(true);
      try {
        await unblockUser(blockedId);
        setBlockedUsers((prev) => prev.filter((u) => u.blocked_id !== blockedId));
      } catch (e) {
        throw e;
      } finally {
        setIsMutating(false);
      }
    },
    [],
  );

  return { blockedUsers, isLoading, isMutating, error, refresh, unblock };
}
