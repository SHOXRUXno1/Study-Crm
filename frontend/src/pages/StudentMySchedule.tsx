import { useMemo, useState } from "react";
import { format, parseISO, addDays, startOfWeek } from "date-fns";
import { ru as ruLocale, uz as uzLocale, enUS as enLocale } from "date-fns/locale";
import type { Locale } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, User } from "lucide-react";

import { DashboardLayout } from "@/components/DashboardLayout";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { useLanguage } from "@/hooks/use-language";
import { useMySchedule } from "@/hooks/use-me-student";

const DF_LOCALES: Record<string, Locale> = {
  ru: ruLocale,
  uz: uzLocale,
  en: enLocale,
};

function isoOf(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function StudentMySchedule() {
  const { t, language } = useLanguage();
  const dfLocale = DF_LOCALES[language] ?? ruLocale;
  // Anchor date = current "first day" of the visible 14-day window.
  const [anchor, setAnchor] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [view, setView] = useState<"today" | "tomorrow" | "week" | "all">("week");

  const range = useMemo(
    () => ({ from: isoOf(anchor), to: isoOf(addDays(anchor, 13)) }),
    [anchor],
  );
  const { data, isLoading } = useMySchedule(range);
  const lessons = data ?? [];

  const lessonsByDay = useMemo(() => {
    const m = new Map<string, typeof lessons>();
    for (let i = 0; i < 14; i++) {
      m.set(isoOf(addDays(anchor, i)), []);
    }
    for (const l of lessons) {
      const list = m.get(l.lesson_date) ?? [];
      list.push(l);
      m.set(l.lesson_date, list);
    }
    for (const [k, list] of m) {
      list.sort((a, b) => a.start_time.localeCompare(b.start_time));
      m.set(k, list);
    }
    return m;
  }, [lessons, anchor]);

  const visibleDays = useMemo(() => {
    const today = isoOf(new Date());
    const tomorrow = isoOf(addDays(new Date(), 1));
    const entries = Array.from(lessonsByDay.entries());
    if (view === "today") {
      return entries.filter(([dateIso]) => dateIso === today);
    }
    if (view === "tomorrow") {
      return entries.filter(([dateIso]) => dateIso === tomorrow);
    }
    if (view === "week") {
      const weekEnd = isoOf(addDays(new Date(), 6));
      return entries.filter(([dateIso]) => dateIso >= today && dateIso <= weekEnd);
    }
    return entries;
  }, [lessonsByDay, view]);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl space-y-4 sm:space-y-6">
        <Breadcrumbs items={[{ label: t("student.mySchedule") }]} />

        <div className="space-y-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
              {t("student.mySchedule")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("student.scheduleHeader")}
            </p>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <ViewButton
              active={view === "today"}
              label={t("student.mobile.today")}
              onClick={() => setView("today")}
            />
            <ViewButton
              active={view === "tomorrow"}
              label={t("student.mobile.tomorrow")}
              onClick={() => setView("tomorrow")}
            />
            <ViewButton
              active={view === "week"}
              label={t("student.mobile.week")}
              onClick={() => setView("week")}
            />
            <ViewButton
              active={view === "all"}
              label={t("student.mobile.all")}
              onClick={() => setView("all")}
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAnchor((a) => addDays(a, -7))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAnchor(startOfWeek(new Date(), { weekStartsOn: 1 }))}
            >
              {t("schedule.today")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAnchor((a) => addDays(a, 7))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : lessons.length === 0 ? (
          <div className="rounded-2xl border border-border/40 bg-card p-12 flex flex-col items-center justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/40">
              <CalendarDays className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground mt-3">{t("student.noSchedule")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleDays.map(([dateIso, dayLessons]) => {
              const date = parseISO(dateIso);
              const isToday = dateIso === isoOf(new Date());
              return (
                <div
                  key={dateIso}
                  className={cn(
                    "rounded-2xl border bg-card overflow-hidden",
                    isToday ? "border-primary/40 ring-1 ring-primary/20" : "border-border/40",
                  )}
                >
                  <div
                    className={cn(
                      "px-4 py-3 flex items-center justify-between border-b",
                      isToday ? "bg-primary/5 border-primary/20" : "bg-muted/30 border-border/40",
                    )}
                  >
                    <p className={cn("text-sm font-bold capitalize", isToday && "text-primary")}>
                      {format(date, "EEEE, d MMM", { locale: dfLocale })}
                    </p>
                    <span className="text-[11px] uppercase tracking-widest font-semibold text-muted-foreground">
                      {dayLessons.length === 0
                        ? t("student.noUpcomingLessons")
                        : `${dayLessons.length} · ${t("student.lessonsCount")}`}
                    </span>
                  </div>
                  {dayLessons.length > 0 && (
                    <ul className="space-y-2 p-3">
                      {dayLessons.map((l) => (
                        <li
                          key={l.id}
                          className={cn(
                            "rounded-xl border border-border/60 p-3",
                            l.status === "cancelled" && "opacity-60",
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-foreground">
                                {l.course_name ?? l.group_code}
                              </p>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {l.start_time.slice(0, 5)} – {l.end_time.slice(0, 5)}
                              </p>
                              {l.topic && (
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {l.topic}
                                </p>
                              )}
                              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                                {l.teacher_name && (
                                  <span className="inline-flex items-center gap-1">
                                    <User className="h-3 w-3" />
                                    {l.teacher_name}
                                  </span>
                                )}
                                {l.room_name && (
                                  <span className="inline-flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {l.room_name}
                                  </span>
                                )}
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {l.group_code}
                                </span>
                              </div>
                            </div>

                            {l.status === "cancelled" && (
                              <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold uppercase text-destructive">
                                {t("schedule.statusCancelled")}
                              </span>
                            )}
                            {l.status === "completed" && (
                              <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-600">
                                {t("schedule.statusFinished")}
                              </span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function ViewButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-2 py-2 text-xs font-semibold transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40",
      )}
    >
      {label}
    </button>
  );
}
