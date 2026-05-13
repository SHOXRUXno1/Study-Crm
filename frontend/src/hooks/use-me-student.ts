import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import type { StudentLedger } from "@/hooks/use-finance";
import type { StudentAttendanceEntry } from "@/hooks/use-attendance";
import type { ScheduleLesson } from "@/hooks/use-schedule";

// ── Types ──────────────────────────────────────────────────────────────────

export interface StudentSelfProfile {
  id: number;
  full_name: string;
  phone: string | null;
  parent_phone: string | null;
  gender: string | null;
  /** YYYY-MM-DD */
  birth_date: string | null;
  source: string | null;
  group_id: number | null;
  group_code: string | null;
  course_name: string | null;
  payment_status: string;
  is_active: boolean;
  created_at: string;
}

// ── Query keys ─────────────────────────────────────────────────────────────

export const meStudentKeys = {
  all: ["me-student"] as const,
  profile: () => ["me-student", "profile"] as const,
  ledger: (from?: string, to?: string) =>
    ["me-student", "ledger", from ?? "*", to ?? "*"] as const,
  attendance: (from?: string, to?: string) =>
    ["me-student", "attendance", from ?? "*", to ?? "*"] as const,
  schedule: (from: string, to: string) =>
    ["me-student", "schedule", from, to] as const,
};

// ── Helpers ────────────────────────────────────────────────────────────────

function qs(params: Record<string, string | number | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

// ── Queries ────────────────────────────────────────────────────────────────

export function useMyProfile(enabled = true) {
  return useQuery<StudentSelfProfile>({
    queryKey: meStudentKeys.profile(),
    queryFn: () => apiClient.get<StudentSelfProfile>("/me/student/profile"),
    staleTime: 30_000,
    enabled,
  });
}

export function useMyLedger(params: { from?: string; to?: string } = {}) {
  return useQuery<StudentLedger>({
    queryKey: meStudentKeys.ledger(params.from, params.to),
    queryFn: () =>
      apiClient.get<StudentLedger>(`/me/student/ledger${qs(params)}`),
    staleTime: 15_000,
  });
}

export function useMyAttendance(params: { from?: string; to?: string } = {}) {
  return useQuery<StudentAttendanceEntry[]>({
    queryKey: meStudentKeys.attendance(params.from, params.to),
    queryFn: () =>
      apiClient.get<StudentAttendanceEntry[]>(
        `/me/student/attendance${qs(params)}`,
      ),
    staleTime: 15_000,
  });
}

export function useMySchedule(params: { from: string; to: string }) {
  return useQuery<ScheduleLesson[]>({
    queryKey: meStudentKeys.schedule(params.from, params.to),
    queryFn: () =>
      apiClient.get<ScheduleLesson[]>(`/me/student/schedule${qs(params)}`),
    staleTime: 15_000,
    enabled: !!params.from && !!params.to,
  });
}
