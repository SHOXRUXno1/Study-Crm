import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { Languages, LogOut, Search, Settings, Sun, Moon, Ellipsis } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { studentPrimaryTabs } from "@/config/student-nav";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useLanguage } from "@/hooks/use-language";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export function StudentMobileNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { logout } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);

  const activePath = location.pathname;
  const tabs = useMemo(() => studentPrimaryTabs, []);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav || typeof document === "undefined") return;

    const setNavHeightVar = () => {
      const h = Math.ceil(nav.getBoundingClientRect().height);
      document.documentElement.style.setProperty("--student-mobile-nav-h", `${h}px`);
    };

    setNavHeightVar();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => setNavHeightVar());
      ro.observe(nav);
    } else {
      window.addEventListener("resize", setNavHeightVar);
      window.addEventListener("orientationchange", setNavHeightVar);
    }

    return () => {
      if (ro) {
        ro.disconnect();
      } else {
        window.removeEventListener("resize", setNavHeightVar);
        window.removeEventListener("orientationchange", setNavHeightVar);
      }
    };
  }, []);

  return (
    <>
      <nav
        ref={navRef}
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85"
      >
        <div className="grid min-h-[76px] grid-cols-5 px-1 pb-[max(env(safe-area-inset-bottom),0.35rem)] pt-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activePath === tab.path;
            return (
              <button
                key={tab.path}
                type="button"
                onClick={() => navigate(tab.path)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 transition-colors",
                  active ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="text-[10px] font-semibold leading-none">{t(tab.titleKey)}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Ellipsis className="h-4 w-4" />
            <span className="text-[10px] font-semibold leading-none">{t("student.mobile.more")}</span>
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-[max(env(safe-area-inset-bottom),1rem)]">
          <SheetHeader>
            <SheetTitle>{t("student.mobile.more")}</SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-2">
            <ActionButton
              icon={Settings}
              label={t("sidebar.settings")}
              onClick={() => {
                setMoreOpen(false);
                navigate("/settings");
              }}
            />
            <ActionButton
              icon={Search}
              label={t("student.mobile.search")}
              onClick={() => {
                setMoreOpen(false);
                document.dispatchEvent(
                  new KeyboardEvent("keydown", {
                    key: "k",
                    metaKey: true,
                    ctrlKey: true,
                  }),
                );
              }}
            />
            <ActionButton
              icon={theme === "light" ? Moon : Sun}
              label={t("settings.darkMode")}
              onClick={toggleTheme}
            />
          </div>

          <div className="mt-4 rounded-xl border border-border/50 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Languages className="mr-1 inline h-3 w-3" />
              {t("settings.language")}
            </p>
            <LanguageSwitcher size="md" className="w-full justify-center" />
          </div>

          <Button
            variant="destructive"
            className="mt-4 w-full"
            onClick={() => {
              logout();
              setMoreOpen(false);
              navigate("/login");
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            {t("profile.logout")}
          </Button>
        </SheetContent>
      </Sheet>
    </>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-border/50 px-3 py-3 text-left text-sm font-medium text-foreground hover:bg-muted/40 transition-colors"
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span>{label}</span>
    </button>
  );
}
