import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  addMonths, differenceInDays, differenceInMonths,
  eachDayOfInterval, format, getDay,
} from "date-fns";
import { ru as ruLocale, uz as uzLocale, enUS as enLocale } from "date-fns/locale";
import type { Locale } from "date-fns";
import {
  Search, Plus, MoreHorizontal, ChevronLeft, ChevronRight,
  Eye, Pencil, Trash2, Users, BookOpen, CalendarDays, CalendarIcon,
  ArrowUpDown, X, Loader2, AlertTriangle, CheckCircle2, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Input }              from "@/components/ui/input";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import { Button }             from "@/components/ui/button";
import { Label }              from "@/components/ui/label";
import { StatusBadge }        from "@/components/StatusBadge";
import { Breadcrumbs }        from "@/components/Breadcrumbs";
import { useLanguage }        from "@/hooks/use-language";
import { useAuth }            from "@/hooks/use-auth";
import { useDebouncedValue }  from "@/hooks/useDebouncedValue";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { GroupScheduleTimeSection } from "@/components/GroupScheduleTimeSection";

import {
  useGroups, useCreateGroup, useUpdateGroup, useDeleteGroup,
  expandDays, type GroupRead, type GroupStatus, type DaysType,
} from "@/hooks/use-groups";
import {
  useGroupConflicts,
  isConflictPayloadReady,
  type ConflictCheckPayload,
  type ConflictHit,
} from "@/hooks/use-group-conflicts";
import { useCourses }  from "@/hooks/use-courses";
import { useTeachers } from "@/hooks/use-teachers";
import { useRooms }    from "@/hooks/use-rooms";
import { conflictsFromError } from "@/lib/group-conflicts-from-error";

// ── Constants ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 8;

const SORT_KEYS = ["newest", "oldest", "az", "za", "most-students"] as const;

const STATUS_VALUES = ["active", "completed"] as const;

// ── Main component ─────────────────────────────────────────────────────────

const LOCALES: Record<string, Locale> = { ru: ruLocale, uz: uzLocale, en: enLocale };

