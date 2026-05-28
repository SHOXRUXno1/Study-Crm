import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  BarChart3,
  Settings,
  UserCheck,
  UsersRound,
  LogOut,
  DoorOpen,
  CreditCard,
  AlertTriangle,
  CalendarDays,
  ClipboardList,
  Wallet,
  PenSquare,
  Briefcase,
  Building2,
  type LucideIcon,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { useBranding } from "@/hooks/use-branding";
import type { UserRole } from "@/types/auth";
import {
  studentSidebarAcademicItems,
  studentSidebarFinanceItems,
  studentSidebarSystemItems,
} from "@/config/student-nav";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

type NavItem = {
  titleKey: string;
  url: string;
  icon: LucideIcon;
  roles?: UserRole[];   // visible to these roles; undefined = all
};

const mainNav: NavItem[] = [
  { titleKey: "sidebar.dashboard", url: "/", icon: LayoutDashboard },
];

const managementNav: NavItem[] = [
  { titleKey: "sidebar.students", url: "/students", icon: Users,        roles: ["admin", "teacher", "manager"] },
  { titleKey: "sidebar.teachers", url: "/teachers", icon: UserCheck,    roles: ["admin", "manager"] },
  { titleKey: "sidebar.groups",   url: "/groups",   icon: UsersRound,   roles: ["admin", "teacher", "manager"] },
  { titleKey: "sidebar.courses",  url: "/courses",  icon: BookOpen,     roles: ["admin", "manager"] },
  { titleKey: "sidebar.managers", url: "/managers", icon: Briefcase,    roles: ["admin"] },
];

const academicNav: NavItem[] = [
  { titleKey: "sidebar.attendance",    url: "/journal",       icon: ClipboardList, roles: ["admin", "teacher", "manager"] },
  { titleKey: "sidebar.schedule",      url: "/schedule",      icon: CalendarDays,  roles: ["admin", "teacher", "manager"] },
  { titleKey: "sidebar.whiteboard",    url: "/whiteboard",    icon: PenSquare,     roles: ["admin", "teacher"] },
  ...studentSidebarAcademicItems.map((item) => ({
    titleKey: item.titleKey,
    url: item.path,
    icon: item.icon,
    roles: ["student"] as UserRole[],
  })),
];

const financeNav: NavItem[] = [
  { titleKey: "sidebar.payments",    url: "/payments",    icon: CreditCard,    roles: ["admin"] },
  { titleKey: "sidebar.debtors",     url: "/debtors",     icon: AlertTriangle, roles: ["admin", "manager"] },
  { titleKey: "salary.menu",         url: "/finance/payroll", icon: Wallet,    roles: ["admin"] },
  ...studentSidebarFinanceItems.map((item) => ({
    titleKey: item.titleKey,
    url: item.path,
    icon: item.icon,
    roles: ["student"] as UserRole[],
  })),
];

const operationsNav: NavItem[] = [
  { titleKey: "sidebar.analytics", url: "/analytics", icon: BarChart3, roles: ["admin", "manager"] },
  { titleKey: "sidebar.rooms",     url: "/rooms",     icon: DoorOpen,  roles: ["admin", "manager"] },
];

const systemNav: NavItem[] = [
  { titleKey: "sidebar.profile",  url: "/profile",  icon: UserCheck, roles: ["teacher"] },
  { titleKey: "sidebar.settings", url: "/settings", icon: Settings, roles: ["admin", "teacher", "manager"] },
  ...studentSidebarSystemItems.map((item) => ({
    titleKey: item.titleKey,
    url: item.path,
    icon: item.icon,
    roles: ["student"] as UserRole[],
  })),
];

