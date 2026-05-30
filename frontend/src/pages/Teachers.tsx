import { useState, useMemo } from "react";
import {
  Search, Plus, MoreHorizontal, Phone,
  ChevronLeft, ChevronRight, Eye, Pencil, Trash2,
  Users, ArrowUpDown,
  X, Loader2, CalendarDays,
  Calendar, Coins, TrendingUp,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ru as ruLocale, enUS, uz as uzLocale } from "date-fns/locale";
import type { Locale } from "date-fns";
import { Input }   from "@/components/ui/input";
import { PasswordInput } from "@/components/PasswordInput";
import { Button }  from "@/components/ui/button";
import { Label }   from "@/components/ui/label";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { StatusBadge }  from "@/components/StatusBadge";
import { useLanguage }  from "@/hooks/use-language";
import { useAuth }      from "@/hooks/use-auth";
import { useNavigate }  from "react-router-dom";
import { toast }        from "sonner";
import { cn }           from "@/lib/utils";
import { formatCurrencyUZS, formatNumber } from "@/lib/utils";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  useCreateTeacher, useUpdateTeacher, useDeleteTeacher,
  type TeacherCreate, type TeacherUpdate,
} from "@/hooks/use-teachers";
import {
  useCreateManager, useUpdateManager, useDeleteManager,
  type ManagerCreate, type ManagerUpdate,
} from "@/hooks/use-managers";
import {
  useEmployees, empFullName, POSITION_OPTIONS, isTeacherPosition,
  type Employee,
} from "@/hooks/use-employees";
import {
  monthEndIso, monthStartIso, useAllSalaries, type SalaryBreakdown,
} from "@/hooks/use-salary";

const PAGE_SIZE = 8;

const SORT_OPTIONS = [
  { key: "newest", labelKey: "students.sortNewest" },
  { key: "oldest", labelKey: "students.sortOldest" },
  { key: "az",     labelKey: "sort.az" },
  { key: "za",     labelKey: "sort.za" },
] as const;

// ── Form state ─────────────────────────────────────────────────────────────

interface FormState {
  position: string;
  first_name: string;
  last_name: string;
  middle_name: string;
  phone: string;
  birth_date: string;
  hire_date: string;
  gender: "male" | "female" | "";
  username: string;
  password: string;
  // Salary — only shown when position === "teacher"
  salary_monthly: number | null;
  salary_percent: string;
  salary_per_lesson: number | null;
  salary_per_student: number | null;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const emptyForm = (): FormState => ({
  position: "teacher",
  first_name: "", last_name: "", middle_name: "", phone: "",
  birth_date: "", hire_date: todayIso(), gender: "",
  username: "", password: "",
  salary_monthly: 0, salary_percent: "0", salary_per_lesson: 0, salary_per_student: 0,
});

function formFromEmployee(e: Employee): FormState {
  return {
    position:     e.position,
    first_name:   e.first_name,
    last_name:    e.last_name,
    middle_name:  e.middle_name ?? "",
    phone:        e.phone ?? "",
    birth_date:   e.birth_date ?? "",
    hire_date:    e.hire_date ?? "",
    gender:       (e.gender ?? "") as "male" | "female" | "",
    username:     e.username ?? "",
    password:     "",
    salary_monthly:    e.salary_monthly ?? 0,
    salary_percent:    String(e.salary_percent ?? 0),
    salary_per_lesson: e.salary_per_lesson ?? 0,
    salary_per_student:e.salary_per_student ?? 0,
  };
}

// ── Salary tab helpers ──────────────────────────────────────────────────────

function currentMonthInputValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthInputToBounds(v: string): { from: string; to: string } {
  const [y, m] = v.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return { from: monthStartIso(d), to: monthEndIso(d) };
}

// ── Main component ──────────────────────────────────────────────────────────

export default function Teachers() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const isManager = user?.role === "manager";
  const navigate  = useNavigate();

  // ── tab state ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"employees" | "salary">("employees");

