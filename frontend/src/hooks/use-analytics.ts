import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import type { MethodBreakdown } from "@/hooks/use-finance";

// ── Types ──────────────────────────────────────────────────────────────────

export type GenderFilter = "male" | "female";
export type SourceFilter = "instagram" | "telegram" | "recommended";

export interface AnalyticsKpis {
  students_active: number;
  groups_active: number;

  revenue_period: number;
  revenue_prev_period: number;

  debt_total: number;
  debtors_count: number;

  payments_count: number;
  avg_check: number;
}

export interface RevenuePoint {
  /** ISO YYYY-MM */
  month: string;
  revenue: number;
  debt: number;
}

export interface RevenueByCourse {
  course_id: number | null;
  course_name: string;
  revenue: number;
}

export interface TopGroupAttendance {
  group_id: number;
  code: string;
  course_name: string | null;
  rate_pct: number;
  total_marks: number;
}

export interface DemographicBreakdown {
  key: string;
  count: number;
}

export interface AnalyticsOverview {
  /** YYYY-MM-DD */
  period_from: string;
  /** YYYY-MM-DD */
  period_to: string;

  kpis: AnalyticsKpis;
  revenue_by_month: RevenuePoint[];
  revenue_by_course: RevenueByCourse[];
  payment_methods: MethodBreakdown[];
  top_groups_attendance: TopGroupAttendance[];
  students_by_gender: DemographicBreakdown[];
  students_by_source: DemographicBreakdown[];
}

// ── Hook ───────────────────────────────────────────────────────────────────

export interface AnalyticsOverviewParams {
  /** YYYY-MM-DD */
  from?: string;
  /** YYYY-MM-DD */
  to?: string;
  gender?: GenderFilter;
  source?: SourceFilter;
}

export const analyticsKeys = {
  overview: (p: AnalyticsOverviewParams) =>
    [
      "analytics",
      "overview",
      p.from ?? "*",
      p.to ?? "*",
      p.gender ?? "*",
      p.source ?? "*",
    ] as const,
};

export function useAnalyticsOverview(params: AnalyticsOverviewParams = {}) {
  return useQuery<AnalyticsOverview>({
    queryKey: analyticsKeys.overview(params),
    queryFn: () => {
      const q = new URLSearchParams();
      if (params.from)   q.set("from", params.from);
      if (params.to)     q.set("to",   params.to);
      if (params.gender) q.set("gender", params.gender);
      if (params.source) q.set("source", params.source);
      const qs = q.toString();
      return apiClient.get<AnalyticsOverview>(
        `/analytics/overview${qs ? `?${qs}` : ""}`,
      );
    },
    staleTime: 60_000,
  });
}
