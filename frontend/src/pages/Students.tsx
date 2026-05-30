import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ru as ruLocale, uz as uzLocale, enUS as enLocale } from "date-fns/locale";
import type { Locale } from "date-fns";
import {
  Search, Plus, MoreHorizontal, Phone,
  ChevronLeft, ChevronRight, Eye, Pencil, Trash2,
  Users, AlertTriangle, CheckCircle2, UserX,
  X, Loader2, Lock,
} from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/PasswordInput";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  useStudents, useCreateStudent, useUpdateStudent, useDeleteStudent,
  type StudentRead, type PaymentStatus, type Gender,
  type StudentCreate, type StudentUpdate,
} from "@/hooks/use-students";
import { useGroups, expandDays, type DaysType } from "@/hooks/use-groups";
import { useCourses } from "@/hooks/use-courses";

const PAGE_SIZE = 10;

const SORT_KEYS = ["newest", "oldest", "az", "za"] as const;
const PAYMENT_VALUES: PaymentStatus[] = ["paid", "debt"];

const DF_LOCALES: Record<string, Locale> = { ru: ruLocale, uz: uzLocale, en: enLocale };

function mapStudentApiError(e: unknown, t: (key: string) => string): string {
  if (!(e instanceof ApiError)) return t("common.unknownError");

  const msg = (typeof e.detail === "string" ? e.detail : e.message ?? "").toLowerCase();

  // Phone validation errors from backend
  if (msg.includes("phone must contain at least")) return t("students.errorPhoneTooShort");
  if (msg.includes("phone") && msg.includes("digit"))   return t("students.errorPhoneDigits");
  if (msg.includes("phone") && (msg.includes("invalid") || msg.includes("format")))
    return t("students.errorPhoneInvalid");

  // Duplicate / conflict
  if (e.status === 409 || msg.includes("already exists") || msg.includes("duplicate"))
    return t("students.errorDuplicate");

  // Server errors
  if (e.status >= 500) return t("common.serverError");

  // Fallback: show detail if it's a short readable string, else generic
  if (typeof e.detail === "string" && e.detail.length < 120) return e.detail;
  return t("common.unknownError");
}

