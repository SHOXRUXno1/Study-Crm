import { useEffect, useMemo, useRef, useState } from "react";
import {
  UserPlus, CreditCard, AlertTriangle, Smartphone, Bell, Send, AlertOctagon,
  CalendarDays, Users, Moon, RotateCcw, Loader2, AlertCircle,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
  type ChannelPrefs,
  type NotificationKind,
  type NotificationPreferencesRead,
  type QuietHours,
} from "@/hooks/use-notifications";

type ChannelKey = "in_app" | "push" | "telegram";

interface NotifCardDef {
  key: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  labelKey: string;
  descKey: string;
  /** Underlying backend kinds that this UI card controls. */
  kinds: NotificationKind[];
}

const CARDS: NotifCardDef[] = [
  {
    key: "newStudent",
    icon: UserPlus,
    iconClass: "bg-primary/10 text-primary",
    labelKey: "settings.notifNewStudent",
    descKey: "settings.notifNewStudentDesc",
    kinds: ["new_student", "course_enrollment"],
  },
  {
    key: "payment",
    icon: CreditCard,
    iconClass: "bg-success/10 text-success",
    labelKey: "settings.notifPayment",
    descKey: "settings.notifPaymentDesc",
    kinds: ["payment_received"],
  },
  {
    key: "attendance",
    icon: AlertTriangle,
    iconClass: "bg-warning/10 text-warning",
    labelKey: "settings.notifAttendance",
    descKey: "settings.notifAttendanceDesc",
    kinds: ["attendance_changed", "low_attendance"],
  },
  {
    key: "debt",
    icon: AlertOctagon,
    iconClass: "bg-destructive/10 text-destructive",
    labelKey: "settings.notifDebt",
    descKey: "settings.notifDebtDesc",
    kinds: ["debtor_overdue", "unpaid_advance"],
  },
  {
    key: "schedule",
    icon: CalendarDays,
    iconClass: "bg-primary/10 text-primary",
    labelKey: "settings.notifSchedule",
    descKey: "settings.notifScheduleDesc",
    kinds: ["lesson_cancelled", "schedule_changed", "schedule_conflict", "open_conflicts"],
  },
  {
    key: "group",
    icon: Users,
    iconClass: "bg-accent/10 text-accent-foreground",
    labelKey: "settings.notifGroup",
    descKey: "settings.notifGroupDesc",
    kinds: ["group_ending", "low_fill"],
  },
];

const DEFAULT_CHANNEL_PREFS: ChannelPrefs = {
  in_app: true,
  push: false,
  telegram: false,
};

function ensureKindsBlob(
  prefs: NotificationPreferencesRead | undefined,
): Record<NotificationKind, ChannelPrefs> {
  const out: Record<string, ChannelPrefs> = {};
  for (const card of CARDS) {
    for (const k of card.kinds) {
      out[k] = prefs?.kinds?.[k] ?? { ...DEFAULT_CHANNEL_PREFS };
    }
  }
  return out as Record<NotificationKind, ChannelPrefs>;
}

/** Aggregate channel state across the kinds backing a single card.
 *  We display "on" when *any* of the kinds has the channel enabled. */
function aggregate(
  kinds: NotificationKind[],
  state: Record<NotificationKind, ChannelPrefs>,
  channel: ChannelKey,
): boolean {
  return kinds.some((k) => Boolean(state[k]?.[channel]));
}

