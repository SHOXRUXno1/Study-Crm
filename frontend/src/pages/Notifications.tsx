import { useEffect, useMemo, useState } from "react";
import {
  Bell, UserPlus, CreditCard, AlertTriangle, BookOpen, Check, CheckCheck,
  Trash2, Search, CalendarDays, ExternalLink, X, Flame,
  CalendarX, CalendarClock, Hourglass, Users, AlertCircle, Loader2,
  Settings as SettingsIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useLanguage } from "@/hooks/use-language";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  useNotificationsList,
  useMarkRead,
  useDeleteNotification,
  useDeleteRead,
  type NotificationKind,
  type NotificationRead,
  type NotificationSeverity,
} from "@/hooks/use-notifications";
import {
  formatRelativeNotificationTime,
  localDayKey,
  notificationDayBucket,
} from "@/lib/notification-time";

// ── Categorisation (kind → category) ─────────────────────────────────────

type Category = "finance" | "students" | "attendance" | "schedule" | "system";

const KIND_TO_CATEGORY: Record<NotificationKind, Category> = {
  payment_received:   "finance",
  debtor_overdue:     "finance",
  unpaid_advance:     "finance",
  new_student:        "students",
  course_enrollment:  "students",
  attendance_changed: "attendance",
  low_attendance:     "attendance",
  lesson_cancelled:   "schedule",
  schedule_changed:   "schedule",
  schedule_conflict:  "schedule",
  group_ending:       "schedule",
  open_conflicts:     "schedule",
  low_fill:           "system",
};

const KIND_ICON: Record<NotificationKind, React.ComponentType<{ className?: string }>> = {
  payment_received:    CreditCard,
  new_student:         UserPlus,
  lesson_cancelled:    CalendarX,
  schedule_changed:    CalendarClock,
  schedule_conflict:   AlertCircle,
  attendance_changed:  AlertTriangle,
  course_enrollment:   BookOpen,
  debtor_overdue:      AlertTriangle,
  group_ending:        Hourglass,
  low_attendance:      AlertTriangle,
  open_conflicts:      AlertCircle,
  low_fill:            Users,
  unpaid_advance:      CreditCard,
};

const SEVERITY_TONE: Record<NotificationSeverity, string> = {
  info:     "bg-primary/10 text-primary",
  success:  "bg-success/10 text-success",
  warning:  "bg-warning/10 text-warning",
  critical: "bg-destructive/10 text-destructive",
};

const CATEGORY_META: Record<Category, { labelKey: string; icon: React.ComponentType<{ className?: string }> }> = {
  finance:    { labelKey: "notif.catFinance",    icon: CreditCard },
  students:   { labelKey: "notif.catStudents",   icon: UserPlus },
  attendance: { labelKey: "notif.catAttendance", icon: AlertTriangle },
  schedule:   { labelKey: "notif.catSchedule",   icon: CalendarDays },
  system:     { labelKey: "notif.catSystem",     icon: SettingsIcon },
};

const KIND_LABEL_KEY: Record<NotificationKind, string> = {
  payment_received:   "notif.kindPaymentReceived",
  new_student:        "notif.kindNewStudent",
  lesson_cancelled:   "notif.kindLessonCancelled",
  schedule_changed:   "notif.kindScheduleChanged",
  schedule_conflict:  "notif.kindScheduleConflict",
  attendance_changed: "notif.kindAttendanceChanged",
  course_enrollment:  "notif.kindCourseEnrollment",
  debtor_overdue:     "notif.kindDebtorOverdue",
  group_ending:       "notif.kindGroupEnding",
  low_attendance:     "notif.kindLowAttendance",
  open_conflicts:     "notif.kindOpenConflicts",
  low_fill:           "notif.kindLowFill",
  unpaid_advance:     "notif.kindUnpaidAdvance",
};

// ── Helpers ──────────────────────────────────────────────────────────────

// ── Page ─────────────────────────────────────────────────────────────────

