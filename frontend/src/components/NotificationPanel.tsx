import {
  Bell, UserPlus, CreditCard, AlertTriangle, BookOpen, Check, CheckCheck,
  ExternalLink, CalendarX, CalendarClock, Hourglass, Users,
  AlertCircle, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/use-language";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { formatRelativeNotificationTime } from "@/lib/notification-time";
import {
  useNotificationsList,
  useUnreadCount,
  useMarkRead,
  type NotificationKind,
  type NotificationRead,
  type NotificationSeverity,
} from "@/hooks/use-notifications";

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

export function NotificationPanel() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [bellPulse, setBellPulse] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const listQ   = useNotificationsList({ limit: 20 });
  const unreadQ = useUnreadCount();
  const markRead = useMarkRead();

  const items = listQ.data?.items ?? [];
  const unreadCount = unreadQ.data?.unread ?? listQ.data?.unread ?? 0;

  // Listen for live arrivals broadcast by the SSE stream hook and pulse
  // the bell briefly so the user sees something arrived.
  useEffect(() => {
    const onNew = () => {
      setBellPulse(true);
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
      pulseTimerRef.current = setTimeout(() => setBellPulse(false), 1200);
    };
    window.addEventListener("notifications:new", onNew);
    return () => {
      window.removeEventListener("notifications:new", onNew);
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const visible = useMemo(
    () => (tab === "unread" ? items.filter((n) => !n.read_at) : items),
    [tab, items],
  );

  const handleMarkAllRead = () => {
    markRead.mutate(null);
  };

  const handleClick = (n: NotificationRead) => {
    if (!n.read_at) markRead.mutate([n.id]);
    if (n.link) navigate(n.link);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "relative h-8 w-8 text-muted-foreground hover:text-foreground",
            bellPulse && "text-primary",
          )}
        >
          <Bell
            className={cn(
              "h-4 w-4 transition-transform",
              bellPulse && "animate-bell-shake",
            )}
          />
          {unreadCount > 0 && (
            <span
              className={cn(
                "absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-card flex items-center justify-center",
                bellPulse && "ring-primary/40 animate-pulse",
              )}
            >
              <span className="text-[8px] text-destructive-foreground font-bold">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 p-0 bg-background/70 backdrop-blur-xl border border-border/40 shadow-xl">
        <div className="flex items-center justify-between px-4 py-3">
          <h4 className="text-sm font-semibold text-foreground">{t("notif.title")}</h4>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs gap-1 text-primary"
              onClick={handleMarkAllRead}
              disabled={markRead.isPending}
            >
              <Check className="h-3 w-3" /> {t("notif.markAllRead")}
            </Button>
          )}
        </div>
        <div className="px-3 pb-2">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="grid grid-cols-2 h-8 w-full">
              <TabsTrigger value="all" className="text-[11px] h-6">
                {t("notif.tabAll")} <span className="ml-1 text-[10px] opacity-60">{listQ.data?.total ?? items.length}</span>
              </TabsTrigger>
              <TabsTrigger value="unread" className="text-[11px] h-6">
                {t("notif.tabUnread")} <span className="ml-1 text-[10px] opacity-60">{unreadCount}</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <Separator />
        <div className="max-h-96 overflow-y-auto">
          {listQ.isLoading ? (
            <div className="py-10 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : listQ.isError ? (
            <div className="py-10 text-center">
              <AlertCircle className="h-6 w-6 text-destructive/60 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">{t("notif.failedLoad")}</p>
            </div>
          ) : visible.length === 0 ? (
            <div className="py-10 text-center">
              <Bell className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">{t("notif.empty")}</p>
            </div>
          ) : (
            visible.map((n) => {
              const Icon = KIND_ICON[n.kind] ?? Bell;
              const tone = SEVERITY_TONE[n.severity] ?? SEVERITY_TONE.info;
              const isRead = !!n.read_at;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleClick(n)}
                  className={cn(
                    "w-full text-left px-4 py-3 flex gap-3 hover:bg-muted/30 transition-colors cursor-pointer",
                    !isRead && "bg-primary/5",
                  )}
                >
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs ${!isRead ? "font-semibold text-foreground" : "font-medium text-muted-foreground"}`}>
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{n.body}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      {formatRelativeNotificationTime(n.created_at, t, language, nowMs)}
                    </p>
                  </div>
                  {!isRead && <div className="h-2 w-2 rounded-full bg-primary mt-1.5 shrink-0" />}
                </button>
              );
            })
          )}
        </div>
        <Separator />
        <div className="p-2 flex gap-1">
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 text-xs gap-1"
              onClick={handleMarkAllRead}
              disabled={markRead.isPending}
            >
              <CheckCheck className="h-3 w-3" /> {t("notif.markAllRead")}
            </Button>
          )}
          <Button variant="ghost" size="sm" className="flex-1 text-xs gap-1 text-muted-foreground" onClick={() => navigate("/notifications")}>
            <ExternalLink className="h-3 w-3" /> {t("notif.openAll")}
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
