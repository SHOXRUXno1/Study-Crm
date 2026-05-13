import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────

export type GroupStatus = "active" | "completed";
export type DaysType = "odd" | "even";

export interface GroupRead {
  id: number;
  code: string;
  course_id: number | null;
  teacher_id: number | null;
  room_id: number | null;
  days: DaysType;
  /** "HH:MM:SS" */
  start_time: string;
  /** "HH:MM:SS" */
  end_time: string;
  /** Derived "HH:MM – HH:MM" — kept for backward compatibility */
  time_slot: string;
  max_students: number;
  student_count: number;
  price: number;
  duration_months: number;
  start_date: string;   // ISO date string "YYYY-MM-DD"
  end_date: string;
  status: GroupStatus;
  course_name: string | null;
  teacher_name: string | null;
  room_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface GroupListResponse {
  items: GroupRead[];
  total: number;
  skip: number;
  limit: number;
}

export interface GroupCreate {
  code: string;
  course_id?: number | null;
  teacher_id?: number | null;
  room_id?: number | null;
  days: DaysType;
  /** "HH:MM" or "HH:MM:SS" */
  start_time: string;
  end_time: string;
  max_students?: number;
  price?: number;
  duration_months?: number;
  start_date: string;
  end_date: string;
  status?: GroupStatus;
}

export interface GroupUpdate {
  code?: string;
  course_id?: number | null;
  teacher_id?: number | null;
  room_id?: number | null;
  days?: DaysType;
  start_time?: string;
  end_time?: string;
  max_students?: number;
  student_count?: number;
  price?: number;
  duration_months?: number;
  start_date?: string;
  end_date?: string;
  status?: GroupStatus;
}

export interface GroupsParams {
  skip?: number;
  limit?: number;
  status?: GroupStatus;
  course_id?: number;
  teacher_id?: number;
  search?: string;
  sort?: string;
}

// ── Query key factory ──────────────────────────────────────────────────────

export const groupKeys = {
  all:    ["groups"] as const,
  lists:  () => ["groups", "list"] as const,
  list:   (params: GroupsParams) => ["groups", "list", params] as const,
  detail: (id: number) => ["groups", "detail", id] as const,
};

// ── Helpers ────────────────────────────────────────────────────────────────

function buildQs(params: GroupsParams): string {
  const q = new URLSearchParams();
  if (params.skip       !== undefined) q.set("skip",       String(params.skip));
  if (params.limit      !== undefined) q.set("limit",      String(params.limit));
  if (params.status     !== undefined) q.set("status",     params.status);
  if (params.course_id  !== undefined) q.set("course_id",  String(params.course_id));
  if (params.teacher_id !== undefined) q.set("teacher_id", String(params.teacher_id));
  if (params.search)                   q.set("search",     params.search);
  if (params.sort)                     q.set("sort",       params.sort);
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** Expand "odd"/"even" to day abbreviation arrays */
export function expandDays(days: DaysType): string[] {
  return days === "odd" ? ["Mon", "Wed", "Fri"] : ["Tue", "Thu", "Sat"];
}

/**
 * Friendly days label.
 *
 * Pass a `t` from `useLanguage()` to get a fully localised label
 * (`Mon / Wed / Fri` in EN, `Пн / Ср / Пт` in RU, `Du / Cho / Ju` in UZ).
 *
 * Without `t` (e.g. legacy callers, exports outside React tree) the function
 * falls back to the Russian compact form to preserve current behaviour. New
 * callers should always pass `t`.
 */
export function daysLabel(days: DaysType, t?: (key: string) => string): string {
  if (t) {
    return days === "odd" ? t("groups.daysOddCompact") : t("groups.daysEvenCompact");
  }
  return days === "odd" ? "Пн / Ср / Пт" : "Вт / Чт / Сб";
}

// ── Queries ────────────────────────────────────────────────────────────────

export function useGroups(
  params: GroupsParams = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery<GroupListResponse>({
    queryKey: groupKeys.list(params),
    queryFn:  () => apiClient.get<GroupListResponse>(`/groups${buildQs(params)}`),
    staleTime: 30_000,
    enabled:  options.enabled ?? true,
  });
}

export function useGroup(id: number | string) {
  return useQuery<GroupRead>({
    queryKey: groupKeys.detail(Number(id)),
    queryFn:  () => apiClient.get<GroupRead>(`/groups/${id}`),
    staleTime: 30_000,
    enabled:  !!id,
  });
}

// ── Mutations ──────────────────────────────────────────────────────────────

export interface CreateGroupVariables {
  data: GroupCreate;
  /** Skip the schedule-conflict guard on the backend (admin override). */
  force?: boolean;
}

export interface UpdateGroupVariables {
  id: number;
  data: GroupUpdate;
  /** Skip the schedule-conflict guard on the backend (admin override). */
  force?: boolean;
}

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ data, force }: CreateGroupVariables) =>
      apiClient.post<GroupRead>(`/groups${force ? "?force=true" : ""}`, data),
    onSuccess: (newGroup) => {
      qc.setQueriesData<GroupListResponse>(
        { queryKey: groupKeys.lists() },
        (old) => old ? { ...old, items: [newGroup, ...old.items], total: old.total + 1 } : old,
      );
      qc.setQueryData(groupKeys.detail(newGroup.id), newGroup);
      qc.invalidateQueries({ queryKey: groupKeys.all });
    },
  });
}

