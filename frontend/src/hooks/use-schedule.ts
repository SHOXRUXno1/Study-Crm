import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import type { DaysType } from "@/hooks/use-groups";

// ── Types ──────────────────────────────────────────────────────────────────

export type LessonStatus =
  | "scheduled"
  | "cancelled"
  | "completed"
  | "rescheduled";

export interface ScheduleLesson {
  id: number;
  group_id: number;
  group_code: string;
  course_id: number | null;
  course_name: string | null;
  teacher_id: number | null;
  teacher_name: string | null;
  room_id: number | null;
  room_name: string | null;

  /** ISO date "YYYY-MM-DD" */
  lesson_date: string;
  /** "HH:MM:SS" */
  start_time: string;
  /** "HH:MM:SS" */
  end_time: string;

  status: LessonStatus;
  note: string | null;
  topic: string | null;
  notes: string | null;
  rescheduled_from_id: number | null;

  days: DaysType | string;
  max_students: number;
  student_count: number;
  duration_months: number;

  created_at: string;
  updated_at: string;
}

export interface ScheduleParams {
  /** ISO date YYYY-MM-DD inclusive */
  from: string;
  /** ISO date YYYY-MM-DD inclusive */
  to: string;
  teacher_id?: number;
  room_id?: number;
  group_id?: number;
  course_id?: number;
  status?: LessonStatus;
}

export interface LessonUpdate {
  teacher_id?: number | null;
  room_id?: number | null;
  lesson_date?: string;
  start_time?: string;
  end_time?: string;
  status?: LessonStatus;
  note?: string | null;
  topic?: string | null;
  notes?: string | null;
}

export interface LessonJournalUpdate {
  topic?: string | null;
  notes?: string | null;
}

export interface LessonReschedulePayload {
  new_date: string;
  new_start_time: string;
  new_end_time: string;
  note?: string;
}

// ── Query keys ─────────────────────────────────────────────────────────────

export const scheduleKeys = {
  all:    ["schedule"] as const,
  list:   (params: ScheduleParams) => ["schedule", "list", params] as const,
  detail: (id: number) => ["schedule", "detail", id] as const,
};

// ── Helpers ────────────────────────────────────────────────────────────────

function buildQs(params: ScheduleParams): string {
  const q = new URLSearchParams();
  q.set("from", params.from);
  q.set("to",   params.to);
  if (params.teacher_id !== undefined) q.set("teacher_id", String(params.teacher_id));
  if (params.room_id    !== undefined) q.set("room_id",    String(params.room_id));
  if (params.group_id   !== undefined) q.set("group_id",   String(params.group_id));
  if (params.course_id  !== undefined) q.set("course_id",  String(params.course_id));
  if (params.status)                   q.set("status",     params.status);
  return q.toString();
}

// ── Queries ────────────────────────────────────────────────────────────────

export function useSchedule(
  params: ScheduleParams,
  options?: { enabled?: boolean },
) {
  return useQuery<ScheduleLesson[]>({
    queryKey: scheduleKeys.list(params),
    queryFn:  () => apiClient.get<ScheduleLesson[]>(`/schedule?${buildQs(params)}`),
    staleTime: 15_000,
    enabled:  (options?.enabled ?? true) && !!params.from && !!params.to,
  });
}

export function useLesson(id: number | null) {
  return useQuery<ScheduleLesson>({
    queryKey: scheduleKeys.detail(id ?? 0),
    queryFn:  () => apiClient.get<ScheduleLesson>(`/lessons/${id}`),
    staleTime: 15_000,
    enabled:  id != null,
  });
}

// ── Mutations ──────────────────────────────────────────────────────────────

export function useUpdateLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: LessonUpdate }) =>
      apiClient.patch<ScheduleLesson>(`/lessons/${id}`, data),
    onSuccess: (updated) => {
      qc.setQueryData(scheduleKeys.detail(updated.id), updated);
      qc.invalidateQueries({ queryKey: scheduleKeys.all });
    },
  });
}

export function useCancelLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: number; note?: string }) =>
      apiClient.post<ScheduleLesson>(`/lessons/${id}/cancel`, note ? { note } : undefined),
    onSuccess: (updated) => {
      qc.setQueryData(scheduleKeys.detail(updated.id), updated);
      qc.invalidateQueries({ queryKey: scheduleKeys.all });
    },
  });
}

export function useRescheduleLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: LessonReschedulePayload }) =>
      apiClient.post<ScheduleLesson>(`/lessons/${id}/reschedule`, data),
    onSuccess: (newLesson) => {
      qc.setQueryData(scheduleKeys.detail(newLesson.id), newLesson);
      qc.invalidateQueries({ queryKey: scheduleKeys.all });
    },
  });
}

/** PATCH /lessons/{id}/journal — set topic/notes (admin or assigned teacher). */
export function useUpdateLessonJournal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: LessonJournalUpdate }) =>
      apiClient.patch<ScheduleLesson>(`/lessons/${id}/journal`, data),
    onSuccess: (updated) => {
      qc.setQueryData(scheduleKeys.detail(updated.id), updated);
      qc.invalidateQueries({ queryKey: scheduleKeys.all });
      qc.invalidateQueries({ queryKey: ["attendance"] });
      qc.invalidateQueries({ queryKey: ["journal"] });
    },
  });
}

// ── Utility helpers (UI-side) ──────────────────────────────────────────────

/** Parse "HH:MM" or "HH:MM:SS" → minutes since midnight. */
export function timeToMinutes(t: string): number {
  const [h = "0", m = "0"] = t.split(":");
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}

/** "HH:MM:SS" → "HH:MM". */
export function shortTime(t: string): string {
  return t.slice(0, 5);
}

/** Combine ISO date + HH:MM[:SS] → Date. */
export function lessonDateTime(dateISO: string, t: string): Date {
  const [hh = "0", mm = "0", ss = "0"] = t.split(":");
  const [Y, M, D] = dateISO.split("-").map(Number);
  return new Date(Y, (M ?? 1) - 1, D ?? 1, +hh, +mm, +ss);
}