export default function Groups() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const dfLocale = LOCALES[language] ?? enLocale;

  // ── Filters / pagination ───────────────────────────────────────────────
  const [search,        setSearch]        = useState("");
  const [statusFilter,  setStatusFilter]  = useState("all");
  const [courseFilter,  setCourseFilter]  = useState("all");
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [daysFilter,    setDaysFilter]    = useState("all");
  const [timeFilter,    setTimeFilter]    = useState("all");
  const [sortMode,      setSortMode]      = useState("newest");
  const [page,          setPage]          = useState(1);
  const debouncedSearch = useDebouncedValue(search, 300);

  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter, courseFilter, teacherFilter, daysFilter, timeFilter, sortMode]);  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter, courseFilter, sortMode]);

  // ── Dialogs ────────────────────────────────────────────────────────────
  const [addOpen,      setAddOpen]      = useState(false);
  const [editTarget,   setEditTarget]   = useState<GroupRead | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GroupRead | null>(null);

  // ── Form state ─────────────────────────────────────────────────────────
  const [fCode,      setFCode]      = useState("");
  const [fCourseId,  setFCourseId]  = useState("none");
  const [fTeacherId, setFTeacherId] = useState("none");
  const [fRoomId,    setFRoomId]    = useState("none");
  const [fDays,      setFDays]      = useState<DaysType>("odd");
  const [fStartTime, setFStartTime] = useState("09:00");
  const [fEndTime,   setFEndTime]   = useState("10:30");
  const [fPrice,     setFPrice]     = useState("1500000");
  const [fStatus,    setFStatus]    = useState<GroupStatus>("active");
  const [fStart,     setFStart]     = useState(format(new Date(), "yyyy-MM-dd"));
  const [fEnd,       setFEnd]       = useState(format(addMonths(new Date(), 3), "yyyy-MM-dd"));
  const [fDuration,  setFDuration]  = useState(3);

  // ── Date helpers ───────────────────────────────────────────────────────
  const handleDurationChange = (months: number) => {
    setFDuration(months);
    if (fStart) setFEnd(format(addMonths(new Date(fStart), months), "yyyy-MM-dd"));
  };

  const durationInfo = useMemo(() => {
    if (!fStart || !fEnd || fEnd <= fStart) return null;
    const start = new Date(fStart);
    const end = new Date(fEnd);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    const calendarDays = differenceInDays(end, start);
    const allowedDows = fDays === "odd" ? [1, 3, 5] : [2, 4, 6];
    const allDays = eachDayOfInterval({ start, end });
    const classDays = allDays.filter((d) => allowedDows.includes(getDay(d))).length;
    return { calendarDays, classDays };
  }, [fStart, fEnd, fDays]);

  function resetForm() {
    setFCode(""); setFCourseId("none"); setFTeacherId("none"); setFRoomId("none");
    setFDays("odd"); setFStartTime("09:00"); setFEndTime("10:30");
    setFPrice("1500000"); setFStatus("active"); setFDuration(3);
    setFStart(format(new Date(), "yyyy-MM-dd"));
    setFEnd(format(addMonths(new Date(), 3), "yyyy-MM-dd"));
  }

  function openAdd() {
    setEditTarget(null);
    resetForm();
    setAddOpen(true);
  }

  function openEdit(g: GroupRead) {
    setEditTarget(g);
    setFCode(g.code);
    setFCourseId(g.course_id ? String(g.course_id) : "none");
    setFTeacherId(g.teacher_id ? String(g.teacher_id) : "none");
    setFRoomId(g.room_id ? String(g.room_id) : "none");
    setFDays(g.days as DaysType);
    setFStartTime((g.start_time ?? "09:00:00").slice(0, 5));
    setFEndTime((g.end_time ?? "10:30:00").slice(0, 5));
    setFPrice(String(g.price));
    setFStatus(g.status as GroupStatus);
    setFDuration(g.duration_months);
    setFStart(g.start_date || format(new Date(), "yyyy-MM-dd"));
    setFEnd(g.end_date || format(addMonths(new Date(), 3), "yyyy-MM-dd"));
    setAddOpen(true);
  }

  function closeDialog() {
    setAddOpen(false);
    setEditTarget(null);
  }

  // ── API: main data ─────────────────────────────────────────────────────
  const baseParams = { limit: 1000 as const, sort: sortMode };
  const filterParams = {
    ...baseParams,
    ...(debouncedSearch   ? { search:     debouncedSearch }               : {}),
    ...(statusFilter  !== "all" ? { status:    statusFilter as GroupStatus }  : {}),
    ...(courseFilter  !== "all" ? { course_id: Number(courseFilter) }         : {}),
    ...(teacherFilter !== "all" ? { teacher_id: Number(teacherFilter) }       : {}),
  };

  const allQ  = useGroups(baseParams);
  const listQ = useGroups(filterParams);

  // ── API: reference data for dropdowns ──────────────────────────────────
  // /teachers list is admin-only on the backend — gate the query so non-admins
  // don't trigger 403s here. The list is only used inside the admin-only
  // create/edit dialog anyway.
  const courses  = useCourses({ limit: 1000, is_active: true }).data?.items  ?? [];
  const teachers = useTeachers({ limit: 1000 }, { enabled: isAdmin }).data?.items ?? [];
  const rooms    = useRooms({ limit: 1000 }).data?.items    ?? [];

  // ── KPI stats ──────────────────────────────────────────────────────────
  const allItems      = allQ.data?.items ?? [];
  const totalGroups   = allQ.data?.total ?? 0;
  const activeCount   = allItems.filter((g) => g.status === "active").length;
  const completedCount = allItems.filter((g) => g.status === "completed").length;
  const totalStudents  = allItems.reduce((s, g) => s + g.student_count, 0);

  // ── Table rows + pagination ────────────────────────────────────────────
  const rawRows    = listQ.data?.items ?? [];
  const rows       = rawRows
    .filter((g) => daysFilter === "all" || g.days === daysFilter)
    .filter((g) => timeFilter === "all" || g.time_slot === timeFilter);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const paged      = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Unique time_slot values for the filter dropdown
  const timeSlots = useMemo(() => {
    const set = new Set<string>();
    for (const g of (allQ.data?.items ?? [])) {
      if (g.time_slot) set.add(g.time_slot);
    }
    return [...set].sort();
  }, [allQ.data?.items]);

  // ── Mutations ──────────────────────────────────────────────────────────
  const createM = useCreateGroup();
  const updateM = useUpdateGroup();
  const deleteM = useDeleteGroup();

  // ── Live conflict preview (debounced) ──────────────────────────────────
  // Only an active group can clash with anything; a completed group's slot is
  // not enforced. Keep the payload null until the form is dialog-open and has
  // enough data to ask a meaningful question.
  const rawConflictPayload: ConflictCheckPayload | null = useMemo(() => {
    if (!addOpen || fStatus !== "active") return null;
    const teacherId = fTeacherId && fTeacherId !== "none" ? Number(fTeacherId) : null;
    const roomId    = fRoomId    && fRoomId    !== "none" ? Number(fRoomId)    : null;
    return {
      days: fDays,
      start_time: fStartTime,
      end_time: fEndTime,
      start_date: fStart,
      end_date: fEnd,
      teacher_id: teacherId,
      room_id: roomId,
      exclude_group_id: editTarget?.id ?? null,
    };
  }, [addOpen, fStatus, fDays, fStartTime, fEndTime, fStart, fEnd, fTeacherId, fRoomId, editTarget?.id]);

  const debouncedConflictPayload = useDebouncedValue(rawConflictPayload, 300);
  const conflictsQ = useGroupConflicts(debouncedConflictPayload);
  const liveConflicts = conflictsQ.data?.conflicts ?? [];
  const conflictsReady = isConflictPayloadReady(debouncedConflictPayload);
  const conflictsLoading =
    conflictsReady && (conflictsQ.isLoading || conflictsQ.isFetching);

  // ── Confirm dialog (force override) ────────────────────────────────────
  const [confirmConflicts, setConfirmConflicts] = useState<ConflictHit[] | null>(null);
  const [pendingForcePayload, setPendingForcePayload] = useState<{
    payload: ReturnType<typeof buildPayload> | null;
    isEdit: boolean;
    editId?: number;
  }>({ payload: null, isEdit: false });

  function buildPayload() {
    const roomId = fRoomId && fRoomId !== "none" ? Number(fRoomId) : null;
    const selectedRoom = roomId ? rooms.find((r) => r.id === roomId) : null;
    const maxStudents = selectedRoom?.capacity ?? (editTarget?.max_students ?? 15);
    return {
      code:            fCode.trim(),
      course_id:       fCourseId  && fCourseId  !== "none" ? Number(fCourseId)  : null,
      teacher_id:      fTeacherId && fTeacherId !== "none" ? Number(fTeacherId) : null,
      room_id:         roomId,
      days:            fDays,
      start_time:      fStartTime,
      end_time:        fEndTime,
      max_students:    maxStudents,
      price:           Number(fPrice)       || 0,
      duration_months: fDuration,
      start_date:      fStart,
      end_date:        fEnd,
      status:          fStatus,
    };
  }

  async function runMutation(
    payload: ReturnType<typeof buildPayload>,
    isEdit: boolean,
    editId: number | undefined,
    force: boolean,
  ) {
    if (isEdit && editId !== undefined) {
      await updateM.mutateAsync({ id: editId, data: payload, force });
      toast.success(t("groups.toastUpdated"));
    } else {
      await createM.mutateAsync({ data: payload, force });
      toast.success(t("groups.toastCreated"));
    }
    closeDialog();
  }

  async function submitForm() {
    if (!fCode.trim()) { toast.error(t("groups.errorEnterCode")); return; }
    if (!fStartTime || !fEndTime) { toast.error(t("groups.selectTime")); return; }
    if (fEndTime <= fStartTime)   { toast.error(t("groups.invalidTimeRange")); return; }
    if (!fStart || !fEnd) { toast.error(t("groups.errorEnterDates")); return; }

    const payload = buildPayload();
    const isEdit = !!editTarget;
    const editId = editTarget?.id;

    // Pre-flight: if the live preview already reports conflicts, don't even
    // try the server — open the confirm dialog first. This avoids a wasted
    // round-trip on the common case.
    if (liveConflicts.length > 0) {
      setPendingForcePayload({ payload, isEdit, editId });
      setConfirmConflicts(liveConflicts);
      return;
    }

    try {
      await runMutation(payload, isEdit, editId, false);
    } catch (e) {
      // Race condition: live preview was clean, but conflict slipped in
      // between debounce and POST. Fall back to the same confirm dialog.
      const conflicts = conflictsFromError(e);
      if (conflicts) {
        setPendingForcePayload({ payload, isEdit, editId });
        setConfirmConflicts(conflicts);
        return;
      }
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  }

  async function submitForceForm() {
    const { payload, isEdit, editId } = pendingForcePayload;
    if (!payload) return;
    setConfirmConflicts(null);
    setPendingForcePayload({ payload: null, isEdit: false });
    try {
      await runMutation(payload, isEdit, editId, true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  }

  async function submitDelete() {
    if (!deleteTarget) return;
    try {
      await deleteM.mutateAsync(deleteTarget.id);
      toast.success(t("groups.toastDeleted").replace("{{code}}", deleteTarget.code));
      setDeleteTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  }

  // ── i18n helpers ───────────────────────────────────────────────────────
  const statusLabel = (v: string) => {
    switch (v) {
      case "active":    return t("groups.statusActiveLabel");
      case "completed": return t("groups.statusCompletedLabel");
      default:          return v;
    }
  };
  const sortLabel = (k: string) => {
    switch (k) {
      case "newest":        return t("groups.sortNewest");
      case "oldest":        return t("groups.sortOldest");
      case "az":            return t("groups.sortAZ");
      case "za":            return t("groups.sortZA");
      case "most-students": return t("groups.sortMostStudents");
      default:              return k;
    }
  };

  // ── Active filter badges ───────────────────────────────────────────────
  const activeFilters: { key: string; label: string; onClear: () => void }[] = [];
  if (courseFilter !== "all") {
    const name = courses.find((c) => String(c.id) === courseFilter)?.name ?? courseFilter;
    activeFilters.push({ key: "course", label: `${t("groups.course")}: ${name}`, onClear: () => setCourseFilter("all") });
  }
  if (statusFilter !== "all") {
    activeFilters.push({ key: "status", label: `${t("groups.status")}: ${statusLabel(statusFilter)}`, onClear: () => setStatusFilter("all") });
  }
  if (teacherFilter !== "all") {
    const teacher = teachers.find((tc) => String(tc.id) === teacherFilter);
    const tName = teacher ? `${teacher.last_name} ${teacher.first_name}` : teacherFilter;
    activeFilters.push({ key: "teacher", label: `${t("groups.teacher")}: ${tName}`, onClear: () => setTeacherFilter("all") });
  }
  if (daysFilter !== "all") {
    const dLabel = daysFilter === "odd" ? t("groups.daysOdd") : t("groups.daysEven");
    activeFilters.push({ key: "days", label: `${t("groups.days")}: ${dLabel}`, onClear: () => setDaysFilter("all") });
  }
  if (timeFilter !== "all") {
    activeFilters.push({ key: "time", label: `${t("groups.timeSlot")}: ${timeFilter}`, onClear: () => setTimeFilter("all") });
  }

  function resetAllFilters() {
    setSearch(""); setCourseFilter("all"); setStatusFilter("all");
    setTeacherFilter("all"); setDaysFilter("all"); setTimeFilter("all"); setPage(1);
  }

  const fillPct = (s: number, m: number) => (m > 0 ? Math.round((s / m) * 100) : 0);
  const isPending = createM.isPending || updateM.isPending;

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 sm:space-y-6">
      <Breadcrumbs items={[{ label: t("sidebar.groups") }]} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{t("groups.title")}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t("groups.subtitle")}</p>
        </div>
        {isAdmin && (
          <Button className="gap-2 self-start sm:self-auto" size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4" /> {t("groups.addGroup")}
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {[
          { label: t("groups.totalGroups"),           value: totalGroups,    icon: BookOpen,    color: "text-primary"           },
          { label: t("groups.activeGroups"),           value: activeCount,    icon: Users,       color: "text-emerald-600"       },
          { label: t("groups.completedLabel"),         value: completedCount, icon: CalendarDays, color: "text-muted-foreground" },
          { label: t("groups.totalStudentsInGroups"),  value: totalStudents,  icon: Users,       color: "text-accent-foreground" },
        ].map((s, i) => (
          <div key={s.label} className="rounded-xl border border-border/60 bg-card p-3 sm:p-4 shadow-sm animate-fade-in" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="flex items-center gap-1.5 mb-1">
              <s.icon className={`h-4 w-4 ${s.color}`} />
              <span className="text-[10px] sm:text-xs text-muted-foreground">{s.label}</span>
            </div>
            <p className="text-xl sm:text-2xl font-bold">
              {allQ.isLoading ? "…" : s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Filters — flat single row */}
      <div className="stat-card space-y-3">
        <div className="flex flex-col lg:flex-row gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("groups.searchPlaceholder")} className="pl-9 h-9 text-sm"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          {/* Teacher */}
          {isAdmin && (
            <Select value={teacherFilter} onValueChange={setTeacherFilter}>
              <SelectTrigger className="w-full lg:w-44 h-9 text-sm"><SelectValue placeholder={t("groups.allTeachers")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("groups.allTeachers")}</SelectItem>
                {teachers.map((tc) => (
                  <SelectItem key={tc.id} value={String(tc.id)}>
                    {[tc.last_name, tc.first_name].filter(Boolean).join(" ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Course */}
          <Select value={courseFilter} onValueChange={setCourseFilter}>
            <SelectTrigger className="w-full lg:w-44 h-9 text-sm"><SelectValue placeholder={t("groups.allCourses")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("groups.allCourses")}</SelectItem>
              {courses.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Days */}
          <Select value={daysFilter} onValueChange={setDaysFilter}>
            <SelectTrigger className="w-full lg:w-40 h-9 text-sm"><SelectValue placeholder={t("groups.lessonDays")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("groups.lessonDays")}</SelectItem>
              <SelectItem value="odd">{t("groups.daysOdd")}</SelectItem>
              <SelectItem value="even">{t("groups.daysEven")}</SelectItem>
            </SelectContent>
          </Select>

          {/* Time slot */}
          <Select value={timeFilter} onValueChange={setTimeFilter}>
            <SelectTrigger className="w-full lg:w-40 h-9 text-sm"><SelectValue placeholder={t("groups.timeSlot")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("groups.timeSlot")}</SelectItem>
              {timeSlots.map((ts) => <SelectItem key={ts} value={ts}>{ts}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Status */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full lg:w-36 h-9 text-sm"><SelectValue placeholder={t("groups.allStatuses")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("groups.allStatuses")}</SelectItem>
              {STATUS_VALUES.map((v) => <SelectItem key={v} value={v}>{statusLabel(v)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Active badges row */}
        {(activeFilters.length > 0 || search) && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {activeFilters.map((f) => (
              <span key={f.key} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 text-xs font-medium">
                {f.label}
                <button onClick={() => { f.onClear(); setPage(1); }}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {activeFilters.length > 0 && (
              <Button variant="ghost" size="sm"
                className="h-6 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={resetAllFilters}>
                {t("groups.resetAll")}
              </Button>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {t("groups.foundLabel")}: <span className="font-semibold text-foreground">{rows.length}</span> {t("groups.groupsUnit")}
            </span>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="stat-card p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="font-semibold">{t("filter.group")}</TableHead>
              <TableHead className="font-semibold hidden sm:table-cell">{t("groups.course")}</TableHead>
              <TableHead className="font-semibold hidden md:table-cell">{t("groups.teacher")}</TableHead>
              <TableHead className="font-semibold">{t("groups.studentsCol")}</TableHead>
              <TableHead className="font-semibold hidden lg:table-cell">{t("groups.days")}</TableHead>
              <TableHead className="font-semibold hidden lg:table-cell">{t("groups.timeSlot")}</TableHead>
              <TableHead className="font-semibold">{t("groups.status")}</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQ.isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-sm">{t("groups.loading")}</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Search className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">{t("groups.notFound")}</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : paged.map((g, i) => {
              const expanded = expandDays(g.days as DaysType);
              const pct = fillPct(g.student_count, g.max_students);
              return (
                <TableRow key={g.id} className="animate-fade-in cursor-pointer transition-colors hover:bg-muted/30"
                  style={{ animationDelay: `${i * 30}ms` }}
                  onClick={() => navigate(`/groups/${g.id}`)}>
                  <TableCell>
                    <p className="text-sm font-semibold">{g.code}</p>
                    <p className="text-xs text-muted-foreground sm:hidden truncate max-w-[180px]">{g.course_name ?? "—"}</p>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm">{g.course_name ?? "—"}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm">{g.teacher_name ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full transition-all",
                          pct >= 90 ? "bg-destructive" : pct >= 70 ? "bg-amber-500" : "bg-primary"
                        )} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground">{g.student_count}/{g.max_students}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="flex gap-1 flex-wrap">
                      {expanded.map((d) => (
                        <span key={d} className="text-[10px] font-medium bg-muted px-1.5 py-0.5 rounded">{t(`day.short.${d}`)}</span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm">{g.time_slot}</TableCell>
                  <TableCell><StatusBadge status={g.status} /></TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(`/groups/${g.id}`)}>
                          <Eye className="h-3.5 w-3.5 mr-2" /> {t("groups.view")}
                        </DropdownMenuItem>
                        {isAdmin && (
                          <>
                            <DropdownMenuItem onClick={() => openEdit(g)}>
                              <Pencil className="h-3.5 w-3.5 mr-2" /> {t("groups.edit")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteTarget(g)}>
                              <Trash2 className="h-3.5 w-3.5 mr-2" /> {t("groups.delete")}
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
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, rows.length)} {t("groups.pageOf")} {rows.length}
            </p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-3 w-3" /> {t("groups.pageBack")}
              </Button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => (
                <Button key={i} variant={page === i + 1 ? "default" : "outline"} size="icon" className="h-7 w-7 text-xs" onClick={() => setPage(i + 1)}>
                  {i + 1}
                </Button>
              ))}
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                {t("groups.pageNext")} <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Add / Edit Dialog ─────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? t("groups.editTitle") : t("groups.addGroup")}
            </DialogTitle>
            <DialogDescription>
              {editTarget ? `${t("groups.editingLabel")} ${editTarget.code}` : t("groups.fillData")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Code + Course */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("groups.groupName")}</Label>
                <Input placeholder={t("groups.namePlaceholder")} value={fCode} onChange={(e) => setFCode(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("groups.course")}</Label>
                <Select value={fCourseId} onValueChange={setFCourseId}>
                  <SelectTrigger><SelectValue placeholder={t("groups.selectCourse")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("groups.noCourse")}</SelectItem>
                    {courses.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Teacher + Days */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("groups.teacher")}</Label>
                <Select value={fTeacherId} onValueChange={setFTeacherId}>
                  <SelectTrigger><SelectValue placeholder={t("groups.selectTeacher")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("groups.noTeacher")}</SelectItem>
                    {teachers.map((tc) => (
                      <SelectItem key={tc.id} value={String(tc.id)}>
                        {[tc.last_name, tc.first_name].filter(Boolean).join(" ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("groups.days")}</Label>
                <Select value={fDays} onValueChange={(v) => setFDays(v as DaysType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="odd">{t("groups.daysOdd")}</SelectItem>
                    <SelectItem value="even">{t("groups.daysEven")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <GroupScheduleTimeSection
              startTime={fStartTime}
              endTime={fEndTime}
              onStartChange={setFStartTime}
              onEndChange={setFEndTime}
              invalidRange={Boolean(fEndTime && fStartTime && fEndTime <= fStartTime)}
            />

            <div className="space-y-1.5">
              <Label>{t("groups.room")}</Label>
              <Select value={fRoomId} onValueChange={setFRoomId}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder={t("groups.selectRoom")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("groups.noRoom")}</SelectItem>
                  {rooms.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Price */}
            <div className="space-y-1.5">
              <Label>{t("groups.priceLabel")}</Label>
              <div className="relative">
                <FormattedNumberInput
                  placeholder="1500000"
                  className="pr-12"
                  value={fPrice ? Number(fPrice) : null}
                  onValueChange={(value) => setFPrice(value == null ? "" : String(value))}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">UZS</span>
              </div>
              {(() => {
                const selected = fRoomId && fRoomId !== "none" ? rooms.find((r) => r.id === Number(fRoomId)) : null;
                return selected ? (
                  <p className="text-xs text-muted-foreground">
                    {t("groups.roomCapacity")} «{selected.name}»:{" "}
                    <span className="font-semibold text-foreground">{selected.capacity}</span> {t("groups.learnersUnit")}
                  </p>
                ) : null;
              })()}
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("groups.startDate")}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "w-full h-9 justify-start text-left font-normal",
                        !fStart && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {fStart ? format(new Date(fStart), "dd MMMM yyyy", { locale: dfLocale }) : t("groups.selectDate")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={fStart ? new Date(fStart) : undefined}
                      onSelect={(d) => {
                        if (!d) return;
                        const val = format(d, "yyyy-MM-dd");
                        setFStart(val);
                        setFEnd(format(addMonths(d, fDuration), "yyyy-MM-dd"));
                      }}
                      initialFocus
                      locale={dfLocale}
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label>{t("groups.endDate")}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "w-full h-9 justify-start text-left font-normal",
                        !fEnd && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {fEnd ? format(new Date(fEnd), "dd MMMM yyyy", { locale: dfLocale }) : t("groups.selectDate")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={fEnd ? new Date(fEnd) : undefined}
                      onSelect={(d) => {
                        if (!d) return;
                        const val = format(d, "yyyy-MM-dd");
                        setFEnd(val);
                        if (fStart && val > fStart) {
                          const m = differenceInMonths(d, new Date(fStart));
                          if (m > 0) setFDuration(m);
                        }
                      }}
                      disabled={(date) => fStart ? date < new Date(fStart) : false}
                      initialFocus
                      locale={dfLocale}
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Duration + Status */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("groups.duration")}</Label>
                <Select value={String(fDuration)} onValueChange={(v) => handleDurationChange(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((m) => (
                      <SelectItem key={m} value={String(m)}>{m} {t("groups.durationUnit")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("groups.status")}</Label>
                <Select value={fStatus} onValueChange={(v) => setFStatus(v as GroupStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_VALUES.map((v) => (
                      <SelectItem key={v} value={v}>{statusLabel(v)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Info summary */}
            {durationInfo && (
              <div className="space-y-1.5 rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  📅 {t("groups.calendarDays")}: <span className="font-semibold text-foreground">{durationInfo.calendarDays}</span>
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  📚 {t("groups.classDays")}: <span className="font-semibold text-primary">{durationInfo.classDays}</span>
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  ⏱ {t("groups.totalDuration")}: <span className="font-semibold text-foreground">{fDuration} {t("groups.durationUnit")}</span>
                </p>
              </div>
            )}

            <ConflictsBanner
              ready={conflictsReady}
              loading={conflictsLoading}
              conflicts={liveConflicts}
              onOpenGroup={(id) => navigate(`/groups/${id}`)}
              t={t}
              dfLocale={dfLocale}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>{t("groups.cancel")}</Button>
            <Button
              onClick={submitForm}
              disabled={isPending}
              className={cn(
                liveConflicts.length > 0 &&
                  "bg-amber-600 hover:bg-amber-600/90 text-white",
              )}
            >
              {isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t("groups.saving")}</>
                : liveConflicts.length > 0
                  ? <><AlertTriangle className="h-4 w-4 mr-2" /> {t("conflicts.saveAnywayShort")}</>
                  : editTarget ? t("groups.save") : t("groups.addGroup")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Dialog ─────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("groups.deleteQ")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? t("groups.deleteDesc").replace("{name}", `«${deleteTarget.code}»`)
                : t("groups.deleteDesc").replace("{name}", "")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("groups.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={submitDelete} disabled={deleteM.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteM.isPending ? t("groups.deleting") : t("groups.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Conflict confirm dialog ───────────────────────────────────── */}
      <AlertDialog
        open={confirmConflicts !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmConflicts(null);
            setPendingForcePayload({ payload: null, isEdit: false });
          }
        }}
      >
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              {t("conflicts.confirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("conflicts.confirmDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="max-h-[40vh] overflow-y-auto space-y-2 rounded-md border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/60 dark:bg-amber-950/30">
            {(confirmConflicts ?? []).map((c, i) => (
              <ConflictRow
                key={`${c.kind}-${c.group_id}-${i}`}
                hit={c}
                t={t}
                dfLocale={dfLocale}
                onOpen={() => {
                  setConfirmConflicts(null);
                  setPendingForcePayload({ payload: null, isEdit: false });
                  closeDialog();
                  navigate(`/groups/${c.group_id}`);
                }}
              />
            ))}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>{t("conflicts.fixForm")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={submitForceForm}
              disabled={isPending}
              className="bg-amber-600 hover:bg-amber-600/90 text-white"
            >
              {isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t("groups.saving")}</>
                : t("conflicts.saveAnyway")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Sub-components (kept local to avoid ballooning files) ──────────────────

interface ConflictsBannerProps {
  ready: boolean;
  loading: boolean;
  conflicts: ConflictHit[];
  onOpenGroup: (id: number) => void;
  t: (key: string) => string;
  dfLocale: Locale;
}

function ConflictsBanner({
  ready, loading, conflicts, onOpenGroup, t, dfLocale,
}: ConflictsBannerProps) {
  if (!ready) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
        {t("conflicts.fillToCheck")}
      </div>
    );
  }
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {t("conflicts.checking")}
      </div>
    );
  }
  if (conflicts.length === 0) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
        <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
        <span className="font-medium">{t("conflicts.none")}</span>
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50/80 p-3 dark:border-amber-900/60 dark:bg-amber-950/40">
      <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="text-xs font-semibold uppercase tracking-wide">
          {t("conflicts.title")} · {conflicts.length}
        </span>
      </div>
      <div className="space-y-1.5">
        {conflicts.map((c, i) => (
          <ConflictRow
            key={`${c.kind}-${c.group_id}-${i}`}
            hit={c}
            t={t}
            dfLocale={dfLocale}
            onOpen={() => onOpenGroup(c.group_id)}
          />
        ))}
      </div>
    </div>
  );
}

interface ConflictRowProps {
  hit: ConflictHit;
  t: (key: string) => string;
  dfLocale: Locale;
  onOpen: () => void;
}

function ConflictRow({ hit, t, dfLocale, onOpen }: ConflictRowProps) {
  const daysLabel =
    hit.days === "odd" ? t("groups.daysOdd") : t("groups.daysEven");
  const time = `${hit.start_time.slice(0, 5)}–${hit.end_time.slice(0, 5)}`;
  const overlap = `${format(new Date(hit.overlap_start), "dd MMM", { locale: dfLocale })} – ${format(new Date(hit.overlap_end), "dd MMM yyyy", { locale: dfLocale })}`;
  const reasonKey = hit.kind === "teacher" ? "conflicts.teacherBusy" : "conflicts.roomBusy";
  const subject =
    hit.kind === "teacher" ? (hit.teacher_name ?? "—") : (hit.room_name ?? "—");
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-md bg-background/80 border border-border/60 px-2.5 py-2 text-xs">
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span className={cn(
            "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            hit.kind === "teacher"
              ? "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200"
              : "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200",
          )}>
            {t(reasonKey)}
          </span>
          <span className="font-medium text-foreground truncate">{subject}</span>
        </div>
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">{hit.group_code}</span>
          {" · "}
          {daysLabel} {time}
          {" · "}
          {t("conflicts.overlap")}: {overlap}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs gap-1 self-start sm:self-auto"
        onClick={onOpen}
      >
        <ExternalLink className="h-3 w-3" />
        {t("conflicts.openGroup")}
      </Button>
    </div>
  );
}