export function useUpdateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data, force }: UpdateGroupVariables) =>
      apiClient.patch<GroupRead>(`/groups/${id}${force ? "?force=true" : ""}`, data),

    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: groupKeys.all });
      const snapshots = qc.getQueriesData<GroupListResponse | GroupRead>({ queryKey: groupKeys.all });
      qc.setQueriesData<GroupListResponse>(
        { queryKey: groupKeys.lists() },
        (old) => old
          ? { ...old, items: old.items.map((g) => g.id === id ? { ...g, ...data } : g) }
          : old,
      );
      qc.setQueryData<GroupRead>(groupKeys.detail(id), (old) =>
        old ? { ...old, ...data } : old,
      );
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.snapshots?.forEach(([key, val]) => qc.setQueryData(key, val));
    },
    onSuccess: (updated) => {
      qc.setQueryData(groupKeys.detail(updated.id), updated);
      qc.invalidateQueries({ queryKey: groupKeys.all });
    },
  });
}

export function useDeleteGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.delete<void>(`/groups/${id}`),

    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: groupKeys.all });
      const snapshots = qc.getQueriesData<GroupListResponse | GroupRead>({ queryKey: groupKeys.all });
      qc.setQueriesData<GroupListResponse>(
        { queryKey: groupKeys.lists() },
        (old) => old
          ? { ...old, items: old.items.filter((g) => g.id !== id), total: old.total - 1 }
          : old,
      );
      qc.removeQueries({ queryKey: groupKeys.detail(id) });
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.snapshots?.forEach(([key, val]) => qc.setQueryData(key, val));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: groupKeys.all });
    },
  });
}


// ── Vacation hooks ──────────────────────────────────────────────────────────

export interface VacationRead {
  id: number;
  group_id: number;
  vacation_date: string;
  note: string | null;
  created_at: string;
}

interface VacationListResponse {
  items: VacationRead[];
}

const vacationKeys = {
  all: ["vacations"] as const,
  list: (groupId: number) => ["vacations", groupId] as const,
};

export function useGroupVacations(groupId: number) {
  return useQuery({
    queryKey: vacationKeys.list(groupId),
    queryFn: () => apiClient.get<VacationListResponse>(`/groups/${groupId}/vacations`),
    enabled: groupId > 0,
  });
}

export function useCreateVacation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, data }: { groupId: number; data: { vacation_date: string; note?: string | null } }) =>
      apiClient.post<VacationRead>(`/groups/${groupId}/vacations`, data),
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: vacationKeys.list(vars.groupId) });
    },
  });
}

export function useDeleteVacation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, vacationId }: { groupId: number; vacationId: number }) =>
      apiClient.delete<void>(`/groups/${groupId}/vacations/${vacationId}`),
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: vacationKeys.list(vars.groupId) });
    },
  });
}