export default function Students() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  // ── Filters ───────────────────────────────────────────────────────
  const [search, setSearch]             = useState("");
  const [groupFilter, setGroupFilter]   = useState("all");
  const [courseFilter, setCourseFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState("all");
  const [noGroupOnly, setNoGroupOnly]   = useState(false);
  const [sortMode, setSortMode]         = useState("newest");
  const [page, setPage]                 = useState(1);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportPhase, setExportPhase] = useState<ExportPhase>("idle");
  const debouncedSearch = useDebouncedValue(search, 300);

  useEffect(() => { setPage(1); }, [debouncedSearch, groupFilter, courseFilter, paymentFilter, genderFilter, noGroupOnly, sortMode]);

  // ── Dialog state ──────────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StudentRead | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StudentRead | null>(null);

  // ── API: Students list ────────────────────────────────────────────
  const baseParams = { limit: 1000 as const, sort: sortMode };
  const filterParams = {
    ...baseParams,
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(groupFilter   !== "all" ? { group_id: Number(groupFilter) } : {}),
    ...(paymentFilter !== "all" ? { payment_status: paymentFilter as PaymentStatus } : {}),
  };

  const allQ  = useStudents(baseParams);
  const listQ = useStudents(filterParams);

  const groupsQ  = useGroups({ limit: 1000 });
  const coursesQ = useCourses({ limit: 1000, is_active: true });
  const groups   = groupsQ.data?.items ?? [];
  const courses  = coursesQ.data?.items ?? [];

  // Further client-side filters
  const rowsRaw = listQ.data?.items ?? [];
  const rows = useMemo(() => {
    let r = rowsRaw;
    if (courseFilter !== "all") {
      const cid = Number(courseFilter);
      const groupIdsOfCourse = new Set(groups.filter((g) => g.course_id === cid).map((g) => g.id));
      r = r.filter((s) => s.group_id && groupIdsOfCourse.has(s.group_id));
    }
    if (noGroupOnly) r = r.filter((s) => !s.group_id);
    if (genderFilter !== "all") r = r.filter((s) => s.gender === genderFilter);
    return r;
  }, [rowsRaw, courseFilter, groups, noGroupOnly, genderFilter]);

  // ── Stats from unfiltered data ────────────────────────────────────
  const allItems = allQ.data?.items ?? [];
  const totalStudents = allQ.data?.total ?? 0;
  const debtors = allItems.filter((s) => s.payment_status === "debt").length;
  const activeCount = allItems.filter((s) => s.is_active).length;

  // ── Pagination ────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const paged = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Mutations ─────────────────────────────────────────────────────
  const deleteM = useDeleteStudent();

  async function submitDelete() {
    if (!deleteTarget) return;
    try {
      await deleteM.mutateAsync(deleteTarget.id);
      toast.success(t("students.deleteSuccess"));
      setDeleteTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.unknownError"));
    }
  }

  // ── Labels ────────────────────────────────────────────────────────
  const sortLabel = (k: string) => {
    switch (k) {
      case "newest": return t("students.sortNewest");
      case "oldest": return t("students.sortOldest");
      case "az":     return t("students.sortAZ");
      case "za":     return t("students.sortZA");
      default:       return k;
    }
  };
  const paymentLabel = (p: string) => {
    switch (p) {
      case "paid":    return t("students.paid");
      case "debt":    return t("students.debt");
      default:        return p;
    }
  };

  // ── Active filter badges ──────────────────────────────────────────
  const activeFilters: { key: string; label: string; onClear: () => void }[] = [];
  if (courseFilter !== "all") {
    const c = courses.find((x) => String(x.id) === courseFilter);
    activeFilters.push({ key: "course", label: c?.name ?? courseFilter, onClear: () => { setCourseFilter("all"); setGroupFilter("all"); } });
  }
  if (groupFilter !== "all") {
    const g = groups.find((x) => String(x.id) === groupFilter);
    activeFilters.push({ key: "group", label: g?.code ?? groupFilter, onClear: () => setGroupFilter("all") });
  }
  if (paymentFilter !== "all") {
    activeFilters.push({ key: "payment", label: paymentLabel(paymentFilter), onClear: () => setPaymentFilter("all") });
  }
  if (genderFilter !== "all") {
    activeFilters.push({ key: "gender", label: genderFilter === "male" ? t("students.male") : t("students.female"), onClear: () => setGenderFilter("all") });
  }
  if (noGroupOnly) {
    activeFilters.push({ key: "nogroup", label: t("students.noGroup"), onClear: () => setNoGroupOnly(false) });
  }

  const hasAnyFilter = activeFilters.length > 0 || !!search;

  const exportColumns: ExportColumn[] = [
    { key: "full_name", label: t("students.fullName") },
    { key: "phone", label: t("students.phone") },
    { key: "group", label: t("students.group") },
    { key: "course", label: t("filter.course") },
    { key: "payment", label: t("students.payment") },
    { key: "created_at", label: t("students.addedDate") },
  ];
  const exportFilterSummary: ExportFilterSummaryItem[] = [
    ...(debouncedSearch ? [{ label: t("common.search"), value: debouncedSearch }] : []),
    ...(courseFilter !== "all" ? [{ label: t("filter.course"), value: courseFilter }] : []),
    ...(groupFilter !== "all" ? [{ label: t("students.group"), value: groupFilter }] : []),
    ...(paymentFilter !== "all" ? [{ label: t("students.payment"), value: paymentFilter }] : []),
    ...(genderFilter !== "all" ? [{ label: t("students.gender"), value: genderFilter }] : []),
    ...(noGroupOnly ? [{ label: t("students.noGroup"), value: "true" }] : []),
  ];

  const runStudentsExport = async (scope: "filtered" | "all", columns: string[]) => {
    const sourceRows = scope === "all" ? allItems : rows;
    if (sourceRows.length === 0) {
      toast.info(t("students.noStudents"));
      return;
    }
    const indexByKey = exportColumns.reduce<Record<string, number>>((acc, column, idx) => {
      acc[column.key] = idx;
      return acc;
    }, {});
    const enabledIndexes = columns.map((key) => indexByKey[key]).filter((idx) => idx !== undefined);
    const header = exportColumns.map((column) => column.label).filter((_, idx) => enabledIndexes.includes(idx));
    const csvRows = sourceRows.map((student) => {
      const row = [
        student.full_name,
        student.phone ?? "",
        student.group_code ?? "",
        groups.find((group) => group.id === student.group_id)?.course_name ?? "",
        paymentLabel(student.payment_status),
        format(new Date(student.created_at), "yyyy-MM-dd HH:mm"),
      ];
      return row.filter((_, idx) => enabledIndexes.includes(idx));
    });
    runCsvExport({
      filename: buildUnifiedExportFileName({
        entity: "students",
        format: "csv",
        rangeLabel: buildFilterRangeLabel(exportFilterSummary),
      }),
      header,
      rows: csvRows,
      delimiter: ";",
    });
  };

  function resetAll() {
    setSearch(""); setCourseFilter("all"); setGroupFilter("all");
    setPaymentFilter("all"); setGenderFilter("all"); setNoGroupOnly(false);
    setPage(1);
  }

  // ── Helpers ───────────────────────────────────────────────────────
  const daysLabel = (ds: DaysType) => expandDays(ds).map((d) => t(`day.short.${d}`)).join(", ");

  const paymentBadge = (status: string) => {
    const styles: Record<string, string> = {
      paid:    "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
      debt:    "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    };
    return (
      <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", styles[status] ?? "bg-muted")}>
        {paymentLabel(status)}
      </span>
    );
  };

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 sm:space-y-6">
      <Breadcrumbs items={[{ label: t("students.title") }]} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{t("students.title")}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t("students.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <ExportActionButton
            phase={exportPhase}
            onClick={() => setExportOpen(true)}
            label={t("students.export")}
          />
          {isAdmin && (
            <Button size="sm" className="gap-2" onClick={() => { setEditTarget(null); setAddOpen(true); }}>
              <Plus className="h-4 w-4" /> {t("students.addStudent")}
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards — clickable */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
        {[
          {
            label: t("students.totalStudents"), value: totalStudents,
            icon: Users, color: "text-primary",
            active: false, onClick: undefined,
          },
          {
            label: t("students.debtors"), value: debtors,
            icon: AlertTriangle, color: "text-rose-600",
            active: paymentFilter === "debt",
            onClick: () => { setPaymentFilter(paymentFilter === "debt" ? "all" : "debt"); setPage(1); },
          },
          {
            label: t("students.active2"), value: activeCount,
            icon: CheckCircle2, color: "text-emerald-600",
            active: false, onClick: undefined,
          },
        ].map((s, i) => (
          <div
            key={s.label}
            role={s.onClick ? "button" : undefined}
            tabIndex={s.onClick ? 0 : undefined}
            onClick={s.onClick}
            onKeyDown={s.onClick ? (e) => e.key === "Enter" && s.onClick?.() : undefined}
            className={cn(
              "rounded-xl border border-border/60 bg-card p-3 sm:p-4 shadow-sm animate-fade-in transition-colors",
              s.onClick && "cursor-pointer hover:border-primary/40 hover:bg-muted/30",
              s.active && "border-rose-300 bg-rose-50 dark:bg-rose-500/10 dark:border-rose-500/30",
            )}
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <s.icon className={cn("h-4 w-4", s.color)} />
              <span className="text-[10px] sm:text-xs text-muted-foreground">{s.label}</span>
            </div>
            <p className="text-xl sm:text-2xl font-bold">
              {allQ.isLoading ? "…" : s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="stat-card space-y-2.5">
        {/* Row 1: search + dropdowns + sort */}
        <div className="flex flex-wrap gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("students.searchPlaceholder")}
              className="pl-9 h-9 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Course */}
          <Select value={courseFilter} onValueChange={(v) => { setCourseFilter(v); setGroupFilter("all"); }}>
            <SelectTrigger className="w-full sm:w-40 h-9 text-sm">
              <SelectValue placeholder={t("students.allCourses")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("students.allCourses")}</SelectItem>
              {courses.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Group — filtered by chosen course */}
          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger className="w-full sm:w-40 h-9 text-sm">
              <SelectValue placeholder={t("students.allGroups")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("students.allGroups")}</SelectItem>
              {(courseFilter === "all"
                ? groups
                : groups.filter((g) => String(g.course_id) === courseFilter)
              ).map((g) => (
                <SelectItem key={g.id} value={String(g.id)}>
                  {g.code}
                  {g.teacher_name ? ` · ${g.teacher_name.split(" ")[0]}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Payment */}
          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger className="w-full sm:w-36 h-9 text-sm">
              <SelectValue placeholder={t("students.allPayments")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("students.allPayments")}</SelectItem>
              {PAYMENT_VALUES.map((p) => (
                <SelectItem key={p} value={p}>{paymentLabel(p)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Sort */}
          <Select value={sortMode} onValueChange={setSortMode}>
            <SelectTrigger className="w-full sm:w-36 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_KEYS.map((k) => (
                <SelectItem key={k} value={k}>{sortLabel(k)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Row 2: quick filter chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground mr-0.5">{t("students.quickFilters")}:</span>

          {/* No group */}
          <button
            onClick={() => { setNoGroupOnly(!noGroupOnly); setGroupFilter("all"); }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              noGroupOnly
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border/60 text-muted-foreground hover:border-primary/50 hover:text-foreground"
            )}
          >
            <UserX className="h-3 w-3" />
            {t("students.noGroup")}
          </button>

          {/* Debtors */}
          <button
            onClick={() => setPaymentFilter(paymentFilter === "debt" ? "all" : "debt")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              paymentFilter === "debt"
                ? "bg-rose-500 text-white border-rose-500"
                : "border-border/60 text-muted-foreground hover:border-rose-400 hover:text-rose-600"
            )}
          >
            <AlertTriangle className="h-3 w-3" />
            {t("students.debt")}
          </button>

          {/* Male */}
          <button
            onClick={() => setGenderFilter(genderFilter === "male" ? "all" : "male")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              genderFilter === "male"
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border/60 text-muted-foreground hover:border-primary/50 hover:text-foreground"
            )}
          >
            {t("students.male")}
          </button>

          {/* Female */}
          <button
            onClick={() => setGenderFilter(genderFilter === "female" ? "all" : "female")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              genderFilter === "female"
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border/60 text-muted-foreground hover:border-primary/50 hover:text-foreground"
            )}
          >
            {t("students.female")}
          </button>

          {/* Active chips for selected filters */}
          {activeFilters.map((f) => (
            <span
              key={f.key}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary border border-primary/20 px-2.5 py-1 text-xs font-medium"
            >
              {f.label}
              <button onClick={() => { f.onClear(); setPage(1); }} className="hover:opacity-70">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}

          {/* Results count + reset */}
          <div className="ml-auto flex items-center gap-2">
            {hasAnyFilter && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 gap-1" onClick={resetAll}>
                <X className="h-3 w-3" /> {t("students.resetAll")}
              </Button>
            )}
            <span className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{rows.length}</span> {t("students.studentsCount")}
            </span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="stat-card p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="font-semibold w-12">#</TableHead>
              <TableHead className="font-semibold">{t("students.student")}</TableHead>
              <TableHead className="font-semibold hidden sm:table-cell">{t("students.contact")}</TableHead>
              <TableHead className="font-semibold hidden md:table-cell">{t("students.group")}</TableHead>
              <TableHead className="font-semibold hidden lg:table-cell">{t("groups.days")}</TableHead>
              <TableHead className="font-semibold hidden lg:table-cell">{t("groups.timeSlot")}</TableHead>
              <TableHead className="font-semibold hidden xl:table-cell">{t("students.addedDate")}</TableHead>
              <TableHead className="font-semibold">{t("students.payment")}</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQ.isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-sm">{t("students.loading")}</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Search className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm font-medium">{t("students.noStudents")}</p>
                    <p className="text-xs text-muted-foreground">{t("students.adjustFilters")}</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : paged.map((s, i) => {
              const group = s.group_id ? groups.find((g) => g.id === s.group_id) : null;
              return (
                <TableRow key={s.id} className="animate-fade-in cursor-pointer transition-colors hover:bg-muted/30"
                  style={{ animationDelay: `${i * 20}ms` }}
                  onClick={() => navigate(`/students/${s.id}`)}>
                  <TableCell className="text-xs text-muted-foreground">{(page - 1) * PAGE_SIZE + i + 1}.</TableCell>
                  <TableCell>
                    <p className="text-sm font-semibold">{s.full_name}</p>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {s.phone ? (
                      <a href={`tel:${s.phone}`} onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1.5 text-primary hover:underline text-sm">
                        <Phone className="h-3 w-3" /> {s.phone}
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm">
                    {s.group_code ?? <span className="text-xs text-muted-foreground/60 italic">{t("students.noGroup")}</span>}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {group ? (
                      <div className="flex gap-1 flex-wrap">
                        {expandDays(group.days as DaysType).map((d) => (
                          <span key={d} className="text-[10px] font-medium bg-muted px-1.5 py-0.5 rounded">{t(`day.short.${d}`)}</span>
                        ))}
                      </div>
                    ) : <span className="text-xs text-muted-foreground/60 italic">{t("students.noGroup")}</span>}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm">
                    {group?.time_slot ?? <span className="text-xs text-muted-foreground/60 italic">{t("students.noGroup")}</span>}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(s.created_at), "dd.MM.yyyy")}<br/>
                    <span className="text-muted-foreground/60">{format(new Date(s.created_at), "HH:mm")}</span>
                  </TableCell>
                  <TableCell>{paymentBadge(s.payment_status)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(`/students/${s.id}`)}>
                          <Eye className="h-3.5 w-3.5 mr-2" /> {t("students.view")}
                        </DropdownMenuItem>
                        {isAdmin && (
                          <>
                            <DropdownMenuItem onClick={() => { setEditTarget(s); setAddOpen(true); }}>
                              <Pencil className="h-3.5 w-3.5 mr-2" /> {t("students.edit")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteTarget(s)}>
                              <Trash2 className="h-3.5 w-3.5 mr-2" /> {t("students.delete")}
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

        {rows.length > PAGE_SIZE && (
          <div className="flex flex-col sm:flex-row items-center justify-between border-t border-border/60 px-4 py-3 gap-3">
            <p className="text-xs text-muted-foreground">
              {t("students.showing")} {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, rows.length)} {t("students.of")} {rows.length} {t("students.studentsCount")}
            </p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-3 w-3" /> {t("students.previous")}
              </Button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => (
                <Button key={i} variant={page === i + 1 ? "default" : "outline"} size="icon" className="h-7 w-7 text-xs" onClick={() => setPage(i + 1)}>
                  {i + 1}
                </Button>
              ))}
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                {t("students.next")} <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Dialog */}
      <StudentDialog
        open={addOpen}
        onClose={() => { setAddOpen(false); setEditTarget(null); }}
        editTarget={editTarget}
      />

      {/* Delete dialog */}
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
            run: () => runStudentsExport(state.scope, state.columns),
            onSuccess: () => {
              toast.success(t("students.exportStarted"));
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

      {/* Delete dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("students.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && <span className="font-semibold">{deleteTarget.full_name}</span>}
              {" — "}{t("students.deleteDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("students.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={submitDelete} disabled={deleteM.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteM.isPending ? t("students.deleting") : t("students.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// ── StudentDialog ───────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════

function StudentDialog({
  open, onClose, editTarget,
}: {
  open: boolean;
  onClose: () => void;
  editTarget: StudentRead | null;
}) {
  const { t, language } = useLanguage();
  const dfLocale = DF_LOCALES[language] ?? enLocale;
  const createM = useCreateStudent();
  const updateM = useUpdateStudent();
  const isEdit = !!editTarget;

  // ── Fields ────────────────────────────────────────────────────────
  const [fullName, setFullName]         = useState("");
  const [gender, setGender]             = useState<"none" | "male" | "female">("none");
  const [birthDate, setBirthDate]       = useState("");
  const [birthRaw, setBirthRaw]         = useState("");
  const [phone, setPhone]               = useState("");
  const [parentPhone, setParentPhone]   = useState("");
  const [source, setSource]             = useState<string | null>(null);
  const [groupId, setGroupId]           = useState<number | null>(null);
  const [groupSearch, setGroupSearch]   = useState("");
  const [groupOpen, setGroupOpen]       = useState(false);
  const [password, setPassword]         = useState("");

  // ── Reset / load ──────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    if (editTarget) {
      setFullName(editTarget.full_name);
      setGender((editTarget.gender as "male" | "female") ?? "none");
      setBirthDate(editTarget.birth_date ?? "");
      setBirthRaw(editTarget.birth_date ? editTarget.birth_date.split("-").reverse().join(".") : "");
      setPhone(editTarget.phone ?? "");
      setParentPhone(editTarget.parent_phone ?? "");
      setSource(editTarget.source ?? null);
      setGroupId(editTarget.group_id);
    } else {
      setFullName(""); setGender("none");
      setBirthDate(""); setBirthRaw("");
      setPhone(""); setParentPhone("");
      setSource(null);
      setGroupId(null);
    }
    setPassword("");
    setGroupSearch("");
    setGroupOpen(false);
  }, [open, editTarget]);

  const groupsQ = useGroups({ limit: 1000 });
  const groups  = groupsQ.data?.items ?? [];

  const filteredGroups = useMemo(() => {
    if (!groupSearch.trim()) return groups;
    const q = groupSearch.toLowerCase();
    return groups.filter((g) =>
      g.code.toLowerCase().includes(q) ||
      (g.teacher_name ?? "").toLowerCase().includes(q) ||
      (g.course_name ?? "").toLowerCase().includes(q)
    );
  }, [groups, groupSearch]);

  const selectedGroup = groupId ? groups.find((g) => g.id === groupId) : null;
  const isValid   = fullName.trim().length > 0;
  const isPending = createM.isPending || updateM.isPending;

  async function handleSave() {
    if (!isValid) { toast.error(t("students.enterFullName")); return; }
    const trimmedPassword = password.trim();
    if (trimmedPassword) {
      if (!phone.trim()) {
        toast.error(t("student.passwordRequiresPhone"));
        return;
      }
      if (trimmedPassword.length < 6) {
        toast.error(t("student.passwordTooShort"));
        return;
      }
    }
    const basePayload = {
      full_name:    fullName.trim(),
      gender:       (gender === "none" ? null : (gender as Gender)) as Gender | null,
      birth_date:   birthDate || null,
      phone:        phone.trim() || null,
      parent_phone: parentPhone.trim() || null,
      source:       source,
      // ``group_id`` is intentionally excluded from edit payloads: changing
      // a student's group goes through the dedicated Transfer dialog so debt,
      // capacity and audit invariants stay consistent.
      ...(isEdit ? {} : { group_id: groupId }),
      ...(trimmedPassword ? { password: trimmedPassword } : {}),
    };
    try {
      if (isEdit && editTarget) {
        await updateM.mutateAsync({ id: editTarget.id, data: basePayload as StudentUpdate });
        toast.success(t("students.updateSuccess"));
      } else {
        await createM.mutateAsync(basePayload as StudentCreate);
        toast.success(t("students.createSuccess"));
      }
      onClose();
    } catch (e) {
      toast.error(mapStudentApiError(e, t));
    }
  }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("students.editTitle") : t("students.addNew")}</DialogTitle>
          <DialogDescription className="sr-only">{isEdit ? t("students.editTitle") : t("students.addNew")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-1">

          {/* Ф.И.О */}
          <div className="space-y-1.5">
            <Label>{t("students.fullName")} <span className="text-destructive">*</span></Label>
            <Input
              placeholder={t("students.enterFullName")}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>

          {/* Телефон | Телефон родителей */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("students.phone")}</Label>
              <Input placeholder="+998 90 123 4567" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("students.parentPhone")}</Label>
              <Input placeholder="+998 90 123 4567" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} />
            </div>
          </div>

          {/* Пол */}
          <div className="space-y-1.5">
            <Label>{t("students.gender")}</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={gender === "male" ? "default" : "outline"}
                size="sm"
                className="flex-1 h-10"
                onClick={() => setGender(gender === "male" ? "none" : "male")}
              >
                {t("students.male")}
              </Button>
              <Button
                type="button"
                variant={gender === "female" ? "default" : "outline"}
                size="sm"
                className="flex-1 h-10"
                onClick={() => setGender(gender === "female" ? "none" : "female")}
              >
                {t("students.female")}
              </Button>
            </div>
          </div>

          {/* Дата рождения | Группа */}
          <div className="grid grid-cols-2 gap-3">
            {/* Дата рождения */}
            <div className="space-y-1.5">
              <Label>{t("students.birthDate")}</Label>
              <Input
                placeholder={t("students.birthDatePlaceholder")}
                value={birthRaw}
                maxLength={10}
                onChange={(e) => {
                  let v = e.target.value.replace(/[^\d.]/g, "");
                  if (v.length === 2 && birthRaw.length === 1) v = v + ".";
                  if (v.length === 5 && birthRaw.length === 4) v = v + ".";
                  setBirthRaw(v);
                  if (/^\d{2}\.\d{2}\.\d{4}$/.test(v)) {
                    const [dd, mm, yyyy] = v.split(".");
                    const d = new Date(`${yyyy}-${mm}-${dd}`);
                    if (!isNaN(d.getTime())) setBirthDate(`${yyyy}-${mm}-${dd}`);
                  } else {
                    setBirthDate("");
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && birthRaw.endsWith(".")) {
                    e.preventDefault();
                    setBirthRaw(birthRaw.slice(0, -1));
                  }
                }}
              />
            </div>

            {/* Группа — триггер */}
            <div className="space-y-1.5">
              <Label>{t("students.group")}</Label>
              {isEdit && editTarget?.group_id ? (
                // Read-only in edit mode: changing groups must go through the
                // Transfer dialog so debt/capacity/audit are handled atomically.
                <div className="space-y-1">
                  <div
                    className="w-full rounded-md border border-input bg-muted/40 px-3 h-10 flex items-center justify-between gap-2 text-sm"
                    title={t("transfer.useTransferDialog")}
                  >
                    <span className="font-medium text-foreground truncate">
                      {selectedGroup
                        ? `${selectedGroup.code} · ${selectedGroup.time_slot}`
                        : `#${editTarget.group_id}`}
                    </span>
                    <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {t("transfer.useTransferDialog")}
                  </p>
                </div>
              ) : selectedGroup ? (
                <button
                  type="button"
                  onClick={() => setGroupOpen((p) => !p)}
                  className="w-full text-left rounded-md border border-primary bg-primary/5 ring-1 ring-primary/20 px-3 h-10 flex items-center justify-between gap-2 transition-colors hover:bg-primary/10"
                >
                  <span className="text-sm font-medium text-foreground truncate">{selectedGroup.code} · {selectedGroup.time_slot}</span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setGroupId(null); setGroupOpen(false); }}
                    className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setGroupOpen((p) => !p)}
                  className={cn(
                    "w-full text-left rounded-md border px-3 h-10 flex items-center justify-between text-sm transition-colors bg-background",
                    groupOpen
                      ? "border-primary ring-1 ring-primary/20 text-foreground"
                      : "border-input text-muted-foreground hover:border-primary/60 hover:text-foreground"
                  )}
                >
                  <span>{t("students.groupOptional")}</span>
                  <ChevronRight className={cn("h-4 w-4 shrink-0 transition-transform", groupOpen && "rotate-90")} />
                </button>
              )}
            </div>
          </div>

          {/* Группа — выпадающий список (на всю ширину) */}
          {!(isEdit && editTarget?.group_id) && groupOpen && (
            <div className="rounded-lg border border-border/60 bg-card shadow-sm overflow-hidden -mt-1">
              <div className="p-2 border-b border-border/40">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder={t("students.searchGroup")}
                    className="pl-8 h-8 text-sm"
                    value={groupSearch}
                    onChange={(e) => setGroupSearch(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>
              <div className="max-h-[200px] overflow-y-auto">
                <button
                  type="button"
                  onClick={() => { setGroupId(null); setGroupOpen(false); }}
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors",
                    !groupId ? "bg-primary/5 text-primary font-medium" : "text-muted-foreground hover:bg-muted/40"
                  )}
                >
                  <div className={cn("h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0", !groupId ? "border-primary" : "border-muted-foreground/40")}>
                    {!groupId && <div className="h-2 w-2 rounded-full bg-primary" />}
                  </div>
                  {t("students.noGroup")}
                </button>
                <div className="h-px bg-border/40 mx-2" />
                {filteredGroups.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">{t("groups.notFound")}</p>
                ) : filteredGroups.map((g) => {
                  const isFull = g.student_count >= g.max_students;
                  const isSelected = g.id === groupId;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      disabled={isFull && !isSelected}
                      onClick={() => { setGroupId(isSelected ? null : g.id); setGroupOpen(false); }}
                      className={cn(
                        "w-full text-left px-3 py-2.5 transition-colors flex items-center gap-3",
                        isSelected && "bg-primary/5",
                        !isSelected && !isFull && "hover:bg-muted/40",
                        isFull && !isSelected && "opacity-50 cursor-not-allowed",
                      )}
                    >
                      <div className={cn("h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0", isSelected ? "border-primary" : "border-muted-foreground/40")}>
                        {isSelected && <div className="h-2 w-2 rounded-full bg-primary" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{g.code}</span>
                          {isFull && (
                            <span className="text-[10px] font-semibold rounded bg-rose-100 text-rose-700 px-1.5 py-0.5 border border-rose-200">
                              {t("students.full")}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {expandDays(g.days as DaysType).map((d) => t(`day.short.${d}`)).join("/")} · {g.time_slot}
                          {g.teacher_name ? ` · ${g.teacher_name}` : ""}
                        </p>
                      </div>
                      <span className={cn("text-xs font-semibold shrink-0", isFull ? "text-rose-500" : "text-emerald-600")}>
                        {g.student_count}/{g.max_students}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Источник */}
          <div className="space-y-1.5">
            <Label>{t("students.source")}</Label>
            <div className="flex gap-2 flex-wrap">
              {([
                { value: "instagram",    label: t("students.srcInstagram") },
                { value: "telegram",     label: t("students.srcTelegram") },
                { value: "recommended",  label: t("students.srcRecommended") },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSource(source === opt.value ? null : opt.value)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                    source === opt.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-foreground bg-background hover:border-primary/60"
                  )}
                >
                  <span className={cn(
                    "inline-flex h-3.5 w-3.5 rounded-full border-2 items-center justify-center shrink-0",
                    source === opt.value ? "border-primary-foreground" : "border-muted-foreground/40"
                  )}>
                    {source === opt.value && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground block" />}
                  </span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cabinet credentials */}
          <div className="space-y-1.5 pt-2 border-t border-border/40">
            <Label htmlFor="student-password" className="flex items-center gap-1.5">
              {t("student.credentialsBlock")}
              {isEdit && editTarget?.has_credentials && (
                <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold uppercase text-success">
                  {t("student.credentialsSet")}
                </span>
              )}
            </Label>
            <PasswordInput
              id="student-password"
              autoComplete="new-password"
              placeholder={isEdit ? t("student.resetPassword") : t("student.setPassword")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={!phone.trim()}
            />
            <p className="text-[11px] text-muted-foreground">
              {phone.trim() ? t("student.credentialsHelper") : t("student.credentialsHelperNoPhone")}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-border/40">
            <Button variant="outline" onClick={onClose} disabled={isPending}>
              {t("students.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={!isValid || isPending} className="gap-1.5">
              {isPending
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />{t("students.saving")}</>
                : t(isEdit ? "students.save" : "students.addStudent")}
            </Button>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
