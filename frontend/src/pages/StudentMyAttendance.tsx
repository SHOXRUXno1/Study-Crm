import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ru as ruLocale, uz as uzLocale, enUS as enLocale } from "date-fns/locale";
import type { Locale } from "date-fns";
import { ClipboardList, CheckCircle2, AlertTriangle, Clock, CircleDot } from "lucide-react";

import { DashboardLayout } from "@/components/DashboardLayout";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { useLanguage } from "@/hooks/use-language";
import { useMyAttendance } from "@/hooks/use-me-student";

const DF_LOCALES: Record<string, Locale> = {
  ru: ruLocale,
  uz: uzLocale,
  en: enLocale,
};

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}
function isoBack(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function StudentMyAttendance() {
  const { t, language } = useLanguage();
  const dfLocale = DF_LOCALES[language] ?? ruLocale;
  const [period, setPeriod] = useState<"30" | "90" | "180" | "all">("90");

  const range = useMemo(() => {
    const to = isoToday();
    const days = period === "all" ? 365 : Number(period);
    return { from: isoBack(days), to };
  }, [period]);

  const { data, isLoading } = useMyAttendance(range);
  const items = data ?? [];

  const stats = useMemo(() => {
    let present = 0,
      absent = 0,
      late = 0,
      excused = 0;
    for (const e of items) {
      if (e.status === "present") present++;
      else if (e.status === "absent") absent++;
      else if (e.status === "late") late++;
      else if (e.status === "excused") excused++;
    }
    const counted = present + late + absent;
    const ratePct = counted === 0 ? 0 : Math.round(((present + late) / counted) * 100);
    return { total: items.length, present, absent, late, excused, ratePct };
  }, [items]);

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6 max-w-5xl mx-auto">
        <Breadcrumbs items={[{ label: t("student.myAttendance") }]} />

        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
              {t("student.myAttendance")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("student.attendanceLog")}
            </p>
          </div>
          <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">30 {t("debtors.monthsShort") ?? ""}</SelectItem>
              <SelectItem value="90">90</SelectItem>
              <SelectItem value="180">180</SelectItem>
              <SelectItem value="all">{t("analytics.allMonths")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label={t("student.attendanceRate")} value={`${stats.ratePct}%`} tone="primary" />
          <Stat label={t("student.presentCount")} value={String(stats.present)} tone="success" />
          <Stat label={t("student.lateCount")} value={String(stats.late)} tone="warning" />
          <Stat label={t("student.absentCount")} value={String(stats.absent)} tone="destructive" />
        </div>

        {/* Records */}
        <div className="rounded-2xl border border-border/40 bg-card overflow-hidden">
          {isLoading ? (
            <div className="p-5 space-y-2">
              {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/40">
                <ClipboardList className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground mt-3">{t("student.noAttendance")}</p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/30 text-left">
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                      {t("student.lessonDate")}
                    </th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                      {t("student.lessonTime")}
                    </th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                      {t("student.group")}
                    </th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                      {t("student.topic")}
                    </th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                      {t("student.lessonStatus")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {items.map((a) => (
                    <tr key={`${a.lesson_id}`} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-semibold text-foreground whitespace-nowrap">
                        {format(parseISO(a.lesson_date), "d MMM yyyy", { locale: dfLocale })}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {a.start_time.slice(0, 5)} – {a.end_time.slice(0, 5)}
                      </td>
                      <td className="px-4 py-3 text-foreground">{a.group_code}</td>
                      <td className="px-4 py-3 text-muted-foreground truncate max-w-xs">
                        {a.topic ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={a.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-2 p-3">
                {items.map((a) => (
                  <div key={`${a.lesson_id}`} className="rounded-xl border border-border/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">
                        {format(parseISO(a.lesson_date), "d MMM yyyy", { locale: dfLocale })}
                      </p>
                      <StatusPill status={a.status} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {a.start_time.slice(0, 5)} – {a.end_time.slice(0, 5)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {a.group_code} · {a.topic ?? "—"}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "primary" | "success" | "warning" | "destructive" }) {
  const cls: Record<typeof tone, string> = {
    primary: "text-primary",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
  };
  return (
    <div className="rounded-2xl border border-border/40 bg-card p-4">
      <p className={cn("text-2xl font-extrabold leading-none", cls[tone])}>{value}</p>
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold mt-2">
        {label}
      </p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const { t } = useLanguage();
  const map: Record<string, { cls: string; Icon: typeof CheckCircle2; key: string }> = {
    present: { cls: "bg-success/10 text-success", Icon: CheckCircle2, key: "student.statusPresent" },
    late: { cls: "bg-warning/10 text-warning", Icon: Clock, key: "student.statusLate" },
    absent: { cls: "bg-destructive/10 text-destructive", Icon: AlertTriangle, key: "student.statusAbsent" },
    excused: { cls: "bg-muted text-muted-foreground", Icon: CircleDot, key: "student.statusExcused" },
  };
  const c = map[status] ?? map.excused;
  const Icon = c.Icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase", c.cls)}>
      <Icon className="h-3 w-3" />
      {t(c.key)}
    </span>
  );
}
