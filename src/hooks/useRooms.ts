import { useCallback, useEffect, useState } from 'react';
import {
  listMyRooms,
  createRoom,
  joinRoom,
  deleteRoom,
} from '@/services/rooms';
import type { RoomRow } from '@/services/types';
import type { CreateRoomRequest, CreateRoomResponse } from '@/services/api';

export interface UseRoomsResult {
  rooms: RoomRow[];
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  create: (req: CreateRoomRequest) => Promise<CreateRoomResponse>;
  join: (inviteCode: string) => Promise<{ room_id: string; name: string }>;
  remove: (roomId: string) => Promise<void>;
}

export function useRooms(): UseRoomsResult {
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const list = await listMyRooms();
      setRooms(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load rooms.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(
    async (req: CreateRoomRequest): Promise<CreateRoomResponse> => {
      setIsMutating(true);
      try {
        const resp = await createRoom(req);
        await refresh();
        return resp;
      } finally {
        setIsMutating(false);
      }
    },
    [refresh],
  );

  const join = useCallback(
    async (inviteCode: string) => {
      setIsMutating(true);
      try {
        const resp = await joinRoom(inviteCode);
        await refresh();
        return resp;
      } finally {
        setIsMutating(false);
      }
    },
    [refresh],
  );

  const remove = useCallback(async (roomId: string) => {
    setIsMutating(true);
    try {
      await deleteRoom(roomId);
      setRooms((prev) => prev.filter((r) => r.id !== roomId));
    } finally {
      setIsMutating(false);
    }
  }, []);

  return {
    rooms,
    isLoading,
    isMutating,
    error,
    refresh,
    create,
    join,
    remove,
  };
}
