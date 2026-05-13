import {
  Users, GraduationCap, CreditCard, CalendarCheck,
  Clock, UserPlus, AlertTriangle, BookOpen, Wallet, Banknote,
  ChevronRight, CalendarDays,
  Sparkles, Activity, CircleDollarSign, CalendarX, CalendarClock,
  UsersRound, FileWarning, AlertOctagon, UserX, Hourglass, TrendingDown as TrendDown,
  TrendingUp, ArrowRight, CircleCheckBig, type LucideIcon,
} from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/hooks/use-language";
import { useNavigate } from "react-router-dom";
import { cn, formatNumber } from "@/lib/utils";
import {
  useDashboard,
  type ActionItem,
  type ActionItemKind,
  type ActionItemSeverity,
  type ActivityItem,
  type ActivityItemKind,
  type TodayLessonRow,
} from "@/hooks/use-dashboard";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell,
} from "recharts";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatUZS(amount: number): string {
  return formatNumber(amount);
}

function formatCompactUZS(amount: number, t: (k: string) => string): string {
  void t;
  return formatUZS(amount);
}

function monthLabel(ym: string, locale: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleString(locale, { month: "short" });
}

function relativeTime(iso: string, t: (k: string) => string): string {
  const then = new Date(iso).getTime();
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return t("time.now");
  const minutes = Math.floor(diffSec / 60);
  if (minutes < 60) return `${minutes} ${t("time.minShort")}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${t("time.hourShort")}`;
  const days = Math.floor(hours / 24);
  return `${days} ${t("time.daysShort")}`;
}

function pctChange(curr: number, prev: number): { text: string; type: "positive" | "negative" | "neutral" } {
  if (prev === 0) {
    if (curr === 0) return { text: "0%", type: "neutral" };
    return { text: "+100%", type: "positive" };
  }
  const delta = ((curr - prev) / prev) * 100;
  const rounded = Math.round(delta * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return {
    text: `${sign}${rounded}%`,
    type: rounded > 0 ? "positive" : rounded < 0 ? "negative" : "neutral",
  };
}

function absDelta(curr: number, prev: number): { text: string; type: "positive" | "negative" | "neutral" } {
  const delta = curr - prev;
  if (delta === 0) return { text: "0", type: "neutral" };
  const sign = delta > 0 ? "+" : "";
  return {
    text: `${sign}${delta}`,
    type: delta > 0 ? "positive" : "negative",
  };
}

function ppDelta(curr: number, prev: number): { text: string; type: "positive" | "negative" | "neutral" } {
  const delta = curr - prev;
  if (delta === 0) return { text: "0 pp", type: "neutral" };
  const sign = delta > 0 ? "+" : "";
  return {
    text: `${sign}${delta} pp`,
    type: delta > 0 ? "positive" : "negative",
  };
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

const COURSE_PALETTE = [
  "hsl(234 85% 55%)",
  "hsl(152 69% 31%)",
  "hsl(38 92% 50%)",
  "hsl(340 65% 55%)",
  "hsl(280 65% 55%)",
  "hsl(195 75% 45%)",
  "hsl(20 85% 55%)",
];

// ── Tooltip ────────────────────────────────────────────────────────────────

function CustomTooltipFactory(t: (k: string) => string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-xl border border-border/60 bg-card px-4 py-2.5 shadow-lg backdrop-blur-sm">
        <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {payload.map((p: any, i: number) => (
          <p key={i} className="text-sm font-bold text-foreground">
            {p.dataKey === "revenue"
              ? `${formatCompactUZS(p.value, t)} UZS`
              : formatNumber(Number(p.value))}
          </p>
        ))}
      </div>
    );
  };
}

// ── Action items metadata ─────────────────────────────────────────────────

const ACTION_ICON: Record<ActionItemKind, LucideIcon> = {
  pending_journal: FileWarning,
  schedule_conflict: AlertOctagon,
  new_student_no_group: UserX,
  group_ending_soon: Hourglass,
  low_attendance_group: TrendDown,
  teacher_no_active_groups: GraduationCap,
};

