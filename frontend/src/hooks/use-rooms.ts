import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────

export interface RoomRead {
  id: number;
  name: string;
  capacity: number;
  current_occupancy: number;
  created_at: string;
  updated_at: string;
}

export interface RoomListResponse {
  items: RoomRead[];
  total: number;
  skip: number;
  limit: number;
}

export interface RoomCreate {
  name: string;
  capacity: number;
  current_occupancy?: number;
}

export interface RoomUpdate {
  name?: string;
  capacity?: number;
  current_occupancy?: number;
}

export interface RoomsParams {
  skip?: number;
  limit?: number;
  search?: string;
}

// ── Query key factory ──────────────────────────────────────────────────────

export const roomKeys = {
  all:    ["rooms"] as const,
  lists:  () => ["rooms", "list"] as const,
  list:   (params: RoomsParams) => ["rooms", "list", params] as const,
  detail: (id: number) => ["rooms", "detail", id] as const,
};

// ── Helpers ────────────────────────────────────────────────────────────────

function buildQs(params: RoomsParams): string {
  const q = new URLSearchParams();
  if (params.skip   !== undefined) q.set("skip",   String(params.skip));
  if (params.limit  !== undefined) q.set("limit",  String(params.limit));
  if (params.search)               q.set("search", params.search);
  const s = q.toString();
  return s ? `?${s}` : "";
}

// ── Queries ────────────────────────────────────────────────────────────────

export function useRooms(
  params: RoomsParams = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery<RoomListResponse>({
    queryKey: roomKeys.list(params),
    queryFn:  () => apiClient.get<RoomListResponse>(`/rooms${buildQs(params)}`),
    staleTime: 30_000,
    enabled:  options.enabled ?? true,
  });
}

export function useRoom(id: number) {
  return useQuery<RoomRead>({
    queryKey: roomKeys.detail(id),
    queryFn:  () => apiClient.get<RoomRead>(`/rooms/${id}`),
    staleTime: 30_000,
    enabled:  !!id,
  });
}

// ── Mutations ──────────────────────────────────────────────────────────────

export function useCreateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: RoomCreate) => apiClient.post<RoomRead>("/rooms", data),
    onSuccess: (newRoom) => {
      qc.setQueriesData<RoomListResponse>(
        { queryKey: roomKeys.lists() },
        (old) => old ? { ...old, items: [...old.items, newRoom], total: old.total + 1 } : old,
      );
      qc.setQueryData(roomKeys.detail(newRoom.id), newRoom);
      qc.invalidateQueries({ queryKey: roomKeys.all });
    },
  });
}

export function useUpdateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: RoomUpdate }) =>
      apiClient.patch<RoomRead>(`/rooms/${id}`, data),

    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: roomKeys.all });
      const snapshots = qc.getQueriesData<RoomListResponse | RoomRead>({ queryKey: roomKeys.all });

      qc.setQueriesData<RoomListResponse>(
        { queryKey: roomKeys.lists() },
        (old) => old
          ? { ...old, items: old.items.map((r) => r.id === id ? { ...r, ...data } : r) }
          : old,
      );
      qc.setQueryData<RoomRead>(roomKeys.detail(id), (old) =>
        old ? { ...old, ...data } : old,
      );
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.snapshots?.forEach(([key, val]) => qc.setQueryData(key, val));
    },
    onSuccess: (updated) => {
      qc.setQueryData(roomKeys.detail(updated.id), updated);
      qc.invalidateQueries({ queryKey: roomKeys.all });
    },
  });
}

export function useDeleteRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.delete<void>(`/rooms/${id}`),

    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: roomKeys.all });
      const snapshots = qc.getQueriesData<RoomListResponse | RoomRead>({ queryKey: roomKeys.all });

      qc.setQueriesData<RoomListResponse>(
        { queryKey: roomKeys.lists() },
        (old) => old
          ? { ...old, items: old.items.filter((r) => r.id !== id), total: old.total - 1 }
          : old,
      );
      qc.removeQueries({ queryKey: roomKeys.detail(id) });
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.snapshots?.forEach(([key, val]) => qc.setQueryData(key, val));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: roomKeys.all });
    },
  });
}
