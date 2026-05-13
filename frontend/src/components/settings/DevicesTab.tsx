import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Monitor, Smartphone, Tablet, Globe,
  LogOut, MapPin, Calendar, Loader2,
} from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  useSessions,
  useRevokeSession,
  useLogoutAll,
  useLogout,
  type SessionItem,
} from "@/hooks/use-sessions";

// ── Helpers ────────────────────────────────────────────────────────────────

type DeviceStatus = "online" | "recent" | "stale";

function getStatus(lastActiveAt: string): DeviceStatus {
  const diffMs = Date.now() - new Date(lastActiveAt).getTime();
  const mins = diffMs / 60000;
  if (mins < 5)   return "online";
  if (mins < 1440) return "recent";
  return "stale";
}

function formatRelative(iso: string, lang: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins   = Math.floor(diffMs / 60000);
  const hours  = Math.floor(mins / 60);
  const days   = Math.floor(hours / 24);
  const months = Math.floor(days / 30);

  const dict: Record<string, Record<string, (n: number) => string>> = {
    ru: {
      now:   () => "сейчас онлайн",
      min:   (n) => `${n} мин назад`,
      hour:  (n) => `${n} ч назад`,
      day:   (n) => n === 1 ? "вчера" : `${n} дн назад`,
      month: (n) => `${n} мес назад`,
    },
    en: {
      now:   () => "online now",
      min:   (n) => `${n} min ago`,
      hour:  (n) => `${n}h ago`,
      day:   (n) => n === 1 ? "yesterday" : `${n}d ago`,
      month: (n) => `${n}mo ago`,
    },
    uz: {
      now:   () => "hozir onlayn",
      min:   (n) => `${n} daq oldin`,
      hour:  (n) => `${n} soat oldin`,
      day:   (n) => n === 1 ? "kecha" : `${n} kun oldin`,
      month: (n) => `${n} oy oldin`,
    },
  };
  const d = dict[lang] ?? dict.en;
  if (mins < 1)  return d.now(0);
  if (mins < 60) return d.min(mins);
  if (hours < 24) return d.hour(hours);
  if (days < 30)  return d.day(days);
  return d.month(months);
}

function formatDate(iso: string, lang: string): string {
  return new Date(iso).toLocaleString(
    lang === "ru" ? "ru-RU" : lang === "uz" ? "uz-UZ" : "en-GB",
    { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" },
  );
}

function DeviceIcon({ type }: { type: SessionItem["device_type"] }) {
  const cls = "h-5 w-5 text-foreground";
  if (type === "desktop") return <Monitor className={cls} />;
  if (type === "mobile")  return <Smartphone className={cls} />;
  if (type === "tablet")  return <Tablet className={cls} />;
  return <Globe className={cls} />;
}

function StatusDot({ status }: { status: DeviceStatus }) {
  if (status === "online") {
    return (
      <span className="relative flex h-2.5 w-2.5" aria-label="online">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
      </span>
    );
  }
  if (status === "recent") {
    return <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/50" aria-label="recent" />;
  }
  return <span className="h-2.5 w-2.5 rounded-full bg-destructive" aria-label="stale" />;
}

function deviceName(s: SessionItem): string {
  const parts = [s.os_name, s.browser_name].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Unknown device";
}

function deviceLocation(s: SessionItem): string {
  const parts = [s.city, s.country].filter(Boolean);
  return parts.length ? parts.join(", ") : (s.ip_address ?? "—");
}

// ── Component ──────────────────────────────────────────────────────────────

export function DevicesTab() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const { data, isLoading, isError } = useSessions();
  const revokeM    = useRevokeSession();
  const logoutAllM = useLogoutAll();
  const logoutM    = useLogout();

  const sessions = data?.items ?? [];

  async function handleRevoke(id: number) {
    try {
      await revokeM.mutateAsync(id);
      toast.success(t("devices.toastRevoked"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  }

  async function handleLogoutAll() {
    try {
      const res = await logoutAllM.mutateAsync();
      toast.success(res.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  }

  async function handleLogoutCurrent() {
    try {
      await logoutM.mutateAsync();
      logout();
      navigate("/login");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="stat-card space-y-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">{t("devices.title")}</h3>
          <p className="text-xs text-muted-foreground mt-1">{t("devices.subtitle")}</p>
        </div>
        <Separator />

        {isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {isError && (
          <p className="text-sm text-destructive text-center py-4">{t("devices.loadFailed")}</p>
        )}

        {!isLoading && !isError && (
          <div className="space-y-3">
            {sessions.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">{t("devices.noSessions")}</p>
            )}
            {sessions.map((s) => {
              const status = getStatus(s.last_active_at);
              return (
                <div
                  key={s.id}
                  className="rounded-xl border border-border bg-card/50 p-4 transition-all hover:border-border/80 hover:bg-card"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                        <DeviceIcon type={s.device_type} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-foreground truncate">{deviceName(s)}</p>
                          <StatusDot status={status} />
                        </div>
                        {(s.city || s.country) && (
                          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {deviceLocation(s)}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatRelative(s.last_active_at, language)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {s.is_current ? (
                        <>
                          <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-500 border border-emerald-500/20">
                            {t("devices.current")}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleLogoutCurrent}
                            disabled={logoutM.isPending}
                            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 gap-1.5 text-xs h-7 px-2"
                          >
                            <LogOut className="h-3.5 w-3.5" />
                            {t("devices.logout")}
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRevoke(s.id)}
                          disabled={revokeM.isPending}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5 text-xs h-7 px-2"
                        >
                          {revokeM.isPending
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <LogOut className="h-3.5 w-3.5" />
                          }
                          {t("devices.logout")}
                        </Button>
                      )}
                    </div>
                  </div>

                  <Separator className="my-3" />

                  <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                    {s.ip_address && (
                      <span className="font-mono">
                        <span className="text-muted-foreground/70">{t("devices.ip")}:</span>{" "}
                        <span className="text-foreground/80">{s.ip_address}</span>
                      </span>
                    )}
                    <span className="flex items-center gap-1 flex-wrap">
                      <Calendar className="h-3 w-3" />
                      <span className="text-muted-foreground/70">{t("devices.signedIn")}:</span>{" "}
                      <span className="text-foreground/80">{formatDate(s.created_at, language)}</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {sessions.some((s) => !s.is_current) && (
        <div className="flex justify-center">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="gap-2" disabled={logoutAllM.isPending}>
                {logoutAllM.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <LogOut className="h-4 w-4" />
                }
                {t("devices.logoutAll")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("devices.confirmTitle")}</AlertDialogTitle>
                <AlertDialogDescription>{t("devices.confirmDesc")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("devices.cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleLogoutAll}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {t("devices.logoutAll")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