export function NotificationsTab() {
  const { t } = useLanguage();
  const prefsQ = useNotificationPreferences();
  const updateM = useUpdateNotificationPreferences();

  // Local working copy mirrors server data; debounced save flushes changes.
  const [kinds, setKinds] = useState<Record<NotificationKind, ChannelPrefs>>(() =>
    ensureKindsBlob(undefined),
  );
  const [telegramUsername, setTelegramUsername] = useState("");
  const [quiet, setQuiet] = useState<QuietHours>({
    enabled: false,
    start: "22:00",
    end: "07:00",
  });

  // Hydrate once data arrives.
  const hydrated = useRef(false);
  useEffect(() => {
    if (!prefsQ.data || hydrated.current) return;
    hydrated.current = true;
    setKinds(ensureKindsBlob(prefsQ.data));
    setTelegramUsername(prefsQ.data.telegram_username ?? "");
    // Server may return `start`/`end` in HH:MM:SS; trim to HH:MM for the picker.
    setQuiet({
      enabled: !!prefsQ.data.quiet_hours?.enabled,
      start: (prefsQ.data.quiet_hours?.start ?? "22:00").slice(0, 5),
      end:   (prefsQ.data.quiet_hours?.end   ?? "07:00").slice(0, 5),
    });
  }, [prefsQ.data]);

  // Debounced save: 350ms after last change.
  const dirty = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleSave = () => {
    dirty.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!dirty.current) return;
      dirty.current = false;
      updateM.mutate(
        {
          kinds,
          quiet_hours: quiet,
          telegram_username: telegramUsername || null,
        },
        {
          onSuccess: () => toast.success(t("notif.savedPrefs")),
          onError: () => toast.error(t("notif.failedLoad")),
        },
      );
    }, 350);
  };

  const toggleChannel = (cardKey: string, channel: ChannelKey) => {
    const card = CARDS.find((c) => c.key === cardKey);
    if (!card) return;
    setKinds((prev) => {
      const wasOn = aggregate(card.kinds, prev, channel);
      const next = { ...prev };
      for (const k of card.kinds) {
        next[k] = { ...next[k], [channel]: !wasOn };
      }
      return next;
    });
    scheduleSave();
  };

  const setQuietPart = (patch: Partial<QuietHours>) => {
    setQuiet((q) => ({ ...q, ...patch }));
    scheduleSave();
  };

  const setTgUser = (v: string) => {
    setTelegramUsername(v);
    scheduleSave();
  };

  const reset = () => {
    const blank = ensureKindsBlob(undefined);
    setKinds(blank);
    setTelegramUsername("");
    setQuiet({ enabled: false, start: "22:00", end: "07:00" });
    scheduleSave();
    toast.success(t("settings.resetDone"));
  };

  const channelMeta: { key: ChannelKey; labelKey: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "in_app",   labelKey: "settings.channelInApp",    icon: Bell },
    { key: "push",     labelKey: "settings.channelPush",     icon: Smartphone },
    { key: "telegram", labelKey: "settings.channelTelegram", icon: Send },
  ];

  const isReady = !!prefsQ.data && !prefsQ.isLoading;
  const isSaving = updateM.isPending;

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">{t("settings.notifPrefs")}</h3>
          <p className="text-xs text-muted-foreground mt-1">{t("settings.notifPrefsDesc")}</p>
        </div>
        <div className="flex items-center gap-2">
          {isSaving && (
            <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
            </span>
          )}
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" /> {t("settings.resetDefaults")}
          </Button>
        </div>
      </div>

      {prefsQ.isError && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" /> {t("notif.failedLoad")}
        </div>
      )}

      {!isReady ? (
        <div className="rounded-xl border border-border/60 bg-card p-8 flex items-center justify-center text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : (
        <>
          {/* Telegram */}
          <div className="rounded-xl border border-border/60 bg-card p-4 sm:p-5 shadow-sm space-y-2">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">{t("settings.channelTelegram")}</p>
            </div>
            <Input
              value={telegramUsername}
              onChange={(e) => setTgUser(e.target.value)}
              placeholder={t("settings.telegramUsername")}
              className="h-9"
            />
          </div>

          {/* Quiet hours */}
          <div className="rounded-xl border border-border/60 bg-card p-4 sm:p-5 shadow-sm space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Moon className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-sm font-semibold text-foreground">{t("settings.quietHours")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("settings.quietHoursDesc")}</p>
                </div>
              </div>
              <Switch
                checked={quiet.enabled}
                onCheckedChange={(v) => setQuietPart({ enabled: v })}
              />
            </div>
            {quiet.enabled && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{t("settings.quietFrom")}</label>
                  <Input
                    type="time"
                    value={quiet.start}
                    onChange={(e) => setQuietPart({ start: e.target.value })}
                    className="h-9 mt-1"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{t("settings.quietTo")}</label>
                  <Input
                    type="time"
                    value={quiet.end}
                    onChange={(e) => setQuietPart({ end: e.target.value })}
                    className="h-9 mt-1"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Cards */}
          <div className="grid gap-3">
            {CARDS.map((card, i) => {
              const Icon = card.icon;
              const enabledCount = channelMeta.filter((ch) =>
                aggregate(card.kinds, kinds, ch.key),
              ).length;
              return (
                <div
                  key={card.key}
                  className="rounded-xl border border-border/60 bg-card p-4 sm:p-5 shadow-sm transition-colors hover:border-border animate-fade-in"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div className="flex items-start gap-3 sm:gap-4">
                    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", card.iconClass)}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">{t(card.labelKey)}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{t(card.descKey)}</p>
                        </div>
                        <span className="shrink-0 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {enabledCount}/3
                        </span>
                      </div>

                      <Separator className="my-3" />

                      <div className="grid grid-cols-3 gap-2">
                        {channelMeta.map((ch) => {
                          const ChIcon = ch.icon;
                          const checked = aggregate(card.kinds, kinds, ch.key);
                          return (
                            <label
                              key={ch.key}
                              className={cn(
                                "flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 cursor-pointer transition-colors",
                                checked ? "border-primary/40 bg-primary/5" : "border-border/60 bg-background hover:bg-muted/40",
                              )}
                            >
                              <span className="flex items-center gap-1.5 min-w-0 text-muted-foreground">
                                <ChIcon className="h-3.5 w-3.5" />
                                <span className="text-[11px] font-medium truncate">{t(ch.labelKey)}</span>
                              </span>
                              <Switch
                                checked={checked}
                                onCheckedChange={() => toggleChannel(card.key, ch.key)}
                                className="scale-75"
                              />
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