  // ── filters ────────────────────────────────────────────────────────────
  const [search, setSearch]             = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortMode, setSortMode]         = useState("newest");
  const debouncedSearch = useDebouncedValue(search, 300);

  // ── pagination ─────────────────────────────────────────────────────────
  const [page, setPage] = useState(1);

  // ── dialogs ────────────────────────────────────────────────────────────
  const [modalOpen,    setModalOpen]    = useState(false);
  const [editTarget,   setEditTarget]   = useState<Employee | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);

  // ── form ───────────────────────────────────────────────────────────────
  const [form, setForm] = useState<FormState>(emptyForm());

  // ── API ────────────────────────────────────────────────────────────────
  const empParams: { search?: string; is_active?: boolean; sort: string } = { sort: sortMode };
  if (debouncedSearch)           empParams.search    = debouncedSearch;
  if (statusFilter === "active")   empParams.is_active = true;
  if (statusFilter === "inactive") empParams.is_active = false;

  const { employees, isLoading, total: totalCount } = useEmployees(empParams);

  const totalPages = Math.max(1, Math.ceil(employees.length / PAGE_SIZE));
  const paginated  = employees.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const activeCount = employees.filter((e) => e.is_active).length;

  // Mutations for teachers
  const createTeacherM = useCreateTeacher();
  const updateTeacherM = useUpdateTeacher();
  const deleteTeacherM = useDeleteTeacher();
  // Mutations for managers (office staff)
  const createManagerM = useCreateManager();
  const updateManagerM = useUpdateManager();
  const deleteManagerM = useDeleteManager();

  const isSaving = createTeacherM.isPending || updateTeacherM.isPending
    || createManagerM.isPending || updateManagerM.isPending;

  // ── date-fns locale ────────────────────────────────────────────────────
  const LOCALE_MAP: Record<string, Locale> = { ru: ruLocale, en: enUS, uz: uzLocale };
  const dfLocale = LOCALE_MAP[language] ?? enUS;

  // ── salary tab ─────────────────────────────────────────────────────────
  const [salaryMonth, setSalaryMonth] = useState<string>(currentMonthInputValue());
  const [salarySearch, setSalarySearch] = useState("");
  const debouncedSalarySearch = useDebouncedValue(salarySearch, 250);
  const { from: salFrom, to: salTo } = useMemo(() => monthInputToBounds(salaryMonth), [salaryMonth]);
  const salaryQ = useAllSalaries({ from: salFrom, to: salTo });
  const salaryFiltered: SalaryBreakdown[] = useMemo(() => {
    const items = salaryQ.data?.items ?? [];
    if (!debouncedSalarySearch.trim()) return items;
    const q = debouncedSalarySearch.trim().toLowerCase();
    return items.filter((s) => s.teacher_name.toLowerCase().includes(q));
  }, [salaryQ.data?.items, debouncedSalarySearch]);
  const salaryGrandTotal = salaryQ.data?.total_payroll ?? 0;
  const salaryTeacherCount = salaryQ.data?.items.length ?? 0;
  const salaryTotalLessons = useMemo(
    () => (salaryQ.data?.items ?? []).reduce((s, x) => s + x.lessons_count, 0),
    [salaryQ.data?.items],
  );

  // ── position label helper ──────────────────────────────────────────────
  function positionLabel(pos: string): string {
    const key = `position.${pos}` as any;
    try { const v = t(key); return v || pos; } catch { return pos; }
  }

  // ── handlers ───────────────────────────────────────────────────────────
  function openAdd() {
    setEditTarget(null);
    setForm(emptyForm());
    setModalOpen(true);
  }

  function openEdit(emp: Employee) {
    setEditTarget(emp);
    setForm(formFromEmployee(emp));
    setModalOpen(true);
  }

  function setF<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  const parsePercent = (value: string) => {
    const n = Number.parseFloat(value.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(100, Math.round(n * 100) / 100);
  };

  async function handleSave() {
    if (!form.first_name.trim() || !form.last_name.trim()) return;
    const newUsername = form.username.trim().toLowerCase();
    const newPassword = form.password.trim();
    const usernameProvided = newUsername.length > 0;
    const passwordProvided = newPassword.length > 0;

    if (!editTarget && isTeacherPosition(form.position) && usernameProvided !== passwordProvided) {
      toast.error(t("employees.toastCredBothOrEmpty"));
      return;
    }

    try {
      if (editTarget) {
        // Update — dispatch by kind
        if (editTarget.kind === "teacher") {
          const patch: TeacherUpdate = {
            first_name:  form.first_name.trim(),
            last_name:   form.last_name.trim(),
            middle_name: form.middle_name.trim() || null,
            phone:       form.phone.trim() || null,
            birth_date:  form.birth_date || null,
            hire_date:   form.hire_date || null,
            gender:      (form.gender || null) as "male" | "female" | null,
            salary_monthly:    Math.max(0, form.salary_monthly ?? 0),
            salary_percent:    parsePercent(form.salary_percent),
            salary_per_lesson: Math.max(0, form.salary_per_lesson ?? 0),
            salary_per_student:Math.max(0, form.salary_per_student ?? 0),
          };
          if (newUsername !== (editTarget.username ?? "")) patch.username = newUsername || null;
          if (newPassword) patch.password = newPassword;
          await updateTeacherM.mutateAsync({ id: editTarget.id, data: patch });
        } else {
          const patch: ManagerUpdate = {
            first_name:  form.first_name.trim(),
            last_name:   form.last_name.trim(),
            middle_name: form.middle_name.trim() || null,
            phone:       form.phone.trim() || null,
            birth_date:  form.birth_date || null,
            hire_date:   form.hire_date || null,
            gender:      form.gender || null,
          };
          if (newUsername && newUsername !== editTarget.username) patch.username = newUsername;
          if (newPassword) patch.password = newPassword;
          await updateManagerM.mutateAsync({ id: editTarget.id, data: patch });
        }
        toast.success(t("employees.toastUpdated"));
      } else {
        // Create — dispatch by position
        if (isTeacherPosition(form.position)) {
          const payload: TeacherCreate = {
            first_name:  form.first_name.trim(),
            last_name:   form.last_name.trim(),
            middle_name: form.middle_name.trim() || null,
            phone:       form.phone.trim() || null,
            birth_date:  form.birth_date || null,
            hire_date:   form.hire_date || null,
            gender:      (form.gender || null) as "male" | "female" | null,
            salary_monthly:    Math.max(0, form.salary_monthly ?? 0),
            salary_percent:    parsePercent(form.salary_percent),
            salary_per_lesson: Math.max(0, form.salary_per_lesson ?? 0),
            salary_per_student:Math.max(0, form.salary_per_student ?? 0),
          };
          if (usernameProvided) { payload.username = newUsername; payload.password = newPassword; }
          await createTeacherM.mutateAsync(payload);
        } else {
          if (!usernameProvided || !passwordProvided) {
            toast.error(t("employees.toastCredBothOrEmpty"));
            return;
          }
          const payload: ManagerCreate = {
            first_name:  form.first_name.trim(),
            last_name:   form.last_name.trim(),
            middle_name: form.middle_name.trim() || null,
            phone:       form.phone.trim() || null,
            username:    newUsername,
            password:    newPassword,
            position:    form.position,
            birth_date:  form.birth_date || null,
            hire_date:   form.hire_date || null,
            gender:      form.gender || null,
          };
          await createManagerM.mutateAsync(payload);
        }
        toast.success(t("employees.toastCreated"));
      }
      setModalOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.kind === "teacher") {
        await deleteTeacherM.mutateAsync(deleteTarget.id);
      } else {
        await deleteManagerM.mutateAsync(deleteTarget.id);
      }
      toast.success(t("employees.toastDeleted").replace("{{name}}", empFullName(deleteTarget)));
      setDeleteTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  }

  function clearFilters() {
    setSearch(""); setStatusFilter("all"); setSortMode("newest"); setPage(1);
  }

  const hasFilters = search || statusFilter !== "all";
  const isDeleting = deleteTeacherM.isPending || deleteManagerM.isPending;

  // ── render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 sm:space-y-6">
      <Breadcrumbs items={[{ label: t("employees.title") }]} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">{t("employees.title")}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t("employees.subtitle")}</p>
        </div>
        {!isManager && (
          <Button size="sm" className="gap-2 self-start sm:self-auto" onClick={openAdd}>
            <Plus className="h-4 w-4" /> {t("employees.addEmployee")}
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "employees" | "salary")}>
        <TabsList className="h-9">
          <TabsTrigger value="employees" className="text-sm">{t("employees.tab")}</TabsTrigger>
          {!isManager && (
            <TabsTrigger value="salary" className="text-sm">{t("employees.tabSalary")}</TabsTrigger>
          )}
        </TabsList>

        {/* ─── Employees tab ─────────────────────────────────────────── */}
        <TabsContent value="employees" className="mt-4 space-y-4">
          {/* KPI */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {[
              { label: t("employees.totalEmployees"), value: totalCount,  sub: `${activeCount} ${t("teachers.activeTeachers").toLowerCase()}`, icon: Users, color: "text-primary" },
              { label: t("teachers.studentsManaged"), value: "",           sub: null, icon: Users, color: "text-violet-500" },
            ].slice(0, 1).map((kpi, i) => (
              <div key={kpi.label} className="rounded-xl border border-border/60 bg-card p-3 sm:p-4 shadow-sm" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                  <span className="text-[10px] sm:text-xs text-muted-foreground">{kpi.label}</span>
                </div>
                <p className="text-xl sm:text-2xl font-bold text-foreground">{totalCount}</p>
                {kpi.sub && <p className="text-[10px] text-muted-foreground mt-0.5">{kpi.sub}</p>}
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="stat-card space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("employees.searchPlaceholder")}
                  className="pl-9 h-9 text-sm"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-40 h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.allStatuses")}</SelectItem>
                  <SelectItem value="active">{t("teachers.statusActivePlural")}</SelectItem>
                  <SelectItem value="inactive">{t("teachers.statusInactivePlural")}</SelectItem>
                </SelectContent>
              </Select>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 h-9 text-sm w-full sm:w-auto">
                    <ArrowUpDown className="h-3.5 w-3.5" /> {t("common.sort")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {SORT_OPTIONS.map(({ key, labelKey }) => (
                    <DropdownMenuItem key={key} onClick={() => { setSortMode(key); setPage(1); }} className={sortMode === key ? "bg-accent" : ""}>
                      {t(labelKey)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {hasFilters && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10" onClick={clearFilters}>
                  {t("common.resetAll")}
                </Button>
                <span className="ml-auto text-xs text-muted-foreground">
                  {t("common.found")}: <span className="font-semibold text-foreground">{employees.length}</span>
                </span>
              </div>
            )}
          </div>

          {/* Table */}
          <div className="stat-card p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="font-semibold pl-4">{t("employees.tab")}</TableHead>
                  <TableHead className="font-semibold hidden md:table-cell">{t("students.contact")}</TableHead>
                  <TableHead className="font-semibold hidden xl:table-cell whitespace-nowrap">
                    <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 shrink-0" />{t("teachers.birthDate")}</span>
                  </TableHead>
                  <TableHead className="font-semibold hidden lg:table-cell whitespace-nowrap">
                    <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 shrink-0" />{t("teachers.hireDate")}</span>
                  </TableHead>
                  <TableHead className="font-semibold hidden sm:table-cell">{t("employees.colPosition")}</TableHead>
                  <TableHead className="font-semibold hidden md:table-cell text-center">{t("teachers.colStatus")}</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Search className="h-8 w-8 text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground">{t("employees.noEmployees")}</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : paginated.map((emp, i) => {
                  const birthDate = emp.birth_date ? format(parseISO(emp.birth_date), "d LLL yyyy", { locale: dfLocale }) : null;
                  const hireDate  = emp.hire_date  ? format(parseISO(emp.hire_date),  "d MMM yyyy", { locale: dfLocale }) : null;

                  return (
                    <TableRow
                      key={`${emp.kind}-${emp.id}`}
                      className="animate-fade-in cursor-pointer transition-colors hover:bg-muted/30"
                      style={{ animationDelay: `${i * 30}ms` }}
                      onClick={() => emp.kind === "teacher" ? navigate(`/teachers/${emp.id}`) : openEdit(emp)}
                    >
                      {/* Name cell */}
                      <TableCell className="pl-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold overflow-hidden">
                            {emp.avatar_base64 ? (
                              <img src={emp.avatar_base64} alt={empFullName(emp)} className="h-full w-full object-cover" />
                            ) : (
                              <>{emp.first_name[0]}{emp.last_name[0]}</>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{empFullName(emp)}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {emp.phone && <span className="md:hidden text-[10px] text-muted-foreground font-mono truncate" onClick={(e) => e.stopPropagation()}>{emp.phone}</span>}
                              <span className="md:hidden"><StatusBadge status={emp.is_active ? "active" : "inactive"} /></span>
                            </div>
                          </div>
                        </div>
                      </TableCell>

                      {/* Phone */}
                      <TableCell className="hidden md:table-cell" onClick={(e) => e.stopPropagation()}>
                        {emp.phone ? (
                          <a href={`tel:${emp.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 text-xs font-mono text-primary hover:underline whitespace-nowrap">
                            <Phone className="h-3 w-3 shrink-0" />{emp.phone}
                          </a>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>

                      {/* Birth date */}
                      <TableCell className="hidden xl:table-cell">
                        {birthDate ? <span className="text-xs text-muted-foreground capitalize">{birthDate}</span> : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>

                      {/* Hire date */}
                      <TableCell className="hidden lg:table-cell">
                        {hireDate ? <span className="text-xs text-muted-foreground capitalize">{hireDate}</span> : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>

                      {/* Position */}
                      <TableCell className="hidden sm:table-cell">
                        <span className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                          emp.position === "teacher"
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                        )}>
                          {positionLabel(emp.position)}
                        </span>
                      </TableCell>

                      {/* Status */}
                      <TableCell className="hidden md:table-cell text-center">
                        <StatusBadge status={emp.is_active ? "active" : "inactive"} />
                      </TableCell>

                      {/* Actions */}
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {emp.kind === "teacher" && (
                              <DropdownMenuItem onClick={() => navigate(`/teachers/${emp.id}`)}>
                                <Eye className="h-3.5 w-3.5 mr-2" /> {t("teachers.viewProfile")}
                              </DropdownMenuItem>
                            )}
                            {!isManager && (
                              <>
                                <DropdownMenuItem onClick={() => openEdit(emp)}>
                                  <Pencil className="h-3.5 w-3.5 mr-2" /> {t("employees.editEmployee")}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setDeleteTarget(emp)}
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-2" /> {t("teachers.deleteTeacher")}
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Pagination */}
            {employees.length > PAGE_SIZE && (
              <div className="flex flex-col sm:flex-row items-center justify-between border-t border-border/60 px-3 sm:px-4 py-3 gap-3">
                <p className="text-xs text-muted-foreground">
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, employees.length)} {t("common.of")} {employees.length}
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                    <ChevronLeft className="h-3 w-3" />
                  </Button>
                  {Array.from({ length: totalPages }, (_, i) => (
                    <Button key={i + 1} variant={page === i + 1 ? "default" : "outline"} size="sm" className="h-7 w-7 text-xs p-0" onClick={() => setPage(i + 1)}>
                      {i + 1}
                    </Button>
                  ))}
                  <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ─── Salary tab ────────────────────────────────────────────── */}
        {!isManager && (
          <TabsContent value="salary" className="mt-4 space-y-4">
            {/* Salary header controls */}
            <div className="flex items-center gap-2 self-start">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <input
                type="month"
                value={salaryMonth}
                onChange={(e) => setSalaryMonth(e.target.value || currentMonthInputValue())}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t("salary.month")}
              />
            </div>

            {/* Salary KPI */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {[
                { icon: Coins,      label: t("salary.payroll"),        value: formatCurrencyUZS(salaryGrandTotal),    accent: "text-primary",     bg: "bg-primary/10" },
                { icon: Users,      label: t("teachers.activeTeachers"), value: formatNumber(salaryTeacherCount), accent: "text-emerald-600", bg: "bg-emerald-500/10" },
                { icon: TrendingUp, label: t("salary.lessonsCount"),   value: formatNumber(salaryTotalLessons),       accent: "text-violet-600",  bg: "bg-violet-500/10" },
              ].map(({ icon: Icon, label, value, accent, bg }) => (
                <div key={label} className="rounded-xl border border-border/60 bg-card p-3 sm:p-4 shadow-sm">
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className={cn("flex h-5 w-5 items-center justify-center rounded", bg)}>
                      <Icon className={cn("h-3.5 w-3.5", accent)} />
                    </div>
                    <span className="text-[10px] sm:text-xs text-muted-foreground truncate">{label}</span>
                  </div>
                  <p className="text-base sm:text-xl font-bold text-foreground tabular-nums truncate">{value}</p>
                </div>
              ))}
            </div>

            {/* Salary search */}
            <div className="stat-card">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("teachers.searchPlaceholder")}
                  className="pl-9 h-9 text-sm"
                  value={salarySearch}
                  onChange={(e) => setSalarySearch(e.target.value)}
                />
              </div>
            </div>

            {/* Salary table */}
            <div className="stat-card p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="font-semibold pl-4">{t("teachers.teacher")}</TableHead>
                    <TableHead className="font-semibold text-right hidden sm:table-cell">{t("salary.componentMonthly")}</TableHead>
                    <TableHead className="font-semibold text-right hidden md:table-cell">{t("salary.componentPercent")}</TableHead>
                    <TableHead className="font-semibold text-right hidden md:table-cell">{t("salary.componentLessons")}</TableHead>
                    <TableHead className="font-semibold text-right hidden lg:table-cell">{t("salary.componentStudents")}</TableHead>
                    <TableHead className="font-semibold text-right pr-4">{t("salary.total")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salaryQ.isLoading && (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  )}
                  {!salaryQ.isLoading && salaryFiltered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center">
                        <p className="text-sm text-muted-foreground">{t("salary.empty")}</p>
                      </TableCell>
                    </TableRow>
                  )}
                  {!salaryQ.isLoading && salaryFiltered.map((s, i) => (
                    <TableRow
                      key={s.teacher_id}
                      className="animate-fade-in cursor-pointer hover:bg-muted/30"
                      style={{ animationDelay: `${i * 30}ms` }}
                      onClick={() => navigate(`/teachers/${s.teacher_id}`)}
                    >
                      <TableCell className="pl-4">
                        <p className="text-sm font-medium text-foreground">{s.teacher_name}</p>
                      </TableCell>
                      <SalaryCell amount={s.monthly_amount}  disabled={s.rate_monthly === 0}    className="hidden sm:table-cell" />
                      <SalaryCell amount={s.percent_amount}  disabled={s.rate_percent === 0}    className="hidden md:table-cell" />
                      <SalaryCell amount={s.lessons_amount}  disabled={s.rate_per_lesson === 0} className="hidden md:table-cell" />
                      <SalaryCell amount={s.students_amount} disabled={s.rate_per_student === 0} className="hidden lg:table-cell" />
                      <TableCell className="pr-4 text-right tabular-nums font-bold text-primary">
                        {formatCurrencyUZS(s.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        )}
      </Tabs>

      {/* ─── Add / Edit dialog ─────────────────────────────────────────────── */}
      <Dialog open={modalOpen} onOpenChange={(open) => !open && setModalOpen(false)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTarget ? t("employees.editEmployee") : t("employees.addEmployee")}</DialogTitle>
            <DialogDescription className="sr-only">{t("teachers.formDescription")}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 py-2">
            {/* Position select — disabled when editing */}
            <div className="col-span-2 grid gap-1.5">
              <Label>{t("employees.positionLabel")} *</Label>
              {editTarget ? (
                <div className="h-9 rounded-md border border-input bg-muted/50 px-3 flex items-center text-sm text-muted-foreground">
                  {positionLabel(form.position)}
                  <span className="ml-2 text-xs opacity-60">({t("employees.positionLocked")})</span>
                </div>
              ) : (
                <Select value={form.position} onValueChange={(v) => setF("position", v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={t("employees.positionPlaceholder")} /></SelectTrigger>
                  <SelectContent>
                    {POSITION_OPTIONS.map((pos) => (
                      <SelectItem key={pos} value={pos}>{positionLabel(pos)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* First / Last name */}
            <div className="grid gap-1.5">
              <Label htmlFor="ef-first">{t("teachers.firstName")} *</Label>
              <Input id="ef-first" placeholder={t("teachers.placeholderFirstName")} value={form.first_name} onChange={(e) => setF("first_name", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ef-last">{t("teachers.lastName")} *</Label>
              <Input id="ef-last" placeholder={t("teachers.placeholderLastName")} value={form.last_name} onChange={(e) => setF("last_name", e.target.value)} />
            </div>

            {/* Middle name */}
            <div className="grid gap-1.5 col-span-2">
              <Label htmlFor="ef-mid">{t("teachers.middleName")}</Label>
              <Input id="ef-mid" placeholder={t("teachers.placeholderMiddleName")} value={form.middle_name} onChange={(e) => setF("middle_name", e.target.value)} />
            </div>

            {/* Phone */}
            <div className="grid gap-1.5 col-span-2">
              <Label htmlFor="ef-phone">{t("students.phone")}</Label>
              <Input id="ef-phone" placeholder="+998 90 123 4567" value={form.phone} onChange={(e) => setF("phone", e.target.value)} />
            </div>

            {/* Birth / Hire date */}
            <div className="grid gap-1.5">
              <Label htmlFor="ef-birth">{t("teachers.birthDate")}</Label>
              <Input id="ef-birth" type="date" value={form.birth_date} onChange={(e) => setF("birth_date", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ef-hire">{t("teachers.hireDate")}</Label>
              <Input id="ef-hire" type="date" value={form.hire_date} onChange={(e) => setF("hire_date", e.target.value)} />
            </div>

            {/* Gender */}
            <div className="col-span-2 grid gap-1.5">
              <Label>{t("teachers.genderLabel")}</Label>
              <div className="flex gap-2">
                {(["male", "female"] as const).map((g) => (
                  <button
                    key={g} type="button"
                    onClick={() => setF("gender", form.gender === g ? "" : g)}
                    className={cn(
                      "flex-1 rounded-lg border py-2 text-sm font-medium transition-all",
                      form.gender === g ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-foreground hover:border-primary/40"
                    )}
                  >
                    {g === "male" ? t("teachers.genderMale") : t("teachers.genderFemale")}
                  </button>
                ))}
              </div>
            </div>

            {/* Salary block — only for teacher position */}
            {isTeacherPosition(form.position) && (
              <div className="col-span-2 mt-1 rounded-lg border border-border/60 p-3 space-y-3 bg-background">
                <div>
                  <p className="text-sm font-semibold">{t("teachers.salarySectionTitle")}</p>
                  <p className="text-xs text-muted-foreground">{t("teachers.salaryFormula")}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="ef-sal-monthly">{t("teachers.salaryFixed")}</Label>
                    <FormattedNumberInput id="ef-sal-monthly" value={form.salary_monthly} onValueChange={(v) => setF("salary_monthly", v)} placeholder="0" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="ef-sal-percent">{t("teachers.salaryPercent")}</Label>
                    <Input id="ef-sal-percent" type="number" inputMode="decimal" min={0} max={100} step={0.01} value={form.salary_percent} onChange={(e) => setF("salary_percent", e.target.value)} placeholder="0" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="ef-sal-lesson">{t("teachers.salaryPerLesson")}</Label>
                    <FormattedNumberInput id="ef-sal-lesson" value={form.salary_per_lesson} onValueChange={(v) => setF("salary_per_lesson", v)} placeholder="0" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="ef-sal-student">{t("teachers.salaryPerStudent")}</Label>
                    <FormattedNumberInput id="ef-sal-student" value={form.salary_per_student} onValueChange={(v) => setF("salary_per_student", v)} placeholder="0" />
                  </div>
                </div>
              </div>
            )}

            {/* Account credentials */}
            <div className="col-span-2 mt-1 rounded-lg border border-border/60 p-3 space-y-3 bg-background">
              <div>
                <p className="text-sm font-semibold">{t("teachers.credentialsSection")}</p>
                <p className="text-xs text-muted-foreground">
                  {editTarget ? t("teachers.credentialsHelpEdit") : t("teachers.credentialsHelpCreate")}
                </p>
                {!isTeacherPosition(form.position) && !editTarget && (
                  <p className="text-xs text-amber-600 mt-1">{t("employees.toastCredBothOrEmpty")}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="ef-username">{t("teachers.login")} {!isTeacherPosition(form.position) && !editTarget ? "*" : ""}</Label>
                  <Input id="ef-username" placeholder={t("teachers.usernamePlaceholder")} autoComplete="off" value={form.username} onChange={(e) => setF("username", e.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="ef-password">{editTarget ? t("teachers.newPasswordLabel") : t("teachers.password")} {!isTeacherPosition(form.position) && !editTarget ? "*" : ""}</Label>
                  <PasswordInput id="ef-password" placeholder={editTarget ? "••••••" : t("teachers.passwordPlaceholderMin")} autoComplete="new-password" value={form.password} onChange={(e) => setF("password", e.target.value)} />
                </div>
              </div>
              {editTarget?.has_account && (
                <p className="text-[11px] text-emerald-600">{t("teachers.accountExistsNote")}</p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={isSaving}>{t("common.cancel")}</Button>
            <Button onClick={handleSave} disabled={isSaving || !form.first_name.trim() || !form.last_name.trim()}>
              {isSaving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t("common.saving")}</> : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete confirmation ───────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("employees.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("employees.deleteDescription").replace("{{name}}", deleteTarget ? empFullName(deleteTarget) : "")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t("common.deleting")}</> : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Salary cell helper ──────────────────────────────────────────────────────

function SalaryCell({ amount, disabled, className }: { amount: number; disabled?: boolean; className?: string }) {
  return (
    <TableCell className={cn("text-right tabular-nums text-sm", disabled && "text-muted-foreground/60", className)}>
      {disabled ? "—" : formatCurrencyUZS(amount)}
    </TableCell>
  );
}
