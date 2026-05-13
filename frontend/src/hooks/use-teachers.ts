import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────

export interface TeacherRead {
  id: number;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  phone: string | null;
  is_active: boolean;
  username: string | null;
  has_account: boolean;
  avatar_base64: string | null;
  birth_date: string | null;  // ISO date "YYYY-MM-DD"
  hire_date: string | null;   // ISO date "YYYY-MM-DD"
  gender: "male" | "female" | null;
  // Salary rates — see backend/app/services/salary_service.py
  salary_monthly: number;        // UZS, fixed monthly
  salary_percent: number;        // 0..100, supports decimals like 7.5 (Decimal serialised as number/string)
  salary_per_lesson: number;     // UZS per completed lesson
  salary_per_student: number;    // UZS per active student (snapshot)
  created_at: string;
  updated_at: string;
}

export interface TeacherListResponse {
  items: TeacherRead[];
  total: number;
  skip: number;
  limit: number;
}

export interface SalaryBreakdownRead {
  teacher_id: number;
  teacher_name: string;
  period_from: string;
  period_to: string;
  revenue: number;
  lessons_count: number;
  students_count: number;
  rate_monthly: number;
  rate_percent: number;
  rate_per_lesson: number;
  rate_per_student: number;
  monthly_amount: number;
  percent_amount: number;
  lessons_amount: number;
  students_amount: number;
  total: number;
}

export interface SalaryListResponse {
  period_from: string;
  period_to: string;
  items: SalaryBreakdownRead[];
  total_payroll: number;
}

export interface TeacherCreate {
  first_name: string;
  last_name: string;
  middle_name?: string | null;
  phone?: string | null;
  is_active?: boolean;
  birth_date?: string | null;
  hire_date?: string | null;
  gender?: "male" | "female" | null;
  username?: string | null;
  password?: string | null;
  salary_monthly?: number;
  salary_percent?: number;
  salary_per_lesson?: number;
  salary_per_student?: number;
}

export interface TeacherUpdate {
  first_name?: string;
  last_name?: string;
  middle_name?: string | null;
  phone?: string | null;
  is_active?: boolean;
  birth_date?: string | null;
  hire_date?: string | null;
  gender?: "male" | "female" | null;
  username?: string | null;
  password?: string | null;
  salary_monthly?: number;
  salary_percent?: number;
  salary_per_lesson?: number;
  salary_per_student?: number;
}

export interface TeachersParams {
  skip?: number;
  limit?: number;
  is_active?: boolean;
  search?: string;
  sort?: string;
}

export interface TeacherSalaryParams {
  from?: string;
  to?: string;
}

// ── Query key factory ──────────────────────────────────────────────────────

export const teacherKeys = {
  all:    ["teachers"] as const,
  lists:  () => ["teachers", "list"] as const,
  list:   (params: TeachersParams) => ["teachers", "list", params] as const,
  detail: (id: number) => ["teachers", "detail", id] as const,
  salary: (id: number, params: TeacherSalaryParams) => ["teachers", "salary", id, params] as const,
  salaries: (params: TeacherSalaryParams) => ["teachers", "salaries", params] as const,
};

// ── Helpers ────────────────────────────────────────────────────────────────

function buildQs(params: TeachersParams): string {
  const q = new URLSearchParams();
  if (params.skip      !== undefined) q.set("skip",      String(params.skip));
  if (params.limit     !== undefined) q.set("limit",     String(params.limit));
  if (params.is_active !== undefined) q.set("is_active", String(params.is_active));
  if (params.search)                  q.set("search",    params.search);
  if (params.sort)                    q.set("sort",      params.sort);
  const s = q.toString();
  return s ? `?${s}` : "";
}

