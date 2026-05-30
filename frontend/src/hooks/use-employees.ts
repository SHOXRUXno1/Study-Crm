import { useMemo } from "react";
import { useTeachers, type TeacherRead } from "./use-teachers";
import { useManagers, type ManagerRead } from "./use-managers";

// ── Types ───────────────────────────────────────────────────────────────────

export type EmployeeKind = "teacher" | "office";

export const POSITION_OPTIONS = [
  "teacher",
  "manager",
  "director",
  "admin_staff",
  "other",
] as const;

export type EmployeePosition = (typeof POSITION_OPTIONS)[number];

/** Determines which backend table an employee lives in */
export function isTeacherPosition(position: string): boolean {
  return position === "teacher";
}

export interface Employee {
  id: number;
  kind: EmployeeKind;
  position: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  phone: string | null;
  birth_date: string | null;
  hire_date: string | null;
  gender: "male" | "female" | null;
  is_active: boolean;
  username: string | null;
  has_account: boolean;
  avatar_base64: string | null;
  /** Only present for kind === "teacher" */
  salary_monthly?: number;
  salary_percent?: number;
  salary_per_lesson?: number;
  salary_per_student?: number;
  created_at: string;
  updated_at: string;
}

export function empFullName(e: Pick<Employee, "first_name" | "last_name" | "middle_name">): string {
  return [e.last_name, e.first_name, e.middle_name].filter(Boolean).join(" ");
}

// ── Converters ──────────────────────────────────────────────────────────────

function teacherToEmployee(t: TeacherRead): Employee {
  return {
    id: t.id,
    kind: "teacher",
    position: (t as any).position ?? "teacher",
    first_name: t.first_name,
    last_name: t.last_name,
    middle_name: t.middle_name,
    phone: t.phone,
    birth_date: t.birth_date,
    hire_date: t.hire_date,
    gender: t.gender as "male" | "female" | null,
    is_active: t.is_active,
    username: t.username,
    has_account: t.has_account,
    avatar_base64: t.avatar_base64,
    salary_monthly: t.salary_monthly,
    salary_percent: t.salary_percent,
    salary_per_lesson: t.salary_per_lesson,
    salary_per_student: t.salary_per_student,
    created_at: t.created_at,
    updated_at: t.updated_at,
  };
}

function managerToEmployee(m: ManagerRead): Employee {
  return {
    id: m.id,
    kind: "office",
    position: m.position ?? "manager",
    first_name: m.first_name,
    last_name: m.last_name,
    middle_name: m.middle_name,
    phone: m.phone,
    birth_date: m.birth_date,
    hire_date: m.hire_date,
    gender: m.gender as "male" | "female" | null,
    is_active: m.is_active,
    username: m.username,
    has_account: m.has_account,
    avatar_base64: m.avatar_base64,
    created_at: m.created_at,
    updated_at: m.updated_at,
  };
}

// ── Sorting ─────────────────────────────────────────────────────────────────

function sortEmployees(employees: Employee[], sort: string): Employee[] {
  return [...employees].sort((a, b) => {
    switch (sort) {
      case "az":
        return a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name);
      case "za":
        return b.last_name.localeCompare(a.last_name) || b.first_name.localeCompare(a.first_name);
      case "oldest":
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      default: // newest
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
  });
}

// ── Hook ────────────────────────────────────────────────────────────────────

export interface EmployeesParams {
  search?: string;
  is_active?: boolean;
  sort?: string;
}

export function useEmployees(params: EmployeesParams = {}) {
  const { search, is_active, sort = "newest" } = params;

  const teachersQ = useTeachers({ limit: 1000, search, is_active, sort });
  const managersQ = useManagers({ limit: 1000, search, is_active, sort });

  const employees = useMemo<Employee[]>(() => {
    const teachers = (teachersQ.data?.items ?? []).map(teacherToEmployee);
    const managers = (managersQ.data?.items ?? []).map(managerToEmployee);
    return sortEmployees([...teachers, ...managers], sort);
  }, [teachersQ.data, managersQ.data, sort]);

  return {
    employees,
    isLoading: teachersQ.isLoading || managersQ.isLoading,
    total: employees.length,
  };
}
