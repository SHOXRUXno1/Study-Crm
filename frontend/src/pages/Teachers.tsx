import { useState, useMemo } from "react";
import {
  Search, Plus, MoreHorizontal, Phone,
  ChevronLeft, ChevronRight, Eye, Pencil, Trash2,
  Users, GraduationCap, BookOpen, ArrowUpDown,
  X, Loader2, KeyRound, CalendarDays,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ru as ruLocale, enUS, uz as uzLocale } from "date-fns/locale";
import type { Locale } from "date-fns";
import { Input }   from "@/components/ui/input";
import { PasswordInput } from "@/components/PasswordInput";
import { Button }  from "@/components/ui/button";
import { Label }   from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { StatusBadge }  from "@/components/StatusBadge";
import { useLanguage }  from "@/hooks/use-language";
import { useAuth }      from "@/hooks/use-auth";
import { useNavigate }  from "react-router-dom";
import { toast }        from "sonner";
import { cn }           from "@/lib/utils";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { ExportActionButton } from "@/components/export/ExportActionButton";
import { ExportCenter } from "@/components/export/ExportCenter";
import {
  buildFilterRangeLabel,
  buildUnifiedExportFileName,
  runCsvExport,
  runExportTask,
  type ExportColumn,
  type ExportFilterSummaryItem,
  type ExportPhase,
} from "@/lib/export";

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
  useTeachers, useCreateTeacher, useUpdateTeacher, useDeleteTeacher,
  fullName, type TeacherRead, type TeacherCreate, type TeacherUpdate,
} from "@/hooks/use-teachers";
import { useGroups } from "@/hooks/use-groups";

const PAGE_SIZE = 8;

const SORT_OPTIONS = [
  { key: "newest", labelKey: "students.sortNewest" },
  { key: "oldest", labelKey: "students.sortOldest" },
  { key: "az",     labelKey: "sort.az" },
  { key: "za",     labelKey: "sort.za" },
] as const;

// ── Form state ─────────────────────────────────────────────────────────────

interface FormState {
  first_name: string;
  last_name: string;
  middle_name: string;
  phone: string;
  birth_date: string;
  hire_date: string;
  gender: "male" | "female" | "";
  is_active: boolean;
  username: string;
  password: string;
  salary_monthly: number | null;
  salary_percent: string;
  salary_per_lesson: number | null;
  salary_per_student: number | null;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const emptyForm = (): FormState => ({
  first_name: "", last_name: "", middle_name: "", phone: "",
  birth_date: "", hire_date: todayIso(), gender: "",
  is_active: true, username: "", password: "",
  salary_monthly: 0, salary_percent: "0", salary_per_lesson: 0, salary_per_student: 0,
});

function formFromTeacher(t: TeacherRead): FormState {
  return {
    first_name:  t.first_name,
    last_name:   t.last_name,
    middle_name: t.middle_name ?? "",
    phone:       t.phone ?? "",
    birth_date:  t.birth_date ?? "",
    hire_date:   t.hire_date ?? "",
    gender:      (t.gender as "male" | "female") ?? "",
    is_active:   t.is_active,
    username:    t.username ?? "",
    password:    "",
    salary_monthly: t.salary_monthly ?? 0,
    salary_percent: String(t.salary_percent ?? 0),
    salary_per_lesson: t.salary_per_lesson ?? 0,
    salary_per_student: t.salary_per_student ?? 0,
  };
}

// ── Component ──────────────────────────────────────────────────────────────

export default function Teachers() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const isManager = user?.role === "manager";
  const navigate  = useNavigate();

