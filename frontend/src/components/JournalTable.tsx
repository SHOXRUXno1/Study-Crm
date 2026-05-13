import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  format, isSameDay, isBefore, isAfter, startOfMonth, endOfMonth,
  subMonths, startOfWeek, endOfWeek, addDays, parseISO,
} from "date-fns";
import { ru, enUS, uz } from "date-fns/locale";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router-dom";
import {
  Check, X, Clock, FileText, User, DollarSign, AlertTriangle,
  Search, ChevronLeft, ChevronRight, MessageSquare,
  Users, BookOpen, CalendarDays, BarChart3, BarChart2, TrendingUp,
  CheckCircle2, XCircle, CalendarCheck, Filter, CalendarRange,
  ChevronDown, TrendingDown, Minus, GraduationCap, RotateCcw, CircleDollarSign,
  Loader2, Square,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip, TooltipContent, TooltipTrigger, TooltipProvider,
} from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";

import { type GroupRead, expandDays, type DaysType } from "@/hooks/use-groups";
import {
  useGroupJournal,
  useUpsertAttendance,
  useDeleteAttendance,
  type AbsenceReasonCode,
  type AttendanceStatus,
  type JournalLesson,
  type JournalMark,
} from "@/hooks/use-attendance";
import { useUpdateLessonJournal } from "@/hooks/use-schedule";
import { ExportActionButton } from "@/components/export/ExportActionButton";
import { ExportCenter } from "@/components/export/ExportCenter";
import {
  buildUnifiedExportFileName,
  runCsvExport,
  runExportTask,
  type ExportFilterSummaryItem,
  type ExportPhase,
} from "@/lib/export";

// ── Types ────────────────────────────────────────────────────────────────────

type ViewMode = "month" | "week" | "today";

