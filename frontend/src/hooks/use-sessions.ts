import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

export interface SessionItem {
  id: number;
  device_type: "desktop" | "mobile" | "tablet" | null;
  os_name: string | null;
  browser_name: string | null;
  ip_address: string | null;
  city: string | null;
  country: string | null;
  created_at: string;
  last_active_at: string;
  is_current: boolean;
}

interface SessionListResponse {
  items: SessionItem[];
}

const QK = ["sessions"];

export function useSessions() {
  return useQuery<SessionListResponse>({
    queryKey: QK,
    queryFn: () => apiClient.get<SessionListResponse>("/auth/sessions"),
    staleTime: 0,
  });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.delete<{ message: string }>(`/auth/sessions/${id}`),
    onSuccess: () => qc.refetchQueries({ queryKey: QK, type: "all" }),
  });
}

export function useLogoutAll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post<{ message: string }>("/auth/sessions/logout-all"),
    onSuccess: () => qc.refetchQueries({ queryKey: QK, type: "all" }),
  });
}

export function useLogout() {
  return useMutation({
    mutationFn: () => apiClient.post<{ message: string }>("/auth/logout"),
  });
}