  // ── filters ────────────────────────────────────────────────────────────
  const [search, setSearch]           = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortMode, setSortMode]   = useState("newest");
  const debouncedSearch = useDebouncedValue(search, 300);

  // ── pagination ─────────────────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportPhase, setExportPhase] = useState<ExportPhase>("idle");

  // ── dialogs ────────────────────────────────────────────────────────────
  const [modalOpen,    setModalOpen]    = useState(false);
  const [editTarget,   setEditTarget]   = useState<TeacherRead | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TeacherRead | null>(null);

  // ── form ───────────────────────────────────────────────────────────────
  const [form, setForm] = useState<FormState>(emptyForm());

  // ── API ────────────────────────────────────────────────────────────────
  // allQ shares the cache key with listQ when no filters are active (sort must match)
  const allQ = useTeachers({ limit: 1000, sort: sortMode });

  const listP: Parameters<typeof useTeachers>[0] = { limit: 1000, sort: sortMode };
  if (debouncedSearch)           listP.search    = debouncedSearch;
  if (statusFilter === "active")   listP.is_active = true;
  if (statusFilter === "inactive") listP.is_active = false;
  const listQ = useTeachers(listP);

  const rows       = listQ.data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const paginated  = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totalCount = allQ.data?.total ?? 0;

  const createM = useCreateTeacher();
  const updateM = useUpdateTeacher();
  const deleteM = useDeleteTeacher();

  // ── derived KPIs ───────────────────────────────────────────────────────
  // Aggregate stats: count groups with assigned teacher + sum of their students
  const groupsQ = useGroups({ limit: 1000 });
  const groupsWithTeacher = (groupsQ.data?.items ?? []).filter((g) => g.teacher_id !== null);
  const totalGroups   = groupsWithTeacher.length;
  const totalStudents = groupsWithTeacher.reduce((s, g) => s + g.student_count, 0);
  const activeCount   = (allQ.data?.items ?? []).filter((t) => t.is_active).length;

  // Per-teacher stats map  teacher_id → { groups, students }
  const teacherStats = useMemo(() => {
    const m = new Map<number, { groups: number; students: number }>();
    for (const g of (groupsQ.data?.items ?? [])) {
      if (g.teacher_id == null) continue;
      const prev = m.get(g.teacher_id) ?? { groups: 0, students: 0 };
      m.set(g.teacher_id, { groups: prev.groups + 1, students: prev.students + g.student_count });
    }
    return m;
  }, [groupsQ.data?.items]);

  // date-fns locale for formatted dates
  const LOCALE_MAP: Record<string, Locale> = { ru: ruLocale, en: enUS, uz: uzLocale };
  const dfLocale = LOCALE_MAP[language] ?? enUS;

  // ── handlers ───────────────────────────────────────────────────────────
  function openAdd() {
    setEditTarget(null);
    setForm(emptyForm());
    setModalOpen(true);
  }

  function openEdit(teacher: TeacherRead) {
    setEditTarget(teacher);
    setForm(formFromTeacher(teacher));
    setModalOpen(true);
  }

  function setF<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSave() {
    if (!form.first_name.trim() || !form.last_name.trim()) return;

    const newUsername = form.username.trim().toLowerCase();
    const newPassword = form.password.trim();

    // Client-side credential consistency check
    const usernameProvided = newUsername.length > 0;
    const passwordProvided = newPassword.length > 0;

    if (!editTarget && usernameProvided !== passwordProvided) {
      toast.error(t("teachers.toastCredBothOrEmpty"));
      return;
    }

    const parsePercent = (value: string) => {
      const n = Number.parseFloat(value.replace(",", "."));
      if (!Number.isFinite(n) || n <= 0) return 0;
      return Math.min(100, Math.round(n * 100) / 100);
    };

    const basePayload = {
      first_name:  form.first_name.trim(),
      last_name:   form.last_name.trim(),
      middle_name: form.middle_name.trim() || null,
      phone:       form.phone.trim() || null,
      is_active:   form.is_active,
      birth_date:  form.birth_date || null,
      hire_date:   form.hire_date || null,
      gender:      (form.gender || null) as "male" | "female" | null,
      salary_monthly: Math.max(0, form.salary_monthly ?? 0),
      salary_percent: parsePercent(form.salary_percent),
      salary_per_lesson: Math.max(0, form.salary_per_lesson ?? 0),
      salary_per_student: Math.max(0, form.salary_per_student ?? 0),
    };

    try {
      if (editTarget) {
        const patch: TeacherUpdate = { ...basePayload };
        if (newUsername !== (editTarget.username ?? "")) {
          patch.username = newUsername || null;
        }
        if (newPassword) {
          patch.password = newPassword;
        }
        await updateM.mutateAsync({ id: editTarget.id, data: patch });
        toast.success(t("teachers.toastUpdated"));
      } else {
        const payload: TeacherCreate = { ...basePayload };
        if (usernameProvided) {
          payload.username = newUsername;
          payload.password = newPassword;
        }
        await createM.mutateAsync(payload);
        toast.success(
          usernameProvided
            ? t("teachers.toastCreatedWithAccount")
            : t("teachers.toastCreated")
        );
      }
      setModalOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteM.mutateAsync(deleteTarget.id);
      toast.success(t("teachers.toastDeleted").replace("{{name}}", fullName(deleteTarget)));
      setDeleteTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  }

  function clearFilters() {
    setSearch(""); setStatusFilter("all"); setSortMode("newest"); setPage(1);
  }

  const hasFilters = search || statusFilter !== "all";
  const isSaving   = createM.isPending || updateM.isPending;
  const exportColumns: ExportColumn[] = [
    { key: "full_name", label: t("teachers.teacher") },
    { key: "phone", label: t("students.contact") },
    { key: "birth_date", label: t("teachers.birthDate") },
    { key: "hire_date", label: t("teachers.hireDate") },
    { key: "status", label: t("filter.status") },
  ];
  const exportFilterSummary: ExportFilterSummaryItem[] = [
    ...(debouncedSearch ? [{ label: t("common.search"), value: debouncedSearch }] : []),
    ...(statusFilter !== "all" ? [{ label: t("filter.status"), value: statusFilter }] : []),
  ];

  const runTeachersExport = async (scope: "filtered" | "all", columns: string[]) => {
    const sourceRows = scope === "all" ? (allQ.data?.items ?? []) : rows;
    if (sourceRows.length === 0) {
      toast.info(t("teachers.noTeachers"));
      return;
    }
    const indexByKey = exportColumns.reduce<Record<string, number>>((acc, column, idx) => {
      acc[column.key] = idx;
      return acc;
    }, {});
    const enabledIndexes = columns.map((key) => indexByKey[key]).filter((idx) => idx !== undefined);
    const header = exportColumns.map((column) => column.label).filter((_, idx) => enabledIndexes.includes(idx));
    const csvRows = sourceRows.map((teacher) => {
      const row = [
        fullName(teacher),
        teacher.phone ?? "",
        teacher.birth_date ?? "",
        teacher.hire_date ?? "",
        teacher.is_active ? "active" : "inactive",
      ];
      return row.filter((_, idx) => enabledIndexes.includes(idx));
    });
    runCsvExport({
      filename: buildUnifiedExportFileName({
        entity: "teachers",
        format: "csv",
        rangeLabel: buildFilterRangeLabel(exportFilterSummary),
      }),
      header,
      rows: csvRows,
      delimiter: ";",
    });
  };

  // ── active filter badges ───────────────────────────────────────────────
  const badges: { key: string; label: string; onClear: () => void }[] = [];
  if (statusFilter !== "all") {
    const statusLabel = statusFilter === "active"
      ? t("teachers.statusActivePlural")
      : t("teachers.statusInactivePlural");
    badges.push({
      key: "status",
      label: `${t("teachers.filterStatusPrefix")}${statusLabel}`,
      onClear: () => setStatusFilter("all"),
    });
  }

  // ── render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 sm:space-y-6">
      <Breadcrumbs items={[{ label: t("teachers.title") }]} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">{t("teachers.title")}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t("teachers.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <ExportActionButton
            phase={exportPhase}
            onClick={() => setExportOpen(true)}
            label={t("students.export")}
          />
          {!isManager && (
            <Button size="sm" className="gap-2" onClick={openAdd}>
              <Plus className="h-4 w-4" /> {t("teachers.addTeacher")}
            </Button>
          )}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[
          { label: t("teachers.totalTeachers"),  value: totalCount,   sub: `${activeCount} ${t("teachers.activeTeachers").toLowerCase()}`, icon: GraduationCap, color: "text-primary" },
          { label: t("teachers.totalGroups"),     value: totalGroups,  sub: null, icon: BookOpen, color: "text-emerald-500" },
          { label: t("teachers.studentsManaged"), value: totalStudents,sub: null, icon: Users,    color: "text-violet-500" },
        ].map((kpi, i) => (
          <div key={kpi.label} className="rounded-xl border border-border/60 bg-card p-3 sm:p-4 shadow-sm animate-fade-in" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="flex items-center gap-1.5 mb-1">
              <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
              <span className="text-[10px] sm:text-xs text-muted-foreground">{kpi.label}</span>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-foreground">{kpi.value}</p>
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
              placeholder={t("teachers.searchPlaceholder")}
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

        {(hasFilters || badges.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {badges.map((b) => (
              <span key={b.key} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 text-xs font-medium animate-fade-in">
                {b.label}
                <button onClick={() => { b.onClear(); setPage(1); }} className="ml-0.5 hover:text-primary/70">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {hasFilters && (
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10" onClick={clearFilters}>
                {t("common.resetAll")}
              </Button>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {t("common.found")}: <span className="font-semibold text-foreground">{rows.length}</span> {t("teachers.resultsTeacherAbbr")}
            </span>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="stat-card p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="font-semibold pl-4">{t("teachers.teacher")}</TableHead>
              <TableHead className="font-semibold hidden md:table-cell">{t("students.contact")}</TableHead>
              <TableHead className="font-semibold hidden xl:table-cell whitespace-nowrap">
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                  {t("teachers.birthDate")}
                </span>
              </TableHead>
              <TableHead className="font-semibold hidden lg:table-cell whitespace-nowrap">
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                  {t("teachers.hireDate")}
                </span>
              </TableHead>
              <TableHead className="font-semibold hidden md:table-cell text-center">{t("teachers.colStatus")}</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQ.isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Search className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">{t("teachers.noTeachers")}</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : paginated.map((teacher, i) => {
              const stats     = teacherStats.get(teacher.id) ?? { groups: 0, students: 0 };
              const birthDate = teacher.birth_date
                ? format(parseISO(teacher.birth_date), "d LLL yyyy", { locale: dfLocale })
                : null;
              const hireDate  = teacher.hire_date
                ? format(parseISO(teacher.hire_date), "d MMM yyyy", { locale: dfLocale })
                : null;

              return (
              <TableRow
                key={teacher.id}
                className="animate-fade-in cursor-pointer transition-colors hover:bg-muted/30"
                style={{ animationDelay: `${i * 30}ms` }}
                onClick={() => navigate(`/teachers/${teacher.id}`)}
              >
                  {/* Name cell — avatar + full name + account badge */}
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold overflow-hidden">
                        {teacher.avatar_base64 ? (
                          <img src={teacher.avatar_base64} alt={fullName(teacher)} className="h-full w-full object-cover" />
                        ) : (
                          <>{teacher.first_name[0]}{teacher.last_name[0]}</>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{fullName(teacher)}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {/* Phone — visible on mobile only */}
                          {teacher.phone && (
                            <span
                              className="md:hidden text-[10px] text-muted-foreground font-mono truncate"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {teacher.phone}
                            </span>
                          )}
                          {/* Status badge — visible on mobile only */}
                          <span className="md:hidden">
                            <StatusBadge status={teacher.is_active ? "active" : "inactive"} />
                          </span>
                        </div>
                      </div>
                    </div>
                </TableCell>

                  {/* Phone */}
                  <TableCell className="hidden md:table-cell" onClick={(e) => e.stopPropagation()}>
                    {teacher.phone ? (
                  <a
                    href={`tel:${teacher.phone.replace(/\s/g, "")}`}
                        className="inline-flex items-center gap-1.5 text-xs font-mono text-primary hover:underline whitespace-nowrap"
                  >
                    <Phone className="h-3 w-3 shrink-0" />
                    {teacher.phone}
                  </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                </TableCell>

                  {/* Birth date */}
                  <TableCell className="hidden xl:table-cell">
                    {birthDate ? (
                      <span className="text-xs text-muted-foreground capitalize">{birthDate}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                </TableCell>

                  {/* Hire date */}
                <TableCell className="hidden lg:table-cell">
                    {hireDate ? (
                      <span className="text-xs text-muted-foreground capitalize">{hireDate}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                </TableCell>

                  {/* Status — moved to end, visible md+ */}
                  <TableCell className="hidden md:table-cell text-center">
                    <StatusBadge status={teacher.is_active ? "active" : "inactive"} />
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
                      <DropdownMenuItem onClick={() => navigate(`/teachers/${teacher.id}`)}>
                        <Eye className="h-3.5 w-3.5 mr-2" /> {t("teachers.viewProfile")}
                      </DropdownMenuItem>
                      {!isManager && (
                        <>
                          <DropdownMenuItem onClick={() => openEdit(teacher)}>
                            <Pencil className="h-3.5 w-3.5 mr-2" /> {t("teachers.editTeacher")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteTarget(teacher)}
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
        {rows.length > PAGE_SIZE && (
          <div className="flex flex-col sm:flex-row items-center justify-between border-t border-border/60 px-3 sm:px-4 py-3 gap-3">
            <p className="text-xs text-muted-foreground">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, rows.length)} {t("common.of")} {rows.length}
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

      <ExportCenter
        open={exportOpen}
        onOpenChange={setExportOpen}
        title={t("export.center.title")}
        description={t("export.center.description")}
        formats={["csv"]}
        columns={exportColumns}
        sortOptions={[
          { value: "newest", label: t("students.sortNewest") },
          { value: "oldest", label: t("students.sortOldest") },
        ]}
        filterSummary={exportFilterSummary}
        submitLabel={t("export.center.submit")}
        onSubmit={(state) => {
          runExportTask({
            onPhaseChange: (phase) => setExportPhase(phase),
            run: () => runTeachersExport(state.scope, state.columns),
            onSuccess: () => {
              toast.success(t("export.toast.success"));
              setExportOpen(false);
              setTimeout(() => setExportPhase("idle"), 1200);
            },
            onError: (error) => {
              toast.error(error.message);
              setTimeout(() => setExportPhase("idle"), 1500);
            },
          });
        }}
      />

      {/* ─── Add / Edit dialog ─────────────────────────────────────────────── */}
      <Dialog open={modalOpen} onOpenChange={(open) => !open && setModalOpen(false)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTarget ? t("teachers.editTeacher") : t("teachers.addNew")}</DialogTitle>
            <DialogDescription className="sr-only">{t("teachers.formDescription")}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 py-2">
            {/* Row 1: First / Last */}
            <div className="grid gap-1.5">
              <Label htmlFor="tf-first">{t("teachers.firstName")} *</Label>
              <Input id="tf-first" placeholder={t("teachers.placeholderFirstName")} value={form.first_name} onChange={(e) => setF("first_name", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tf-last">{t("teachers.lastName")} *</Label>
              <Input id="tf-last" placeholder={t("teachers.placeholderLastName")} value={form.last_name} onChange={(e) => setF("last_name", e.target.value)} />
            </div>

            {/* Row 2: Middle name */}
            <div className="grid gap-1.5 col-span-2">
              <Label htmlFor="tf-mid">{t("teachers.middleName")}</Label>
              <Input id="tf-mid" placeholder={t("teachers.placeholderMiddleName")} value={form.middle_name} onChange={(e) => setF("middle_name", e.target.value)} />
            </div>

            {/* Row 3: Phone */}
            <div className="grid gap-1.5 col-span-2">
              <Label htmlFor="tf-phone">{t("students.phone")}</Label>
              <Input id="tf-phone" placeholder="+998 90 123 4567" value={form.phone} onChange={(e) => setF("phone", e.target.value)} />
            </div>

            {/* Row 4: Birth date / Hire date */}
            <div className="grid gap-1.5">
              <Label htmlFor="tf-birth">{t("teachers.birthDate")}</Label>
              <Input id="tf-birth" type="date" value={form.birth_date} onChange={(e) => setF("birth_date", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tf-hire">{t("teachers.hireDate")}</Label>
              <Input id="tf-hire" type="date" value={form.hire_date} onChange={(e) => setF("hire_date", e.target.value)} />
            </div>

            {/* Row 5: Gender */}
            <div className="col-span-2 grid gap-1.5">
              <Label>{t("teachers.genderLabel")}</Label>
              <div className="flex gap-2">
                {(["male", "female"] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setF("gender", form.gender === g ? "" : g)}
                    className={cn(
                      "flex-1 rounded-lg border py-2 text-sm font-medium transition-all",
                      form.gender === g
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-foreground hover:border-primary/40"
                    )}
                  >
                    {g === "male" ? t("teachers.genderMale") : t("teachers.genderFemale")}
                  </button>
                ))}
              </div>
            </div>

            {/* Row 6: Active toggle */}
            <div className="col-span-2 flex items-center justify-between rounded-lg border p-3 bg-background">
              <div>
                <p className="text-sm font-medium">{t("teachers.activeTitle")}</p>
                <p className="text-xs text-muted-foreground">{t("teachers.activeHint")}</p>
              </div>
              <Switch checked={form.is_active} onCheckedChange={(v) => setF("is_active", v)} />
            </div>

            {/* Row 7: Salary */}
            <div className="col-span-2 mt-1 rounded-lg border border-border/60 p-3 space-y-3 bg-background">
              <div>
                <p className="text-sm font-semibold">{t("teachers.salarySectionTitle")}</p>
                <p className="text-xs text-muted-foreground">{t("teachers.salaryFormula")}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="tf-sal-monthly">{t("teachers.salaryFixed")}</Label>
                  <FormattedNumberInput
                    id="tf-sal-monthly"
                    value={form.salary_monthly}
                    onValueChange={(value) => setF("salary_monthly", value)}
                    placeholder="0"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="tf-sal-percent">{t("teachers.salaryPercent")}</Label>
                  <Input
                    id="tf-sal-percent"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step={0.01}
                    value={form.salary_percent}
                    onChange={(e) => setF("salary_percent", e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="tf-sal-lesson">{t("teachers.salaryPerLesson")}</Label>
                  <FormattedNumberInput
                    id="tf-sal-lesson"
                    value={form.salary_per_lesson}
                    onValueChange={(value) => setF("salary_per_lesson", value)}
                    placeholder="0"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="tf-sal-student">{t("teachers.salaryPerStudent")}</Label>
                  <FormattedNumberInput
                    id="tf-sal-student"
                    value={form.salary_per_student}
                    onValueChange={(value) => setF("salary_per_student", value)}
                    placeholder="0"
                  />
                </div>
              </div>
            </div>

            {/* Row 8: Account credentials */}
            <div className="col-span-2 mt-1 rounded-lg border border-border/60 p-3 space-y-3 bg-background">
              <div>
                <p className="text-sm font-semibold">{t("teachers.credentialsSection")}</p>
                <p className="text-xs text-muted-foreground">
                  {editTarget
                    ? t("teachers.credentialsHelpEdit")
                    : t("teachers.credentialsHelpCreate")}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="tf-username">{t("teachers.login")}</Label>
                  <Input
                    id="tf-username"
                    placeholder={t("teachers.usernamePlaceholder")}
                    autoComplete="off"
                    value={form.username}
                    onChange={(e) => setF("username", e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="tf-password">
                    {editTarget ? t("teachers.newPasswordLabel") : t("teachers.password")}
                  </Label>
                  <PasswordInput
                    id="tf-password"
                    placeholder={editTarget ? "••••••" : t("teachers.passwordPlaceholderMin")}
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(e) => setF("password", e.target.value)}
                  />
                </div>
              </div>

              {editTarget?.has_account && (
                <p className="text-[11px] text-emerald-600">
                  {t("teachers.accountExistsNote")}
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={isSaving}>{t("common.cancel")}</Button>
            <Button onClick={handleSave} disabled={isSaving || !form.first_name.trim() || !form.last_name.trim()}>
              {isSaving
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t("common.saving")}</>
                : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete confirmation ───────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("teachers.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("teachers.deleteDescription").replace("{{name}}", deleteTarget ? fullName(deleteTarget) : "")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteM.isPending}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteM.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteM.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t("common.deleting")}</>
                : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
