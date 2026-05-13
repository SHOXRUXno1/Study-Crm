import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────

export interface SalaryBreakdown {
  teacher_id: number;
  teacher_name: string;
  period_from: string;  // ISO YYYY-MM-DD
  period_to: string;    // ISO YYYY-MM-DD

  revenue: number;
  lessons_count: number;
  students_count: number;

  rate_monthly: number;
  rate_percent: number;       // 0..100
  rate_per_lesson: number;
  rate_per_student: number;

  monthly_amount: number;
  percent_amount: number;
  lessons_amount: number;
  students_amount: number;

  total: number;
}

export interface SalaryListResponse {
  period_from: string;
  period_to: string;
  items: SalaryBreakdown[];
  total_payroll: number;
}

export interface SalaryParams {
  /** ISO YYYY-MM-DD. Default on server: 1st of current month. */
  from?: string;
  /** ISO YYYY-MM-DD. Default on server: last day of current month. */
  to?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildQs(params: SalaryParams): string {
  const q = new URLSearchParams();
  if (params.from) q.set("from", params.from);
  if (params.to)   q.set("to",   params.to);
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** First day of the given month, ISO YYYY-MM-DD. */
export function monthStartIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Last day of the given month, ISO YYYY-MM-DD. */
export function monthEndIso(d: Date): string {
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
}

// ── Query key factory ──────────────────────────────────────────────────────

export const salaryKeys = {
  all:     ["salary"] as const,
  one:     (teacherId: number, params: SalaryParams) =>
             ["salary", "teacher", teacherId, params] as const,
  payroll: (params: SalaryParams) => ["salary", "payroll", params] as const,
};

// ── Queries ────────────────────────────────────────────────────────────────

/**
 * Salary breakdown for a single teacher in a given period.
 *
 * Visible to the admin (any teacher) and to the teacher themselves
 * (the backend rejects other combinations with 404).
 */
export function useTeacherSalary(
  teacherId: number | string | undefined,
  params: SalaryParams = {},
  options: { enabled?: boolean } = {},
) {
  const id = Number(teacherId);
  return useQuery<SalaryBreakdown>({
    queryKey: salaryKeys.one(id, params),
    queryFn:  () => apiClient.get<SalaryBreakdown>(`/teachers/${id}/salary${buildQs(params)}`),
    staleTime: 30_000,
    enabled:  !!id && (options.enabled ?? true),
  });
}

/** Admin-only: payroll for every active teacher. */
export function useAllSalaries(
  params: SalaryParams = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery<SalaryListResponse>({
    queryKey: salaryKeys.payroll(params),
    queryFn:  () => apiClient.get<SalaryListResponse>(`/teachers/salaries${buildQs(params)}`),
    staleTime: 30_000,
    enabled:  options.enabled ?? true,
  });
}
