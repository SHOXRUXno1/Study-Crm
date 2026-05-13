import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────

export interface CourseRead {
  id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CourseListResponse {
  items: CourseRead[];
  total: number;
  skip: number;
  limit: number;
}

export interface CourseCreate {
  name: string;
  description?: string | null;
  is_active?: boolean;
}

export interface CourseUpdate {
  name?: string;
  description?: string | null;
  is_active?: boolean;
}

export interface CoursesParams {
  skip?: number;
  limit?: number;
  is_active?: boolean;
  search?: string;
}

// ── Query key factory ──────────────────────────────────────────────────────

export const courseKeys = {
  all:    ["courses"] as const,
  lists:  () => ["courses", "list"] as const,
  list:   (params: CoursesParams) => ["courses", "list", params] as const,
  detail: (id: number) => ["courses", "detail", id] as const,
};

// ── Helpers ────────────────────────────────────────────────────────────────

function buildQs(params: CoursesParams): string {
  const q = new URLSearchParams();
  if (params.skip      !== undefined) q.set("skip",      String(params.skip));
  if (params.limit     !== undefined) q.set("limit",     String(params.limit));
  if (params.is_active !== undefined) q.set("is_active", String(params.is_active));
  if (params.search)                  q.set("search",    params.search);
  const s = q.toString();
  return s ? `?${s}` : "";
}

// ── Queries ────────────────────────────────────────────────────────────────

export function useCourse(id: number | string) {
  return useQuery<CourseRead>({
    queryKey: courseKeys.detail(Number(id)),
    queryFn:  () => apiClient.get<CourseRead>(`/courses/${id}`),
    staleTime: 30_000,
    enabled:  !!id,
  });
}

export function useCourses(
  params: CoursesParams = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery<CourseListResponse>({
    queryKey: courseKeys.list(params),
    queryFn:  () => apiClient.get<CourseListResponse>(`/courses${buildQs(params)}`),
    staleTime: 30_000,
    enabled:  options.enabled ?? true,
  });
}

// ── Mutations ──────────────────────────────────────────────────────────────

export function useCreateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CourseCreate) => apiClient.post<CourseRead>("/courses", data),
    onSuccess: (newCourse) => {
      // Inject into every list cache immediately
      qc.setQueriesData<CourseListResponse>(
        { queryKey: courseKeys.lists() },
        (old) => old ? { ...old, items: [newCourse, ...old.items], total: old.total + 1 } : old,
      );
      qc.setQueryData(courseKeys.detail(newCourse.id), newCourse);
      // Background sync
      qc.invalidateQueries({ queryKey: courseKeys.all });
    },
  });
}

export function useUpdateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: CourseUpdate }) =>
      apiClient.patch<CourseRead>(`/courses/${id}`, data),

    // Instant optimistic update
    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: courseKeys.all });
      const snapshots = qc.getQueriesData<CourseListResponse | CourseRead>({ queryKey: courseKeys.all });

      qc.setQueriesData<CourseListResponse>(
        { queryKey: courseKeys.lists() },
        (old) => old
          ? { ...old, items: old.items.map((c) => c.id === id ? { ...c, ...data } : c) }
          : old,
      );
      qc.setQueryData<CourseRead>(courseKeys.detail(id), (old) =>
        old ? { ...old, ...data } : old,
      );
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.snapshots?.forEach(([key, val]) => qc.setQueryData(key, val));
    },
    onSuccess: (updated) => {
      qc.setQueryData(courseKeys.detail(updated.id), updated);
      qc.invalidateQueries({ queryKey: courseKeys.all });
    },
  });
}

export function useDeleteCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.delete<void>(`/courses/${id}`),

    // Instant optimistic removal
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: courseKeys.all });
      const snapshots = qc.getQueriesData<CourseListResponse | CourseRead>({ queryKey: courseKeys.all });

      qc.setQueriesData<CourseListResponse>(
        { queryKey: courseKeys.lists() },
        (old) => old
          ? { ...old, items: old.items.filter((c) => c.id !== id), total: old.total - 1 }
          : old,
      );
      qc.removeQueries({ queryKey: courseKeys.detail(id) });
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.snapshots?.forEach(([key, val]) => qc.setQueryData(key, val));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: courseKeys.all });
    },
  });
}