const SEVERITY_CLS: Record<ActionItemSeverity, { ring: string; iconBg: string; iconText: string; chip: string }> = {
  critical: {
    ring: "border-destructive/30 hover:border-destructive/60",
    iconBg: "bg-destructive/10",
    iconText: "text-destructive",
    chip: "bg-destructive/10 text-destructive",
  },
  warning: {
    ring: "border-warning/30 hover:border-warning/60",
    iconBg: "bg-warning/10",
    iconText: "text-warning",
    chip: "bg-warning/10 text-warning",
  },
  info: {
    ring: "border-border/40 hover:border-primary/40",
    iconBg: "bg-primary/10",
    iconText: "text-primary",
    chip: "bg-primary/10 text-primary",
  },
};

// ── Activity icon mapping ──────────────────────────────────────────────────

const ACTIVITY_ICON: Record<ActivityItemKind, LucideIcon> = {
  payment: CircleDollarSign,
  student_added: Sparkles,
  lesson_cancelled: CalendarX,
  lesson_rescheduled: CalendarClock,
  group_created: UsersRound,
};

const ACTIVITY_COLOR: Record<ActivityItemKind, string> = {
  payment: "bg-gradient-to-br from-success/20 to-success/5 text-success",
  student_added: "bg-gradient-to-br from-primary/20 to-primary/5 text-primary",
  lesson_cancelled: "bg-gradient-to-br from-destructive/20 to-destructive/5 text-destructive",
  lesson_rescheduled: "bg-gradient-to-br from-warning/20 to-warning/5 text-warning",
  group_created: "bg-gradient-to-br from-accent/30 to-accent/10 text-accent-foreground",
};

const ACTIVITY_TITLE_KEY: Record<ActivityItemKind, string> = {
  payment: "dash.eventPayment",
  student_added: "dash.eventNewStudent",
  lesson_cancelled: "dash.event.lessonCancelled",
  lesson_rescheduled: "dash.event.lessonRescheduled",
  group_created: "dash.event.groupCreated",
};

