import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import type { DebtorRead } from "@/hooks/use-finance";
import type { RevenuePoint } from "@/hooks/use-analytics";

// ── Types (mirror backend/app/schemas/dashboard.py) ────────────────────────

export interface DashboardKpis {
  students_total: number;
  /** Active student count 30 days ago — used to compute the delta. */
  students_prev_total: number;
  groups_active: number;
  /** Active groups 30 days ago. */
  groups_prev_active: number;
  revenue_month: number;
  revenue_prev_month: number;
  attendance_rate_pct: number;
  /** Rolling window: today-60d..today-30d, for the MoM delta. */
  attendance_rate_prev_pct: number;
  /** paid MTD / billed MTD across active students, in percent. */
  collection_rate_pct: number;
}

export interface TodayStats {
  lessons_count: number;
  lessons_completed: number;
  lessons_active: number;
  expected_students: number;
  debtors_count: number;
  today_payments_total: number;
  today_payments_count: number;
}

export type TodayLessonStatus =
  | "scheduled"
  | "active"
  | "completed"
  | "cancelled"
  | "rescheduled";

export interface TodayLessonRow {
  id: number;
  group_id: number;
  /** "HH:MM" */
  start_time: string;
  /** "HH:MM" */
  end_time: string;
  course_name: string | null;
  group_code: string;
  teacher_name: string | null;
  room_name: string | null;
  student_count: number;
  status: TodayLessonStatus;
}

export type ActionItemKind =
  | "pending_journal"
  | "schedule_conflict"
  | "new_student_no_group"
  | "group_ending_soon"
  | "low_attendance_group"
  | "teacher_no_active_groups";

export type ActionItemSeverity = "info" | "warning" | "critical";

export interface ActionItem {
  kind: ActionItemKind;
  severity: ActionItemSeverity;
  title: string;
  detail: string | null;
  link: string;
  count: number;
}

export interface CourseDistributionRow {
  course_id: number | null;
  course_name: string;
  students_count: number;
}

export interface StudentGrowthPoint {
  /** "YYYY-MM" */
  month: string;
  new_students: number;
  total_students: number;
}

export type ActivityItemKind =
  | "payment"
  | "student_added"
  | "lesson_cancelled"
  | "lesson_rescheduled"
  | "group_created";

export interface ActivityItem {
  type: ActivityItemKind;
  title: string;
  detail: string | null;
  /** ISO datetime */
  happened_at: string;
  link: string | null;
}

export interface DashboardSummary {
  /** "YYYY-MM-DD" */
  today: string;
  kpis: DashboardKpis;
  today_stats: TodayStats;
  today_lessons: TodayLessonRow[];
  action_items: ActionItem[];
  top_debtors: DebtorRead[];
  debt_total: number;
  revenue_by_month: RevenuePoint[];
  students_growth: StudentGrowthPoint[];
  course_distribution: CourseDistributionRow[];
  recent_activity: ActivityItem[];
}

// ── Query key + hook ───────────────────────────────────────────────────────

export const dashboardKeys = {
  all: ["dashboard"] as const,
  summary: () => ["dashboard", "summary"] as const,
};

export function useDashboard() {
  return useQuery<DashboardSummary>({
    queryKey: dashboardKeys.summary(),
    queryFn: () => apiClient.get<DashboardSummary>("/dashboard/summary"),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