interface JournalTableProps {
  selectedGroupId: number | null;
  onGroupChange: (id: number) => void;
  groups: GroupRead[];
  isLoadingGroups: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const courseColorOf = (course: string | null | undefined): string => {
  if (!course) return "hsl(234 62% 50%)";
  const map: Record<string, string> = {
    English: "hsl(152 60% 42%)",
    Grammar: "hsl(280 60% 55%)",
    "Pre-IELTS": "hsl(190 70% 45%)",
    "KIDS' English": "hsl(340 75% 55%)",
    IELTS: "hsl(234 62% 50%)",
    CEFR: "hsl(0 72% 55%)",
    /** Legacy labels (older API / cached data) */
    "IELTS Preparation": "hsl(234 62% 50%)",
    "General English B2": "hsl(160 60% 42%)",
    "Business English": "hsl(38 90% 50%)",
    "Grammar & Writing": "hsl(280 60% 55%)",
    "Speaking & Pronunciation": "hsl(190 70% 45%)",
    "Kids English (A1–A2)": "hsl(340 75% 55%)",
  };
  if (map[course]) return map[course];
  // Stable hue from name hash
  let h = 0;
  for (let i = 0; i < course.length; i++) h = (h * 31 + course.charCodeAt(i)) % 360;
  return `hsl(${h} 65% 48%)`;
};

const fullName = (s: { full_name: string }) => s.full_name;

// ── Component ────────────────────────────────────────────────────────────────

export function JournalTable({
  selectedGroupId,
  onGroupChange,
  groups,
  isLoadingGroups,
}: JournalTableProps) {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const isTeacher = user?.role === "teacher";
  const isManager = user?.role === "manager";
  const dfLocale = language === "ru" ? ru : language === "uz" ? uz : enUS;
  const navigate = useNavigate();
  // Tracks the current calendar day. Re-evaluated every minute so the journal
  // shows the correct "today" highlight even if the tab stays open across
  // midnight (rather than being frozen to the moment the component mounted).
  const [today, setToday] = useState<Date>(() => new Date());
  const todayKey = format(today, "yyyy-MM-dd");

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setToday((prev) =>
        format(prev, "yyyy-MM-dd") === format(now, "yyyy-MM-dd") ? prev : now,
      );
    };
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  // ── Local UI state ─────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [currentDate, setCurrentDate] = useState<Date>(today);
  const [searchQuery, setSearchQuery] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<"all" | "paid" | "debt">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | AttendanceStatus>("all");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportPhase, setExportPhase] = useState<ExportPhase>("idle");

  const [hoveredCol, setHoveredCol] = useState<string | null>(null);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(currentDate.getFullYear());

  // Modals
  const [absentTarget, setAbsentTarget] = useState<{ lesson: JournalLesson; studentId: number } | null>(null);
  const [absentReason, setAbsentReason] = useState<AbsenceReasonCode>("none");
  const [absentNote, setAbsentNote] = useState("");

  const [lateTarget, setLateTarget] = useState<{ lesson: JournalLesson; studentId: number } | null>(null);
  const [lateMinutes, setLateMinutes] = useState("10");

  const [lessonDetail, setLessonDetail] = useState<JournalLesson | null>(null);
  const [topicDraft, setTopicDraft] = useState({ topic: "", notes: "" });

  // Active cell — opens the inline status picker (floating panel with 4 options).
  const [activeCell, setActiveCell] = useState<{ studentId: number; dateKey: string } | null>(null);
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  // Prevents the picker from immediately reopening when the click event from a
  // picker button "falls through" to the underlying <td> after the portal unmounts.
  const pickerJustClosed = useRef(false);

  const openPicker = useCallback((studentId: number, dateKey: string, td: HTMLElement) => {
    if (pickerJustClosed.current) return;
    const rect = td.getBoundingClientRect();
    setPickerPos({ top: rect.top - 4, left: rect.left + rect.width / 2 });
    setActiveCell({ studentId, dateKey });
  }, []);

  const closePicker = useCallback(() => {
    setActiveCell(null);
    pickerJustClosed.current = true;
    setTimeout(() => { pickerJustClosed.current = false; }, 200);
  }, []);

  useEffect(() => {
    if (!activeCell) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setActiveCell(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeCell]);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setPickerYear(currentDate.getFullYear()); }, [currentDate]);

  // ── Group navigation ────────────────────────────────────────────────────
  const visibleGroups = useMemo(
    () => groups.filter((g) => g.status === "active"),
    [groups],
  );
  const navList = visibleGroups.length > 0 ? visibleGroups : groups;
  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === selectedGroupId) ?? null,
    [groups, selectedGroupId],
  );
  const groupIndex = navList.findIndex((g) => g.id === selectedGroupId);

  const goPrevGroup = () => {
    if (navList.length === 0) return;
    const next = (groupIndex - 1 + navList.length) % navList.length;
    onGroupChange(navList[next].id);
  };
  const goNextGroup = () => {
    if (navList.length === 0) return;
    const next = (groupIndex + 1) % navList.length;
    onGroupChange(navList[next].id);
  };

  // ── Server data ─────────────────────────────────────────────────────────
  const journalQ = useGroupJournal(selectedGroupId);
  const journal = journalQ.data;

  const allLessons = journal?.lessons ?? [];
  const lessonByDate = useMemo(() => {
    const m = new Map<string, JournalLesson>();
    allLessons.forEach((l) => m.set(l.lesson_date, l));
    return m;
  }, [allLessons]);

  type RosterStudent = {
    id: number; name: string;
    paymentStatus: "paid" | "debt";
  };

  const students = useMemo<RosterStudent[]>(
    () => (journal?.students ?? []).map((s) => ({
      id: s.id,
      name: fullName(s),
      paymentStatus: (s.payment_status as RosterStudent["paymentStatus"]) ?? "paid",
    })),
    [journal],
  );

  const marks = journal?.marks ?? {};

  const getMark = useCallback((studentId: number, dateKey: string): JournalMark | null => {
    const lesson = lessonByDate.get(dateKey);
    if (!lesson) return null;
    return marks[studentId]?.[lesson.id] ?? null;
  }, [marks, lessonByDate]);

  // ── Visible window (filter all_lessons by view+currentDate) ─────────────
  const visibleLessons = useMemo(() => {
    let s: Date, e: Date;
    if (viewMode === "today") { s = today; e = today; }
    else if (viewMode === "week") {
      s = startOfWeek(currentDate, { weekStartsOn: 1 });
      e = endOfWeek(currentDate, { weekStartsOn: 1 });
    } else {
      s = startOfMonth(currentDate);
      e = endOfMonth(currentDate);
    }
    return allLessons.filter((l) => {
      const d = parseISO(l.lesson_date);
      return !isBefore(d, s) && !isAfter(d, e);
    });
  }, [allLessons, viewMode, currentDate, today]);

  const visibleDates = useMemo(
    () => visibleLessons.map((l) => parseISO(l.lesson_date)),
    [visibleLessons],
  );

  // ── Filtered students ──────────────────────────────────────────────────
  const filteredStudents = useMemo(() => {
    let result = students;
    const q = searchQuery.trim().toLowerCase();
    if (q) result = result.filter((s) => s.name.toLowerCase().includes(q));
    if (paymentFilter !== "all") {
      result = result.filter((s) => s.paymentStatus === paymentFilter);
    }
    if (statusFilter !== "all") {
      const pastLessons = allLessons.filter((l) => parseISO(l.lesson_date) <= today);
      result = result.filter((s) =>
        pastLessons.some((l) => marks[s.id]?.[l.id]?.status === statusFilter),
      );
    }
    return result;
  }, [students, searchQuery, paymentFilter, statusFilter, allLessons, marks, today]);

  // ── Stats from server (server already excludes future / cancelled / rescheduled) ──
  const studentStatsById = useMemo(() => {
    const m = new Map<number, { present: number; late: number; absent: number; excused: number; total: number; rate_pct: number }>();
    (journal?.stats ?? []).forEach((s) => m.set(s.student_id, s));
    return m;
  }, [journal]);

  const overallRate = journal?.overall_rate_pct ?? 0;

  // Aggregate visible counts (over all students × past lessons in loaded slice)
  const aggregate = useMemo(() => {
    let totalPresent = 0, totalAbsent = 0, totalLate = 0, totalCells = 0, atRisk = 0;
    students.forEach((s) => {
      const st = studentStatsById.get(s.id);
      if (!st) return;
      totalPresent += st.present;
      totalLate    += st.late;
      totalAbsent  += st.absent;
      totalCells   += st.total;
      if (st.total > 0 && (st.present + st.late) / st.total < 0.7) atRisk++;
    });
    return { totalPresent, totalAbsent, totalLate, totalCells, atRisk };
  }, [students, studentStatsById]);

  // ── Critical streaks (3+ consecutive absences) ─────────────────────────
  const criticalStudents = useMemo(() => {
    const past = allLessons
      .filter((l) => parseISO(l.lesson_date) <= today)
      .filter((l) => l.status !== "rescheduled" && l.status !== "cancelled")
      .sort((a, b) => a.lesson_date.localeCompare(b.lesson_date));
    return students
      .map((s) => {
        let max = 0, streak = 0;
        past.forEach((l) => {
          const v = marks[s.id]?.[l.id]?.status;
          if (v === "absent") { streak++; max = Math.max(max, streak); }
          else streak = 0;
        });
        return max >= 3 ? { id: s.id, name: s.name, streak: max } : null;
      })
      .filter((x): x is { id: number; name: string; streak: number } => Boolean(x));
  }, [students, allLessons, marks, today]);

  // ── Mutations ──────────────────────────────────────────────────────────
  const upsertM = useUpsertAttendance();
  const deleteM = useDeleteAttendance();
  const updateJournalM = useUpdateLessonJournal();

  const setMark = useCallback(
    (lesson: JournalLesson, studentId: number, payload: {
      status: AttendanceStatus;
      late_minutes?: number | null;
      reason_code?: AbsenceReasonCode | null;
      reason_text?: string | null;
    }) => {
      upsertM.mutate({
        lessonId: lesson.id,
        marks: [{ student_id: studentId, ...payload }],
      });
    },
    [upsertM],
  );

  const clearMark = useCallback(
    (lessonId: number, studentId: number) => {
      deleteM.mutate({ lessonId, studentId });
    },
    [deleteM],
  );

  const handleSaveAbsent = () => {
    if (!absentTarget) return;
    setMark(absentTarget.lesson, absentTarget.studentId, {
      status: "absent",
      reason_code: absentReason,
      reason_text: absentReason === "other" ? absentNote || null : null,
    });
    setAbsentTarget(null);
  };

  const handleSaveLate = () => {
    if (!lateTarget) return;
    const mins = Math.max(0, Math.min(240, parseInt(lateMinutes, 10) || 0));
    setMark(lateTarget.lesson, lateTarget.studentId, {
      status: "late",
      late_minutes: mins,
    });
    setLateTarget(null);
  };

  const handleMarkAllPresent = () => {
    const lesson = lessonByDate.get(todayKey);
    if (!lesson) return;
    const payload = students
      .filter((s) => !getMark(s.id, todayKey))
      .map((s) => ({ student_id: s.id, status: "present" as AttendanceStatus }));
    if (payload.length === 0) return;
    upsertM.mutate({ lessonId: lesson.id, marks: payload });
  };

  // ── Lesson detail modal sync ──────────────────────────────────────────
  useEffect(() => {
    if (lessonDetail) {
      // Pull current topic/notes from cached schedule lesson if available, else empty.
      // We don't have it in the journal payload, so we re-fetch via PATCH-back. Simplest:
      // start with what we know (topic from JournalLesson), notes blank.
      setTopicDraft({ topic: lessonDetail.topic ?? "", notes: "" });
    }
  }, [lessonDetail]);

  const saveTopicForLesson = async () => {
    if (!lessonDetail) return;
    try {
      await updateJournalM.mutateAsync({
        id: lessonDetail.id,
        data: { topic: topicDraft.topic || null, notes: topicDraft.notes || null },
      });
      toast.success(t("journal.topicSaved"));
      setLessonDetail(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  };

  // ── Period nav ─────────────────────────────────────────────────────────
  const goPrev = () => {
    if (viewMode === "month") setCurrentDate((d) => subMonths(d, 1));
    else if (viewMode === "week") setCurrentDate((d) => addDays(d, -7));
    else setCurrentDate((d) => addDays(d, -1));
  };
  const goNext = () => {
    if (viewMode === "month") setCurrentDate((d) => { const n = new Date(d); n.setMonth(n.getMonth() + 1); return n; });
    else if (viewMode === "week") setCurrentDate((d) => addDays(d, 7));
    else setCurrentDate((d) => addDays(d, 1));
  };

  // ── Auto-scroll to "today" column when group/view changes ─────────────
  useEffect(() => {
    requestAnimationFrame(() => {
      const container = scrollRef.current;
      if (!container) return;
      const todayCol = container.querySelector('[data-today="true"]') as HTMLElement | null;
      if (todayCol) {
        const offset = todayCol.offsetLeft - container.clientWidth / 2 + todayCol.offsetWidth / 2;
        container.scrollTo({ left: Math.max(0, offset), behavior: "smooth" });
      }
    });
  }, [selectedGroupId, viewMode, currentDate, visibleLessons.length]);

  // ── Period label ───────────────────────────────────────────────────────
  const periodLabel = useMemo(() => {
    if (viewMode === "today") return format(currentDate, "EEEE, d MMMM yyyy", { locale: dfLocale });
    if (viewMode === "week") {
      const ws = startOfWeek(currentDate, { weekStartsOn: 1 });
      const we = endOfWeek(currentDate, { weekStartsOn: 1 });
      return `${format(ws, "d MMM", { locale: dfLocale })} — ${format(we, "d MMM yyyy", { locale: dfLocale })}`;
    }
    return format(currentDate, "LLLL yyyy", { locale: dfLocale });
  }, [currentDate, viewMode, dfLocale]);

  const todayLesson = lessonByDate.get(todayKey);

  // ── Cell renderer ─────────────────────────────────────────────────────
  const renderCell = (mark: JournalMark | null, isFuture: boolean, lessonStatus: string) => {
    if (lessonStatus === "cancelled") {
      return (
        <div className="flex items-center justify-center w-8 h-8 mx-auto rounded-lg bg-red-500/[0.06]">
          <span className="text-[10px] text-red-500/70">×</span>
        </div>
      );
    }
    if (lessonStatus === "rescheduled") {
      return (
        <div className="flex items-center justify-center w-8 h-8 mx-auto rounded-lg bg-amber-500/[0.05]">
          <span className="text-[10px] text-amber-500/70">↪</span>
        </div>
      );
    }
    if (isFuture) {
      return (
        <div className="flex items-center justify-center w-8 h-8 mx-auto">
          <span className="text-base font-semibold text-muted-foreground/50 leading-none">—</span>
        </div>
      );
    }
    if (!mark) {
      return <div className="flex items-center justify-center w-8 h-8 mx-auto rounded-lg hover:bg-muted/50 transition-all" />;
    }
    const cfg = {
      present: { icon: <Check className="w-4 h-4 text-emerald-500" strokeWidth={2.5} />, bg: "bg-emerald-500/15" },
      absent:  { icon: <X     className="w-4 h-4 text-red-500"     strokeWidth={2.5} />, bg: "bg-red-500/15"     },
      late:    { icon: <Clock className="w-3.5 h-3.5 text-amber-500" strokeWidth={2} />, bg: "bg-amber-500/15"   },
      excused: { icon: <FileText className="w-3.5 h-3.5 text-sky-500" strokeWidth={2} />, bg: "bg-sky-500/15"    },
    }[mark.status];
    return (
      <div className={`relative flex items-center justify-center w-8 h-8 mx-auto rounded-lg transition-all duration-200 ${cfg.bg}`}>
        {cfg.icon}
        {mark.status === "absent" && (mark.reason_code || mark.reason_text) && (
          <MessageSquare className="absolute -top-1 -right-1 w-2.5 h-2.5 text-muted-foreground" />
        )}
        {mark.status === "late" && mark.late_minutes != null && mark.late_minutes > 0 && (
          <span className="absolute -bottom-0.5 text-[7px] font-bold text-amber-600 dark:text-amber-400">
            {mark.late_minutes}{t("journal.minutesShort")}
          </span>
        )}
      </div>
    );
  };

  // ── Per-student percent + sparkline (last 12 marked lessons) ──────────
  const getStudentPercent = (studentId: number): number | null => {
    const st = studentStatsById.get(studentId);
    if (!st || st.total === 0) return null;
    return st.rate_pct;
  };

  const getSparkline = (studentId: number): (1 | 0)[] => {
    const past = allLessons
      .filter((l) => parseISO(l.lesson_date) <= today)
      .filter((l) => l.status !== "rescheduled" && l.status !== "cancelled")
      .sort((a, b) => a.lesson_date.localeCompare(b.lesson_date));
    const out: (1 | 0)[] = [];
    for (let i = past.length - 1; i >= 0 && out.length < 12; i--) {
      const v = marks[studentId]?.[past[i].id]?.status;
      if (v === "present" || v === "late") out.unshift(1);
      else if (v === "absent") out.unshift(0);
    }
    return out;
  };

  // ── Percent palette ────────────────────────────────────────────────────
  const getPercentColor = (p: number | null) => p === null ? "text-muted-foreground" : p >= 85 ? "text-emerald-500" : p >= 70 ? "text-amber-500" : "text-red-500";
  const getPercentBg    = (p: number | null) => p === null ? "bg-muted/30"            : p >= 85 ? "bg-emerald-500/15" : p >= 70 ? "bg-amber-500/15" : "bg-red-500/15";

  // ── CSV / PDF export ──────────────────────────────────────────────────
  const exportCSV = () => {
    if (!selectedGroup || visibleLessons.length === 0) return;
    const symbols: Record<string, string> = {
      present: "✓",
      absent: "✗",
      late: t("journal.exportSymbolLate"),
      excused: t("journal.exportSymbolExcused"),
      "": "—",
    };
    const headers = [t("journal.colNo"), t("journal.colStudent"), ...visibleLessons.map((l) => format(parseISO(l.lesson_date), "dd.MM")), "%"];
    const rows = filteredStudents.map((s, idx) => {
      const pct = getStudentPercent(s.id);
      return [
        String(idx + 1),
        s.name,
        ...visibleLessons.map((l) => symbols[marks[s.id]?.[l.id]?.status ?? ""] ?? "—"),
        pct !== null ? `${pct}%` : "—",
      ];
    });
    runCsvExport({
      filename: buildUnifiedExportFileName({
        entity: `journal-${selectedGroup.code}`,
        format: "csv",
        rangeLabel: format(currentDate, "yyyy-MM"),
      }),
      header: headers,
      rows,
      delimiter: ";",
    });
  };

  const exportPDF = () => {
    if (!selectedGroup || visibleLessons.length === 0) return;
    const symbols: Record<string, string> = {
      present: "✓",
      absent: "✗",
      late: t("journal.exportSymbolLate"),
      excused: t("journal.exportSymbolExcused"),
      "": "—",
    };
    const win = window.open("", "_blank", "width=1200,height=800");
    if (!win) return;
    const tableHead = `<tr><th>${t("journal.colNo")}</th><th>${t("journal.colStudent")}</th>${visibleLessons.map((l) => `<th>${format(parseISO(l.lesson_date), "dd.MM")}<br/><small>${format(parseISO(l.lesson_date), "EEE", { locale: dfLocale })}</small></th>`).join("")}<th>%</th></tr>`;
    const tableBody = filteredStudents.map((s, idx) => {
      const pct = getStudentPercent(s.id);
      return `<tr><td>${idx + 1}</td><td style="text-align:left;">${s.name}</td>${visibleLessons.map((l) => `<td>${symbols[marks[s.id]?.[l.id]?.status ?? ""] ?? "—"}</td>`).join("")}<td><b>${pct !== null ? pct + "%" : "—"}</b></td></tr>`;
    }).join("");
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${t("journal.printTitle")} ${selectedGroup.code}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  body { font-family: Arial, sans-serif; color: #000; font-size: 10px; }
  h1 { font-size: 14px; margin: 0 0 4px; } h2 { font-size: 11px; margin: 0 0 12px; font-weight: normal; color: #555; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #999; padding: 4px 3px; text-align: center; }
  th { background: #eee; font-weight: 600; font-size: 9px; }
  small { font-size: 8px; color: #777; font-weight: normal; }
</style></head><body>
<h1>${t("journal.printTitle")} — ${selectedGroup.code}</h1>
<h2>${selectedGroup.teacher_name ?? "—"} · ${selectedGroup.time_slot} · ${periodLabel}</h2>
<table><thead>${tableHead}</thead><tbody>${tableBody}</tbody></table>
<script>window.onload=function(){window.print();setTimeout(function(){window.close()},500);}</script>
</body></html>`);
    win.document.close();
  };

  const exportFilterSummary: ExportFilterSummaryItem[] = [
    ...(selectedGroup ? [{ label: t("schedule.group"), value: selectedGroup.code }] : []),
    { label: t("journal.viewMonth"), value: viewMode },
    ...(searchQuery ? [{ label: t("common.search"), value: searchQuery }] : []),
    ...(paymentFilter !== "all" ? [{ label: t("journal.allPayments"), value: paymentFilter }] : []),
    ...(statusFilter !== "all" ? [{ label: t("journal.allStatuses"), value: statusFilter }] : []),
  ];

  // ── Render ─────────────────────────────────────────────────────────────
  const isLoading = isLoadingGroups || journalQ.isLoading;
  const hasGroup = !!selectedGroupId && !!selectedGroup;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-xl font-bold text-foreground">{t("journal.title")}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{t("journal.subtitle")}</p>
          </div>
        </div>

        {/* Group selector */}
        <div className="rounded-xl border border-border/60 bg-card p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={goPrevGroup} disabled={navList.length < 2}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Popover open={groupPickerOpen} onOpenChange={setGroupPickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/40 hover:bg-muted hover:border-border px-3 py-1.5 transition-all min-w-[180px]"
                    aria-label={t("journal.selectGroup")}
                  >
                    {selectedGroup ? (
                      <>
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: courseColorOf(selectedGroup.course_name) }} />
                        <div className="flex-1 text-left">
                          <div className="text-sm font-bold text-foreground leading-tight">{selectedGroup.code}</div>
                          <div className="text-[10px] text-muted-foreground leading-tight truncate max-w-[180px]">{selectedGroup.course_name ?? "—"}</div>
                        </div>
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">{t("journal.selectGroup")}</span>
                    )}
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[320px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder={t("journal.searchGroup")} className="text-xs" />
                    <CommandList>
                      <CommandEmpty>{t("journal.groupsNotFound")}</CommandEmpty>
                      {Array.from(new Set(navList.map((g) => g.course_name ?? "—"))).map((course) => (
                        <CommandGroup
                          key={course}
                          heading={
                            <div className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full" style={{ background: courseColorOf(course) }} />
                              <span>{course}</span>
                            </div>
                          }
                        >
                          {navList
                            .filter((g) => (g.course_name ?? "—") === course)
                            .map((g) => (
                              <CommandItem
                                key={g.id}
                                value={`${g.code} ${g.course_name ?? ""} ${g.teacher_name ?? ""}`}
                                onSelect={() => { onGroupChange(g.id); setGroupPickerOpen(false); }}
                                className="text-xs gap-2 cursor-pointer"
                              >
                                <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: courseColorOf(g.course_name) }} />
                                <span className="font-semibold">{g.code}</span>
                                <span className="text-muted-foreground">·</span>
                                <span className="text-muted-foreground truncate flex-1">{g.teacher_name ?? "—"}</span>
                                <span className="text-[10px] text-muted-foreground tabular-nums">{g.time_slot}</span>
                                {g.id === selectedGroupId && <Check className="h-3.5 w-3.5 text-primary ml-1" />}
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={goNextGroup} disabled={navList.length < 2}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="hidden sm:block h-8 w-px bg-border/60" />

            {selectedGroup && (
              <div className="flex items-center gap-3 sm:gap-4 text-[11px] text-muted-foreground flex-wrap">
                <div className="flex items-center gap-1.5">
                  <GraduationCap className="h-3.5 w-3.5" strokeWidth={1.5} />
                  <span className="font-medium text-foreground">{selectedGroup.teacher_name ?? "—"}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" strokeWidth={1.5} />
                  <span>{expandDays(selectedGroup.days as DaysType).map((d) => t(`day.short.${d}`)).join(" / ")}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" strokeWidth={1.5} />
                  <span className="tabular-nums">{selectedGroup.time_slot}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" strokeWidth={1.5} />
                  <span>
                    <span className="font-semibold text-foreground">{students.length}</span>{" "}
                    {t("journal.studentsShort")}
                  </span>
                </div>
              </div>
            )}

            {navList.length > 1 && (
              <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                {Math.max(0, groupIndex) + 1} / {navList.length}
              </span>
            )}
          </div>
        </div>

        {/* Filters bar */}
        <div className="rounded-xl border border-border/60 bg-card p-3 space-y-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={goPrev}><ChevronLeft className="h-4 w-4" /></Button>
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    className="text-xs font-semibold px-2 min-w-[130px] text-center capitalize cursor-pointer hover:underline underline-offset-2 inline-flex items-center justify-center gap-1 transition-colors hover:text-primary"
                    aria-label={t("journal.pickMonthYear")}
                  >
                    {periodLabel}
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[280px] p-3" align="center">
                  <div className="flex items-center justify-between mb-3">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setPickerYear((y) => y - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm font-bold tabular-nums">{pickerYear}</span>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setPickerYear((y) => y + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {Array.from({ length: 12 }).map((_, i) => {
                      const isActive = currentDate.getFullYear() === pickerYear && currentDate.getMonth() === i;
                      const isCurrent = today.getFullYear() === pickerYear && today.getMonth() === i;
                      const monthLabel = format(new Date(pickerYear, i, 1), "LLL", { locale: dfLocale });
                      return (
                        <button
                          key={i}
                          onClick={() => { setCurrentDate(new Date(pickerYear, i, 1)); setPickerOpen(false); }}
                          className={`h-9 rounded-md text-xs font-medium capitalize transition-all ${
                            isActive ? "bg-primary text-primary-foreground shadow-sm"
                            : isCurrent ? "ring-1 ring-primary/40 bg-muted/50 hover:bg-muted text-foreground"
                            : "hover:bg-muted text-foreground"
                          }`}
                        >
                          {monthLabel}
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={goNext}><ChevronRight className="h-4 w-4" /></Button>
            </div>

            <div className="flex items-center gap-0.5 bg-muted/50 rounded-lg p-0.5">
              {(["month", "week", "today"] as ViewMode[]).map((v) => (
                <Button key={v} size="sm" variant={viewMode === v ? "default" : "ghost"} className="h-7 px-3 text-xs" onClick={() => setViewMode(v)}>
                  {v === "month" && <><CalendarDays className="h-3.5 w-3.5 mr-1" strokeWidth={1.5} />{t("journal.viewMonth")}</>}
                  {v === "week"  && <><CalendarRange className="h-3.5 w-3.5 mr-1" strokeWidth={1.5} />{t("journal.viewWeek")}</>}
                  {v === "today" && <><CalendarCheck className="h-3.5 w-3.5 mr-1" strokeWidth={1.5} />{t("journal.viewToday")}</>}
                </Button>
              ))}
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <ExportActionButton
                phase={exportPhase}
                onClick={() => setExportOpen(true)}
                label={t("journal.featExport")}
              />
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
              <Input placeholder={t("journal.searchStudent")} className="h-8 w-52 pl-8 text-xs" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>

            <Select value={paymentFilter} onValueChange={(v) => setPaymentFilter(v as "all" | "paid" | "debt")}>
              <SelectTrigger className="w-40 h-8 text-xs">
                <CircleDollarSign className="h-3.5 w-3.5 mr-1.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">{t("journal.allPayments")}</SelectItem>
                <SelectItem value="paid" className="text-xs">{t("journal.paid")}</SelectItem>
                <SelectItem value="debt" className="text-xs">{t("journal.debtors")}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="w-44 h-8 text-xs">
                <Filter className="h-3.5 w-3.5 mr-1.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">{t("journal.allStatuses")}</SelectItem>
                <SelectItem value="present" className="text-xs">{t("journal.statusPresentPlural")}</SelectItem>
                <SelectItem value="absent" className="text-xs">{t("journal.statusAbsentPlural")}</SelectItem>
                <SelectItem value="late" className="text-xs">{t("journal.statusLatePlural")}</SelectItem>
              </SelectContent>
            </Select>

            {(paymentFilter !== "all" || statusFilter !== "all" || searchQuery) && (
              <Button size="sm" variant="ghost" className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => { setPaymentFilter("all"); setStatusFilter("all"); setSearchQuery(""); }}>
                <RotateCcw className="h-3 w-3" strokeWidth={1.5} />{t("journal.reset")}
              </Button>
            )}
          </div>

          {(paymentFilter !== "all" || statusFilter !== "all") && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-muted-foreground mr-1">{t("journal.filters")}</span>
              {paymentFilter !== "all" && (
                <Badge variant="secondary" className="text-[10px] h-5 gap-1 cursor-pointer" onClick={() => setPaymentFilter("all")}>
                  {paymentFilter === "paid" ? t("journal.paid") : t("journal.debtors")}<X className="h-2.5 w-2.5" />
                </Badge>
              )}
              {statusFilter !== "all" && (
                <Badge variant="secondary" className="text-[10px] h-5 gap-1 cursor-pointer" onClick={() => setStatusFilter("all")}>
                  {statusFilter === "present" ? t("journal.statusPresentPlural")
                    : statusFilter === "absent" ? t("journal.statusAbsentPlural")
                    : statusFilter === "late" ? t("journal.statusLatePlural")
                    : statusFilter}
                  <X className="h-2.5 w-2.5" />
                </Badge>
              )}
              <span className="text-[10px] text-muted-foreground ml-1">
                ({filteredStudents.length} {t("journal.filteredOf")} {students.length})
              </span>
            </div>
          )}
        </div>

        {/* States */}
        {!hasGroup ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-card/50 px-6 py-20">
            <div className="mx-auto max-w-md text-center space-y-5">
              <div className="relative mx-auto w-20 h-20">
                <div className="absolute inset-0 rounded-2xl bg-primary/10 blur-2xl" />
                <div className="relative flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
                  <BookOpen className="h-9 w-9 text-primary" strokeWidth={1.5} />
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-foreground">{t("journal.emptyTitle")}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{t("journal.emptyDesc")}</p>
              </div>
              {!isLoadingGroups && (
                <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                  {navList.slice(0, 4).map((g) => (
                    <Button key={g.id} size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => onGroupChange(g.id)}>
                      <BookOpen className="h-3 w-3" strokeWidth={1.5} />{g.code}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : isLoading ? (
          <div className="rounded-xl border border-border/60 bg-card px-6 py-20 flex items-center justify-center text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> {t("journal.loading") || t("groups.loading")}
          </div>
        ) : (
          <>
            {criticalStudents.length > 0 && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" strokeWidth={1.5} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {t("journal.criticalAlert").replace("{{count}}", String(criticalStudents.length))}
                  </p>
                  <div className="mt-1 flex items-center gap-x-2 gap-y-0.5 flex-wrap">
                    {criticalStudents.slice(0, 5).map((s) => (
                      <button key={s.id} onClick={() => navigate(`/students/${s.id}`)}
                        className="text-xs text-muted-foreground hover:text-foreground hover:underline underline-offset-2 transition-colors">
                        {s.name} <span className="text-amber-600 dark:text-amber-400">({s.streak})</span>
                      </button>
                    ))}
                    {criticalStudents.length > 5 && (
                      <span className="text-xs text-muted-foreground">+{criticalStudents.length - 5}</span>
                    )}
                  </div>
                </div>
                <Button size="sm" variant="outline"
                  className="h-7 text-xs gap-1.5 shrink-0 border-amber-500/40 hover:bg-amber-500/10"
                  onClick={() => toast.success(t("journal.notifySent").replace("{{count}}", String(criticalStudents.length)), {
                    description: t("journal.notifyDemo"),
                  })}>
                  <MessageSquare className="h-3.5 w-3.5" strokeWidth={1.5} />{t("journal.notifyParents")}
                </Button>
              </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><BarChart3 className="h-3.5 w-3.5" strokeWidth={1.5} />{t("journal.kpiRate")}</div>
                <div className="flex items-end gap-2"><span className={`text-2xl font-bold ${getPercentColor(overallRate)}`}>{overallRate}%</span></div>
                <Progress value={overallRate} className="h-1.5" />
              </div>
              <button type="button" onClick={() => setStatusFilter("present")}
                className="text-left rounded-xl border border-border/60 bg-card p-4 space-y-2 transition-all hover:border-emerald-500/40 hover:shadow-sm">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" strokeWidth={1.5} />{t("journal.kpiPresent")}</div>
                <div className="flex items-end gap-2">
                  <span className="text-2xl font-bold text-foreground">{aggregate.totalPresent + aggregate.totalLate}</span>
                  <span className="text-xs text-muted-foreground mb-1">{t("journal.kpiPresentOf").replace("{{total}}", String(aggregate.totalCells))}</span>
                </div>
              </button>
              <button type="button" onClick={() => setStatusFilter("absent")}
                className="text-left rounded-xl border border-border/60 bg-card p-4 space-y-2 transition-all hover:border-red-500/40 hover:shadow-sm">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><XCircle className="h-3.5 w-3.5 text-red-500" strokeWidth={1.5} />{t("journal.kpiAbsent")}</div>
                <div className="flex items-end gap-2">
                  <span className="text-2xl font-bold text-foreground">{aggregate.totalAbsent}</span>
                  <span className="text-xs text-muted-foreground mb-1">{t("journal.kpiAbsentUnit")}</span>
                </div>
              </button>
              <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><AlertTriangle className="h-3.5 w-3.5 text-amber-500" strokeWidth={1.5} />{t("journal.kpiRisk")}</div>
                <div className="flex items-end gap-2">
                  <span className="text-2xl font-bold text-foreground">{aggregate.atRisk}</span>
                  <span className="text-xs text-muted-foreground mb-1">{t("journal.kpiRiskUnit")}</span>
                </div>
              </div>
            </div>

            {/* Today view */}
            {viewMode === "today" ? (
              <TodayView
                lesson={todayLesson ?? null}
                selectedGroup={selectedGroup}
                students={filteredStudents}
                getMark={(sid) => getMark(sid, todayKey)}
                handleMarkAllPresent={handleMarkAllPresent}
                onSetMark={(sid, mode) => {
                  if (!todayLesson) return;
                  if (mode === "present") setMark(todayLesson, sid, { status: "present" });
                  if (mode === "absent")  { setAbsentTarget({ lesson: todayLesson, studentId: sid }); setAbsentReason("none"); setAbsentNote(""); }
                  if (mode === "late")    { setLateTarget({ lesson: todayLesson, studentId: sid }); setLateMinutes("10"); }
                }}
                t={t}
                dfLocale={dfLocale}
                navigate={navigate}
              />
            ) : filteredStudents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 bg-card/50 px-6 py-16 text-center">
                <Users className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.5} />
                <p className="text-sm font-medium text-foreground">{t("journal.noStudents")}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {students.length === 0 ? t("journal.noStudentsInGroup") : t("journal.noStudentsForFilters")}
                </p>
              </div>
            ) : visibleLessons.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 bg-card/50 px-6 py-16 text-center">
                <CalendarDays className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.5} />
                <p className="text-sm font-medium text-foreground">{t("journal.noLessonsInPeriod")}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("journal.noLessonsHint")}</p>
              </div>
            ) : (
              <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
                <div className="overflow-x-auto [--student-col:140px] sm:[--student-col:180px]" ref={scrollRef}>
                  <table className="border-collapse" style={{ tableLayout: "fixed", width: "auto", minWidth: "100%" }}>
                    <thead className="sticky top-0 z-30">
                      <tr>
                        <th className="sticky left-0 z-40 bg-muted/95 backdrop-blur-sm border-b border-r border-border/60 px-2 py-2.5 text-center text-[11px] font-semibold text-muted-foreground" style={{ width: 40, minWidth: 40, maxWidth: 40 }}>№</th>
                        <th className="sticky left-[40px] z-40 bg-muted/95 backdrop-blur-sm border-b border-r border-border/60 px-1 py-2.5 text-center text-[11px] font-semibold text-muted-foreground" style={{ width: 36, minWidth: 36, maxWidth: 36 }}>
                          <Tooltip><TooltipTrigger asChild><span className="inline-flex justify-center w-full"><DollarSign className="h-3.5 w-3.5" strokeWidth={1.8} /></span></TooltipTrigger>
                          <TooltipContent className="text-xs">{t("journal.paymentStatus")}</TooltipContent></Tooltip>
                        </th>
                        <th className="sticky left-[76px] z-40 bg-muted/95 backdrop-blur-sm border-b border-r border-border/60 px-3 py-2.5 text-left text-[11px] font-semibold text-muted-foreground shadow-[2px_0_4px_-2px_hsl(var(--foreground)/0.08)]"
                          style={{ width: "var(--student-col)", minWidth: "var(--student-col)", maxWidth: "var(--student-col)" }}>
                          <div className="flex items-center gap-1.5"><User className="h-3 w-3" strokeWidth={1.5} />{t("journal.colStudent")}</div>
                        </th>
                        {visibleLessons.map((l) => {
                          const d = parseISO(l.lesson_date);
                          const isToday = isSameDay(d, today);
                          const isFuture = isAfter(d, today);
                          const dayAbbr = format(d, "EEEEEE", { locale: dfLocale }).replace(/^./, (c) => c.toUpperCase());
                          const dateShort = format(d, "dd.MM");
                          const isHovered = hoveredCol === l.lesson_date;
                          const isCancelled = l.status === "cancelled" || l.status === "rescheduled";
                          return (
                            <th
                              key={l.id}
                              data-today={isToday ? "true" : undefined}
                              style={{ width: 52, minWidth: 52, maxWidth: 52 }}
                              className={`border-b border-r border-border/40 px-0.5 py-2 text-center cursor-pointer transition-colors ${
                                isToday ? "bg-primary/[0.08] border-x-2 border-x-primary text-primary font-bold"
                                : isCancelled ? "bg-muted/40 text-muted-foreground/60"
                                : isHovered ? "bg-accent/60 text-foreground"
                                : isFuture  ? "bg-muted/30 text-muted-foreground opacity-40 hover:bg-muted/50"
                                : "bg-muted/95 text-muted-foreground hover:bg-muted"
                              }`}
                              onClick={() => setLessonDetail(l)}
                              onMouseEnter={() => setHoveredCol(l.lesson_date)}
                              onMouseLeave={() => setHoveredCol((c) => (c === l.lesson_date ? null : c))}
                            >
                              <div className={`text-[11px] leading-tight ${isToday ? "font-bold text-primary" : "font-semibold"}`}>{dayAbbr}</div>
                              <div className={`text-[11px] leading-tight mt-0.5 tabular-nums ${isToday ? "font-bold text-primary" : "font-medium opacity-80"} ${isCancelled ? "line-through" : ""}`}>{dateShort}</div>
                              {isToday && <div className="mt-0.5 mx-auto h-1 w-1 rounded-full bg-primary" />}
                            </th>
                          );
                        })}
                        <th className="sticky right-0 z-40 bg-muted/95 backdrop-blur-sm border-b border-l border-border/60 px-1 py-2.5 text-center text-[11px] font-semibold text-muted-foreground shadow-[-2px_0_4px_-2px_hsl(var(--foreground)/0.08)]" style={{ width: 110, minWidth: 110, maxWidth: 110 }}>
                          % / {t("journal.colPercentTrend").split("/")[1]?.trim() || "trend"}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudents.map((student, idx) => {
                        const pct = getStudentPercent(student.id);
                        const isRowHovered = hoveredRow === student.id;
                        const stickyBg = isRowHovered ? "bg-accent/40" : "bg-card";
                        return (
                          <tr key={student.id}
                            className={`transition-colors ${isRowHovered ? "bg-accent/30" : "hover:bg-muted/30"}`}
                            onMouseEnter={() => setHoveredRow(student.id)}
                            onMouseLeave={() => setHoveredRow((r) => (r === student.id ? null : r))}
                          >
                            <td className={`sticky left-0 z-10 ${stickyBg} border-b border-r border-border/40 px-2 py-2 text-center text-xs text-muted-foreground font-medium transition-colors`} style={{ width: 40, minWidth: 40, maxWidth: 40 }}>{idx + 1}</td>
                            <td className={`sticky left-[40px] z-10 ${stickyBg} border-b border-r border-border/40 px-1 py-2 text-center transition-colors`} style={{ width: 36, minWidth: 36, maxWidth: 36 }}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  {student.paymentStatus === "debt" ? (
                                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-red-500/10 mx-auto"><DollarSign className="h-3.5 w-3.5 text-red-500" strokeWidth={2} /></div>
                                  ) : (
                                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/10 mx-auto"><DollarSign className="h-3.5 w-3.5 text-emerald-500" strokeWidth={2} /></div>
                                  )}
                                </TooltipTrigger>
                                <TooltipContent className="text-xs">{student.paymentStatus === "debt" ? t("journal.debt") : t("journal.paid")}</TooltipContent>
                              </Tooltip>
                            </td>
                            <td className={`sticky left-[76px] z-10 ${stickyBg} border-b border-r border-border/40 px-3 py-2 transition-colors shadow-[2px_0_4px_-2px_hsl(var(--foreground)/0.08)]`}
                              style={{ width: "var(--student-col)", minWidth: "var(--student-col)", maxWidth: "var(--student-col)" }}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button onClick={() => navigate(`/students/${student.id}`)} className="text-xs font-medium text-foreground hover:text-primary transition-colors truncate block w-full text-left">
                                    {student.name}
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="text-xs">{student.name}</TooltipContent>
                              </Tooltip>
                            </td>
                            {visibleLessons.map((l) => {
                              const dateKey = l.lesson_date;
                              const mark = marks[student.id]?.[l.id] ?? null;
                              const d = parseISO(dateKey);
                              const isToday = isSameDay(d, today);
                              const isFuture = isAfter(d, today);
                              const isPast = isBefore(d, today) && !isToday;
                              const isColHover = hoveredCol === dateKey;
                              const lessonInactive = l.status === "cancelled" || l.status === "rescheduled";
                              const isLockedForTeacher = isTeacher && isPast;
                              const isLockedForReadonly = isManager;
                              const isPickable = !isFuture && !lessonInactive && !isLockedForTeacher && !isLockedForReadonly;

                              return (
                                <td key={l.id}
                                  onClick={(e) => {
                                    if (!isPickable) return;
                                    openPicker(student.id, dateKey, e.currentTarget);
                                  }}
                                  onMouseEnter={() => setHoveredCol(dateKey)}
                                  onMouseLeave={() => setHoveredCol((c) => (c === dateKey ? null : c))}
                                  tabIndex={-1}
                                  style={{ width: 52, minWidth: 52, maxWidth: 52, outline: "none" }}
                                  className={`border-b border-r border-border/30 text-center px-0.5 py-2 transition-colors duration-150 focus:outline-none focus-visible:outline-none select-none ${
                                    lessonInactive ? "cursor-default bg-muted/30"
                                    : isFuture || isLockedForTeacher || isLockedForReadonly ? "cursor-default bg-muted/20"
                                    : "cursor-pointer hover:bg-accent/40"
                                  } ${isToday ? "border-x-2 border-x-primary bg-primary/[0.06]" : isColHover && !isFuture && !lessonInactive && !isLockedForTeacher && !isLockedForReadonly ? "bg-accent/30" : ""}`}
                                >
                                  {renderCell(mark, isFuture || isLockedForTeacher || isLockedForReadonly, l.status)}
                                </td>
                              );
                            })}
                            <td style={{ width: 110, minWidth: 110, maxWidth: 110 }}
                              className={`sticky right-0 z-10 border-b border-l border-border/60 px-2 py-2 text-center transition-colors shadow-[-2px_0_4px_-2px_hsl(var(--foreground)/0.08)] ${getPercentBg(pct)}`}>
                              {pct === null ? (
                                <span className="text-xs font-bold text-muted-foreground">—</span>
                              ) : (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex items-center justify-center gap-1.5 cursor-help whitespace-nowrap">
                                      <span className={`text-xs font-bold leading-none ${getPercentColor(pct)}`}>{pct}%</span>
                                      {(() => {
                                        const points = getSparkline(student.id);
                                        if (points.length < 2) return null;
                                        const barColor = pct > 85 ? "bg-emerald-500" : pct >= 70 ? "bg-amber-500" : "bg-red-500";
                                        const barW = Math.max(1, Math.floor(40 / points.length) - 1);
                                        return (
                                          <div className="flex items-end gap-[1px] shrink-0" style={{ width: 40, height: 16 }}>
                                            {points.map((p, i) => (
                                              <span key={i} className={`rounded-sm ${p === 1 ? barColor : "bg-muted-foreground/30"}`} style={{ width: barW, height: 16 }} />
                                            ))}
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  </TooltipTrigger>
                                  {(() => {
                                    const ss = studentStatsById.get(student.id);
                                    if (!ss) return null;
                                    return (
                                      <TooltipContent side="left" sideOffset={8}
                                        className="text-xs p-0 border bg-popover text-popover-foreground"
                                        style={{ minWidth: 200, borderRadius: 10, padding: "12px 14px", boxShadow: "0 4px 16px rgba(0,0,0,0.1)" }}>
                                        <div className="font-semibold text-sm mb-2 pb-2 border-b border-border/50">{student.name}</div>
                                        <div className="space-y-1.5">
                                          <Row icon={<Check size={14} strokeWidth={1.5} style={{ color: "#16a34a" }} />} label={t("journal.tooltipPresent")} value={`${ss.present} ${t("journal.tooltipTimes")}`} />
                                          <Row icon={<X size={14} strokeWidth={1.5} style={{ color: "#dc2626" }} />} label={t("journal.tooltipAbsent")} value={`${ss.absent} ${t("journal.tooltipTimes")}`} />
                                          <Row icon={<Clock size={14} strokeWidth={1.5} style={{ color: "#d97706" }} />} label={t("journal.tooltipLate")} value={`${ss.late} ${t("journal.tooltipTimes")}`} />
                                        </div>
                                        <div className="mt-2 pt-2 border-t border-border/50 space-y-1.5">
                                          <Row icon={<BarChart2 size={14} strokeWidth={1.5} style={{ color: "#6b7280" }} />} label={t("journal.tooltipLast12")} value="" />
                                        </div>
                                      </TooltipContent>
                                    );
                                  })()}
                                </Tooltip>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Floating status picker (portal) */}
            {activeCell && (() => {
              const acLesson = lessonByDate.get(activeCell.dateKey);
              if (!acLesson) return null;
              const acMark = marks[activeCell.studentId]?.[acLesson.id] ?? null;
              const sid = activeCell.studentId;

              const pick = (status: AttendanceStatus, extra?: { reason_code?: AbsenceReasonCode }) => {
                setMark(acLesson, sid, { status, ...extra });
                closePicker();
              };

              return createPortal(
                <>
                  {/* Transparent backdrop — click to close */}
                  <div className="fixed inset-0 z-[9998]" onClick={closePicker} />

                  {/* Panel */}
                  <div
                    className="fixed z-[9999] flex items-center gap-1 rounded-lg border bg-popover p-1.5 shadow-lg animate-in fade-in-0 zoom-in-95"
                    style={{ top: pickerPos.top, left: pickerPos.left, transform: "translate(-50%, -100%)" }}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <button type="button" title={t("journal.statusAbsent")}
                      onClick={() => pick("absent", { reason_code: "none" })}
                      className={`flex items-center justify-center w-9 h-9 rounded-lg border transition-all ${
                        acMark?.status === "absent" ? "bg-red-500/15 border-red-500/40 text-red-500" : "border-transparent hover:bg-red-500/10 hover:border-red-500/30 text-red-500"
                      }`}>
                      <X className="h-4 w-4" strokeWidth={2.5} />
                    </button>
                    <button type="button" title={t("journal.statusPresent")}
                      onClick={() => pick("present")}
                      className={`flex items-center justify-center w-9 h-9 rounded-lg border transition-all ${
                        acMark?.status === "present" ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-500" : "border-transparent hover:bg-emerald-500/10 hover:border-emerald-500/30 text-emerald-500"
                      }`}>
                      <Check className="h-4 w-4" strokeWidth={2.5} />
                    </button>
                    <button type="button" title={t("journal.statusLate")}
                      onClick={() => {
                        closePicker();
                        setLateTarget({ lesson: acLesson, studentId: sid });
                        setLateMinutes(acMark?.late_minutes != null ? String(acMark.late_minutes) : "10");
                      }}
                      className={`flex items-center justify-center w-9 h-9 rounded-lg border transition-all ${
                        acMark?.status === "late" ? "bg-amber-500/15 border-amber-500/40 text-amber-500" : "border-transparent hover:bg-amber-500/10 hover:border-amber-500/30 text-amber-500"
                      }`}>
                      <Clock className="h-4 w-4" strokeWidth={2.5} />
                    </button>
                    <button type="button" title={t("journal.statusUnmarked")}
                      disabled={!acMark}
                      onClick={() => {
                        if (acMark) clearMark(acLesson.id, sid);
                        closePicker();
                      }}
                      className={`flex items-center justify-center w-9 h-9 rounded-lg border transition-all ${
                        !acMark ? "border-border/40 bg-muted/40 text-muted-foreground cursor-not-allowed opacity-60" : "border-transparent hover:bg-muted/60 hover:border-border text-muted-foreground"
                      }`}>
                      <Square className="h-4 w-4" strokeWidth={2} />
                    </button>
                  </div>
                </>,
                document.body,
              );
            })()}

            {/* Legend */}
            <div className="flex flex-wrap gap-4 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-1.5"><div className="flex items-center justify-center w-5 h-5 rounded bg-emerald-500/15"><Check className="w-3 h-3 text-emerald-500" strokeWidth={2.5} /></div><span>{t("journal.legendPresent")}</span></div>
              <div className="flex items-center gap-1.5"><div className="flex items-center justify-center w-5 h-5 rounded bg-red-500/15"><X className="w-3 h-3 text-red-500" strokeWidth={2.5} /></div><span>{t("journal.legendAbsent")}</span></div>
              <div className="flex items-center gap-1.5"><div className="flex items-center justify-center w-5 h-5 rounded bg-amber-500/15"><Clock className="w-3 h-3 text-amber-500" strokeWidth={2} /></div><span>{t("journal.legendLate")}</span></div>
              <span className="ml-2 italic opacity-70">{t("journal.legendHint")}</span>
            </div>
          </>
        )}

        {/* Lesson detail modal */}
        <Dialog open={!!lessonDetail} onOpenChange={(open) => { if (!open) setLessonDetail(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" strokeWidth={1.5} />
                {lessonDetail && format(parseISO(lessonDetail.lesson_date), "d MMMM yyyy, EEEE", { locale: dfLocale })}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {lessonDetail && (
                <>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
                    {lessonDetail.start_time.slice(0, 5)} – {lessonDetail.end_time.slice(0, 5)}
                  </div>
                  {selectedGroup?.teacher_name && (
                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />{selectedGroup.teacher_name}
                    </div>
                  )}
                  {(lessonDetail.status === "cancelled" || lessonDetail.status === "rescheduled") && (
                    <Badge variant="secondary" className={lessonDetail.status === "cancelled" ? "bg-red-500/15 text-red-700 dark:text-red-400" : "bg-amber-500/15 text-amber-700 dark:text-amber-400"}>
                      {lessonDetail.status === "cancelled" ? t("schedule.cancelled") : t("schedule.rescheduled")}
                    </Badge>
                  )}
                </>
              )}

              <div className="border-t border-border/40 pt-3 space-y-2.5">
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <BookOpen className="h-3.5 w-3.5" strokeWidth={1.5} />{t("journal.lessonTopic")}
                  </label>
                  <Input placeholder={t("journal.lessonTopicPh")} value={topicDraft.topic} onChange={(e) => setTopicDraft((d) => ({ ...d, topic: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" strokeWidth={1.5} />{t("journal.lessonNotes")}
                  </label>
                  <Textarea placeholder={t("journal.lessonNotesPh")} value={topicDraft.notes} onChange={(e) => setTopicDraft((d) => ({ ...d, notes: e.target.value }))} className="text-sm min-h-[70px]" />
                </div>
              </div>

              {lessonDetail && (() => {
                const isFuture = parseISO(lessonDetail.lesson_date) > today;
                const isLessonPast = isBefore(parseISO(lessonDetail.lesson_date), today) && !isSameDay(parseISO(lessonDetail.lesson_date), today);
                const isLockedDetail = (isTeacher && isLessonPast) || isManager;
                if (isFuture) {
                  return (
                    <div className="border-t border-border/40 pt-3">
                      <div className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2.5">
                        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" strokeWidth={1.5} />
                        <p className="text-xs text-muted-foreground leading-relaxed">{t("journal.futureLessonInfo")}</p>
                      </div>
                    </div>
                  );
                }
                if (isLockedDetail) {
                  return (
                    <div className="border-t border-border/40 pt-3">
                      <div className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2.5">
                        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" strokeWidth={1.5} />
                        <p className="text-xs text-muted-foreground leading-relaxed">{t("journal.pastLessonLocked")}</p>
                      </div>
                    </div>
                  );
                }
                return (
                  <div className="border-t border-border/40 pt-3">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">{t("journal.studentsLabel")}</p>
                    <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
                      {students.map((s) => {
                        const m = marks[s.id]?.[lessonDetail.id] ?? null;
                        return (
                          <div key={s.id} className="flex items-center gap-2 text-xs">
                            {renderCell(m, false, lessonDetail.status)}
                            <span className="text-foreground">{s.name}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setLessonDetail(null)}>{t("journal.cancel")}</Button>
              <Button size="sm" onClick={saveTopicForLesson} disabled={updateJournalM.isPending}>
                {updateJournalM.isPending ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />{t("journal.save")}</> : t("journal.save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Absent reason modal */}
        <Dialog open={!!absentTarget} onOpenChange={(open) => { if (!open) setAbsentTarget(null); }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle className="text-base flex items-center gap-2"><XCircle className="h-4 w-4 text-red-500" />{t("journal.absentReasonTitle")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Select value={absentReason} onValueChange={(v) => setAbsentReason(v as AbsenceReasonCode)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="illness">{t("journal.reasonIllness")}</SelectItem>
                  <SelectItem value="family">{t("journal.reasonFamily")}</SelectItem>
                  <SelectItem value="none">{t("journal.reasonNone")}</SelectItem>
                  <SelectItem value="other">{t("journal.reasonOther")}</SelectItem>
                </SelectContent>
              </Select>
              {absentReason === "other" && (
                <Textarea placeholder={t("journal.reasonOtherPlaceholder")} value={absentNote} onChange={(e) => setAbsentNote(e.target.value)} className="text-sm min-h-[60px]" />
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setAbsentTarget(null)}>{t("journal.cancel")}</Button>
              <Button size="sm" onClick={handleSaveAbsent} disabled={upsertM.isPending}>
                {upsertM.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("journal.save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Late minutes modal */}
        <Dialog open={!!lateTarget} onOpenChange={(open) => { if (!open) setLateTarget(null); }}>
          <DialogContent className="sm:max-w-xs">
            <DialogHeader><DialogTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4 text-amber-500" />{t("journal.lateTitle")}</DialogTitle></DialogHeader>
            <div className="flex items-center gap-3">
              <Input type="number" min="0" max="240" value={lateMinutes} onChange={(e) => setLateMinutes(e.target.value)} className="h-9 text-sm w-24" />
              <span className="text-sm text-muted-foreground">{t("journal.minutes")}</span>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setLateTarget(null)}>{t("journal.cancel")}</Button>
              <Button size="sm" onClick={handleSaveLate} disabled={upsertM.isPending}>
                {upsertM.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("journal.save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ExportCenter
          open={exportOpen}
          onOpenChange={setExportOpen}
          title={t("export.center.title")}
          description={t("export.center.description")}
          formats={["csv", "pdf"]}
          columns={[
            { key: "students", label: t("journal.colStudent") },
            { key: "dates", label: t("schedule.days") },
            { key: "attendance", label: t("journal.statusPresentPlural") },
          ]}
          sortOptions={[{ value: "default", label: t("export.sort.default") }]}
          filterSummary={exportFilterSummary}
          submitLabel={t("export.center.submit")}
          onSubmit={(state) => {
            runExportTask({
              onPhaseChange: (phase) => setExportPhase(phase),
              run: () => {
                if (state.format === "pdf") exportPDF();
                else exportCSV();
              },
              onSuccess: () => {
                setExportOpen(false);
                toast.success(t("export.toast.success"));
                setTimeout(() => setExportPhase("idle"), 1200);
              },
              onError: (error) => {
                toast.error(error.message);
                setTimeout(() => setExportPhase("idle"), 1500);
              },
            });
          }}
        />
      </div>
    </TooltipProvider>
  );
}

// ── Today view ───────────────────────────────────────────────────────────────

interface TodayViewProps {
  lesson: JournalLesson | null;
  selectedGroup: GroupRead | null;
  students: { id: number; name: string; paymentStatus: "paid" | "debt" }[];
  getMark: (studentId: number) => JournalMark | null;
  handleMarkAllPresent: () => void;
  onSetMark: (studentId: number, mode: "present" | "absent" | "late") => void;
  t: (k: string) => string;
  dfLocale: typeof ru;
  navigate: (to: string) => void;
}

function TodayView({
  lesson, selectedGroup, students, getMark, handleMarkAllPresent, onSetMark, t, dfLocale, navigate,
}: TodayViewProps) {
  const isClassDay = !!lesson;
  return (
    <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-border/40 bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
            <CalendarCheck className="h-5 w-5 text-primary" strokeWidth={1.5} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground capitalize">
              {format(new Date(), "EEEE, d MMMM", { locale: dfLocale })}
            </p>
            <p className="text-xs text-muted-foreground">
              {isClassDay && selectedGroup
                ? `${t("journal.todayLessonAt")} ${selectedGroup.time_slot}`
                : t("journal.todayNoLesson")}
            </p>
          </div>
          {isClassDay && (
            <Button size="sm" className="ml-auto h-8 text-xs gap-1.5" onClick={handleMarkAllPresent}>
              <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} />{t("journal.markAllPresent")}
            </Button>
          )}
        </div>
      </div>

      {!isClassDay ? (
        <div className="py-16 text-center text-muted-foreground text-sm">{t("journal.todayNoLessonForGroup")}</div>
      ) : (
        <div className="divide-y divide-border/30">
          {students.map((student, idx) => {
            const m = getMark(student.id);
            const val = m?.status ?? "";
            const reason = m?.reason_code ?? "";
            const lateMins = m?.late_minutes ?? null;
            const statusLabels: Record<string, string> = {
              present: t("journal.todayPresent"),
              absent:  reason ? `${t("journal.todayAbsent")}${reason !== "none" ? ` · ${reason}` : ""}` : t("journal.todayAbsent"),
              late:    `${t("journal.todayLatePrefix")} ${lateMins ?? ""}${t("journal.minutesShort")}`,
              excused: t("journal.todayPresent"),
            };
            const statusColors: Record<string, string> = {
              present: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
              absent:  "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30",
              late:    "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
              excused: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30",
            };
            return (
              <div key={student.id} className="flex items-center gap-4 px-5 py-3 hover:bg-muted/20 transition-colors">
                <span className="text-xs text-muted-foreground w-6 text-right font-medium">{idx + 1}</span>
                <button onClick={() => navigate(`/students/${student.id}`)} className="text-sm font-medium text-foreground hover:text-primary transition-colors text-left flex-1">
                  {student.name}
                </button>
                <div className="flex items-center gap-2">
                  {student.paymentStatus === "debt" ? (
                    <span className="flex items-center gap-1 text-[10px] text-red-500"><DollarSign className="h-3 w-3" />{t("journal.debt")}</span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-500"><DollarSign className="h-3 w-3" /></span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {(["present", "absent", "late"] as const).map((status) => (
                    <button
                      key={status}
                      onClick={() => onSetMark(student.id, status)}
                      className={`flex items-center justify-center w-9 h-9 rounded-xl border transition-all duration-200 ${
                        val === status ? statusColors[status] + " border-current scale-110"
                        : "border-border/40 hover:border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {status === "present" && <Check className="h-4 w-4" strokeWidth={2} />}
                      {status === "absent" && <X className="h-4 w-4" strokeWidth={2} />}
                      {status === "late" && <Clock className="h-3.5 w-3.5" strokeWidth={2} />}
                    </button>
                  ))}
                </div>
                {val && <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${statusColors[val] || ""}`}>{statusLabels[val] || ""}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Mini helpers ─────────────────────────────────────────────────────────────

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-2">{icon}{label}</span>
      {value && <span className="font-semibold tabular-nums">{value}</span>}
    </div>
  );
}