function buildSalaryQs(params: TeacherSalaryParams): string {
  const q = new URLSearchParams();
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function fullName(t: TeacherRead): string {
  return [t.last_name, t.first_name, t.middle_name].filter(Boolean).join(" ");
}

// ── Queries ────────────────────────────────────────────────────────────────

export function useTeachers(
  params: TeachersParams = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery<TeacherListResponse>({
    queryKey: teacherKeys.list(params),
    queryFn:  () => apiClient.get<TeacherListResponse>(`/teachers${buildQs(params)}`),
    staleTime: 30_000,
    enabled:  options.enabled ?? true,
  });
}

export function useTeacher(id: number | string) {
  return useQuery<TeacherRead>({
    queryKey: teacherKeys.detail(Number(id)),
    queryFn:  () => apiClient.get<TeacherRead>(`/teachers/${id}`),
    staleTime: 30_000,
    enabled:  !!id,
  });
}

export function useTeacherSalary(
  id: number | string | undefined,
  params: TeacherSalaryParams = {},
  options: { enabled?: boolean } = {},
) {
  const teacherId = Number(id);
  return useQuery<SalaryBreakdownRead>({
    queryKey: teacherKeys.salary(teacherId, params),
    queryFn: () => apiClient.get<SalaryBreakdownRead>(`/teachers/${teacherId}/salary${buildSalaryQs(params)}`),
    staleTime: 30_000,
    enabled: !!teacherId && (options.enabled ?? true),
  });
}

export function useAllSalaries(
  params: TeacherSalaryParams = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery<SalaryListResponse>({
    queryKey: teacherKeys.salaries(params),
    queryFn: () => apiClient.get<SalaryListResponse>(`/teachers/salaries${buildSalaryQs(params)}`),
    staleTime: 30_000,
    enabled: options.enabled ?? true,
  });
}

// ── Mutations ──────────────────────────────────────────────────────────────

export function useCreateTeacher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: TeacherCreate) => apiClient.post<TeacherRead>("/teachers", data),
    onSuccess: (newTeacher) => {
      // Inject into every list cache (preserves sort order from server on next invalidate)
      qc.setQueriesData<TeacherListResponse>(
        { queryKey: teacherKeys.lists() },
        (old) => old ? { ...old, items: [newTeacher, ...old.items], total: old.total + 1 } : old,
      );
      qc.setQueryData(teacherKeys.detail(newTeacher.id), newTeacher);
      qc.invalidateQueries({ queryKey: teacherKeys.all });
    },
  });
}

export function useUpdateTeacher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: TeacherUpdate }) =>
      apiClient.patch<TeacherRead>(`/teachers/${id}`, data),

    // Instant optimistic update — UI responds before server round-trip
    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: teacherKeys.all });
      const snapshots = qc.getQueriesData<TeacherListResponse | TeacherRead>({ queryKey: teacherKeys.all });

      qc.setQueriesData<TeacherListResponse>(
        { queryKey: teacherKeys.lists() },
        (old) => old
          ? { ...old, items: old.items.map((t) => t.id === id ? { ...t, ...data } : t) }
          : old,
      );
      qc.setQueryData<TeacherRead>(teacherKeys.detail(id), (old) =>
        old ? { ...old, ...data } : old,
      );
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      // Rollback on failure
      ctx?.snapshots?.forEach(([key, val]) => qc.setQueryData(key, val));
    },
    onSuccess: (updated) => {
      // Sync with authoritative server response
      qc.setQueryData(teacherKeys.detail(updated.id), updated);
      qc.invalidateQueries({ queryKey: teacherKeys.all });
    },
  });
}

export function useDeleteTeacher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.delete<void>(`/teachers/${id}`),

    // Instant optimistic removal
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: teacherKeys.all });
      const snapshots = qc.getQueriesData<TeacherListResponse | TeacherRead>({ queryKey: teacherKeys.all });

      qc.setQueriesData<TeacherListResponse>(
        { queryKey: teacherKeys.lists() },
        (old) => old
          ? { ...old, items: old.items.filter((t) => t.id !== id), total: old.total - 1 }
          : old,
      );
      qc.removeQueries({ queryKey: teacherKeys.detail(id) });
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.snapshots?.forEach(([key, val]) => qc.setQueryData(key, val));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: teacherKeys.all });
    },
  });
}
