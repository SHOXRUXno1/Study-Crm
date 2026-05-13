import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Search, Sun, Moon, Globe, Settings, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useTheme } from "@/hooks/use-theme";
import { useLanguage, languageNames, type Language } from "@/hooks/use-language";
import { NotificationPanel } from "@/components/NotificationPanel";
import { CommandSearch } from "@/components/CommandSearch";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useNotificationsStream } from "@/hooks/use-notifications-stream";
import { useIsMobile } from "@/hooks/use-mobile";
import { StudentMobileNav } from "@/components/StudentMobileNav";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const languages: Language[] = ["en", "ru", "uz"];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const navigate = useNavigate();
  const { logout, user, isAuthenticated } = useAuth();
  const isStudent = user?.role === "student";
  const isMobile = useIsMobile();
  const isStudentMobile = isStudent && isMobile;

  // Real-time notifications stream — staff (not students). Managers use the
  // same EventSource as admin/teacher once JWT + SSE auth supports them.
  useNotificationsStream(isAuthenticated && !isStudent);

  return (
    <SidebarProvider>
      <div
        className={`flex w-full bg-background ${
          isStudentMobile ? "h-[100dvh]" : "min-h-screen"
        }`}
      >
        <AppSidebar />
        <div className="flex-1 flex min-h-0 flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b border-border/60 bg-card/70 backdrop-blur-xl px-4 sm:px-5 lg:px-8 sticky top-0 z-10 safe-area-top">
            <div className="flex items-center gap-3 min-w-0">
              {!isStudentMobile && (
                <SidebarTrigger className="text-muted-foreground hover:text-foreground transition-colors shrink-0" />
              )}
              {!isStudent && (
                <>
                  <Separator orientation="vertical" className="h-5 hidden md:block" />
                  <div className="relative hidden md:block cursor-pointer" onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}>
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/70" />
                    <div className="pl-9 pr-12 w-64 lg:w-80 h-9 bg-muted/50 border border-border/40 text-sm rounded-xl flex items-center text-muted-foreground transition-colors hover:bg-muted/70">
                      {t("header.search")}
                    </div>
                    <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[10px] font-mono text-muted-foreground/50 bg-background/80 border border-border/40 rounded-md px-1.5 py-0.5">⌘K</kbd>
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center gap-1">
              {!isStudent && (
                <Button variant="ghost" size="icon" className="relative h-8 w-8 text-muted-foreground hover:text-foreground md:hidden rounded-xl">
                  <Search className="h-4 w-4" />
                </Button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-xl">
                    <Globe className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[140px] rounded-xl">
                  {languages.map((lang) => (
                    <DropdownMenuItem
                      key={lang}
                      onClick={() => setLanguage(lang)}
                      className={`rounded-lg ${language === lang ? "bg-accent font-medium" : ""}`}
                    >
                      <span className="text-xs font-semibold uppercase w-6">{lang}</span>
                      <span className="text-sm">{languageNames[lang]}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-xl" onClick={toggleTheme}>
                {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </Button>
              {!isStudent && <NotificationPanel />}

              <div className="ml-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl overflow-hidden bg-gradient-to-br from-primary to-primary/70 cursor-pointer hover:shadow-md transition-all duration-200 hover:scale-105">
                      {user?.avatar_base64 ? (
                        <img src={user.avatar_base64} alt="avatar" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-xs font-bold text-primary-foreground">{user?.initials ?? "AD"}</span>
                      )}
                    </div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 rounded-xl">
                    <div className="px-3 py-3 border-b border-border flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl overflow-hidden bg-gradient-to-br from-primary to-primary/70">
                        {user?.avatar_base64 ? (
                          <img src={user.avatar_base64} alt="avatar" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-xs font-bold text-primary-foreground">{user?.initials ?? "AD"}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{user?.name ?? "admin"}</p>
                        <p className="text-xs text-muted-foreground">{t("profile.role")}</p>
                      </div>
                    </div>
                    <DropdownMenuItem onClick={() => navigate("/settings")} className="gap-2 cursor-pointer rounded-lg my-1">
                      <Settings className="h-4 w-4" />
                      {t("profile.settings")}
                    </DropdownMenuItem>
                    <div className="border-t border-border my-1" />
                    <DropdownMenuItem onClick={() => { logout(); navigate("/login"); }} className="gap-2 cursor-pointer text-destructive focus:text-destructive rounded-lg">
                      <LogOut className="h-4 w-4" />
                      {t("profile.logout")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </header>
          <main
            className={`flex-1 min-h-0 ${
              isStudentMobile
                ? "overflow-y-auto overscroll-y-contain p-4 pb-[calc(var(--student-mobile-nav-h,84px)+0.5rem)]"
                : "overflow-auto safe-area-bottom p-4 sm:p-6 lg:p-8"
            }`}
          >
            {children}
          </main>
          <CommandSearch />
          {isStudentMobile && <StudentMobileNav />}
        </div>
      </div>
    </SidebarProvider>
  );
}
