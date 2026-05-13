import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────

export type NotificationKind =
  | "payment_received"
  | "lesson_cancelled"
  | "schedule_changed"
  | "schedule_conflict"
  | "new_student"
  | "course_enrollment"
  | "attendance_changed"
  | "debtor_overdue"
  | "group_ending"
  | "low_fill"
  | "unpaid_advance"
  | "low_attendance"
  | "open_conflicts";

export type NotificationSeverity = "info" | "success" | "warning" | "critical";

export interface NotificationRead {
  id: number;
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  body: string | null;
  link: string | null;
  payload: Record<string, unknown> | null;
  /** ISO datetime, null = unread. */
  read_at: string | null;
  /** ISO datetime. */
  created_at: string;
}

export interface NotificationListResponse {
  items: NotificationRead[];
  total: number;
  unread: number;
}

export interface UnreadCount {
  unread: number;
}

export interface ChannelPrefs {
  in_app: boolean;
  push: boolean;
  telegram: boolean;
}

export interface QuietHours {
  enabled: boolean;
  /** "HH:MM" or "HH:MM:SS". */
  start: string;
  end: string;
}

export interface NotificationPreferencesRead {
  kinds: Record<string, ChannelPrefs>;
  quiet_hours: QuietHours;
  telegram_username: string | null;
}

export interface NotificationPreferencesUpdate {
  kinds?: Record<string, ChannelPrefs>;
  quiet_hours?: QuietHours;
  telegram_username?: string | null;
}

// ── Query keys ─────────────────────────────────────────────────────────────

export interface ListParams {
  only_unread?: boolean;
  kind?: NotificationKind;
  /** ISO datetime cutoff. */
  since?: string;
  skip?: number;
  limit?: number;
}

export const notificationKeys = {
  all: ["notifications"] as const,
  list: (p: ListParams) => ["notifications", "list", p] as const,
  unread: () => ["notifications", "unread"] as const,
  prefs: () => ["notifications", "prefs"] as const,
};

const qs = (p: ListParams): string => {
  const sp = new URLSearchParams();
  if (p.only_unread) sp.set("only_unread", "true");
  if (p.kind) sp.set("kind", p.kind);
  if (p.since) sp.set("since", p.since);
  if (p.skip !== undefined) sp.set("skip", String(p.skip));
  if (p.limit !== undefined) sp.set("limit", String(p.limit));
  const s = sp.toString();
  return s ? `?${s}` : "";
};

// ── Hooks ──────────────────────────────────────────────────────────────────

export function useNotificationsList(params: ListParams = {}) {
  return useQuery<NotificationListResponse>({
    queryKey: notificationKeys.list(params),
    queryFn: () =>
      apiClient.get<NotificationListResponse>(`/notifications${qs(params)}`),
    staleTime: 15_000,
  });
}

export function useUnreadCount() {
  return useQuery<UnreadCount>({
    queryKey: notificationKeys.unread(),
    queryFn: () => apiClient.get<UnreadCount>("/notifications/unread-count"),
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

/** Mark notifications as read.
 *  - `ids: number[]` → mark just those.
 *  - `ids: null`    → mark all unread (server-side). */
export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[] | null) =>
      apiClient.post<{ updated: number }>("/notifications/mark-read", { ids }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useDeleteNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.delete<void>(`/notifications/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useDeleteRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete<void>("/notifications/read"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useNotificationPreferences() {
  return useQuery<NotificationPreferencesRead>({
    queryKey: notificationKeys.prefs(),
    queryFn: () =>
      apiClient.get<NotificationPreferencesRead>("/notifications/preferences"),
    staleTime: 60_000,
  });
}

export function useUpdateNotificationPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: NotificationPreferencesUpdate) =>
      apiClient.put<NotificationPreferencesRead>(
        "/notifications/preferences",
        patch,
      ),
    onSuccess: (data) => {
      qc.setQueryData(notificationKeys.prefs(), data);
    },
  });
}
