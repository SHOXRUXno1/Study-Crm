import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { scheduleKeys } from "@/hooks/use-schedule";

// ── Types ──────────────────────────────────────────────────────────────────

export type AttendanceStatus = "present" | "absent" | "late" | "excused";
export type AbsenceReasonCode = "illness" | "family" | "other" | "none";
export type MarkedByRole = "admin" | "teacher";

export interface AttendanceMark {
  id: number;
  lesson_id: number;
  student_id: number;
  status: AttendanceStatus;
  late_minutes: number | null;
  reason_code: AbsenceReasonCode | null;
  reason_text: string | null;
  marked_by_role: MarkedByRole;
  marked_by_id: number | null;
  marked_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceMarkInput {
  student_id: number;
  status: AttendanceStatus;
  late_minutes?: number | null;
  reason_code?: AbsenceReasonCode | null;
  reason_text?: string | null;
}

export interface AttendanceRosterStudent {
  student_id: number;
  full_name: string;
  payment_status: string;
  mark: AttendanceMark | null;
}

export interface LessonAttendance {
  lesson_id: number;
  group_id: number;
  group_code: string;
  course_name: string | null;
  teacher_id: number | null;
  teacher_name: string | null;
  /** YYYY-MM-DD */
  lesson_date: string;
  /** HH:MM:SS */
  start_time: string;
  end_time: string;
  status: string;
  topic: string | null;
  notes: string | null;
  students: AttendanceRosterStudent[];
}

export interface JournalLesson {
  id: number;
  lesson_date: string;
  start_time: string;
  end_time: string;
  status: string;
  topic: string | null;
}

export interface JournalStudent {
  id: number;
  full_name: string;
  payment_status: string;
}

export interface JournalMark {
  status: AttendanceStatus;
  late_minutes: number | null;
  reason_code: AbsenceReasonCode | null;
  reason_text: string | null;
}

export interface JournalStudentStats {
  student_id: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  total: number;
  rate_pct: number;
}

export interface GroupJournal {
  group_id: number;
  group_code: string;
  course_name: string | null;
  teacher_id: number | null;
  teacher_name: string | null;
  days: string;
  lessons: JournalLesson[];
  students: JournalStudent[];
  /** marks[student_id][lesson_id] = JournalMark (sparse) */
  marks: Record<number, Record<number, JournalMark>>;
  stats: JournalStudentStats[];
  overall_rate_pct: number;
}

export interface StudentAttendanceEntry {
  lesson_id: number;
  group_id: number;
  group_code: string;
  lesson_date: string;
  start_time: string;
  end_time: string;
  lesson_status: string;
  topic: string | null;
  status: AttendanceStatus;
  late_minutes: number | null;
  reason_code: AbsenceReasonCode | null;
  reason_text: string | null;
}

// ── Query keys ─────────────────────────────────────────────────────────────

export const attendanceKeys = {
  all:               ["attendance"] as const,
  lesson:            (id: number) => ["attendance", "lesson", id] as const,
  groupJournal:      (groupId: number, from?: string, to?: string) =>
                       ["journal", "group", groupId, from ?? "*", to ?? "*"] as const,
  studentAttendance: (studentId: number, from?: string, to?: string) =>
                       ["attendance", "student", studentId, from ?? "*", to ?? "*"] as const,
};

// ── Queries ────────────────────────────────────────────────────────────────

export function useLessonAttendance(lessonId: number | null) {
  return useQuery<LessonAttendance>({
    queryKey: attendanceKeys.lesson(lessonId ?? 0),
    queryFn:  () => apiClient.get<LessonAttendance>(`/lessons/${lessonId}/attendance`),
    enabled:  lessonId != null,
    staleTime: 10_000,
  });
}

export function useGroupJournal(
  groupId: number | null,
  range?: { from?: string; to?: string },
  options?: { enabled?: boolean },
) {
  return useQuery<GroupJournal>({
    queryKey: attendanceKeys.groupJournal(groupId ?? 0, range?.from, range?.to),
    queryFn:  () => {
      const q = new URLSearchParams();
      if (range?.from) q.set("from", range.from);
      if (range?.to)   q.set("to",   range.to);
      const qs = q.toString();
      return apiClient.get<GroupJournal>(`/groups/${groupId}/journal${qs ? `?${qs}` : ""}`);
    },
    enabled:  groupId != null && (options?.enabled ?? true),
    staleTime: 15_000,
  });
}

export function useStudentAttendance(
  studentId: number | null,
  range?: { from?: string; to?: string },
) {
  return useQuery<StudentAttendanceEntry[]>({
    queryKey: attendanceKeys.studentAttendance(studentId ?? 0, range?.from, range?.to),
    queryFn:  () => {
      const q = new URLSearchParams();
      if (range?.from) q.set("from", range.from);
      if (range?.to)   q.set("to",   range.to);
      const qs = q.toString();
      return apiClient.get<StudentAttendanceEntry[]>(
        `/students/${studentId}/attendance${qs ? `?${qs}` : ""}`,
      );
    },
    enabled:   studentId != null,
    staleTime: 30_000,
  });
}

// ── Mutations ──────────────────────────────────────────────────────────────

/** Bulk upsert. The server replaces marks for the listed students and leaves
 * the rest of the roster untouched. Send only the cells you actually changed
 * for a safe partial update; send the whole roster for a full save. */
export function useUpsertAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      lessonId,
      marks,
    }: {
      lessonId: number;
      marks: AttendanceMarkInput[];
    }) =>
      apiClient.put<LessonAttendance>(`/lessons/${lessonId}/attendance`, {
        marks,
      }),
    onSuccess: (data) => {
      qc.setQueryData(attendanceKeys.lesson(data.lesson_id), data);
      qc.invalidateQueries({ queryKey: ["journal", "group", data.group_id] });
      qc.invalidateQueries({ queryKey: ["attendance", "student"] });
      qc.invalidateQueries({ queryKey: scheduleKeys.all });
    },
  });
}

/** Clear a single attendance mark — returns the cell to the "unmarked" state. */
export function useDeleteAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      lessonId,
      studentId,
    }: {
      lessonId: number;
      studentId: number;
    }) =>
      apiClient.delete<void>(
        `/lessons/${lessonId}/attendance/${studentId}`,
      ),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: attendanceKeys.lesson(vars.lessonId) });
      qc.invalidateQueries({ queryKey: ["journal", "group"] });
      qc.invalidateQueries({ queryKey: ["attendance", "student"] });
      qc.invalidateQueries({ queryKey: scheduleKeys.all });
    },
  });
}
