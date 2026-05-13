import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

// ── Types (mirror backend/app/schemas/teacher_dashboard.py) ────────────────

export type TeacherLessonStatus =
  | "scheduled"
  | "active"
  | "completed"
  | "cancelled"
  | "rescheduled";

export interface TeacherLessonRow {
  id: number;
  group_id: number;
  group_code: string;
  course_name: string | null;
  room_name: string | null;
  teacher_name: string | null;
  /** "YYYY-MM-DD" */
  lesson_date: string;
  /** "HH:MM" */
  start_time: string;
  /** "HH:MM" */
  end_time: string;
  student_count: number;
  max_students: number;
  topic: string | null;
  has_attendance: boolean;
  status: TeacherLessonStatus;
}

export interface TeacherKpis {
  my_groups_total: number;
  my_groups_active: number;
  my_students_total: number;

  lessons_today: number;
  lessons_week_done: number;
  lessons_week_planned: number;
  lessons_month_done: number;

  attendance_rate_week_pct: number;
  attendance_rate_month_pct: number;
  attendance_delta_pct: number;

  pending_journals_count: number;
}

export interface PendingJournal {
  lesson_id: number;
  group_id: number;
  group_code: string;
  course_name: string | null;
  /** "YYYY-MM-DD" */
  lesson_date: string;
  /** "HH:MM" */
  start_time: string;
  days_ago: number;
  missing_topic: boolean;
  missing_attendance: boolean;
}

export interface ActionItems {
  pending_journals: PendingJournal[];
  concerning_students_count: number;
}

export interface WeeklyAttendancePoint {
  week_label: string;        // "W1" .. "W4"
  /** "YYYY-MM-DD" */
  week_start: string;
  /** "YYYY-MM-DD" */
  week_end: string;
  rate_pct: number;
  total_marks: number;
}

export type GroupHealth = "good" | "warn" | "bad";

export interface TeacherGroupRow {
  id: number;
  code: string;
  course_name: string | null;
  days: string;
  time_slot: string;
  student_count: number;
  max_students: number;
  fill_pct: number;
  attendance_rate_pct: number;
  debtors_count: number;
  /** "YYYY-MM-DD" or null */
  next_lesson_date: string | null;
  health: GroupHealth;
}

export interface ConcernStudent {
  student_id: number;
  full_name: string;
  group_id: number;
  group_code: string;
  absent_count: number;
  late_count: number;
  attendance_rate_pct: number;
  /** "YYYY-MM-DD" or null */
  last_absent_at: string | null;
}

export interface TeacherSummary {
  /** "YYYY-MM-DD" */
  today: string;
  teacher_id: number;
  teacher_name: string | null;

  kpis: TeacherKpis;
  action_items: ActionItems;

  current_lesson: TeacherLessonRow | null;
  next_lesson: TeacherLessonRow | null;
  today_lessons: TeacherLessonRow[];
  upcoming_week: TeacherLessonRow[];

  weekly_attendance: WeeklyAttendancePoint[];
  my_groups: TeacherGroupRow[];
  top_concerns: ConcernStudent[];
}

// ── Query key + hook ───────────────────────────────────────────────────────

export const teacherSummaryKeys = {
  all: ["teacher", "summary"] as const,
};

export function useTeacherSummary() {
  return useQuery<TeacherSummary>({
    queryKey: teacherSummaryKeys.all,
    queryFn: () => apiClient.get<TeacherSummary>("/teacher/summary"),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