function filterByRole(items: NavItem[], role: UserRole | undefined): NavItem[] {
  if (!role) return items;
  return items.filter((it) => !it.roles || it.roles.includes(role));
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { logout, user } = useAuth();
  const { brandName, brandLogo } = useBranding();
  const role = user?.role;
  const isActive = (path: string) => location.pathname === path;

  const main        = filterByRole(mainNav,        role);
  const management  = filterByRole(managementNav,  role);
  const academic    = filterByRole(academicNav,    role);
  const finance     = filterByRole(financeNav,     role);
  const operations  = filterByRole(operationsNav,  role);
  const system      = filterByRole(systemNav,      role);

  const renderNavItems = (items: NavItem[]) =>
    items.map((item) => {
      const link = (
        <NavLink
          to={item.url}
          end
          className={`flex items-center ${collapsed ? "justify-center" : ""} gap-3 rounded-xl px-3 py-2.5 text-sidebar-foreground transition-all duration-200 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground`}
          activeClassName="bg-primary/10 text-primary font-semibold shadow-sm"
        >
          <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
          {!collapsed && <span className="text-[13px] truncate min-w-0 flex-1">{t(item.titleKey)}</span>}
        </NavLink>
      );

      return (
        <SidebarMenuItem key={item.titleKey}>
          <SidebarMenuButton asChild isActive={isActive(item.url)}>
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {t(item.titleKey)}
                </TooltipContent>
              </Tooltip>
            ) : (
              link
            )}
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    });

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar">
      <SidebarHeader className="p-5 pb-4">
        <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3"}`}>
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-2 ring-primary/10 overflow-hidden">
            {brandLogo
              ? <img src={brandLogo} alt={brandName} className="h-full w-full object-cover" />
              : <Building2 className="h-5 w-5 text-primary" />
            }
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-base font-extrabold text-foreground tracking-tight font-display">{brandName}</span>
              <span className="text-[11px] text-muted-foreground font-medium">
                {role === "teacher"
                  ? t("sidebar.teacher_panel")
                  : role === "student"
                    ? t("sidebar.student_panel")
                    : role === "manager"
                      ? t("sidebar.manager_panel")
                      : t("sidebar.admin")}
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3">
        {main.length > 0 && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>{renderNavItems(main)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {management.length > 0 && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60 px-3 mb-1.5">{t("sidebar.management")}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>{renderNavItems(management)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {academic.length > 0 && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60 px-3 mb-1.5">{t("sidebar.academic")}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>{renderNavItems(academic)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {finance.length > 0 && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60 px-3 mb-1.5">{t("sidebar.finance")}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>{renderNavItems(finance)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {operations.length > 0 && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60 px-3 mb-1.5">{t("sidebar.operations")}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>{renderNavItems(operations)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {system.length > 0 && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60 px-3 mb-1.5">{t("sidebar.system")}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>{renderNavItems(system)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border">
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => { logout(); navigate("/login"); }}
                className="flex h-9 w-9 mx-auto items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200"
              >
                <LogOut className="h-4 w-4" strokeWidth={1.8} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {user?.name ?? "admin"}
            </TooltipContent>
          </Tooltip>
        ) : (
          <div className="flex items-center gap-3 rounded-xl px-2 py-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl overflow-hidden bg-gradient-to-br from-primary to-primary/70 shadow-sm">
              {user?.avatar_base64 ? (
                <img src={user.avatar_base64} alt="avatar" className="h-full w-full object-cover" />
              ) : (
                <span className="text-xs font-bold text-primary-foreground">{user?.initials ?? "AD"}</span>
              )}
            </div>
            <div className="flex-1 min-w-0 overflow-hidden">
              <p className="text-[12.5px] font-semibold text-foreground leading-tight truncate" title={user?.name ?? "admin"}>{user?.name ?? "admin"}</p>
              <p className="text-[10.5px] text-muted-foreground font-medium mt-0.5 truncate">
                {user?.role === "teacher"
                  ? t("sidebar.teacher_role")
                  : user?.role === "student"
                    ? t("sidebar.student_role")
                    : user?.role === "manager"
                      ? t("sidebar.manager_role")
                      : t("sidebar.admin_role")}
              </p>
            </div>
            <button
              onClick={() => { logout(); navigate("/login"); }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.8} />
            </button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
