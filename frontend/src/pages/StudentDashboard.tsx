import { useMemo } from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ru as ruLocale, uz as uzLocale, enUS as enLocale } from "date-fns/locale";
import type { Locale } from "date-fns";
import {
  Wallet,
  CalendarDays,
  ClipboardList,
  TrendingUp,
  Phone,
  GraduationCap,
  CircleDot,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Receipt,
  type LucideIcon,
} from "lucide-react";

import { DashboardLayout } from "@/components/DashboardLayout";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatNumber } from "@/lib/utils";

import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import {
  useMyProfile,
  useMyLedger,
  useMyAttendance,
  useMySchedule,
} from "@/hooks/use-me-student";

const DF_LOCALES: Record<string, Locale> = {
  ru: ruLocale,
  uz: uzLocale,
  en: enLocale,
};

function formatUZS(amount: number): string {
  return formatNumber(amount);
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoPlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── Page ─────────────────────────────────────────────────────────────────
export default function StudentDashboard() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const dfLocale = DF_LOCALES[language] ?? ruLocale;

  // Range used for both attendance summary and the schedule strip.
  const todayIso = isoToday();
  const next7 = isoPlusDays(7);
  const past30 = isoPlusDays(-30);

  const profileQ = useMyProfile();
  const ledgerQ = useMyLedger();
  const attendanceQ = useMyAttendance({ from: past30, to: todayIso });
  const scheduleQ = useMySchedule({ from: todayIso, to: next7 });

  const billing = ledgerQ.data?.billing;
  const payments = ledgerQ.data?.payments ?? [];
  const profile = profileQ.data;
  const upcomingLessons = scheduleQ.data ?? [];
  const attendance = attendanceQ.data ?? [];

  const attendanceStats = useMemo(() => {
    if (attendance.length === 0) {
      return { total: 0, present: 0, absent: 0, late: 0, ratePct: 0 };
    }
    let present = 0;
    let absent = 0;
    let late = 0;
    for (const e of attendance) {
      if (e.status === "present") present++;
      else if (e.status === "absent") absent++;
      else if (e.status === "late") late++;
    }
    const counted = present + late + absent;
    const ratePct = counted === 0 ? 0 : Math.round(((present + late) / counted) * 100);
    return { total: attendance.length, present, absent, late, ratePct };
  }, [attendance]);

  const nextLesson = useMemo(() => {
    if (upcomingLessons.length === 0) return null;
    const now = new Date();
    return (
      upcomingLessons.find((l) => {
        const dt = new Date(`${l.lesson_date}T${l.start_time}`);
        return dt.getTime() >= now.getTime() && l.status !== "cancelled";
      }) ?? upcomingLessons[0]
    );
  }, [upcomingLessons]);

  const isLoading =
    profileQ.isLoading || ledgerQ.isLoading || attendanceQ.isLoading;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl space-y-4 sm:space-y-6">
        <Breadcrumbs items={[{ label: t("sidebar.dashboard") }]} />

        {/* Mobile-first header */}
        <div className="rounded-2xl border border-border/40 bg-gradient-to-br from-primary/10 via-card to-card p-4 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 shadow-md">
              <span className="text-base font-extrabold text-primary-foreground">
                {user?.initials ?? "U"}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-primary/80">
                {t("student.welcome")}
              </p>
              <h1 className="mt-1 text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
                {profile?.full_name ?? user?.name ?? "—"}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {profile?.course_name && profile?.group_code
                  ? `${profile.course_name} · ${profile.group_code}`
                  : t("student.notEnrolled")}
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Link
              to="/me/schedule"
              className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/10 px-3 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/15"
            >
              <span>{t("student.mobile.ctaSchedule")}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/me/payments"
              className="flex items-center justify-between rounded-xl border border-border/60 bg-card px-3 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted/40"
            >
              <span>{t("student.mobile.ctaPayments")}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <KpiTile
            label={t("student.kpiBalance")}
            value={
              billing
                ? billing.credit_balance > 0
                  ? `+${formatUZS(billing.credit_balance)}`
                  : billing.debt_amount > 0
                    ? `−${formatUZS(billing.debt_amount)}`
                    : "0"
                : "—"
            }
            suffix={billing ? "UZS" : undefined}
            tone={
              billing
                ? billing.credit_balance > 0
                  ? "success"
                  : billing.debt_amount > 0
                    ? "destructive"
                    : "primary"
                : "primary"
            }
            hint={
              billing
                ? billing.credit_balance > 0
                  ? t("student.depositBalance")
                  : billing.debt_amount > 0
                    ? t("student.paymentStatusDebt")
                    : t("student.paymentStatusPaid")
                : undefined
            }
            Icon={Wallet}
            isLoading={isLoading}
          />
          <KpiTile
            label={t("student.kpiAttendance")}
            value={`${attendanceStats.ratePct}%`}
            tone={
              attendanceStats.ratePct >= 80
                ? "success"
                : attendanceStats.ratePct >= 60
                  ? "warning"
                  : "destructive"
            }
            hint={t("student.over30days")}
            Icon={ClipboardList}
            isLoading={isLoading}
          />
          <KpiTile
            label={t("student.kpiNextLesson")}
            value={
              nextLesson
                ? format(parseISO(nextLesson.lesson_date), "d MMM", {
                    locale: dfLocale,
                  })
                : "—"
            }
            suffix={
              nextLesson ? nextLesson.start_time.slice(0, 5) : undefined
            }
            tone="primary"
            hint={
              nextLesson?.course_name ?? t("student.noUpcomingLessons")
            }
            Icon={CalendarDays}
            isLoading={isLoading}
          />
          <KpiTile
            label={t("student.kpiPaid")}
            value={billing ? formatUZS(billing.total_paid) : "—"}
            suffix={billing ? "UZS" : undefined}
            tone="primary"
            hint={
              billing?.last_payment_date
                ? format(parseISO(billing.last_payment_date), "d MMM yyyy", {
                    locale: dfLocale,
                  })
                : undefined
            }
            Icon={TrendingUp}
            isLoading={isLoading}
          />
        </div>

        {/* Priority block: next lesson + short profile */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
          <section className="rounded-2xl border border-border/40 bg-card p-4 sm:p-5 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
                {t("student.mobile.nextLesson")}
              </h2>
              <Link
                to="/me/schedule"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                {t("student.mySchedule")} <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {scheduleQ.isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-16 rounded-xl" />
                ))}
              </div>
            ) : !nextLesson ? (
              <EmptyState icon={CalendarDays} text={t("student.noUpcomingLessons")} />
            ) : (
              <div className="space-y-2">
                {upcomingLessons.slice(0, 3).map((l) => (
                  <div
                    key={l.id}
                    className={cn(
                      "rounded-xl border border-border/60 p-3",
                      l.id === nextLesson.id && "border-primary/40 bg-primary/5",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">
                          {l.course_name ?? l.group_code}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {format(parseISO(l.lesson_date), "EEE, d MMM", {
                            locale: dfLocale,
                          })}{" "}
                          · {l.start_time.slice(0, 5)} – {l.end_time.slice(0, 5)}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {l.group_code}
                          {l.room_name ? ` · ${l.room_name}` : ""}
                        </p>
                      </div>
                      {l.status === "cancelled" && (
                        <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold uppercase text-destructive">
                          {t("schedule.statusCancelled")}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-border/40 bg-card p-4 sm:p-5">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-muted-foreground">
              {t("student.profileBlock")}
            </h2>
            {profile ? (
              <dl className="space-y-3 text-sm">
                <InfoRow
                  icon={Phone}
                  label={t("student.credentialsLogin")}
                  value={profile.phone ?? "—"}
                  mono
                />
                <InfoRow
                  icon={Phone}
                  label={t("student.parentPhone")}
                  value={profile.parent_phone ?? "—"}
                  mono
                />
                <InfoRow
                  icon={GraduationCap}
                  label={t("student.group")}
                  value={profile.group_code ?? "—"}
                />
                <InfoRow
                  icon={CircleDot}
                  label={t("student.course")}
                  value={profile.course_name ?? "—"}
                />
                <InfoRow
                  icon={CalendarDays}
                  label={t("student.cabinetSince")}
                  value={
                    profile.created_at
                      ? format(parseISO(profile.created_at), "d MMM yyyy", {
                          locale: dfLocale,
                        })
                      : "—"
                  }
                />
              </dl>
            ) : (
              <div className="space-y-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            )}
          </section>
        </div>

        {/* Recent payments + attendance summary */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
          <section className="rounded-2xl border border-border/40 bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
                {t("student.recentPayments")}
              </h2>
              <Link
                to="/me/payments"
                className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                {t("student.myPayments")} <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {ledgerQ.isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
              </div>
            ) : payments.length === 0 ? (
              <EmptyState icon={Receipt} text={t("student.noPayments")} />
            ) : (
              <ul className="divide-y divide-border/50">
                {payments.slice(0, 4).map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/10">
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {formatUZS(p.amount)} UZS
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(p.paid_at), "d MMM yyyy", { locale: dfLocale })} · {p.method}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-border/40 bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
                {t("student.attendanceLog")}
              </h2>
              <Link
                to="/me/attendance"
                className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                {t("student.myAttendance")} <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {attendanceQ.isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
              </div>
            ) : attendance.length === 0 ? (
              <EmptyState icon={ClipboardList} text={t("student.noAttendance")} />
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <Stat label={t("student.presentCount")} value={attendanceStats.present} tone="success" />
                  <Stat label={t("student.lateCount")} value={attendanceStats.late} tone="warning" />
                  <Stat label={t("student.absentCount")} value={attendanceStats.absent} tone="destructive" />
                </div>
                <ul className="divide-y divide-border/50">
                  {attendance.slice(0, 4).map((a) => (
                    <li key={`${a.lesson_id}`} className="flex items-center gap-3 py-3">
                      <AttendanceDot status={a.status} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {format(parseISO(a.lesson_date), "d MMM yyyy", { locale: dfLocale })}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {a.start_time.slice(0, 5)} · {a.group_code}
                          {a.topic ? ` · ${a.topic}` : ""}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full",
                          attTone(a.status),
                        )}
                      >
                        {t(`student.status${capitalize(a.status)}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────────────

type Tone = "primary" | "success" | "warning" | "destructive";

function KpiTile({
  label,
  value,
  suffix,
  hint,
  tone,
  Icon,
  isLoading,
}: {
  label: string;
  value: string;
  suffix?: string;
  hint?: string;
  tone: Tone;
  Icon: LucideIcon;
  isLoading?: boolean;
}) {
  const toneCls: Record<Tone, { bg: string; fg: string; bar: string }> = {
    primary: {
      bg: "bg-primary/10",
      fg: "text-primary",
      bar: "from-primary to-primary/60",
    },
    success: {
      bg: "bg-success/10",
      fg: "text-success",
      bar: "from-success to-success/60",
    },
    warning: {
      bg: "bg-warning/10",
      fg: "text-warning",
      bar: "from-warning to-warning/60",
    },
    destructive: {
      bg: "bg-destructive/10",
      fg: "text-destructive",
      bar: "from-destructive to-destructive/60",
    },
  };
  const c = toneCls[tone];

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-border/40 bg-card p-4 sm:p-5"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className={cn("absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r", c.bar)} />
      <div className="flex items-start justify-between">
        <div className="space-y-1.5 min-w-0 flex-1">
          <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-widest text-muted-foreground truncate">
            {label}
          </p>
          {isLoading ? (
            <Skeleton className="h-7 w-20" />
          ) : (
            <p className="text-xl sm:text-2xl font-extrabold tracking-tight text-card-foreground leading-none">
              {value}
              {suffix ? (
                <span className="ml-1 text-xs font-semibold text-muted-foreground">{suffix}</span>
              ) : null}
            </p>
          )}
          {hint && (
            <p className="text-[11px] text-muted-foreground truncate">{hint}</p>
          )}
        </div>
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl shrink-0", c.bg)}>
          <Icon className={cn("h-5 w-5", c.fg)} strokeWidth={2} />
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/60">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground/80 font-semibold">
          {label}
        </p>
        <p className={cn("text-sm font-semibold text-foreground truncate", mono && "font-mono")}>
          {value}
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  const toneCls: Record<Tone, string> = {
    primary: "text-primary",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
  };
  return (
    <div className="rounded-xl border border-border/40 bg-muted/20 px-3 py-2.5 text-center">
      <p className={cn("text-2xl font-extrabold leading-none", toneCls[tone])}>{value}</p>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mt-1">
        {label}
      </p>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/40">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground mt-3">{text}</p>
    </div>
  );
}

function AttendanceDot({ status }: { status: string }) {
  const map: Record<string, { bg: string; icon: typeof CheckCircle2 }> = {
    present: { bg: "bg-success/15 text-success", icon: CheckCircle2 },
    late: { bg: "bg-warning/15 text-warning", icon: Clock },
    absent: { bg: "bg-destructive/15 text-destructive", icon: AlertTriangle },
    excused: { bg: "bg-muted text-muted-foreground", icon: CircleDot },
  };
  const c = map[status] ?? map.excused;
  const Icon = c.icon;
  return (
    <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", c.bg)}>
      <Icon className="h-4 w-4" />
    </div>
  );
}

function attTone(status: string): string {
  switch (status) {
    case "present":
      return "bg-success/10 text-success";
    case "late":
      return "bg-warning/10 text-warning";
    case "absent":
      return "bg-destructive/10 text-destructive";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function capitalize(s: string): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
