import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";

export interface ManagerRead {
  id: number;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  phone: string | null;
  username: string;
  is_active: boolean;
  avatar_base64: string | null;
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
}

export interface ManagerUpdate {
  first_name?: string;
  last_name?: string;
  middle_name?: string | null;
  phone?: string | null;
  username?: string;
  password?: string;
  is_active?: boolean;
}

export function useManagers() {
  return useQuery({
    queryKey: ["managers"],
    queryFn: () => apiClient.get<ManagerListResponse>("/managers"),
  });
}

export function useCreateManager() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ManagerCreate) =>
      apiClient.post<ManagerRead>("/managers", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["managers"] });
    },
  });
}

export function useUpdateManager() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: ManagerUpdate }) =>
      apiClient.patch<ManagerRead>(`/managers/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["managers"] });
    },
  });
}

export function useDeleteManager() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.delete(`/managers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["managers"] });
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
