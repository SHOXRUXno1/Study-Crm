import type { ComponentType } from "react";
import { CalendarDays, ClipboardList, LayoutDashboard, Settings, Wallet } from "lucide-react";

export type StudentNavItem = {
  titleKey: string;
  path: string;
  icon: ComponentType<{ className?: string }>;
};

export const studentPrimaryTabs: StudentNavItem[] = [
  { titleKey: "sidebar.dashboard", path: "/", icon: LayoutDashboard },
  { titleKey: "student.mySchedule", path: "/me/schedule", icon: CalendarDays },
  { titleKey: "student.myAttendance", path: "/me/attendance", icon: ClipboardList },
  { titleKey: "student.myPayments", path: "/me/payments", icon: Wallet },
];

export const studentSidebarAcademicItems: StudentNavItem[] = [
  { titleKey: "student.mySchedule", path: "/me/schedule", icon: CalendarDays },
  { titleKey: "student.myAttendance", path: "/me/attendance", icon: ClipboardList },
];

export const studentSidebarFinanceItems: StudentNavItem[] = [
  { titleKey: "student.myPayments", path: "/me/payments", icon: Wallet },
];

export const studentSidebarSystemItems: StudentNavItem[] = [
  { titleKey: "sidebar.settings", path: "/settings", icon: Settings },
];