// ── Skeleton ───────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-5 sm:space-y-6">
      <Skeleton className="h-5 w-40" />
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-32" />
        </div>
      </div>
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-32 rounded-2xl" />
      <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-5">
        <Skeleton className="lg:col-span-3 h-96 rounded-2xl" />
        <Skeleton className="lg:col-span-2 h-96 rounded-2xl" />
      </div>
      <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-5">
        <Skeleton className="lg:col-span-3 h-72 rounded-2xl" />
        <Skeleton className="lg:col-span-2 h-72 rounded-2xl" />
      </div>
      <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useDashboard();
  const CustomTooltip = CustomTooltipFactory(t);

  const localeMap: Record<string, string> = { en: "en-US", ru: "ru-RU", uz: "uz-UZ" };
  const locale = localeMap[language] ?? "en-US";

  const currentHour = new Date().getHours();
  const greeting =
    currentHour < 12
      ? t("dash.goodMorning")
      : currentHour < 18
      ? t("dash.goodAfternoon")
      : t("dash.goodEvening");

  if (isLoading) {
    return (
      <>
        <Breadcrumbs items={[{ label: t("dashboard.title") }]} />
        <DashboardSkeleton />
      </>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-5">
        <Breadcrumbs items={[{ label: t("dashboard.title") }]} />
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
          <AlertTriangle className="h-10 w-10 text-destructive mx-auto mb-3" />
          <p className="text-sm font-semibold text-foreground mb-1">
            {t("common.error")}
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            {t("dash.loadError")}
          </p>
          <Button size="sm" onClick={() => refetch()}>
            {t("dash.retry")}
          </Button>
        </div>
      </div>
    );
  }

  const {
    kpis, today_stats, today_lessons, action_items, top_debtors, debt_total,
    revenue_by_month, students_growth, course_distribution, recent_activity,
  } = data;

  const studentsDelta = absDelta(kpis.students_total, kpis.students_prev_total);
  const groupsDelta = absDelta(kpis.groups_active, kpis.groups_prev_active);
  const revenueChange = pctChange(kpis.revenue_month, kpis.revenue_prev_month);
  const attendanceDelta = ppDelta(kpis.attendance_rate_pct, kpis.attendance_rate_prev_pct);

  const enrollmentChartData = students_growth.map((p) => ({
    month: monthLabel(p.month, locale),
    students: p.total_students,
  }));
  const revenueChartData = revenue_by_month.map((p) => ({
    month: monthLabel(p.month, locale),
    revenue: p.revenue,
  }));

  const totalCourseStudents = course_distribution.reduce(
    (s, r) => s + r.students_count, 0,
  );
  const courseChartData = course_distribution
    .filter((r) => r.students_count > 0)
    .map((r, i) => ({
      name: r.course_name,
      value: r.students_count,
      pct: totalCourseStudents > 0
        ? Math.round((r.students_count / totalCourseStudents) * 100)
        : 0,
      color: COURSE_PALETTE[i % COURSE_PALETTE.length],
    }));

  return (
    <div className="space-y-5 sm:space-y-6">
      <Breadcrumbs items={[{ label: t("dashboard.title") }]} />

      {/* Greeting + quick actions */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            {greeting}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {t("dash.todaySummary")}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" className="text-xs gap-1.5" onClick={() => navigate("/students")}>
            <UserPlus className="h-3.5 w-3.5" /> {t("dash.addStudent")}
          </Button>
          <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => navigate("/payments")}>
            <Wallet className="h-3.5 w-3.5" /> {t("dash.recordPayment")}
          </Button>
          <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => navigate("/groups")}>
            <GraduationCap className="h-3.5 w-3.5" /> {t("dash.createGroup")}
          </Button>
        </div>
      </div>

      {/* KPI Cards (4 — students / groups / revenue / collection) */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <KpiTile
          title={t("dashboard.totalStudents")}
          value={formatNumber(kpis.students_total)}
          delta={studentsDelta}
          deltaLabel={t("dash.kpiDelta.last30d")}
          icon={Users}
          accent="indigo"
          onClick={() => navigate("/students")}
        />
        <KpiTile
          title={t("dashboard.activeGroups")}
          value={formatNumber(kpis.groups_active)}
          delta={groupsDelta}
          deltaLabel={t("dash.kpiDelta.last30d")}
          icon={GraduationCap}
          accent="emerald"
          onClick={() => navigate("/groups")}
        />
        <KpiTile
          title={t("dashboard.monthlyRevenue")}
          value={formatCompactUZS(kpis.revenue_month, t)}
          delta={revenueChange}
          deltaLabel={t("dashboard.vsLastMonth")}
          icon={CreditCard}
          accent="amber"
          onClick={() => navigate("/payments")}
        />
        <KpiTile
          title={t("dash.collection")}
          value={`${kpis.collection_rate_pct}%`}
          deltaLabel={t("dash.collectionSub")}
          icon={CircleCheckBig}
          accent={kpis.collection_rate_pct >= 80 ? "emerald" : kpis.collection_rate_pct >= 50 ? "amber" : "rose"}
          onClick={() => navigate("/debtors")}
        />
      </div>

      {/* Today bar (compact 4 tiles) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <TodayTile
          icon={CalendarDays}
          accent="primary"
          label={t("dash.lessonsToday")}
          value={formatNumber(today_stats.lessons_count)}
          sub={`${today_stats.lessons_completed} ${t("dash.lessonsCompletedSub")} · ${today_stats.lessons_active} ${t("dash.lessonsActiveSub")}`}
          onClick={() => navigate("/schedule")}
        />
        <TodayTile
          icon={Banknote}
          accent="primary"
          label={t("dash.todayPayments")}
          value={formatCompactUZS(today_stats.today_payments_total, t)}
          sub={`${today_stats.today_payments_count} ${t("dash.paymentsCountSub")}`}
          onClick={() => navigate("/payments")}
        />
        <TodayTile
          icon={AlertTriangle}
          accent="warning"
          label={t("dash.debtorsCount")}
          value={formatNumber(today_stats.debtors_count)}
          sub={`${formatCompactUZS(debt_total, t)} UZS`}
          onClick={() => navigate("/debtors")}
        />
        <TodayTile
          icon={CalendarCheck}
          accent={kpis.attendance_rate_pct >= 80 ? "success" : "warning"}
          label={t("dashboard.attendanceRate")}
          value={`${kpis.attendance_rate_pct}%`}
          sub={attendanceDelta.text + " " + t("dash.kpiDelta.vsPrev")}
          onClick={() => navigate("/journal")}
        />
      </div>

      {/* Action Items panel */}
      <ActionItemsPanel items={action_items} t={t} navigate={navigate} />

      {/* Schedule + Debtors */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-5">
        {/* Schedule */}
        <div className="lg:col-span-3 rounded-2xl border border-border/40 bg-gradient-to-br from-card via-card to-primary/[0.02] p-4 sm:p-5 relative overflow-hidden" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="absolute top-0 right-0 h-32 w-32 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-center justify-between mb-4 relative">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/25 to-primary/5 shadow-sm ring-1 ring-primary/10">
                <Clock className="h-5 w-5 text-primary" strokeWidth={2} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-card-foreground flex items-center gap-2">
                  {t("dashboard.todaySchedule")}
                  <span className="text-[10px] font-semibold text-primary bg-primary/10 rounded-full px-2 py-0.5">
                    {today_lessons.length}
                  </span>
                </h3>
                <p className="text-[11px] text-muted-foreground">{t("dash.lessonsTimeline")}</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7 gap-1 hover:text-primary" onClick={() => navigate("/schedule")}>
              {t("dashboard.viewAll")} <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
          {today_lessons.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <CalendarDays className="h-10 w-10 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">{t("dash.noLessonsToday")}</p>
            </div>
          ) : (
            <div className="space-y-2 relative">
              {today_lessons.map((lesson, i) => (
                <LessonRow
                  key={lesson.id}
                  lesson={lesson}
                  isLast={i === today_lessons.length - 1}
                  delay={i * 40}
                  onClick={() => navigate(`/groups/${lesson.group_id}`)}
                  t={t}
                />
              ))}
            </div>
          )}
        </div>

        {/* Debtors */}
        <div className="lg:col-span-2 rounded-2xl border border-border/40 bg-card p-4 sm:p-5" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-warning/25 to-warning/5 shadow-sm">
                <AlertTriangle className="h-4 w-4 text-warning" strokeWidth={2} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-card-foreground">{t("dash.debtorsAlert")}</h3>
                <p className="text-[11px] text-muted-foreground">{t("dash.requireAttention")}</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7 gap-1" onClick={() => navigate("/debtors")}>
              {t("dashboard.viewAll")} <ChevronRight className="h-3 w-3" />
            </Button>
          </div>

          {/* Debt summary chips */}
          <div className="rounded-xl bg-warning/5 border border-warning/20 p-3 mb-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("dash.totalDebt")}</span>
                <span className="text-base font-extrabold text-warning leading-tight">
                  {formatUZS(debt_total)} UZS
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("dash.activeDebtors")}</span>
                <span className="text-base font-extrabold text-foreground leading-tight">
                  {today_stats.debtors_count}
                </span>
              </div>
            </div>
          </div>

          {top_debtors.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10 mb-2">
                <CalendarCheck className="h-6 w-6 text-success" />
              </div>
              <p className="text-sm font-semibold text-foreground">{t("dash.noDebtors")}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{t("dash.allClear")}</p>
            </div>
          ) : (
            <div className="space-y-1">
              {top_debtors.map((d, i) => (
                <div
                  key={d.id}
                  className="flex items-center gap-3 rounded-lg p-2.5 hover:bg-muted/30 transition-colors animate-fade-in cursor-pointer"
                  style={{ animationDelay: `${i * 50}ms` }}
                  onClick={() => navigate(`/students/${d.id}`)}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-xs font-bold text-muted-foreground shrink-0">
                    {initials(d.full_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{d.full_name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {d.group_code ?? "—"}
                      {d.overdue_days > 0 && ` · ${d.overdue_days} ${t("dash.daysOverdue")}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-warning">{formatUZS(d.debt_amount)}</p>
                    <p className="text-[9px] text-muted-foreground">UZS</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Charts */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-5">
        <div className="lg:col-span-3 rounded-2xl border border-border/40 bg-card p-4 sm:p-5" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-card-foreground">{t("dashboard.studentGrowth")}</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">{t("dashboard.enrollmentTrend")}</p>
            </div>
            <div className="flex items-center gap-1.5 bg-muted/40 rounded-lg px-2 py-0.5">
              <div className="h-2 w-2 rounded-full bg-primary" />
              <span className="text-[10px] font-medium text-muted-foreground">{t("dashboard.students")}</span>
            </div>
          </div>
          <div className="h-48 sm:h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={enrollmentChartData} margin={{ top: 5, right: 5, bottom: 0, left: -15 }}>
                <defs>
                  <linearGradient id="enrollGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(234 85% 55%)" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="hsl(234 85% 55%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(220 9% 46%)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(220 9% 46%)" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="students" stroke="hsl(234 85% 55%)" strokeWidth={2} fill="url(#enrollGrad)" dot={false} activeDot={{ r: 4, strokeWidth: 2, fill: "hsl(0 0% 100%)", stroke: "hsl(234 85% 55%)" }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-2 rounded-2xl border border-border/40 bg-card p-4 sm:p-5" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-card-foreground">{t("dashboard.revenue")}</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">{t("dashboard.monthlyRevenueSub")}</p>
            </div>
            {revenueChange.type !== "neutral" && (
              <span className={cn(
                "text-[10px] font-bold rounded-full px-2 py-0.5",
                revenueChange.type === "positive"
                  ? "text-success bg-success/10"
                  : "text-destructive bg-destructive/10",
              )}>
                {revenueChange.text}
              </span>
            )}
          </div>
          <div className="h-48 sm:h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueChartData} margin={{ top: 5, right: 5, bottom: 0, left: -15 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(220 9% 46%)" }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(220 9% 46%)" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => formatCompactUZS(Number(v), t)}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="revenue" fill="hsl(234 85% 55%)" radius={[6, 6, 0, 0]} barSize={14} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom: Course distribution + Recent activity */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-2">
        <div className="rounded-2xl border border-border/40 bg-card p-4 sm:p-5" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-card-foreground">{t("dashboard.courseDistribution")}</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">{t("dashboard.courseDistSub")}</p>
            </div>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <GraduationCap className="h-3.5 w-3.5 text-primary" strokeWidth={1.8} />
            </div>
          </div>
          {courseChartData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <BookOpen className="h-10 w-10 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">{t("dash.noCourses")}</p>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="h-44 sm:h-52 w-1/2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={courseChartData} cx="50%" cy="50%" innerRadius="55%" outerRadius="85%" paddingAngle={3} dataKey="value" stroke="none">
                      {courseChartData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const p: any = payload[0].payload;
                        return (
                          <div className="rounded-xl border border-border/60 bg-card px-3 py-2 shadow-lg">
                            <p className="text-xs font-medium text-muted-foreground">{p.name}</p>
                            <p className="text-sm font-bold text-foreground">
                              {p.value} · {p.pct}%
                            </p>
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-2.5">
                {courseChartData.slice(0, 6).map((course, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: course.color }} />
                    <span className="text-xs text-muted-foreground truncate flex-1">{course.name}</span>
                    <span className="text-xs font-bold text-foreground">{course.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border/40 bg-gradient-to-br from-card via-card to-accent/[0.03] p-4 sm:p-5 relative overflow-hidden" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="absolute -top-8 -right-8 h-32 w-32 bg-accent/10 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-center justify-between mb-4 relative">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent/40 shadow-sm ring-1 ring-border/50">
                <Activity className="h-5 w-5 text-accent-foreground" strokeWidth={2} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-card-foreground flex items-center gap-2">
                  {t("dashboard.recentActivity")}
                  <span className="flex h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                </h3>
                <p className="text-[11px] text-muted-foreground">{t("dashboard.latestUpdates")}</p>
              </div>
            </div>
          </div>
          {recent_activity.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Activity className="h-10 w-10 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">{t("dash.noActivity")}</p>
            </div>
          ) : (
            <div className="space-y-1 relative">
              {recent_activity.map((ev, i) => (
                <ActivityRow
                  key={i}
                  ev={ev}
                  delay={i * 50}
                  t={t}
                  onClick={() => ev.link && navigate(ev.link)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

const KPI_ACCENT: Record<string, { iconBg: string; iconText: string; bar: string; gradient: string }> = {
  indigo: { iconBg: "bg-primary/10", iconText: "text-primary", bar: "from-primary to-primary/60", gradient: "from-primary/[0.03] via-transparent to-transparent" },
  emerald: { iconBg: "bg-success/10", iconText: "text-success", bar: "from-success to-success/60", gradient: "from-success/[0.03] via-transparent to-transparent" },
  amber: { iconBg: "bg-warning/10", iconText: "text-warning", bar: "from-warning to-warning/60", gradient: "from-warning/[0.03] via-transparent to-transparent" },
  rose: { iconBg: "bg-destructive/10", iconText: "text-destructive", bar: "from-destructive to-destructive/60", gradient: "from-destructive/[0.03] via-transparent to-transparent" },
};

function KpiTile({
  title, value, delta, deltaLabel, icon: Icon, accent, onClick,
}: {
  title: string;
  value: string;
  delta?: { text: string; type: "positive" | "negative" | "neutral" };
  deltaLabel: string;
  icon: LucideIcon;
  accent: "indigo" | "emerald" | "amber" | "rose";
  onClick: () => void;
}) {
  const a = KPI_ACCENT[accent];
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative overflow-hidden rounded-2xl border border-border/40 bg-card p-4 sm:p-6 text-left transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 animate-fade-in"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className={cn("absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r", a.bar)} />
      <div className={cn("absolute inset-0 bg-gradient-to-br pointer-events-none", a.gradient)} />
      <div className="relative flex items-start justify-between">
        <div className="space-y-2 sm:space-y-3 min-w-0 flex-1">
          <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-widest text-muted-foreground truncate">
            {title}
          </p>
          <p className="text-2xl sm:text-[2rem] font-extrabold tracking-tight text-card-foreground leading-none">
            {value}
          </p>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            {delta ? (
              delta.type === "positive" ? (
                <div className="flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1">
                  <TrendingUp className="h-3 w-3 text-success" />
                  <span className="text-[11px] font-bold text-success">{delta.text}</span>
                </div>
              ) : delta.type === "negative" ? (
                <div className="flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1">
                  <TrendDown className="h-3 w-3 text-destructive" />
                  <span className="text-[11px] font-bold text-destructive">{delta.text}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 rounded-full bg-muted/50 px-2.5 py-1">
                  <span className="text-[11px] font-bold text-muted-foreground">{delta.text}</span>
                </div>
              )
            ) : null}
            <span className="text-[10px] sm:text-xs text-muted-foreground hidden sm:inline">
              {deltaLabel}
            </span>
          </div>
        </div>
        <div className={cn("hidden sm:flex h-12 w-12 items-center justify-center rounded-2xl transition-all duration-300 group-hover:scale-110 group-hover:shadow-md", a.iconBg)}>
          <Icon className={cn("h-5 w-5", a.iconText)} strokeWidth={2} />
        </div>
      </div>
    </button>
  );
}

const TODAY_ACCENT: Record<string, { iconBg: string; iconText: string; border: string }> = {
  primary: { iconBg: "bg-gradient-to-br from-primary/20 to-primary/5", iconText: "text-primary", border: "border-primary/20" },
  success: { iconBg: "bg-gradient-to-br from-success/20 to-success/5", iconText: "text-success", border: "border-success/20" },
  warning: { iconBg: "bg-gradient-to-br from-warning/20 to-warning/5", iconText: "text-warning", border: "border-warning/20" },
};

function TodayTile({
  icon: Icon, accent, label, value, sub, onClick,
}: {
  icon: LucideIcon;
  accent: "primary" | "success" | "warning";
  label: string;
  value: string;
  sub?: string;
  onClick: () => void;
}) {
  const a = TODAY_ACCENT[accent];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex items-center gap-3 rounded-xl border bg-card p-3 sm:p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-primary/40",
        a.border,
      )}
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl shrink-0 transition-transform duration-200 group-hover:scale-110", a.iconBg)}>
        <Icon className={cn("h-5 w-5", a.iconText)} strokeWidth={1.8} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-lg sm:text-xl font-extrabold text-foreground leading-none">{value}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{label}</p>
        {sub && (
          <p className="text-[10px] text-muted-foreground/80 mt-0.5 truncate">{sub}</p>
        )}
      </div>
    </button>
  );
}

function ActionItemsPanel({
  items, t, navigate,
}: {
  items: ActionItem[];
  t: (k: string) => string;
  navigate: (path: string) => void;
}) {
  return (
    <div
      className="rounded-2xl border border-border/40 bg-card p-4 sm:p-5"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-warning/25 to-warning/5 shadow-sm">
            <AlertOctagon className="h-4 w-4 text-warning" strokeWidth={2} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-card-foreground flex items-center gap-2">
              {t("dash.actionItems.title")}
              {items.length > 0 && (
                <span className="text-[10px] font-semibold text-warning bg-warning/10 rounded-full px-2 py-0.5">
                  {items.length}
                </span>
              )}
            </h3>
            <p className="text-[11px] text-muted-foreground">{t("dash.actionItems.sub")}</p>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-success/20 bg-success/5 p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-success/10">
            <CalendarCheck className="h-4 w-4 text-success" strokeWidth={2} />
          </div>
          <p className="text-sm font-medium text-foreground">{t("dash.actionItems.empty")}</p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {items.map((it, i) => {
            const Icon = ACTION_ICON[it.kind];
            const cls = SEVERITY_CLS[it.severity];
            return (
              <button
                key={i}
                type="button"
                onClick={() => navigate(it.link)}
                className={cn(
                  "group flex items-center gap-3 rounded-xl border bg-card p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
                  cls.ring,
                )}
              >
                <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl shrink-0", cls.iconBg)}>
                  <Icon className={cn("h-4 w-4", cls.iconText)} strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground truncate">{it.title}</p>
                    <span className={cn("text-[10px] font-bold rounded-full px-1.5 py-0.5", cls.chip)}>
                      {it.count}
                    </span>
                  </div>
                  {it.detail && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      {it.detail}
                    </p>
                  )}
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LessonRow({
  lesson, isLast, delay, onClick, t,
}: {
  lesson: TodayLessonRow;
  isLast: boolean;
  delay: number;
  onClick: () => void;
  t: (k: string) => string;
}) {
  const cancelled = lesson.status === "cancelled" || lesson.status === "rescheduled";
  return (
    <div className="flex items-stretch gap-3 animate-fade-in" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex flex-col items-center pt-1 shrink-0 w-12">
        <span className={cn(
          "text-xs font-bold font-mono",
          lesson.status === "active"
            ? "text-primary"
            : lesson.status === "completed"
            ? "text-muted-foreground/60"
            : cancelled
            ? "text-destructive/70 line-through"
            : "text-foreground",
        )}>
          {lesson.start_time}
        </span>
        <span className="text-[9px] text-muted-foreground/70 mt-0.5">{lesson.end_time}</span>
        {!isLast && (
          <div className={cn(
            "w-px flex-1 mt-1.5",
            lesson.status === "completed"
              ? "bg-border/30"
              : "bg-gradient-to-b from-border/60 to-border/20",
          )} />
        )}
      </div>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex-1 rounded-xl border p-3 text-left transition-all duration-200 cursor-pointer",
          lesson.status === "active"
            ? "border-primary/40 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent shadow-sm ring-1 ring-primary/10"
            : lesson.status === "completed"
            ? "border-border/20 bg-muted/20 opacity-60 hover:opacity-80"
            : cancelled
            ? "border-destructive/20 bg-destructive/5 opacity-70"
            : "border-border/30 bg-muted/10 hover:bg-muted/30 hover:border-border/50 hover:-translate-y-0.5 hover:shadow-sm",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {lesson.course_name ?? lesson.group_code}
            </p>
            {lesson.status === "active" && (
              <span className="flex items-center gap-1 text-[9px] font-bold text-primary bg-primary/15 rounded-full px-2 py-0.5 shrink-0">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                {t("dash.now")}
              </span>
            )}
            {lesson.status === "completed" && (
              <span className="text-[9px] font-medium text-success bg-success/10 rounded-full px-2 py-0.5 shrink-0">✓</span>
            )}
            {cancelled && (
              <span className="text-[9px] font-medium text-destructive bg-destructive/10 rounded-full px-2 py-0.5 shrink-0">
                {lesson.status === "cancelled" ? t("dash.cancelled") : t("dash.rescheduled")}
              </span>
            )}
          </div>
          <span className="text-[10px] font-medium text-muted-foreground bg-muted/60 rounded-full px-2 py-0.5 shrink-0">
            {lesson.student_count} {t("dashboard.studentsCount")}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
          <span className="font-medium truncate">{lesson.teacher_name ?? "—"}</span>
          <span className="text-muted-foreground/40">·</span>
          <span className="truncate">{lesson.group_code}</span>
          {lesson.room_name && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="inline-flex items-center gap-1 truncate">
                <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                {t("dash.room")} {lesson.room_name}
              </span>
            </>
          )}
        </div>
      </button>
    </div>
  );
}

function ActivityRow({
  ev, delay, t, onClick,
}: {
  ev: ActivityItem;
  delay: number;
  t: (k: string) => string;
  onClick: () => void;
}) {
  const Icon = ACTIVITY_ICON[ev.type];
  const iconBg = ACTIVITY_COLOR[ev.type];
  const titleKey = ACTIVITY_TITLE_KEY[ev.type];
  const clickable = !!ev.link;
  return (
    <button
      type="button"
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      className={cn(
        "w-full flex items-center gap-3 rounded-xl p-2.5 text-left animate-fade-in transition-all duration-200",
        clickable && "hover:bg-muted/40 hover:translate-x-0.5",
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-border/30", iconBg)}>
        <Icon className="h-4 w-4" strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{t(titleKey)}</p>
        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
          <span className="font-medium text-foreground/80">{ev.title}</span>
          {ev.detail ? ` · ${ev.detail}` : ""}
        </p>
      </div>
      <div className="flex flex-col items-end shrink-0">
        <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap bg-muted/40 rounded-full px-1.5 py-0.5">
          {relativeTime(ev.happened_at, t)}
        </span>
      </div>
    </button>
  );
}