export default function Notifications() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [nowMs, setNowMs] = useState(() => Date.now());

  // ── Filters (server-driven where possible) ────────────────────────────
  const [activeChip, setActiveChip] = useState<"all" | "unread" | Category>("all");
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<"all" | "today" | "7" | "30">("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const onlyUnread = activeChip === "unread";

  // We pull a generous page (server-side limit hits 200), then client-filter
  // by category and search.
  const sinceIso = useMemo(() => {
    if (period === "all") return undefined;
    const days = period === "today" ? 1 : period === "7" ? 7 : 30;
    return new Date(Date.now() - days * 86400000).toISOString();
  }, [period]);

  const listQ = useNotificationsList({
    only_unread: onlyUnread,
    since: sinceIso,
    limit: 200,
  });

  const markRead = useMarkRead();
  const deleteOne = useDeleteNotification();
  const deleteRead = useDeleteRead();

  const items = listQ.data?.items ?? [];

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // ── Derived counts ────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const all = listQ.data?.total ?? items.length;
    const unread = listQ.data?.unread ?? items.filter((n) => !n.read_at).length;
    const today = localDayKey(new Date(nowMs));
    const todayCount = items.filter((n) => localDayKey(n.created_at) === today).length;
    const byCat: Record<Category, number> = {
      finance: 0, students: 0, attendance: 0, schedule: 0, system: 0,
    };
    items.forEach((n) => { byCat[KIND_TO_CATEGORY[n.kind] ?? "system"]++; });
    // critical/warning items are "action-required" candidates
    const action = items.filter((n) => !n.read_at && (n.severity === "critical" || n.severity === "warning")).length;
    return { all, unread, today: todayCount, action, byCat };
  }, [items, listQ.data, nowMs]);

  const filtered = useMemo(() => {
    return items.filter((n) => {
      const cat = KIND_TO_CATEGORY[n.kind] ?? "system";
      if (activeChip !== "all" && activeChip !== "unread" && cat !== activeChip) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !n.title.toLowerCase().includes(q) &&
          !(n.body ?? "").toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [items, activeChip, search]);

  const grouped = useMemo(() => {
    const groups: { key: string; label: string; items: NotificationRead[] }[] = [
      { key: "today", label: t("notif.groupToday"), items: [] },
      { key: "yesterday", label: t("notif.groupYesterday"), items: [] },
      { key: "week", label: t("notif.groupWeek"), items: [] },
      { key: "earlier", label: t("notif.groupEarlier"), items: [] },
    ];
    filtered.forEach((n) => {
      const bucket = notificationDayBucket(n.created_at, nowMs);
      if (bucket === "today") groups[0].items.push(n);
      else if (bucket === "yesterday") groups[1].items.push(n);
      else if (bucket === "week") groups[2].items.push(n);
      else groups[3].items.push(n);
    });
    return groups.filter((g) => g.items.length > 0);
  }, [filtered, t, nowMs]);

  // ── Actions ───────────────────────────────────────────────────────────
  const toggleSelect = (id: number) =>
    setSelected((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });

  const handleClick = (n: NotificationRead) => {
    if (!n.read_at) markRead.mutate([n.id]);
    if (n.link) navigate(n.link);
  };

  const handleDeleteOne = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    deleteOne.mutate(id);
    setSelected((prev) => {
      const s = new Set(prev);
      s.delete(id);
      return s;
    });
  };

  const bulkRead = () => {
    if (selected.size === 0) return;
    markRead.mutate(Array.from(selected));
    setSelected(new Set());
  };

  const bulkDelete = async () => {
    const ids = Array.from(selected);
    setSelected(new Set());
    for (const id of ids) {
      try { await deleteOne.mutateAsync(id); } catch { /* keep going */ }
    }
  };

  const hasFilters =
    activeChip !== "all" || !!search || period !== "all";

  const resetFilters = () => {
    setActiveChip("all"); setSearch(""); setPeriod("all");
  };

  const chips: { key: "all" | "unread" | Category; label: string; count: number }[] = [
    { key: "all",        label: t("notif.catAll"),        count: counts.all },
    { key: "unread",     label: t("notif.catUnread"),     count: counts.unread },
    { key: "finance",    label: t("notif.catFinance"),    count: counts.byCat.finance },
    { key: "students",   label: t("notif.catStudents"),   count: counts.byCat.students },
    { key: "attendance", label: t("notif.catAttendance"), count: counts.byCat.attendance },
    { key: "schedule",   label: t("notif.catSchedule"),   count: counts.byCat.schedule },
    { key: "system",     label: t("notif.catSystem"),     count: counts.byCat.system },
  ];

  const kpis = [
    { key: "all",    label: t("notif.totalNotifs"),     value: counts.all,    icon: Bell,           color: "text-primary",     onClick: () => setActiveChip("all") },
    { key: "unread", label: t("notif.unread"),          value: counts.unread, icon: AlertTriangle,  color: "text-warning",     onClick: () => setActiveChip("unread") },
    { key: "action", label: t("notif.actionRequired"),  value: counts.action, icon: Flame,          color: "text-destructive", onClick: () => setActiveChip("unread") },
    { key: "today",  label: t("notif.todayCount"),      value: counts.today,  icon: CalendarDays,   color: "text-success",     onClick: () => { setPeriod("today"); setActiveChip("all"); } },
  ];

  return (
    <div className="space-y-4 sm:space-y-6 pb-24">
      <Breadcrumbs items={[{ label: t("notif.title") }]} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">{t("notif.allTitle")}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t("notif.allSubtitle")}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => deleteRead.mutate()}
            disabled={deleteRead.isPending}
            title={t("notif.deleteAllRead")}
          >
            <Trash2 className="h-3.5 w-3.5" /> {t("notif.deleteAllRead")}
          </Button>
          {counts.unread > 0 && (
            <Button
              variant="default"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => markRead.mutate(null)}
              disabled={markRead.isPending}
            >
              <CheckCheck className="h-3.5 w-3.5" /> {t("notif.markAllRead")}
            </Button>
          )}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <button
            key={k.key}
            onClick={k.onClick}
            className="text-left rounded-xl border border-border/60 bg-card p-3 sm:p-4 shadow-sm hover:shadow-md hover:border-primary/40 transition-all"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-muted/60">
                <k.icon className={cn("h-4 w-4", k.color)} />
              </div>
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight mb-1">{k.label}</p>
            <p className="text-lg sm:text-xl font-bold text-foreground tabular-nums">{k.value}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-border/60 bg-card p-3 sm:p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder={t("notif.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-8 pr-8 text-sm"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Period */}
          <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
            <SelectTrigger className={cn("h-9 w-full sm:w-44", period !== "all" && "border-primary text-primary")}>
              <SelectValue placeholder={t("notif.periodLabel")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("notif.periodAll")}</SelectItem>
              <SelectItem value="today">{t("notif.periodToday")}</SelectItem>
              <SelectItem value="7">{t("notif.period7")}</SelectItem>
              <SelectItem value="30">{t("notif.period30")}</SelectItem>
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={resetFilters}>
              <X className="h-3.5 w-3.5 mr-1.5" /> {t("notif.resetFilters")}
            </Button>
          )}
        </div>

        {/* Category chips */}
        <div className="mt-3 pt-3 border-t border-border/50 flex flex-wrap gap-1.5">
          {chips.map((c) => {
            const active = activeChip === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setActiveChip(c.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full text-[11px] font-medium px-2.5 py-1 transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/60 text-foreground hover:bg-muted",
                )}
              >
                {c.label}
                <span className={cn(
                  "tabular-nums px-1 rounded-full",
                  active ? "bg-primary-foreground/20" : "bg-background/60",
                )}>
                  {c.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-20 flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 backdrop-blur-sm p-2 shadow-sm">
          <span className="text-xs font-semibold px-2">
            {selected.size} {t("notif.selected")}
          </span>
          <Separator orientation="vertical" className="h-5" />
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={bulkRead} disabled={markRead.isPending}>
            <Check className="h-3 w-3" /> {t("notif.markRead")}
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive" onClick={bulkDelete}>
            <Trash2 className="h-3 w-3" /> {t("notif.deleteSelected")}
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 ml-auto" onClick={() => setSelected(new Set())}>
            <X className="h-3 w-3" /> {t("notif.clearSelection")}
          </Button>
        </div>
      )}

      {/* List */}
      {listQ.isLoading ? (
        <div className="rounded-xl border border-border/60 bg-card px-6 py-16 flex items-center justify-center text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" /> {t("groups.loading")}
        </div>
      ) : listQ.isError ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-6 py-12 text-center">
          <AlertCircle className="h-6 w-6 text-destructive mx-auto mb-2" />
          <p className="text-sm text-destructive">{t("notif.failedLoad")}</p>
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-xl border border-border/60 bg-card px-6 py-16 text-center">
          <Bell className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">{t("notif.empty")}</p>
          <p className="text-xs text-muted-foreground">
            {hasFilters ? t("notif.resetFilters") : t("notif.allSubtitle")}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map((g) => (
            <section key={g.key}>
              <h3 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2 px-1">
                {g.label}
              </h3>
              <div className="rounded-xl border border-border/60 bg-card divide-y divide-border/50 shadow-sm overflow-hidden">
                {g.items.map((n) => {
                  const Icon = KIND_ICON[n.kind] ?? Bell;
                  const tone = SEVERITY_TONE[n.severity] ?? SEVERITY_TONE.info;
                  const isRead = !!n.read_at;
                  const isSelected = selected.has(n.id);
                  const cat = KIND_TO_CATEGORY[n.kind] ?? "system";
                  const meta = CATEGORY_META[cat];
                  return (
                    <div
                      key={n.id}
                      className={cn(
                        "group flex items-start gap-3 px-3 sm:px-4 py-3 transition-colors",
                        !isRead && "bg-primary/5",
                        isSelected && "bg-primary/10",
                      )}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(n.id)}
                        className="mt-1.5 shrink-0"
                      />
                      <button
                        type="button"
                        onClick={() => handleClick(n)}
                        className="flex flex-1 min-w-0 items-start gap-3 text-left"
                      >
                        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", tone)}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn("text-sm", !isRead ? "font-semibold text-foreground" : "font-medium text-muted-foreground")}>
                              {n.title}
                            </span>
                            {n.severity === "critical" && (
                              <span className="text-[9px] font-bold uppercase tracking-wider rounded-full bg-destructive/15 text-destructive px-1.5 py-0.5">
                                {t("notif.urgent")}
                              </span>
                            )}
                            <span className="text-[10px] uppercase tracking-wider rounded-full bg-muted/60 text-muted-foreground px-1.5 py-0.5 inline-flex items-center gap-1">
                              <meta.icon className="h-2.5 w-2.5" />
                              {t(KIND_LABEL_KEY[n.kind])}
                            </span>
                          </div>
                          {n.body && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                          )}
                          <p className="text-[10px] text-muted-foreground/70 mt-1">
                            {formatRelativeNotificationTime(n.created_at, t, language, nowMs)}
                          </p>
                        </div>
                        {!isRead && <div className="h-2 w-2 rounded-full bg-primary mt-2 shrink-0" />}
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        {n.link && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 gap-1 text-[11px]"
                            onClick={() => handleClick(n)}
                          >
                            <ExternalLink className="h-3 w-3" /> {t("notif.openProfile")}
                          </Button>
                        )}
                        {!isRead && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={(e) => { e.stopPropagation(); markRead.mutate([n.id]); }}
                            title={t("notif.markRead")}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-muted-foreground hover:text-destructive"
                          onClick={(e) => handleDeleteOne(e, n.id)}
                          title={t("notif.deleteSelected")}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
