import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

export interface AdminProfile {
  login: string;
  first_name: string | null;
  last_name: string | null;
  middle_name: string | null;
  phone: string | null;
  avatar_base64: string | null;
}

export interface ProfileUpdate {
  first_name: string | null;
  last_name: string | null;
  middle_name: string | null;
  phone: string | null;
  avatar_base64?: string | null;
}

export interface ChangePasswordPayload {
  old_password: string;
  new_password: string;
}

const QK = ["admin", "profile"];

export function useAdminProfile() {
  return useQuery<AdminProfile>({
    queryKey: QK,
    queryFn: () => apiClient.get<AdminProfile>("/auth/profile"),
    staleTime: 0,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ProfileUpdate) =>
      apiClient.patch<AdminProfile>("/auth/profile", data),
    onSuccess: (updated) => {
      qc.setQueryData(QK, updated);
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (data: ChangePasswordPayload) =>
      apiClient.post<{ message: string }>("/auth/change-password", data),
  });
}
