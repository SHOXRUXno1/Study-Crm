import { useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ru as ruLocale, uz as uzLocale, enUS as enLocale } from "date-fns/locale";
import type { Locale } from "date-fns";
import {
  Users, BookOpen, CalendarCheck, Clock, ArrowRight, GraduationCap,
  CalendarDays, ClipboardList, AlertTriangle, AlertCircle, TrendingUp,
  TrendingDown, Activity, ChevronRight, FileEdit, UserX, Sparkles,
  CircleDot, PlayCircle, RefreshCw,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

import { DashboardLayout } from "@/components/DashboardLayout";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import {
  useTeacherSummary,
  type TeacherLessonRow,
  type TeacherGroupRow,
  type ConcernStudent,
  type PendingJournal,
  type GroupHealth,
} from "@/hooks/use-teacher-summary";

// ── Locales ────────────────────────────────────────────────────────────────
const DF_LOCALES: Record<string, Locale> = {
  ru: ruLocale,
  uz: uzLocale,
  en: enLocale,
};

// ── Helpers ────────────────────────────────────────────────────────────────
function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ""));
}

function parseHHMM(s: string): { h: number; m: number } {
  const [h = "0", m = "0"] = s.split(":");
  return { h: parseInt(h, 10), m: parseInt(m, 10) };
}

/** Minutes from "now" until the lesson's start_time (today only). Negative
 *  if the slot has already started. */
function minutesUntilToday(start: string): number {
  const now = new Date();
  const { h, m } = parseHHMM(start);
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 60000);
}

