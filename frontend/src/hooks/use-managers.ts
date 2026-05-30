import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

export interface ManagerRead {
  id: number;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  phone: string | null;
  username: string;
  is_active: boolean;
  position: string;
  birth_date: string | null;
  hire_date: string | null;
  gender: "male" | "female" | null;
  avatar_base64: string | null;
  has_account: boolean;
  created_at: string;
  updated_at: string;
}

export interface ManagerListResponse {
  items: ManagerRead[];
  total: number;
}

export interface ManagerCreate {
  first_name: string;
  last_name: string;
  middle_name?: string | null;
  phone?: string | null;
  username: string;
  password: string;
  is_active?: boolean;
  position?: string;
  birth_date?: string | null;
  hire_date?: string | null;
  gender?: string | null;
}

export interface ManagerUpdate {
  first_name?: string;
  last_name?: string;
  middle_name?: string | null;
  phone?: string | null;
  username?: string;
  password?: string;
  is_active?: boolean;
  position?: string;
  birth_date?: string | null;
  hire_date?: string | null;
  gender?: string | null;
}

export interface ManagersParams {
  skip?: number;
  limit?: number;
  is_active?: boolean;
  search?: string;
  sort?: string;
}

function buildQs(params: ManagersParams): string {
  const q = new URLSearchParams();
  if (params.skip      !== undefined) q.set("skip",      String(params.skip));
  if (params.limit     !== undefined) q.set("limit",     String(params.limit));
  if (params.is_active !== undefined) q.set("is_active", String(params.is_active));
  if (params.search)                  q.set("search",    params.search);
  if (params.sort)                    q.set("sort",      params.sort);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const managerKeys = {
  all:   ["managers"] as const,
  lists: () => ["managers", "list"] as const,
  list:  (params: ManagersParams) => ["managers", "list", params] as const,
};

export function useManagers(params: ManagersParams = {}) {
  return useQuery({
    queryKey: managerKeys.list(params),
    queryFn: () => apiClient.get<ManagerListResponse>(`/managers${buildQs(params)}`),
    staleTime: 30_000,
  });
}

export function useCreateManager() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ManagerCreate) =>
      apiClient.post<ManagerRead>("/managers", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: managerKeys.all });
    },
  });
}

export function useUpdateManager() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: ManagerUpdate }) =>
      apiClient.patch<ManagerRead>(`/managers/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: managerKeys.all });
    },
  });
}

export function useDeleteManager() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.delete(`/managers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: managerKeys.all });
    },
  });
}

export interface ManagerSummary {
  total_students: number;
  active_students: number;
  total_groups: number;
  active_groups: number;
  total_teachers: number;
  top_debtors: Array<{
    id: number;
    full_name: string | null;
    phone: string | null;
    debt_amount: number;
    overdue_days: number;
    group_code: string | null;
    course_name: string | null;
  }>;
  recent_students: Array<{
    id: number;
    full_name: string | null;
    phone: string | null;
    group_code: string | null;
    course_name: string | null;
    created_at: string;
  }>;
  upcoming_lessons_today: number;
  upcoming_lessons_tomorrow: number;
}

export function useManagerSummary() {
  return useQuery({
    queryKey: ["manager-summary"],
    queryFn: () => apiClient.get<ManagerSummary>("/manager/summary"),
  });
}