function formatDuration(minutes: number, t: (k: string) => string): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} ${t("time.minShort")}`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm === 0
    ? `${h} ${t("time.hourShort")}`
    : `${h} ${t("time.hourShort")} ${mm} ${t("time.minShort")}`;
}

function relativeDate(iso: string, today: string, t: (k: string) => string): string {
  const d = parseISO(iso);
  const td = parseISO(today);
  const diff = Math.round((d.getTime() - td.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return t("teacherDash.today");
  if (diff === 1) return t("teacherDash.tomorrow");
  if (diff > 1) return interpolate(t("teacherDash.inDays"), { n: diff });
  if (diff === -1) return t("teacherDash.yesterday");
  return interpolate(t("teacherDash.daysAgo"), { n: -diff });
}

const HEALTH_TONE: Record<GroupHealth, { dot: string; bg: string; text: string; label: string }> = {
  good: { dot: "bg-emerald-500", bg: "bg-emerald-500/10", text: "text-emerald-600", label: "teacherDash.healthGood" },
  warn: { dot: "bg-amber-500",   bg: "bg-amber-500/10",   text: "text-amber-600",   label: "teacherDash.healthWarn" },
  bad:  { dot: "bg-destructive", bg: "bg-destructive/10", text: "text-destructive", label: "teacherDash.healthBad" },
};

const STATUS_TONE: Record<TeacherLessonRow["status"], string> = {
  scheduled:   "bg-primary/10 text-primary",
  active:      "bg-success/15 text-success",
  cancelled:   "bg-destructive/10 text-destructive",
  rescheduled: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  completed:   "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
};

const STATUS_KEY: Record<TeacherLessonRow["status"], string> = {
  scheduled:   "teacherDash.statusScheduled",
  active:      "teacherDash.statusActive",
  cancelled:   "teacherDash.statusCancelled",
  rescheduled: "teacherDash.statusRescheduled",
  completed:   "teacherDash.statusCompleted",
};

// ── Page ───────────────────────────────────────────────────────────────────
export default function TeacherDashboard() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const concernsRef = useRef<HTMLDivElement | null>(null);

  const dfLocale = DF_LOCALES[language] ?? enLocale;
  const today = useMemo(() => new Date(), []);
  const dateLineFmt = format(today, "EEEE, d MMMM", { locale: dfLocale });

  const { data, isLoading, isError, refetch } = useTeacherSummary();

  const greeting = user?.name
    ? interpolate(t("teacherDash.greeting"), { name: user.name.split(" ")[0] ?? "" })
    : t("teacherDash.greetingDefault");

  const goToJournal = (groupId: number, dateISO: string) => {
    navigate(`/journal?group=${groupId}&date=${dateISO}`);
  };

  const goToAttendance = (groupId: number, dateISO: string) => {
    navigate(`/journal?group=${groupId}&date=${dateISO}&open=attendance`);
  };

  const scrollToConcerns = () => {
    concernsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // ── Loading / Error / Empty ───────────────────────────────────────────────
  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-5 sm:space-y-6">
          <Breadcrumbs items={[{ label: t("sidebar.dashboard") }]} />
          <SkeletonPage />
        </div>
      </DashboardLayout>
    );
  }

  if (isError || !data) {
    return (
      <DashboardLayout>
        <div className="space-y-5">
          <Breadcrumbs items={[{ label: t("sidebar.dashboard") }]} />
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
            <AlertTriangle className="h-10 w-10 text-destructive mx-auto mb-3" />
            <p className="text-sm font-semibold text-foreground mb-1">
              {t("common.error")}
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              {t("teacherDash.loadError")}
            </p>
            <Button size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              {t("teacherDash.retry")}
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const { kpis, action_items, current_lesson, next_lesson, today_lessons,
          upcoming_week, weekly_attendance, my_groups, top_concerns } = data;

  if (kpis.my_groups_total === 0) {
    return (
      <DashboardLayout>
        <div className="space-y-5">
          <Breadcrumbs items={[{ label: t("sidebar.dashboard") }]} />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {greeting}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {interpolate(t("teacherDash.dateLine"), { date: dateLineFmt })}
            </p>
          </div>
          <div className="rounded-2xl border border-border/40 bg-card p-10 text-center">
            <BookOpen className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-base font-semibold text-foreground mb-1">
              {t("teacherDash.myGroupsEmpty")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("teacherDash.noGroupsContact")}
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ── Derived ─────────────────────────────────────────────────────────────
  const weekProgressPct = kpis.lessons_week_planned > 0
    ? Math.round((kpis.lessons_week_done / kpis.lessons_week_planned) * 100)
    : 0;

  const attendanceDeltaPositive = kpis.attendance_delta_pct > 0;
  const attendanceDeltaNegative = kpis.attendance_delta_pct < 0;

  const chartData = weekly_attendance.map((p) => ({
    label: p.week_label,
    rate: p.rate_pct,
    total: p.total_marks,
  }));

  // Group days by date for the upcoming-week strip.
  const upcomingByDate = upcoming_week.reduce<Record<string, TeacherLessonRow[]>>((acc, l) => {
    (acc[l.lesson_date] = acc[l.lesson_date] ?? []).push(l);
    return acc;
  }, {});
  const upcomingDates = Object.keys(upcomingByDate).sort();

  return (
    <DashboardLayout>
      <div className="space-y-5 sm:space-y-6">
        <Breadcrumbs items={[{ label: t("sidebar.dashboard") }]} />

        {/* Greeting */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            {greeting}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {interpolate(t("teacherDash.dateLine"), { date: dateLineFmt })}
          </p>
        </div>

        {/* HERO: current / next lesson */}
        <HeroLesson
          current={current_lesson}
          next={next_lesson}
          today={data.today}
          t={t}
          onJournal={goToJournal}
          onAttendance={goToAttendance}
          onSchedule={() => navigate("/schedule")}
        />

        {/* ACTION ITEMS */}
        {(action_items.pending_journals.length > 0 || action_items.concerning_students_count > 0) && (
          <ActionItemsCard
            pending={action_items.pending_journals}
            concerningCount={action_items.concerning_students_count}
            t={t}
            onFill={(p) => goToJournal(p.group_id, p.lesson_date)}
            onShowConcerns={scrollToConcerns}
          />
        )}

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiTile
            icon={CalendarCheck}
            iconTone="text-primary"
            label={t("teacherDash.kpiWeekLessons")}
            primary={`${kpis.lessons_week_done} / ${kpis.lessons_week_planned}`}
            secondary={
              <Progress value={weekProgressPct} className="h-1.5 mt-2" />
            }
          />
          <KpiTile
            icon={Activity}
            iconTone={attendanceDeltaNegative ? "text-destructive" : "text-emerald-600"}
            label={t("teacherDash.kpiAttendanceWeek")}
            primary={`${kpis.attendance_rate_week_pct}%`}
            secondary={
              kpis.attendance_delta_pct === 0 ? (
                <span className="text-[10px] text-muted-foreground">
                  {t("teacherDash.deltaSame")}
                </span>
              ) : (
                <span className={cn(
                  "inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-1.5 py-0.5",
                  attendanceDeltaPositive
                    ? "text-emerald-600 bg-emerald-500/10"
                    : "text-destructive bg-destructive/10",
                )}>
                  {attendanceDeltaPositive
                    ? <TrendingUp className="h-3 w-3" />
                    : <TrendingDown className="h-3 w-3" />}
                  {attendanceDeltaPositive ? "+" : ""}
                  {kpis.attendance_delta_pct}%
                </span>
              )
            }
          />
          <KpiTile
            icon={Users}
            iconTone="text-violet-600"
            label={t("teacherDash.kpiStudents")}
            primary={String(kpis.my_students_total)}
            secondary={
              <span className="text-[10px] text-muted-foreground">
                {kpis.my_groups_active} {t("teacherDash.activeGroupsShort")}
              </span>
            }
          />
          <KpiTile
            icon={FileEdit}
            iconTone={kpis.pending_journals_count > 0 ? "text-destructive" : "text-emerald-600"}
            label={t("teacherDash.kpiPending")}
            primary={String(kpis.pending_journals_count)}
            secondary={
              <span className="text-[10px] text-muted-foreground">
                {kpis.pending_journals_count > 0
                  ? t("teacherDash.pendingHint")
                  : t("teacherDash.allCaughtUp")}
              </span>
            }
          />
        </div>

        {/* Charts: weekly attendance + month summary */}
        <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-3">
          {/* Weekly attendance chart */}
          <div className="lg:col-span-2 rounded-2xl border border-border/40 bg-card p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-card-foreground flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  {t("teacherDash.weeklyAttendanceTitle")}
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {t("teacherDash.last4Weeks")}
                </p>
              </div>
              <span className="text-[10px] font-medium text-muted-foreground bg-muted/40 rounded-full px-2 py-0.5">
                0–100%
              </span>
            </div>
            <div className="h-44 sm:h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -15 }}>
                  <defs>
                    <linearGradient id="attGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(234 85% 55%)" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="hsl(234 85% 55%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(220 9% 46%)" }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "hsl(220 9% 46%)" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const p: any = payload[0].payload;
                      return (
                        <div className="rounded-xl border border-border/60 bg-card px-3 py-2 shadow-lg">
                          <p className="text-xs font-medium text-muted-foreground mb-0.5">{label}</p>
                          <p className="text-sm font-bold text-foreground">{p.rate}%</p>
                          <p className="text-[10px] text-muted-foreground">
                            {p.total} {t("teacherDash.marksShort")}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="rate"
                    stroke="hsl(234 85% 55%)"
                    strokeWidth={2}
                    fill="url(#attGrad)"
                    dot={{ r: 3, strokeWidth: 2, fill: "hsl(0 0% 100%)", stroke: "hsl(234 85% 55%)" }}
                    activeDot={{ r: 5, strokeWidth: 2, fill: "hsl(0 0% 100%)", stroke: "hsl(234 85% 55%)" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Month summary */}
          <div className="rounded-2xl border border-border/40 bg-gradient-to-br from-card via-card to-primary/[0.03] p-4 sm:p-5 shadow-sm flex flex-col">
            <h3 className="text-sm font-bold text-card-foreground flex items-center gap-2 mb-4">
              <Sparkles className="h-4 w-4 text-primary" />
              {t("teacherDash.monthSummary")}
            </h3>
            <div className="space-y-4 flex-1">
              <SummaryRow
                label={t("teacherDash.lessonsConducted")}
                value={String(kpis.lessons_month_done)}
              />
              <SummaryRow
                label={t("teacherDash.avgAttendance")}
                value={`${kpis.attendance_rate_month_pct}%`}
              />
              <SummaryRow
                label={t("teacherDash.totalLearners")}
                value={String(kpis.my_students_total)}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-xs mt-4"
              onClick={() => navigate("/schedule")}
            >
              {t("teacherDash.openSchedule")}
              <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>

        {/* Today + 7-day strip */}
        <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-3">
          {/* Today timeline */}
          <div className="lg:col-span-2 rounded-2xl border border-border/40 bg-card shadow-sm overflow-hidden">
            <div className="p-4 border-b border-border/40 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" />
                {t("teacherDash.todayTitle")}
                <span className="text-[10px] font-semibold text-primary bg-primary/10 rounded-full px-2 py-0.5">
                  {today_lessons.length}
                </span>
              </h2>
              <span className="text-xs text-muted-foreground">
                {format(today, "d MMM", { locale: dfLocale })}
              </span>
            </div>
            {today_lessons.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                {t("teacherDash.todayEmpty")}
              </div>
            ) : (
              <ul className="divide-y divide-border/40">
                {today_lessons.map((l) => (
                  <TodayLessonItem
                    key={l.id}
                    lesson={l}
                    t={t}
                    onJournal={() => goToJournal(l.group_id, l.lesson_date)}
                    onGroup={() => navigate(`/groups/${l.group_id}`)}
                  />
                ))}
              </ul>
            )}
          </div>

          {/* 7-day strip */}
          <div className="rounded-2xl border border-border/40 bg-card shadow-sm overflow-hidden">
            <div className="p-4 border-b border-border/40 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <CalendarCheck className="h-4 w-4 text-primary" />
                {t("teacherDash.upcomingWeekTitle")}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => navigate("/schedule")}
              >
                {t("teacherDash.viewAll")} <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
            {upcomingDates.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                {t("teacherDash.upcomingEmpty")}
              </div>
            ) : (
              <ul className="divide-y divide-border/40 max-h-[24rem] overflow-y-auto">
                {upcomingDates.map((d) => {
                  const lessons = upcomingByDate[d];
                  const dateObj = parseISO(d);
                  return (
                    <li
                      key={d}
                      className="p-3 hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => navigate("/schedule")}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-bold text-foreground capitalize">
                          {format(dateObj, "EEE, d MMM", { locale: dfLocale })}
                        </p>
                        <span className="text-[10px] font-medium text-muted-foreground bg-muted/50 rounded-full px-1.5 py-0.5">
                          {lessons.length}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {lessons.map((l) => l.group_code).join(" · ")}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* My groups with health */}
        <GroupsSection
          groups={my_groups}
          t={t}
          onGroupClick={(id) => navigate(`/groups/${id}`)}
        />

        {/* Concerning students */}
        {top_concerns.length > 0 && (
          <div ref={concernsRef} className="rounded-2xl border border-border/40 bg-card shadow-sm overflow-hidden">
            <div className="p-4 border-b border-border/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10">
                  <UserX className="h-4 w-4 text-destructive" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-card-foreground">
                    {t("teacherDash.concernsTitle")}
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    {t("teacherDash.concernsSubtitle")}
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-semibold text-destructive bg-destructive/10 rounded-full px-2 py-0.5">
                {top_concerns.length}
              </span>
            </div>
            <ul className="divide-y divide-border/40">
              {top_concerns.map((c) => (
                <ConcernItem
                  key={c.student_id}
                  c={c}
                  t={t}
                  onClick={() => navigate(`/students/${c.student_id}`)}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function HeroLesson({
  current, next, today, t, onJournal, onAttendance, onSchedule,
}: {
  current: TeacherLessonRow | null;
  next: TeacherLessonRow | null;
  today: string;
  t: (k: string) => string;
  onJournal: (gid: number, dateISO: string) => void;
  onAttendance: (gid: number, dateISO: string) => void;
  onSchedule: () => void;
}) {
  if (current) {
    return (
      <div className="rounded-2xl border border-success/30 bg-gradient-to-br from-success/10 via-card to-card p-5 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 h-40 w-40 bg-success/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 relative">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="flex items-center gap-1 text-[10px] font-bold text-success bg-success/15 rounded-full px-2 py-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                {t("teacherDash.heroNow")}
              </span>
              <span className="text-xs text-muted-foreground font-mono tabular-nums">
                {current.start_time} – {current.end_time}
              </span>
            </div>
            <p className="text-lg sm:text-xl font-extrabold text-foreground truncate">
              {current.group_code}
              {current.course_name && (
                <>
                  <span className="text-muted-foreground/50 font-normal"> · </span>
                  <span className="text-base font-medium text-muted-foreground">{current.course_name}</span>
                </>
              )}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {current.student_count}/{current.max_students} {t("teacherDash.studentsShort")}
              {current.room_name && ` · ${current.room_name}`}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button onClick={() => onJournal(current.group_id, current.lesson_date)} size="sm" className="gap-1.5">
              <ClipboardList className="h-3.5 w-3.5" />
              {t("teacherDash.openJournal")}
            </Button>
            <Button onClick={() => onAttendance(current.group_id, current.lesson_date)} variant="outline" size="sm" className="gap-1.5">
              <CircleDot className="h-3.5 w-3.5" />
              {t("teacherDash.markAttendance")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (next) {
    const inMinutes = next.lesson_date === today ? minutesUntilToday(next.start_time) : null;
    const subtitle = inMinutes !== null && inMinutes >= 0
      ? interpolate(t("teacherDash.heroIn"), { duration: formatDuration(inMinutes, t) })
      : relativeDate(next.lesson_date, today, t);
    return (
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card p-5 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 h-40 w-40 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 relative">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 rounded-full px-2 py-0.5">
                <PlayCircle className="h-3 w-3" />
                {t("teacherDash.heroNext")}
              </span>
              <span className="text-xs text-muted-foreground font-mono tabular-nums">
                {next.start_time} – {next.end_time}
              </span>
              <span className="text-xs text-muted-foreground">{subtitle}</span>
            </div>
            <p className="text-lg sm:text-xl font-extrabold text-foreground truncate">
              {next.group_code}
              {next.course_name && (
                <>
                  <span className="text-muted-foreground/50 font-normal"> · </span>
                  <span className="text-base font-medium text-muted-foreground">{next.course_name}</span>
                </>
              )}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {next.student_count}/{next.max_students} {t("teacherDash.studentsShort")}
              {next.room_name && ` · ${next.room_name}`}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button onClick={() => onJournal(next.group_id, next.lesson_date)} size="sm" variant="outline" className="gap-1.5">
              <ClipboardList className="h-3.5 w-3.5" />
              {t("teacherDash.openJournal")}
            </Button>
            <Button onClick={onSchedule} size="sm" variant="ghost" className="gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              {t("teacherDash.openSchedule")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/40 bg-card p-6 shadow-sm flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/40">
          <CalendarDays className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">
            {t("teacherDash.heroNoToday")}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {t("teacherDash.heroCheckUpcoming")}
          </p>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={onSchedule} className="gap-1.5">
        <CalendarDays className="h-3.5 w-3.5" />
        {t("teacherDash.openSchedule")}
      </Button>
    </div>
  );
}

function ActionItemsCard({
  pending, concerningCount, t, onFill, onShowConcerns,
}: {
  pending: PendingJournal[];
  concerningCount: number;
  t: (k: string) => string;
  onFill: (p: PendingJournal) => void;
  onShowConcerns: () => void;
}) {
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 sm:p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15">
          <AlertCircle className="h-4 w-4 text-amber-600" />
        </div>
        <h3 className="text-sm font-bold text-foreground">
          {t("teacherDash.actionTitle")}
        </h3>
      </div>

      {pending.length > 0 && (
        <div className="mb-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            {t("teacherDash.pendingJournalsTitle")} ({pending.length})
          </p>
          <ul className="space-y-1.5">
            {pending.slice(0, 3).map((p) => (
              <li
                key={p.lesson_id}
                className="flex items-center gap-3 rounded-lg p-2 bg-card border border-border/40 hover:border-amber-500/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {p.group_code}
                    {p.course_name && (
                      <span className="text-muted-foreground/60 font-normal"> · {p.course_name}</span>
                    )}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {p.lesson_date} · {p.start_time} ·{" "}
                    {p.days_ago === 0
                      ? t("teacherDash.today")
                      : interpolate(t("teacherDash.daysAgo"), { n: p.days_ago })}
                    {p.missing_topic && p.missing_attendance
                      ? ` · ${t("teacherDash.missingBoth")}`
                      : p.missing_attendance
                      ? ` · ${t("teacherDash.missingAttendance")}`
                      : ` · ${t("teacherDash.missingTopic")}`}
                  </p>
                </div>
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 shrink-0" onClick={() => onFill(p)}>
                  {t("teacherDash.fillJournal")}
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </li>
            ))}
          </ul>
          {pending.length > 3 && (
            <p className="text-[10px] text-muted-foreground mt-2 text-right">
              +{pending.length - 3} {t("teacherDash.more")}
            </p>
          )}
        </div>
      )}

      {concerningCount > 0 && (
        <div className="flex items-center gap-3 rounded-lg p-2 bg-card border border-border/40">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10 shrink-0">
            <UserX className="h-4 w-4 text-destructive" />
          </div>
          <p className="text-sm flex-1">
            <span className="font-semibold text-foreground">
              {concerningCount} {t("teacherDash.concerningStudents")}
            </span>
            <span className="text-muted-foreground"> · {t("teacherDash.concerningHint")}</span>
          </p>
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 shrink-0" onClick={onShowConcerns}>
            {t("teacherDash.viewMore")}
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}

function KpiTile({
  icon: Icon, iconTone, label, primary, secondary,
}: {
  icon: any;
  iconTone: string;
  label: string;
  primary: string;
  secondary?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm animate-fade-in">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center">
          <Icon className={`h-4 w-4 ${iconTone}`} />
        </div>
        <span className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide truncate">
          {label}
        </span>
      </div>
      <p className="text-xl sm:text-2xl font-bold text-foreground tabular-nums">
        {primary}
      </p>
      {secondary && <div className="mt-1">{secondary}</div>}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-base font-bold text-foreground tabular-nums">{value}</span>
    </div>
  );
}

function TodayLessonItem({
  lesson, t, onJournal, onGroup,
}: {
  lesson: TeacherLessonRow;
  t: (k: string) => string;
  onJournal: () => void;
  onGroup: () => void;
}) {
  const cancelled = lesson.status === "cancelled" || lesson.status === "rescheduled";
  return (
    <li className="p-3">
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-center w-14 shrink-0">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className={cn(
            "text-xs font-mono font-semibold mt-1 tabular-nums",
            cancelled ? "line-through text-muted-foreground" : "text-foreground",
          )}>
            {lesson.start_time}
          </span>
        </div>

        <button
          type="button"
          onClick={onGroup}
          className="flex-1 min-w-0 text-left rounded-md px-1 py-0.5 hover:bg-muted/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <p className={cn(
            "text-sm font-semibold truncate",
            cancelled ? "text-muted-foreground line-through" : "text-foreground",
          )}>
            {lesson.group_code}
            {lesson.course_name && (
              <>
                <span className="text-muted-foreground/60 font-normal"> · </span>
                <span className="text-xs font-normal text-muted-foreground">{lesson.course_name}</span>
              </>
            )}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs text-muted-foreground truncate">
              {lesson.student_count}/{lesson.max_students} {t("teacherDash.studentsShort")}
              {lesson.room_name ? ` · ${lesson.room_name}` : ""}
            </span>
            <span className={cn(
              "text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0",
              STATUS_TONE[lesson.status],
            )}>
              {t(STATUS_KEY[lesson.status])}
            </span>
            {lesson.has_attendance && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded text-emerald-600 bg-emerald-500/10 shrink-0">
                ✓ {t("teacherDash.markedShort")}
              </span>
            )}
          </div>
        </button>

        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 gap-1 text-xs shrink-0"
          onClick={onJournal}
          disabled={cancelled}
        >
          <ClipboardList className="h-3.5 w-3.5" />
          {t("teacherDash.openJournal")}
        </Button>
      </div>
    </li>
  );
}

function GroupsSection({
  groups, t, onGroupClick,
}: {
  groups: TeacherGroupRow[];
  t: (k: string) => string;
  onGroupClick: (id: number) => void;
}) {
  return (
    <div className="rounded-2xl border border-border/40 bg-card shadow-sm overflow-hidden">
      <div className="p-4 border-b border-border/40 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-primary" />
          {t("teacherDash.myGroupsTitle")}
          <span className="text-[10px] font-semibold text-muted-foreground bg-muted/50 rounded-full px-2 py-0.5">
            {groups.length}
          </span>
        </h2>
      </div>
      {groups.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          {t("teacherDash.myGroupsEmpty")}
        </div>
      ) : (
        <ul className="divide-y divide-border/40">
          {groups.map((g) => {
            const tone = HEALTH_TONE[g.health];
            return (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => onGroupClick(g.id)}
                  className="w-full text-left p-3 hover:bg-muted/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <div className="flex items-center gap-3 mb-1.5">
                    <span className={cn("h-2 w-2 rounded-full shrink-0", tone.dot)} />
                    <p className="text-sm font-semibold text-foreground flex-1 truncate">
                      {g.code}
                    </p>
                    <span className={cn("text-[10px] font-bold rounded-full px-2 py-0.5", tone.bg, tone.text)}>
                      {t(tone.label)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2 flex-wrap">
                    <span className="truncate">{g.course_name ?? "—"}</span>
                    <span className="text-muted-foreground/40">·</span>
                    <span className="tabular-nums">{g.time_slot}</span>
                    {g.next_lesson_date && (
                      <>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="tabular-nums">{t("teacherDash.nextOn")} {g.next_lesson_date}</span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <Activity className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">{t("teacherDash.attendanceShort")}:</span>
                      <span className="font-bold text-foreground tabular-nums">{g.attendance_rate_pct}%</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3 text-muted-foreground" />
                      <span className="font-bold text-foreground tabular-nums">{g.student_count}/{g.max_students}</span>
                      <span className="text-muted-foreground">({g.fill_pct}%)</span>
                    </span>
                    {g.debtors_count > 0 && (
                      <span className="inline-flex items-center gap-1 text-amber-600 bg-amber-500/10 rounded-full px-2 py-0.5 font-semibold">
                        <AlertTriangle className="h-3 w-3" />
                        {g.debtors_count} {t("teacherDash.debtorsShort")}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ConcernItem({
  c, t, onClick,
}: {
  c: ConcernStudent;
  t: (k: string) => string;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left p-3 hover:bg-muted/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/40 text-xs font-bold text-muted-foreground shrink-0">
            {c.full_name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("")}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {c.full_name}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {c.group_code} · {c.absent_count} {t("teacherDash.absences")}
              {c.late_count > 0 && ` · ${c.late_count} ${t("teacherDash.lates")}`}
              {c.last_absent_at && ` · ${t("teacherDash.lastAbsent")} ${c.last_absent_at}`}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className={cn(
              "text-sm font-bold tabular-nums",
              c.attendance_rate_pct < 70 ? "text-destructive" :
              c.attendance_rate_pct < 85 ? "text-amber-600" : "text-foreground",
            )}>
              {c.attendance_rate_pct}%
            </p>
            <p className="text-[9px] text-muted-foreground uppercase">
              {t("teacherDash.attendanceShort")}
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
        </div>
      </button>
    </li>
  );
}

function SkeletonPage() {
  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-28 rounded-2xl" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Skeleton className="lg:col-span-2 h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Skeleton className="lg:col-span-2 h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
      <Skeleton className="h-72 rounded-2xl" />
    </div>
  );
}
