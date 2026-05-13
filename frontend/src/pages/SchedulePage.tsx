import { useState, useMemo, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { useGroup } from "@/hooks/use-groups";
import { useRooms } from "@/hooks/use-rooms";
import { useStudents, fullName as studentFullName } from "@/hooks/use-students";
import {
  useSchedule,
  useCancelLesson,
  useRescheduleLesson,
  shortTime,
  timeToMinutes,
  lessonDateTime,
  type ScheduleLesson,
  type LessonStatus,
} from "@/hooks/use-schedule";
import { cn } from "@/lib/utils";
import { ExportActionButton } from "@/components/export/ExportActionButton";
import { ExportCenter } from "@/components/export/ExportCenter";
import {
  buildUnifiedExportFileName,
  runExportTask,
  runTextExport,
  type ExportFilterSummaryItem,
  type ExportPhase,
} from "@/lib/export";
import {
  CalendarDays, CalendarRange, Calendar as CalendarIcon, CalendarCheck,
  ChevronLeft, ChevronRight, Clock, Users, User, DoorOpen, X, Plus, Search,
  SlidersHorizontal, AlertTriangle, Printer, Keyboard,
  Link as LinkIcon, Ban, ListChecks, LayoutGrid, ArrowRight, Loader2,
  Repeat,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

type ViewMode = "day" | "week" | "month" | "rooms";

// ── Card colour theme (kept verbatim from previous version) ─────────────────
interface CardThemeColors {
  bg: string;
  border: string;
  title: string;
  time: string;
  meta: string;
  divider: string;
  shadow: string;
  hoverShadow: string;
}

function getCardColors(course: string, isDark: boolean): CardThemeColors {
  const c = (course || "").toLowerCase();
  if (c.includes('ielts') && !c.includes('pre')) {
    return isDark
      ? { bg: '#1a3a6b', border: '#3b6df0', title: '#ffffff', time: '#94a3b8', meta: '#94a3b8', divider: 'rgba(255,255,255,0.15)', shadow: '0 4px 12px rgba(0,0,0,0.25)', hoverShadow: '0 8px 24px rgba(0,0,0,0.4)' }
      : { bg: '#dbeafe', border: '#3b6df0', title: '#1e3a5f', time: '#475569', meta: '#475569', divider: 'rgba(0,0,0,0.1)', shadow: '0 2px 8px rgba(0,0,0,0.1)', hoverShadow: '0 6px 16px rgba(0,0,0,0.15)' };
  }
  if (c.includes('pre-ielts') || c.includes('gen')) {
    return isDark
      ? { bg: '#2a1a5e', border: '#8b5cf6', title: '#ffffff', time: '#94a3b8', meta: '#94a3b8', divider: 'rgba(255,255,255,0.15)', shadow: '0 4px 12px rgba(0,0,0,0.25)', hoverShadow: '0 8px 24px rgba(0,0,0,0.4)' }
      : { bg: '#ede9fe', border: '#8b5cf6', title: '#3b0764', time: '#475569', meta: '#475569', divider: 'rgba(0,0,0,0.1)', shadow: '0 2px 8px rgba(0,0,0,0.1)', hoverShadow: '0 6px 16px rgba(0,0,0,0.15)' };
  }
  if (c.includes('grammar')) {
    return isDark
      ? { bg: '#3b2500', border: '#f59e0b', title: '#ffffff', time: '#94a3b8', meta: '#94a3b8', divider: 'rgba(255,255,255,0.15)', shadow: '0 4px 12px rgba(0,0,0,0.25)', hoverShadow: '0 8px 24px rgba(0,0,0,0.4)' }
      : { bg: '#fef3c7', border: '#f59e0b', title: '#451a03', time: '#475569', meta: '#475569', divider: 'rgba(0,0,0,0.1)', shadow: '0 2px 8px rgba(0,0,0,0.1)', hoverShadow: '0 6px 16px rgba(0,0,0,0.15)' };
  }
  if (c.includes('kids')) {
    return isDark
      ? { bg: '#0d2e1a', border: '#22c55e', title: '#ffffff', time: '#94a3b8', meta: '#94a3b8', divider: 'rgba(255,255,255,0.15)', shadow: '0 4px 12px rgba(0,0,0,0.25)', hoverShadow: '0 8px 24px rgba(0,0,0,0.4)' }
      : { bg: '#dcfce7', border: '#22c55e', title: '#052e16', time: '#475569', meta: '#475569', divider: 'rgba(0,0,0,0.1)', shadow: '0 2px 8px rgba(0,0,0,0.1)', hoverShadow: '0 6px 16px rgba(0,0,0,0.15)' };
  }
  if (c.includes('speak')) {
    return isDark
      ? { bg: '#1a2e2e', border: '#14b8a6', title: '#ffffff', time: '#94a3b8', meta: '#94a3b8', divider: 'rgba(255,255,255,0.15)', shadow: '0 4px 12px rgba(0,0,0,0.25)', hoverShadow: '0 8px 24px rgba(0,0,0,0.4)' }
      : { bg: '#ccfbf1', border: '#14b8a6', title: '#042f2e', time: '#475569', meta: '#475569', divider: 'rgba(0,0,0,0.1)', shadow: '0 2px 8px rgba(0,0,0,0.1)', hoverShadow: '0 6px 16px rgba(0,0,0,0.15)' };
  }
  return isDark
    ? { bg: '#1a2e3b', border: '#0ea5e9', title: '#ffffff', time: '#94a3b8', meta: '#94a3b8', divider: 'rgba(255,255,255,0.15)', shadow: '0 4px 12px rgba(0,0,0,0.25)', hoverShadow: '0 8px 24px rgba(0,0,0,0.4)' }
    : { bg: '#e0f2fe', border: '#0ea5e9', title: '#0c2a3b', time: '#475569', meta: '#475569', divider: 'rgba(0,0,0,0.1)', shadow: '0 2px 8px rgba(0,0,0,0.1)', hoverShadow: '0 6px 16px rgba(0,0,0,0.15)' };
}

function getCourseColorDot(course: string): string {
  const c = (course || "").toLowerCase();
  if (c.includes('ielts') && !c.includes('pre')) return '#3b6df0';
  if (c.includes('pre-ielts') || c.includes('gen')) return '#8b5cf6';
  if (c.includes('grammar')) return '#f59e0b';
  if (c.includes('kids')) return '#22c55e';
  if (c.includes('speak')) return '#14b8a6';
  return '#0ea5e9';
}

// ── Lesson view-model ───────────────────────────────────────────────────────
interface UILesson {
  id: number;
  groupId: number;
  groupCode: string;
  course: string;
  teacher: string;
  room: string;
  /** YYYY-MM-DD */
  dateISO: string;
  date: Date;
  startMinutes: number;
  endMinutes: number;
  /** "HH:MM" */
  startStr: string;
  endStr: string;
  /** "HH:MM:SS" — for backend roundtrips */
  startTimeRaw: string;
  endTimeRaw: string;
  students: number;
  maxStudents: number;
  status: LessonStatus;
  note: string | null;
  rescheduledFromId: number | null;
}

function toUILesson(l: ScheduleLesson): UILesson {
  const startMin = timeToMinutes(l.start_time);
  const endMin   = timeToMinutes(l.end_time);
    return {
    id:          l.id,
    groupId:     l.group_id,
    groupCode:   l.group_code,
    course:      l.course_name  ?? "—",
    teacher:     l.teacher_name ?? "—",
    room:        l.room_name    ?? "—",
    dateISO:     l.lesson_date,
    date:        lessonDateTime(l.lesson_date, "00:00:00"),
    startMinutes: startMin,
    endMinutes:   endMin,
    startStr:     shortTime(l.start_time),
    endStr:       shortTime(l.end_time),
    startTimeRaw: l.start_time,
    endTimeRaw:   l.end_time,
    students:    l.student_count,
    maxStudents: l.max_students,
    status:      l.status,
    note:        l.note,
    rescheduledFromId: l.rescheduled_from_id,
  };
}

// ── Date helpers ────────────────────────────────────────────────────────────
function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7;
  const days: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

const HALF_HOURS = Array.from({ length: 25 }, (_, i) => ({ hour: 8 + Math.floor(i / 2), min: (i % 2) * 30 }));
const HOURS = Array.from({ length: 13 }, (_, i) => 8 + i);
const SLOT_HEIGHT = 48;
const TOTAL_TIMELINE_HEIGHT = HALF_HOURS.length * SLOT_HEIGHT;

// Pack overlapping lessons for a single day into columns.
function computeColumns(lsns: UILesson[]): (UILesson & { col: number; totalCols: number })[] {
  if (lsns.length === 0) return [];
  const sorted = [...lsns].sort(
    (a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes
  );
  const cols: UILesson[][] = [];
  for (const lesson of sorted) {
    let placed = false;
    for (let c = 0; c < cols.length; c++) {
      const last = cols[c][cols[c].length - 1];
      if (lesson.startMinutes >= last.endMinutes) {
        cols[c].push(lesson);
        placed = true;
        break;
      }
    }
    if (!placed) cols.push([lesson]);
  }
  type GItem = { lesson: UILesson; col: number };
  type G = { start: number; end: number; items: GItem[] };
  const gs: G[] = [];
  for (let c = 0; c < cols.length; c++) {
    for (const lesson of cols[c]) {
      let found = false;
      for (const g of gs) {
        if (lesson.startMinutes < g.end && lesson.endMinutes > g.start) {
          g.start = Math.min(g.start, lesson.startMinutes);
          g.end = Math.max(g.end, lesson.endMinutes);
          g.items.push({ lesson, col: c });
          found = true; break;
        }
      }
      if (!found) gs.push({ start: lesson.startMinutes, end: lesson.endMinutes, items: [{ lesson, col: c }] });
    }
  }
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < gs.length; i++) {
      for (let j = i + 1; j < gs.length; j++) {
        if (gs[i].start < gs[j].end && gs[i].end > gs[j].start) {
          gs[i].start = Math.min(gs[i].start, gs[j].start);
          gs[i].end   = Math.max(gs[i].end, gs[j].end);
          gs[i].items.push(...gs[j].items);
          gs.splice(j, 1); merged = true; break;
        }
      }
      if (merged) break;
    }
  }
  const result: (UILesson & { col: number; totalCols: number })[] = [];
  for (const g of gs) {
    const tc = Math.max(...g.items.map(x => x.col)) + 1;
    for (const { lesson, col } of g.items) result.push({ ...lesson, col, totalCols: tc });
  }
  return result;
}

const DAY_NAMES_FULL: Record<string, string[]> = {
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  ru: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
  uz: ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"],
};

export default function SchedulePage() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [view, setView] = useState<ViewMode>("day");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [filterTeacher, setFilterTeacher] = useState("all");
  const [filterRoom, setFilterRoom] = useState("all");
  const [filterCourse, setFilterCourse] = useState("all");
  const [filterGroup, setFilterGroup] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showCancelled, setShowCancelled] = useState(true);
  const [selectedLesson, setSelectedLesson] = useState<UILesson | null>(null);
  const [now, setNow] = useState(new Date());
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [visibleCourses, setVisibleCourses] = useState<Set<string>>(new Set());
  const [highlightConflicts, setHighlightConflicts] = useState(false);
  const [showHotkeys, setShowHotkeys] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportPhase, setExportPhase] = useState<ExportPhase>("idle");

  // Reschedule dialog
  const [rescheduleFor, setRescheduleFor] = useState<UILesson | null>(null);
  // Cancel confirm
  const [cancelFor, setCancelFor] = useState<UILesson | null>(null);

  // ── Range for current view ────────────────────────────────────────────────
  const range = useMemo(() => {
    const d = new Date(currentDate);
    if (view === "day" || view === "rooms") {
      const iso = toISO(d);
      return { from: iso, to: iso };
    }
    if (view === "week") {
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      const start = new Date(d); start.setDate(d.getDate() + diff); start.setHours(0, 0, 0, 0);
      const end = new Date(start); end.setDate(start.getDate() + 6);
      return { from: toISO(start), to: toISO(end) };
    }
    // month
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const last  = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { from: toISO(first), to: toISO(last) };
  }, [view, currentDate]);

  // ── Data ──────────────────────────────────────────────────────────────────
  const scheduleQ = useSchedule(range);
  const roomsQ = useRooms({ limit: 100 });

  const ROOMS = useMemo(
    () => (roomsQ.data?.items ?? []).map((r) => r.name).filter(Boolean),
    [roomsQ.data]
  );

  useEffect(() => {
    const observer = new MutationObserver(() => setIsDark(document.documentElement.classList.contains('dark')));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Build UI lessons
  const lessons: UILesson[] = useMemo(() => {
    return (scheduleQ.data ?? []).map(toUILesson);
  }, [scheduleQ.data]);

  // Initialize visible courses (when set of courses changes)
  useEffect(() => {
    setVisibleCourses(prev => {
      const all = new Set(lessons.map(l => l.course));
      // First load — populate everything; otherwise keep selection but add new courses
      if (prev.size === 0) return all;
      const next = new Set(prev);
      all.forEach(c => { if (!prev.has(c) && !lessons.some(l => l.course === c && prev.has(l.course))) next.add(c); });
      return next;
    });
  }, [lessons]);

  const teachers = useMemo(() => [...new Set(lessons.map(l => l.teacher))].filter(x => x && x !== "—"), [lessons]);
  const courses  = useMemo(() => [...new Set(lessons.map(l => l.course))].filter(x => x && x !== "—"), [lessons]);
  const groupCodes = useMemo(() => [...new Set(lessons.map(l => l.groupCode))], [lessons]);

  // ── Filters ───────────────────────────────────────────────────────────────
  const filteredLessons = useMemo(() => {
    return lessons.filter((l) => {
      if (filterTeacher !== "all" && l.teacher !== filterTeacher) return false;
      if (filterRoom !== "all" && l.room !== filterRoom) return false;
      if (filterCourse !== "all" && l.course !== filterCourse) return false;
      if (filterGroup !== "all" && l.groupCode !== filterGroup) return false;
      if (!visibleCourses.has(l.course) && courses.includes(l.course)) return false;
      if (!showCancelled && (l.status === "cancelled" || l.status === "rescheduled")) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (
          !l.groupCode.toLowerCase().includes(q) &&
          !l.teacher.toLowerCase().includes(q) &&
          !l.course.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [lessons, filterTeacher, filterRoom, filterCourse, filterGroup, searchQuery, visibleCourses, courses, showCancelled]);

  // ── Conflict detection over the loaded range ──────────────────────────────
  const conflictsMap = useMemo(() => {
    // Conflicts only for active (scheduled) lessons.
    const active = lessons.filter(l => l.status === "scheduled");
    const map = new Map<number, { reason: "teacher" | "room"; with: string }[]>();
    // Group by date.
    const byDate = new Map<string, UILesson[]>();
    for (const l of active) {
      if (!byDate.has(l.dateISO)) byDate.set(l.dateISO, []);
      byDate.get(l.dateISO)!.push(l);
    }
    for (const dayLessons of byDate.values()) {
      for (let i = 0; i < dayLessons.length; i++) {
        for (let j = i + 1; j < dayLessons.length; j++) {
          const a = dayLessons[i], b = dayLessons[j];
          if (a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes) {
            if (a.teacher === b.teacher && a.teacher !== "—") {
              for (const id of [a.id, b.id]) {
                const arr = map.get(id) || [];
                arr.push({ reason: "teacher", with: id === a.id ? b.groupCode : a.groupCode });
                map.set(id, arr);
              }
            }
            if (a.room === b.room && a.room !== "—") {
              for (const id of [a.id, b.id]) {
                const arr = map.get(id) || [];
                arr.push({ reason: "room", with: id === a.id ? b.groupCode : a.groupCode });
                map.set(id, arr);
              }
            }
          }
        }
      }
    }
    return map;
  }, [lessons]);

  // ── Helpers: now / past per-lesson ────────────────────────────────────────
  const isNowInLesson = useCallback((l: UILesson) => {
    const start = lessonDateTime(l.dateISO, l.startTimeRaw);
    const end   = lessonDateTime(l.dateISO, l.endTimeRaw);
    return l.status === "scheduled" && now >= start && now <= end;
  }, [now]);

  const isPastLesson = useCallback((l: UILesson) => {
    const end = lessonDateTime(l.dateISO, l.endTimeRaw);
    return now > end;
  }, [now]);

  // KPI counts
  const periodLessons = filteredLessons;
  const activeFiltered = useMemo(
    () => filteredLessons.filter(l => l.status === "scheduled"),
    [filteredLessons]
  );

  const liveNowCount = useMemo(
    () => filteredLessons.filter(isNowInLesson).length,
    [filteredLessons, isNowInLesson]
  );

  const studentsInvolved = useMemo(
    () => activeFiltered.reduce((s, l) => s + l.students, 0),
    [activeFiltered]
  );

  const periodConflictIds = useMemo(() => {
    const ids = new Set<number>();
    activeFiltered.forEach(l => { if (conflictsMap.has(l.id)) ids.add(l.id); });
    return ids;
  }, [activeFiltered, conflictsMap]);

  const getLang = () => language === "ru" ? "ru" : language === "uz" ? "uz" : "en";

  const monthNamesFull: Record<string, string[]> = {
    en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    ru: ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"],
    uz: ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentyabr", "Oktyabr", "Noyabr", "Dekabr"],
  };

  const monthNamesGenitive: Record<string, string[]> = {
    en: monthNamesFull.en,
    ru: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
    uz: ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentyabr", "oktyabr", "noyabr", "dekabr"],
  };

  const formatDateNav = (d: Date) => {
    const lang = getLang();
    const dayNames: Record<string, string[]> = {
      en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
      ru: ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"],
      uz: ["Yak", "Dush", "Sesh", "Chor", "Pay", "Jum", "Shan"],
    };
    return `${dayNames[lang][d.getDay()]}, ${d.getDate()} ${monthNamesGenitive[lang][d.getMonth()]} ${d.getFullYear()}`;
  };

  const goToday = () => setCurrentDate(new Date());

  const isOnToday = useMemo(() => {
    const today = new Date();
    if (view === "day" || view === "rooms") {
      return currentDate.toDateString() === today.toDateString();
    }
    if (view === "month") {
      return (
        currentDate.getFullYear() === today.getFullYear() &&
        currentDate.getMonth() === today.getMonth()
      );
    }
    // week: same Mon–Sun bucket
    const startOfWeek = (d: Date) => {
      const r = new Date(d);
      r.setHours(0, 0, 0, 0);
      const dow = (r.getDay() + 6) % 7;
      r.setDate(r.getDate() - dow);
      return r;
    };
    return startOfWeek(currentDate).getTime() === startOfWeek(today).getTime();
  }, [view, currentDate]);

  const goPrev = useCallback(() => {
    if (view === "day" || view === "rooms") setCurrentDate(d => new Date(d.getTime() - 86400000));
    else if (view === "week") setCurrentDate(d => new Date(d.getTime() - 7 * 86400000));
    else setCurrentDate(d => { const n = new Date(d); n.setMonth(n.getMonth() - 1); return n; });
  }, [view]);

  const goNext = useCallback(() => {
    if (view === "day" || view === "rooms") setCurrentDate(d => new Date(d.getTime() + 86400000));
    else if (view === "week") setCurrentDate(d => new Date(d.getTime() + 7 * 86400000));
    else setCurrentDate(d => { const n = new Date(d); n.setMonth(n.getMonth() + 1); return n; });
  }, [view]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key.toLowerCase()) {
        case 't': goToday(); break;
        case 'd': setView("day"); break;
        case 'w': setView("week"); break;
        case 'm': setView("month"); break;
        case 'r': setView("rooms"); break;
        case '?': setShowHotkeys(true); break;
        case 'arrowleft': goPrev(); break;
        case 'arrowright': goNext(); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goPrev, goNext]);

  const weekStart = useMemo(() => {
    const d = new Date(currentDate);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [currentDate]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  }), [weekStart]);

  // Lessons for the current Day view (real date filter).
  const dayISO = toISO(currentDate);
  const dayLessons = useMemo(
    () => filteredLessons.filter(l => l.dateISO === dayISO),
    [filteredLessons, dayISO]
  );
  const dayLessonsWithCols = useMemo(() => computeColumns(dayLessons), [dayLessons]);

  const isToday = currentDate.toDateString() === new Date().toDateString();
  const nowLinePosition = useMemo(() => {
    const min = now.getHours() * 60 + now.getMinutes();
    if (min < 480 || min > 1200) return null;
    return ((min - 480) / 720) * TOTAL_TIMELINE_HEIGHT;
  }, [now]);

  // Active filter pills
  const activeFilters: { key: string; label: string; onClear: () => void }[] = [];
  if (filterTeacher !== "all") activeFilters.push({ key: "teacher", label: `${t("schedule.teacher")}: ${filterTeacher}`, onClear: () => setFilterTeacher("all") });
  if (filterRoom !== "all") activeFilters.push({ key: "room", label: `${t("schedule.room")}: ${filterRoom}`, onClear: () => setFilterRoom("all") });
  if (filterCourse !== "all") activeFilters.push({
    key: "course",
    // The regex strips the locale-specific "All / Все / Barcha " prefix from
    // schedule.allCourses ("All Courses" → "Courses"). Keep the alternation
    // in sync with translations of `schedule.allCourses` in use-language.tsx.
    label: `${t("schedule.allCourses").replace(/^(All |Все |Barcha )/, '')}: ${filterCourse}`,
    onClear: () => setFilterCourse("all"),
  });
  if (filterGroup !== "all") activeFilters.push({ key: "group", label: `${t("schedule.group")}: ${filterGroup}`, onClear: () => setFilterGroup("all") });

  const clearAllFilters = () => {
    setFilterTeacher("all"); setFilterRoom("all"); setFilterCourse("all"); setFilterGroup("all"); setSearchQuery("");
  };

  const toggleCourseVisibility = (course: string) => {
    setVisibleCourses(prev => {
      const next = new Set(prev);
      if (next.has(course)) next.delete(course); else next.add(course);
      return next;
    });
  };

  // ── ICS export over loaded range ──────────────────────────────────────────
  const exportIcs = useCallback(() => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmt = (iso: string, hh: string, mm: string) => {
      const [Y, M, D] = iso.split("-");
      return `${Y}${M}${D}T${pad(+hh)}${pad(+mm)}00`;
    };
    const lines: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//IELTS Imperia//Schedule//EN"];
    for (const l of periodLessons) {
      if (l.status !== "scheduled") continue;
      const [sh, sm] = l.startStr.split(":");
      const [eh, em] = l.endStr.split(":");
        lines.push("BEGIN:VEVENT");
      lines.push(`UID:lesson-${l.id}@imperia`);
      lines.push(`DTSTART:${fmt(l.dateISO, sh, sm)}`);
      lines.push(`DTEND:${fmt(l.dateISO, eh, em)}`);
        lines.push(`SUMMARY:${l.groupCode} — ${l.course}`);
        lines.push(`LOCATION:${l.room}`);
        lines.push(`DESCRIPTION:${l.teacher} · ${l.students}/${l.maxStudents}`);
        lines.push("END:VEVENT");
    }
    lines.push("END:VCALENDAR");
    runTextExport(
      lines.join("\r\n"),
      "text/calendar;charset=utf-8",
      buildUnifiedExportFileName({
        entity: "schedule",
        format: "ics",
        rangeLabel: `${range.from}-to-${range.to}`,
      }),
    );
    toast.success(t("schedule.exportSuccess"));
  }, [periodLessons, range, t]);

  const scheduleExportSummary: ExportFilterSummaryItem[] = [
    { label: t("common.from"), value: range.from },
    { label: t("common.to"), value: range.to },
    ...(filterTeacher !== "all" ? [{ label: t("schedule.teacher"), value: filterTeacher }] : []),
    ...(filterRoom !== "all" ? [{ label: t("schedule.room"), value: filterRoom }] : []),
    ...(filterCourse !== "all" ? [{ label: t("schedule.allCourses"), value: filterCourse }] : []),
    ...(filterGroup !== "all" ? [{ label: t("schedule.group"), value: filterGroup }] : []),
  ];

  const copyLessonLink = useCallback((lesson: UILesson) => {
    const url = `${window.location.origin}/schedule?lesson=${lesson.id}`;
    navigator.clipboard.writeText(url).then(() => toast.success(t("schedule.linkCopied")));
  }, [t]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const cancelMu = useCancelLesson();
  const rescheduleMu = useRescheduleLesson();

  const handleCancel = useCallback((lesson: UILesson) => {
    cancelMu.mutate(
      { id: lesson.id },
      {
        onSuccess: (updated) => {
    toast.success(`${t("schedule.lessonCancelled")}: ${lesson.groupCode}`);
          setSelectedLesson(toUILesson(updated));
          setCancelFor(null);
        },
        onError: (e: unknown) => {
          const msg = (e as { message?: string } | undefined)?.message ?? "Error";
          toast.error(msg);
        },
      },
    );
  }, [cancelMu, t]);

  const handleReschedule = useCallback(
    (lesson: UILesson, payload: { new_date: string; new_start_time: string; new_end_time: string; note?: string }) => {
      rescheduleMu.mutate(
        { id: lesson.id, data: payload },
        {
          onSuccess: () => {
            toast.success(`${t("schedule.lessonRescheduled")}: ${lesson.groupCode}`);
            setRescheduleFor(null);
    setSelectedLesson(null);
          },
          onError: (e: unknown) => {
            const msg = (e as { message?: string } | undefined)?.message ?? "Error";
            toast.error(msg);
          },
        },
      );
    },
    [rescheduleMu, t],
  );

  // Month view data
  const monthDays = useMemo(() => getMonthDays(currentDate.getFullYear(), currentDate.getMonth()), [currentDate]);
  const lessonsByDate = useMemo(() => {
    const map = new Map<string, UILesson[]>();
    for (const l of filteredLessons) {
      if (!map.has(l.dateISO)) map.set(l.dateISO, []);
      map.get(l.dateISO)!.push(l);
    }
    return map;
  }, [filteredLessons]);
  const getLessonsForDate = (date: Date) => lessonsByDate.get(toISO(date)) ?? [];

  // Mini calendar
  const [miniMonth, setMiniMonth] = useState(() => new Date());
  useEffect(() => setMiniMonth(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)), [currentDate]);
  const miniDays = useMemo(() => getMonthDays(miniMonth.getFullYear(), miniMonth.getMonth()), [miniMonth]);

  const dayNamesShort = DAY_NAMES_FULL;

  const renderLessonCard = (lesson: UILesson, compact = false) => {
    const active = isNowInLesson(lesson);
    const past = isPastLesson(lesson) && lesson.status === "scheduled";
    const cancelled = lesson.status === "cancelled";
    const rescheduled = lesson.status === "rescheduled";
    const cardColors = getCardColors(lesson.course, isDark);
    const activeBorder = active ? '#22c55e' : cardColors.border;
    const timeStr = `${lesson.startStr} – ${lesson.endStr}`;
    const conflicts = conflictsMap.get(lesson.id);
    const hasConflict = !!conflicts && conflicts.length > 0 && lesson.status === "scheduled";
    const conflictHighlight = hasConflict && highlightConflicts;
    const conflictTooltip = hasConflict
      ? conflicts!.map(c => `${t(c.reason === "teacher" ? "schedule.conflictTeacher" : "schedule.conflictRoom")} (${c.with})`).join("; ")
      : undefined;

    const stripeStyle = cancelled
      ? { backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(239,68,68,0.18) 6px, rgba(239,68,68,0.18) 8px)' }
      : undefined;

    if (compact) {
      return (
        <div
          key={lesson.id}
          onClick={() => setSelectedLesson(lesson)}
          title={conflictTooltip}
          className={cn(
            "h-full rounded-lg cursor-pointer transition-all overflow-hidden flex flex-col hover:shadow-md hover:-translate-y-px",
            past && "opacity-60",
            cancelled && "opacity-60",
            rescheduled && "opacity-50",
            conflictHighlight && "ring-2 ring-destructive ring-offset-1 ring-offset-card"
          )}
          style={{
            background: cardColors.bg,
            borderLeft: `3px solid ${cancelled ? '#ef4444' : hasConflict ? 'hsl(var(--destructive))' : activeBorder}`,
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            color: cardColors.title,
            ...stripeStyle,
          }}
        >
          <div className="px-2.5 py-2 flex flex-col gap-0.5 min-h-0 flex-1 overflow-hidden" style={{ lineHeight: 1.4 }}>
            <div className="flex items-center gap-1 min-w-0">
              <span className={cn("font-semibold text-[13px] truncate", cancelled && "line-through")} style={{ color: cardColors.title }}>
                {lesson.groupCode}
              </span>
              {active && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
              {cancelled && <Ban className="h-3 w-3 shrink-0 text-red-500 ml-auto" />}
              {rescheduled && <Repeat className="h-3 w-3 shrink-0 text-amber-500 ml-auto" />}
              {hasConflict && !cancelled && !rescheduled && <AlertTriangle className="h-3 w-3 shrink-0 text-destructive ml-auto" />}
            </div>
            <div className="text-[12px] tabular-nums" style={{ color: cardColors.time }}>
              {timeStr}
            </div>
            <div className="flex items-center gap-1 text-[12px] truncate" style={{ color: cardColors.meta }}>
              <User className="h-3 w-3 shrink-0" strokeWidth={1.75} />
              <span className="truncate">{lesson.teacher}</span>
            </div>
            <div className="flex items-center gap-1 text-[12px] truncate" style={{ color: cardColors.meta }}>
              <DoorOpen className="h-3 w-3 shrink-0" strokeWidth={1.75} />
              <span className="truncate">{lesson.room}</span>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        key={lesson.id}
        title={conflictTooltip}
        className={cn(
          "w-full h-full rounded-[12px] cursor-pointer transition-all duration-200 overflow-hidden hover:-translate-y-0.5",
          past && "opacity-50",
          cancelled && "opacity-60",
          rescheduled && "opacity-50",
          active && "ring-1 ring-emerald-500/40",
          conflictHighlight && "ring-2 ring-destructive ring-offset-2 ring-offset-card"
        )}
        style={{
          background: cardColors.bg,
          borderLeft: `4px solid ${cancelled ? '#ef4444' : hasConflict ? 'hsl(var(--destructive))' : activeBorder}`,
          boxShadow: cardColors.shadow,
          ...stripeStyle,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = cardColors.hoverShadow; }}
        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = cardColors.shadow; }}
        onClick={() => setSelectedLesson(lesson)}
      >
        <div className="px-3.5 py-3 h-full flex flex-col">
          <div className="flex items-start justify-between gap-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={cn("font-bold text-sm", cancelled && "line-through")} style={{ color: cardColors.title }}>{lesson.groupCode}</span>
              {active && (
                <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full font-bold animate-pulse border border-emerald-500/30 whitespace-nowrap leading-none">
                  ● {t("schedule.now")}
                </span>
              )}
              {cancelled && (
                <span className="text-[9px] bg-red-500/20 text-red-500 px-1.5 py-0.5 rounded-full font-bold border border-red-500/30 whitespace-nowrap leading-none flex items-center gap-0.5">
                  <Ban className="h-2.5 w-2.5" />{t("schedule.cancelled")}
                </span>
              )}
              {rescheduled && (
                <span className="text-[9px] bg-amber-500/20 text-amber-500 px-1.5 py-0.5 rounded-full font-bold border border-amber-500/30 whitespace-nowrap leading-none flex items-center gap-0.5">
                  <Repeat className="h-2.5 w-2.5" />{t("schedule.rescheduled")}
                </span>
              )}
              {hasConflict && !cancelled && !rescheduled && (
                <span className="text-[9px] bg-destructive/20 text-destructive px-1.5 py-0.5 rounded-full font-bold border border-destructive/30 whitespace-nowrap leading-none flex items-center gap-0.5">
                  <AlertTriangle className="h-2.5 w-2.5" />{t("schedule.conflict")}
                </span>
              )}
            </div>
            <span className="text-[11px] tabular-nums font-medium whitespace-nowrap mt-0.5" style={{ color: cardColors.time }}>{timeStr}</span>
          </div>
          <div className="w-full h-px my-1.5" style={{ background: cardColors.divider }} />
           <div className="flex items-center gap-1.5 text-xs truncate" style={{ color: cardColors.meta }}>
             <User className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} /><span className="truncate">{lesson.teacher}</span>
           </div>
           <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: cardColors.meta }}>
             <span className="flex items-center gap-1 truncate"><DoorOpen className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} /><span className="truncate">{lesson.room}</span></span>
             <span className="flex items-center gap-1 shrink-0"><Users className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />{lesson.students}/{lesson.maxStudents}</span>
           </div>
        </div>
      </div>
    );
  };

  const viewButtons = [
    { key: "day" as ViewMode, Icon: CalendarIcon, label: t("schedule.day"), shortcut: "D" },
    { key: "week" as ViewMode, Icon: CalendarRange, label: t("schedule.week"), shortcut: "W" },
    { key: "month" as ViewMode, Icon: CalendarDays, label: t("schedule.month"), shortcut: "M" },
    { key: "rooms" as ViewMode, Icon: LayoutGrid, label: t("schedule.rooms"), shortcut: "R" },
  ];

  const nowTimeLabel = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const isLoading = scheduleQ.isLoading;
  /** API returned no lessons for the selected range — still render week/month/day grids. */
  const noLessonsInRange = !isLoading && lessons.length === 0;

  return (
    <DashboardLayout>
      <div className="space-y-4 animate-fade-in print:space-y-2">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 print:hidden">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t("schedule.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("schedule.subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <ExportActionButton
              phase={exportPhase}
              onClick={() => setExportOpen(true)}
              label={t("schedule.exportIcs")}
            />
            <Button variant="outline" size="sm" className="rounded-xl h-9 gap-1.5" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("schedule.print")}</span>
            </Button>
            <Popover open={showHotkeys} onOpenChange={setShowHotkeys}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="icon" className="rounded-xl h-9 w-9">
                  <Keyboard className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("schedule.hotkeys")}</p>
                {[
                  { k: "T", l: t("schedule.hotkeyToday") },
                  { k: "D", l: t("schedule.hotkeyDay") },
                  { k: "W", l: t("schedule.hotkeyWeek") },
                  { k: "M", l: t("schedule.hotkeyMonth") },
                  { k: "R", l: t("schedule.rooms") },
                  { k: "← →", l: t("schedule.hotkeyNav") },
                ].map(h => (
                  <div key={h.k} className="flex items-center justify-between text-xs">
                    <span className="text-foreground">{h.l}</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono text-[10px]">{h.k}</kbd>
                  </div>
                ))}
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 print:hidden">
          {[
            { label: t("schedule.kpiLessons"), value: activeFiltered.length, Icon: CalendarDays, color: "text-primary", bg: "bg-primary/10", onClick: () => setHighlightConflicts(false) },
            { label: t("schedule.kpiNow"), value: liveNowCount, Icon: Clock, color: "text-success", bg: "bg-success/10", onClick: () => { setView("day"); setCurrentDate(new Date()); setHighlightConflicts(false); } },
            { label: t("schedule.kpiStudents"), value: studentsInvolved, Icon: Users, color: "text-foreground", bg: "bg-muted", onClick: () => setHighlightConflicts(false) },
            { label: t("schedule.kpiConflicts"), value: periodConflictIds.size, Icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10", onClick: () => setHighlightConflicts(h => !h), active: highlightConflicts },
          ].map((kpi, i) => (
            <button
              key={kpi.label}
              onClick={kpi.onClick}
              className={cn(
                "rounded-xl border bg-card p-3 sm:p-4 shadow-sm text-left transition-all hover:-translate-y-0.5 hover:shadow-md animate-fade-in",
                kpi.active ? "border-destructive ring-2 ring-destructive/30" : "border-border/60"
              )}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className={cn("h-6 w-6 rounded-lg flex items-center justify-center", kpi.bg)}>
                  <kpi.Icon className={cn("h-3.5 w-3.5", kpi.color)} />
                </span>
                <span className="text-[10px] sm:text-xs text-muted-foreground truncate">{kpi.label}</span>
              </div>
              <p className={cn("text-xl sm:text-2xl font-bold tabular-nums", kpi.value > 0 && kpi.label === t("schedule.kpiConflicts") ? "text-destructive" : "text-foreground")}>{kpi.value}</p>
            </button>
          ))}
        </div>

        {/* Row 1: View tabs + Date navigation + Today */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-xl border border-border bg-card p-1 gap-1">
            {viewButtons.map(v => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200",
                  view === v.key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <v.Icon className="h-4 w-4" strokeWidth={1.5} />
                {v.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-1 py-1">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={goPrev}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-sm font-semibold px-3 min-w-[200px] text-center">{formatDateNav(currentDate)}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={goNext}><ChevronRight className="h-4 w-4" /></Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="rounded-full h-9 px-5 font-medium gap-1.5 disabled:opacity-50"
            onClick={goToday}
            disabled={isOnToday}
            title={isOnToday ? t("schedule.today") : undefined}
          >
            <CalendarCheck className="h-4 w-4" strokeWidth={1.5} />
            {t("schedule.today")}
          </Button>
        </div>

        {/* Row 2: Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("schedule.search")}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 h-9 w-[200px] rounded-xl border-border bg-card text-sm"
            />
          </div>
          <Select value={filterTeacher} onValueChange={setFilterTeacher}>
            <SelectTrigger className="w-[170px] h-9 rounded-xl border-border bg-card text-sm">
              <SelectValue placeholder={t("schedule.allTeachers")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("schedule.allTeachers")}</SelectItem>
              {teachers.map(te => <SelectItem key={te} value={te}>{te}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterRoom} onValueChange={setFilterRoom}>
            <SelectTrigger className="w-[170px] h-9 rounded-xl border-border bg-card text-sm">
              <SelectValue placeholder={t("schedule.allRooms")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("schedule.allRooms")}</SelectItem>
              {ROOMS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterCourse} onValueChange={setFilterCourse}>
            <SelectTrigger className="w-[170px] h-9 rounded-xl border-border bg-card text-sm">
              <SelectValue placeholder={t("schedule.allCourses")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("schedule.allCourses")}</SelectItem>
              {courses.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterGroup} onValueChange={setFilterGroup}>
            <SelectTrigger className="w-[140px] h-9 rounded-xl border-border bg-card text-sm">
              <SelectValue placeholder={t("schedule.allGroups")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("schedule.allGroups")}</SelectItem>
              {groupCodes.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className={cn("rounded-xl h-9 gap-1.5", showAdvancedFilters && "bg-muted")}
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {t("schedule.more")}
          </Button>
        </div>

        {/* Advanced filters */}
        {showAdvancedFilters && (
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl border border-border bg-card/50 animate-fade-in">
            <span className="text-xs text-muted-foreground font-medium">{t("schedule.status")}:</span>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <Checkbox checked={showCancelled} onCheckedChange={(v) => setShowCancelled(!!v)} className="h-3.5 w-3.5" />
              {t("schedule.statusCancelled")} / {t("schedule.statusRescheduled")}
            </label>
          </div>
        )}

        {/* Active filter pills */}
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {activeFilters.map(f => (
              <div key={f.key} className="flex items-center gap-1.5 bg-primary/10 text-primary rounded-full px-3 py-1 text-xs font-medium">
                {f.label}
                <button onClick={f.onClear} className="hover:bg-primary/20 rounded-full p-0.5"><X className="h-3 w-3" /></button>
              </div>
            ))}
            <button onClick={clearAllFilters} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
              {t("schedule.clearAll")}
            </button>
          </div>
        )}

        {/* Main content with sidebar */}
        <div className="flex gap-4">
          {/* Left sidebar */}
          <div className="hidden lg:block w-[240px] shrink-0 space-y-4">
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center justify-between mb-2">
                <button onClick={() => setMiniMonth(d => { const n = new Date(d); n.setMonth(n.getMonth() - 1); return n; })} className="p-1 rounded hover:bg-muted"><ChevronLeft className="h-3.5 w-3.5" /></button>
                <span className="text-sm font-semibold">{monthNamesFull[getLang()][miniMonth.getMonth()]} {miniMonth.getFullYear()}</span>
                <button onClick={() => setMiniMonth(d => { const n = new Date(d); n.setMonth(n.getMonth() + 1); return n; })} className="p-1 rounded hover:bg-muted"><ChevronRight className="h-3.5 w-3.5" /></button>
              </div>
              <div className="grid grid-cols-7 gap-0.5 text-center">
                {dayNamesShort[getLang()].map(d => (
                  <div key={d} className="text-[10px] text-muted-foreground font-medium py-1">{d}</div>
                ))}
                {miniDays.map((day, i) => {
                  if (!day) return <div key={`e${i}`} />;
                  const isSel = day.toDateString() === currentDate.toDateString();
                  const isTd = day.toDateString() === new Date().toDateString();
                  const dow = day.getDay();
                  const isWeekend = dow === 0 || dow === 6;
                  const hasLessons = lessonsByDate.has(toISO(day));
                  return (
                    <button
                      key={i}
                      onClick={() => { setCurrentDate(new Date(day)); if (view === "month") setView("day"); }}
                      className={cn(
                        "relative text-xs h-7 w-7 rounded-full transition-all flex items-center justify-center mx-auto",
                        isSel ? "bg-primary text-primary-foreground font-bold" : isTd ? "border border-primary text-primary font-semibold" : isWeekend ? "text-muted-foreground/50" : "text-foreground hover:bg-muted"
                      )}
                    >
                      {day.getDate()}
                      {hasLessons && !isSel && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary/60" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {courses.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="text-xs font-semibold text-muted-foreground mb-2">{t("schedule.myCalendars")}</div>
              <div className="space-y-1.5">
                {courses.map(course => (
                  <label key={course} className="flex items-center gap-2 cursor-pointer group">
                    <Checkbox
                      checked={visibleCourses.has(course)}
                      onCheckedChange={() => toggleCourseVisibility(course)}
                      className="h-4 w-4 rounded border-2"
                      style={{ borderColor: getCourseColorDot(course), backgroundColor: visibleCourses.has(course) ? getCourseColorDot(course) : 'transparent' }}
                    />
                    <span className="text-xs text-foreground group-hover:text-primary transition-colors truncate">{course}</span>
                  </label>
                ))}
              </div>
            </div>
            )}
          </div>

          {/* Main view */}
          <div className="flex-1 min-w-0">
            {isLoading ? (
              <div className="rounded-xl border border-border bg-card flex items-center justify-center py-24">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {noLessonsInRange && (
                  <div className="mb-3 rounded-xl border border-dashed border-border/80 bg-muted/20 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 text-center sm:text-left">
                    <CalendarDays className="h-8 w-8 text-muted-foreground/50 shrink-0 mx-auto sm:mx-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{t("schedule.empty")}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t("schedule.emptyHint")}</p>
                    </div>
                  </div>
                )}
            {/* ===== DAY VIEW ===== */}
            {view === "day" && (
              <div className="relative rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex pt-8" style={{ minHeight: `${TOTAL_TIMELINE_HEIGHT + 32}px` }}>
                  <div className="relative w-[78px] shrink-0" style={{ height: `${TOTAL_TIMELINE_HEIGHT}px` }}>
                    <div className="absolute right-[9px] top-0 bottom-0 w-px bg-border/60" />
                    {HALF_HOURS.map((slot, i) => {
                      const isHour = slot.min === 0;
                      const label = `${String(slot.hour).padStart(2, "0")}:${String(slot.min).padStart(2, "0")}`;
                      return (
                        <div key={i} className="absolute left-0 right-0" style={{ top: `${i * SLOT_HEIGHT}px` }}>
                          <div className="flex items-start h-0">
                            <div className="w-[60px] shrink-0 pr-2 -mt-[7px] text-right">
                              {isHour ? <span className="text-[11px] text-muted-foreground/80 font-medium tabular-nums">{label}</span>
                                : <span className="text-[10px] text-muted-foreground/40 tabular-nums">{label}</span>}
                            </div>
                            <div className="relative w-[18px] shrink-0 flex justify-center -mt-[3px]">
                              {isHour && <div className="w-[5px] h-[5px] rounded-full bg-border" />}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {isToday && nowLinePosition !== null && (
                      <div className="absolute left-0 right-0 z-30" style={{ top: `${nowLinePosition}px` }}>
                        <div className="flex items-start h-0">
                          <div className="w-[60px] shrink-0 pr-2 -mt-[7px] text-right">
                            <span className="text-[10px] font-bold text-red-500 tabular-nums">{nowTimeLabel}</span>
                          </div>
                          <div className="relative w-[18px] shrink-0 flex justify-center -mt-[3px]">
                            <div className="w-[7px] h-[7px] rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="relative flex-1 mr-4" style={{ height: `${TOTAL_TIMELINE_HEIGHT}px` }}>
                    {HALF_HOURS.map((slot, i) => (
                      <div key={i} className="absolute left-0 right-0" style={{ top: `${i * SLOT_HEIGHT}px` }}>
                        <div className={cn("w-full h-px", slot.min === 0 ? "bg-border/50" : "bg-border/20")} />
                      </div>
                    ))}
                    {isToday && nowLinePosition !== null && (
                      <div className="absolute left-0 right-0 z-30 pointer-events-none" style={{ top: `${nowLinePosition}px` }}>
                        <div className="w-full h-px bg-red-500/60" />
                      </div>
                    )}
                    {HALF_HOURS.slice(0, -1).map((slot, i) => {
                      const slotMin = slot.hour * 60 + slot.min;
                          const hasLesson = dayLessons.some(l => slotMin >= l.startMinutes && slotMin < l.endMinutes);
                      if (hasLesson) return null;
                      return (
                        <div key={`empty-${i}`} className="absolute left-0 right-0 group cursor-pointer" style={{ top: `${i * SLOT_HEIGHT}px`, height: `${SLOT_HEIGHT}px` }}>
                          <div className="w-full h-full rounded-lg border border-dashed border-transparent group-hover:border-muted-foreground/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200">
                            <div className="flex items-center gap-1.5 text-muted-foreground/40">
                              <Plus className="h-3.5 w-3.5" /><span className="text-[11px] font-medium">{t("schedule.addLesson")}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {dayLessonsWithCols.map(lesson => {
                          const startMin = lesson.startMinutes - 480;
                      const topPx = (startMin / 30) * SLOT_HEIGHT;
                          const durationMin = lesson.endMinutes - lesson.startMinutes;
                      const heightPx = (durationMin / 30) * SLOT_HEIGHT;
                      const GAP = 8;
                      const colWidth = `calc(${100 / lesson.totalCols}% - ${GAP}px)`;
                      const colLeft = `calc(${(lesson.col / lesson.totalCols) * 100}% + ${lesson.col > 0 ? GAP / 2 : 0}px)`;
                      return (
                            <div key={lesson.id} className="absolute z-10" style={{ top: `${topPx + 2}px`, height: `${Math.max(heightPx - 4, SLOT_HEIGHT - 4)}px`, left: `calc(${colLeft} + 8px)`, width: `calc(${colWidth} - 8px)` }}>
                          {renderLessonCard(lesson)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ===== WEEK VIEW ===== */}
            {view === "week" && (() => {
                  const ROW_H = 96;
              const TOTAL_H = HOURS.length * ROW_H;
              const todayIdx = weekDays.findIndex(d => d.toDateString() === new Date().toDateString());
              const nowMin = now.getHours() * 60 + now.getMinutes();
              const showNowLine = todayIdx >= 0 && nowMin >= 480 && nowMin <= 1260;
              const nowTop = showNowLine ? ((nowMin - 480) / 60) * ROW_H : 0;
              const DAY_MIN_W = 140;
              const TIME_COL_W = 64;

                  const groupOverlaps = (lsns: UILesson[]) => {
                const sorted = [...lsns].sort((a, b) => {
                      if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
                      return (b.endMinutes - b.startMinutes) - (a.endMinutes - a.startMinutes);
                    });
                    type Group = { primary: UILesson; siblings: UILesson[] };
                const groups: Group[] = [];
                for (const lesson of sorted) {
                  let attached = false;
                  for (const g of groups) {
                        if (lesson.startMinutes < g.primary.endMinutes && lesson.endMinutes > g.primary.startMinutes) {
                      g.siblings.push(lesson);
                          attached = true; break;
                    }
                  }
                  if (!attached) groups.push({ primary: lesson, siblings: [] });
                }
                return groups;
              };

              return (
                <div className="rounded-xl border border-border bg-card overflow-auto">
                  <div style={{ minWidth: `${TIME_COL_W + DAY_MIN_W * 7}px` }}>
                    <div className="flex border-b border-border bg-card sticky top-0 z-30">
                      <div className="shrink-0" style={{ width: `${TIME_COL_W}px` }} />
                      {weekDays.map((d, i) => {
                        const isTodayCol = d.toDateString() === new Date().toDateString();
                        return (
                          <div
                                key={i}
                            className={cn(
                              "flex-1 py-2.5 text-center border-l border-border transition-colors hover:bg-muted/30 cursor-pointer",
                              isTodayCol && "bg-primary/[0.04]"
                            )}
                            style={{ minWidth: `${DAY_MIN_W}px` }}
                            onClick={() => { setCurrentDate(new Date(d)); setView("day"); }}
                          >
                            <div className={cn(
                              "text-[10px] font-semibold uppercase tracking-wider",
                              isTodayCol ? "text-primary" : "text-muted-foreground"
                            )}>
                              {dayNamesShort[getLang()][i]}
                            </div>
                            <div
                              className={cn(
                                "text-xl font-semibold mx-auto mt-1 w-9 h-9 rounded-full flex items-center justify-center transition-all",
                                isTodayCol ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground hover:bg-muted"
                              )}
                            >
                              {d.getDate()}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="relative flex" style={{ height: `${TOTAL_H}px` }}>
                      <div className="shrink-0 relative" style={{ width: `${TIME_COL_W}px` }}>
                        {HOURS.map((hour, idx) => (
                          <div
                            key={hour}
                            className="absolute right-2 -translate-y-1/2 text-[11px] text-muted-foreground tabular-nums font-medium"
                            style={{ top: `${idx * ROW_H}px` }}
                          >
                            {idx === 0 ? "" : `${String(hour).padStart(2, "0")}:00`}
                          </div>
                        ))}
                      </div>

                      {weekDays.map((d, i) => {
                            const iso = toISO(d);
                        const isTodayCol = d.toDateString() === new Date().toDateString();
                            const dayLs = filteredLessons.filter(l => l.dateISO === iso);
                        const overlapGroups = groupOverlaps(dayLs);
                        return (
                          <div
                                key={i}
                            className={cn(
                              "flex-1 relative border-l border-border",
                              isTodayCol && "bg-primary/[0.02]"
                            )}
                            style={{ minWidth: `${DAY_MIN_W}px` }}
                          >
                                {HOURS.map((hour, idx) => (
                                <div
                                  key={hour}
                                    className="absolute left-0 right-0 border-b border-border/60 group transition-colors hover:bg-primary/[0.04]"
                                  style={{ top: `${idx * ROW_H}px`, height: `${ROW_H}px` }}
                                >
                                  <div
                                    className="absolute left-0 right-0 border-t border-dashed border-border/40 pointer-events-none"
                                    style={{ top: `${ROW_H / 2}px` }}
                                  />
                                  </div>
                                ))}

                            {overlapGroups.map(({ primary, siblings }) => {
                              const SIDE_GAP = 4;
                              const OFFSET = 14;
                              const MAX_VISIBLE_SIBLINGS = 1;
                              const visibleSiblings = siblings.slice(0, MAX_VISIBLE_SIBLINGS);
                              const overflow = siblings.slice(MAX_VISIBLE_SIBLINGS);

                                  const renderPositioned = (lesson: UILesson, depth: number, zIndex: number) => {
                                    const topMin = lesson.startMinutes - 480;
                                    const durMin = lesson.endMinutes - lesson.startMinutes;
                                const topPx = (topMin / 60) * ROW_H;
                                const hPx = Math.max((durMin / 60) * ROW_H, 60);
                                return (
                                  <div
                                        key={lesson.id}
                                        className="absolute"
                                    style={{
                                      top: `${topPx + 2}px`,
                                      height: `${hPx - 4}px`,
                                      left: `${SIDE_GAP + depth * OFFSET}px`,
                                      right: `${SIDE_GAP}px`,
                                      zIndex: 10 + zIndex,
                                    }}
                                  >
                                    {renderLessonCard(lesson, true)}
                                  </div>
                                );
                              };

                                  const primaryTopPx = ((primary.startMinutes - 480) / 60) * ROW_H;
                                  const primaryHPx = Math.max(((primary.endMinutes - primary.startMinutes) / 60) * ROW_H, 60);

                              return (
                                    <div key={primary.id + "-grp"}>
                                  {renderPositioned(primary, 0, 0)}
                                  {visibleSiblings.map((s, idx) => renderPositioned(s, idx + 1, idx + 1))}
                                  {overflow.length > 0 && (
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <button
                                          type="button"
                                          className="absolute z-30 right-1 px-1.5 py-0.5 rounded-full bg-foreground text-background text-[10px] font-bold shadow hover:scale-105 transition-transform"
                                              style={{ top: `${primaryTopPx + primaryHPx - 18}px` }}
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          +{overflow.length}
                                        </button>
                                      </PopoverTrigger>
                                      <PopoverContent align="end" className="w-64 p-2 space-y-1">
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 py-1">
                                          {overflow.length + visibleSiblings.length + 1} {t("schedule.title")}
                                        </p>
                                        {[primary, ...siblings].map(l => {
                                          const c = getCardColors(l.course, isDark);
                                              const time = `${l.startStr} – ${l.endStr}`;
                                          return (
                                            <button
                                                  key={l.id}
                                              onClick={() => setSelectedLesson(l)}
                                              className="w-full text-left rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors flex items-center gap-2"
                                            >
                                              <span className="w-1 h-8 rounded-full shrink-0" style={{ background: c.border }} />
                                              <span className="min-w-0 flex-1">
                                                <span className="block text-[13px] font-semibold text-foreground truncate">{l.groupCode}</span>
                                                <span className="block text-[11px] text-muted-foreground tabular-nums">{time}</span>
                                              </span>
                                            </button>
                                          );
                                        })}
                                      </PopoverContent>
                                    </Popover>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}

                      {showNowLine && (
                        <div
                          className="absolute right-0 z-20 pointer-events-none"
                          style={{ top: `${nowTop}px`, left: `${TIME_COL_W}px` }}
                        >
                          <div className="relative">
                            <div className="absolute -left-[52px] -top-2.5 flex items-center gap-1">
                              <span className="text-[10px] font-semibold tabular-nums text-red-500 bg-card px-1 rounded">
                                {nowTimeLabel}
                              </span>
                            </div>
                            <div className="absolute -left-1.5 -top-[5px] w-2.5 h-2.5 rounded-full bg-red-500 shadow-sm" />
                            <div className="h-0.5 w-full bg-red-500" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* ===== MONTH VIEW ===== */}
            {view === "month" && (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="grid grid-cols-7 border-b border-border">
                  {dayNamesShort[getLang()].map((d, i) => (
                    <div key={d} className={cn("p-2 text-center text-xs font-semibold", i >= 5 ? "text-muted-foreground/50" : "text-muted-foreground")}>
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {monthDays.map((day, i) => {
                    if (!day) return <div key={`e${i}`} className="min-h-[100px] border-b border-r border-border bg-muted/20" />;
                    const isTd = day.toDateString() === new Date().toDateString();
                    const isSel = day.toDateString() === currentDate.toDateString();
                    const dow = day.getDay();
                    const isWeekend = dow === 0 || dow === 6;
                    const dayLs = getLessonsForDate(day);
                    return (
                      <div
                        key={i}
                        className={cn(
                          "min-h-[100px] border-b border-r border-border p-1.5 cursor-pointer transition-colors hover:bg-muted/30",
                          isWeekend && "bg-muted/10",
                          isTd && "bg-primary/5"
                        )}
                        onClick={() => { setCurrentDate(new Date(day)); setView("day"); }}
                      >
                        <div className={cn(
                          "text-sm font-medium mb-1 w-7 h-7 rounded-full flex items-center justify-center",
                          isTd ? "bg-primary text-primary-foreground font-bold" : isSel ? "ring-2 ring-primary" : isWeekend ? "text-muted-foreground/50" : "text-foreground"
                        )}>
                          {day.getDate()}
                        </div>
                        <div className="space-y-0.5">
                          {dayLs.slice(0, 3).map(lesson => {
                            const color = getCourseColorDot(lesson.course);
                            const cardColors = getCardColors(lesson.course, isDark);
                            return (
                              <div
                                    key={lesson.id}
                                    className={cn(
                                      "flex items-center gap-1 rounded px-1 py-0.5 text-[10px] truncate",
                                      lesson.status === "cancelled" && "opacity-60",
                                      lesson.status === "rescheduled" && "opacity-50",
                                    )}
                                style={{ background: cardColors.bg, borderLeft: `2px solid ${color}` }}
                                onClick={(e) => { e.stopPropagation(); setSelectedLesson(lesson); }}
                              >
                                    <span className={cn("font-medium truncate", lesson.status === "cancelled" && "line-through")} style={{ color: cardColors.title }}>{lesson.groupCode}</span>
                              </div>
                            );
                          })}
                          {dayLs.length > 3 && (
                            <div className="text-[10px] text-muted-foreground pl-1 font-medium">+{dayLs.length - 3}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

                {/* ===== ROOMS VIEW ===== */}
            {view === "rooms" && (
              <div className="rounded-xl border border-border bg-card overflow-auto">
                <div className="text-[11px] text-muted-foreground px-4 py-2 border-b border-border bg-muted/20">
                  {t("schedule.roomsViewHint")} · {formatDateNav(currentDate)}
                </div>
                    <div className="grid" style={{ gridTemplateColumns: `64px repeat(${Math.max(ROOMS.length, 1)}, minmax(180px, 1fr))` }}>
                  <div className="border-b border-border bg-muted/30" />
                  {ROOMS.map(r => (
                    <div key={r} className="border-b border-l border-border px-3 py-2.5 text-sm font-semibold text-foreground bg-muted/30 truncate">
                      <div className="flex items-center gap-1.5"><DoorOpen className="h-3.5 w-3.5 text-muted-foreground" />{r}</div>
                    </div>
                  ))}
                  {HOURS.map(hour => (
                    <div key={`row-${hour}`} className="contents">
                      <div key={`h-${hour}`} className="border-b border-border px-2 py-1 text-[11px] text-muted-foreground tabular-nums text-right">
                        {String(hour).padStart(2, "0")}:00
                      </div>
                      {ROOMS.map(room => {
                            const slotStart = hour * 60;
                            const slotEnd = (hour + 1) * 60;
                            const inSlot = dayLessons.filter(l =>
                          l.room === room &&
                              l.startMinutes < slotEnd && l.endMinutes > slotStart
                        );
                            const startsHere = inSlot.filter(l => Math.floor(l.startMinutes / 60) === hour);
                        return (
                          <div key={`c-${hour}-${room}`} className="border-b border-l border-border min-h-[60px] p-1 relative hover:bg-primary/[0.04]">
                            {inSlot.length === 0 && (
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                                <span className="text-[10px] text-muted-foreground">{t("schedule.free")}</span>
                              </div>
                            )}
                                {startsHere.map(l => {
                              const c = getCardColors(l.course, isDark);
                                  const conf = conflictsMap.has(l.id) && l.status === "scheduled";
                                  const cancelled = l.status === "cancelled";
                              return (
                                <button
                                      key={l.id}
                                  onClick={() => setSelectedLesson(l)}
                                  className={cn(
                                    "w-full text-left rounded-md p-1.5 text-[11px] transition-all hover:-translate-y-px hover:shadow-sm",
                                        conf && "ring-2 ring-destructive",
                                        cancelled && "opacity-60",
                                  )}
                                      style={{ background: c.bg, borderLeft: `3px solid ${cancelled ? '#ef4444' : conf ? 'hsl(var(--destructive))' : c.border}`, color: c.title }}
                                >
                                      <div className={cn("font-semibold truncate flex items-center gap-1", cancelled && "line-through")}>
                                    {l.groupCode}
                                    {conf && <AlertTriangle className="h-2.5 w-2.5 text-destructive" />}
                                        {cancelled && <Ban className="h-2.5 w-2.5 text-red-500" />}
                                  </div>
                                  <div className="text-[10px] tabular-nums opacity-80">
                                        {l.startStr}–{l.endStr}
                                  </div>
                                  <div className="text-[10px] truncate opacity-80">{l.teacher}</div>
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
                )}
              </>
            )}
          </div>
        </div>


        <ExportCenter
          open={exportOpen}
          onOpenChange={setExportOpen}
          title={t("export.center.title")}
          description={t("export.center.description")}
          formats={["ics"]}
          columns={[{ key: "event", label: "Calendar event" }]}
          sortOptions={[{ value: "default", label: t("export.sort.default") }]}
          filterSummary={scheduleExportSummary}
          submitLabel={t("export.center.submit")}
          onSubmit={() => {
            runExportTask({
              onPhaseChange: (phase) => setExportPhase(phase),
              run: () => exportIcs(),
              onSuccess: () => {
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

        {/* Lesson Detail Dialog */}
        <Dialog open={!!selectedLesson} onOpenChange={(o) => !o && setSelectedLesson(null)}>
          <DialogContent className="sm:max-w-[440px] p-0 overflow-hidden rounded-[14px] border-border/30 bg-card max-h-[85vh] flex flex-col">
            {selectedLesson && (
              <LessonDetailContent
                lesson={selectedLesson}
                isDark={isDark}
                conflicts={conflictsMap.get(selectedLesson.id)}
                now={now}
                onClose={() => setSelectedLesson(null)}
                onCopyLink={() => copyLessonLink(selectedLesson)}
                onCancelLesson={() => setCancelFor(selectedLesson)}
                onRescheduleLesson={() => setRescheduleFor(selectedLesson)}
                onGoToGroup={() => { const id = selectedLesson.groupId; setSelectedLesson(null); navigate(`/groups/${id}`); }}
                onOpenJournal={() => { setSelectedLesson(null); navigate(`/journal?group=${selectedLesson.groupId}`); }}
                onGoToStudent={(sid) => { setSelectedLesson(null); navigate(`/students/${sid}`); }}
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Cancel confirmation */}
        <AlertDialog open={!!cancelFor} onOpenChange={(o) => !o && setCancelFor(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("schedule.confirmCancel")}</AlertDialogTitle>
              <AlertDialogDescription>
                {cancelFor && (
                  <>
                    <span className="font-semibold text-foreground">{cancelFor.groupCode}</span>
                    {" · "}{cancelFor.dateISO} {cancelFor.startStr}–{cancelFor.endStr}.
                    <br />{t("schedule.confirmCancelHint")}
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={cancelMu.isPending}>{t("schedule.undo")}</AlertDialogCancel>
              <AlertDialogAction
                disabled={cancelMu.isPending}
                onClick={() => cancelFor && handleCancel(cancelFor)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {cancelMu.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("schedule.cancelLesson")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Reschedule dialog */}
        <Dialog open={!!rescheduleFor} onOpenChange={(o) => !o && setRescheduleFor(null)}>
          <DialogContent className="sm:max-w-[420px]">
            {rescheduleFor && (
              <RescheduleForm
                lesson={rescheduleFor}
                pending={rescheduleMu.isPending}
                onCancel={() => setRescheduleFor(null)}
                onSubmit={(payload) => handleReschedule(rescheduleFor, payload)}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

// ── Reschedule form ──────────────────────────────────────────────────────────
interface RescheduleFormProps {
  lesson: UILesson;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (payload: { new_date: string; new_start_time: string; new_end_time: string; note?: string }) => void;
}

function RescheduleForm({ lesson, pending, onCancel, onSubmit }: RescheduleFormProps) {
  const { t } = useLanguage();
  const [date, setDate] = useState(lesson.dateISO);
  const [start, setStart] = useState(lesson.startStr);
  const [end, setEnd] = useState(lesson.endStr);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (timeToMinutes(end) <= timeToMinutes(start)) {
      setError(t("schedule.invalidTimeRange"));
      return;
    }
    onSubmit({
      new_date: date,
      new_start_time: `${start}:00`,
      new_end_time: `${end}:00`,
      note: note.trim() || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Repeat className="h-4 w-4" />{t("schedule.rescheduleLesson")}
        </DialogTitle>
        <DialogDescription>
          <span className="font-semibold text-foreground">{lesson.groupCode}</span>
          {" · "}{lesson.dateISO} {lesson.startStr}–{lesson.endStr}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-3 py-4">
        <div className="grid gap-1.5">
          <Label htmlFor="r-date" className="text-xs">{t("schedule.newDate")}</Label>
          <Input
            id="r-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="r-start" className="text-xs">{t("schedule.newStartTime")}</Label>
            <Input
              id="r-start"
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="r-end" className="text-xs">{t("schedule.newEndTime")}</Label>
            <Input
              id="r-end"
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              required
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="r-note" className="text-xs">{t("schedule.note")}</Label>
          <Textarea
            id="r-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
          />
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          {t("schedule.undo")}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("schedule.confirmReschedule")}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ── Lesson detail (separate component so hooks run only when dialog is open) ──
interface LessonDetailContentProps {
  lesson: UILesson;
  isDark: boolean;
  conflicts?: { reason: "teacher" | "room"; with: string }[];
  now: Date;
  onClose: () => void;
  onCopyLink: () => void;
  onCancelLesson: () => void;
  onRescheduleLesson: () => void;
  onGoToGroup: () => void;
  onOpenJournal: () => void;
  onGoToStudent: (id: number) => void;
}

function LessonDetailContent({
  lesson,
  isDark,
  conflicts,
  now,
  onCopyLink,
  onCancelLesson,
  onRescheduleLesson,
  onGoToGroup,
  onOpenJournal,
  onGoToStudent,
}: LessonDetailContentProps) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const groupId = lesson.groupId;
  const groupQ = useGroup(groupId);
  const studentsQ = useStudents({ group_id: groupId, limit: 3 });

  const cardColors = getCardColors(lesson.course, isDark);
  const timeStr = `${lesson.startStr} – ${lesson.endStr}`;

  // Per-instance progress: (now − start_time) / (end_time − start_time)
  const progressPct = (() => {
    const start = lessonDateTime(lesson.dateISO, lesson.startTimeRaw).getTime();
    const end = lessonDateTime(lesson.dateISO, lesson.endTimeRaw).getTime();
    if (end <= start) return 0;
    if (now.getTime() < start) return 0;
    if (now.getTime() > end) return 100;
    return Math.round(((now.getTime() - start) / (end - start)) * 100);
  })();

  const studentItems = studentsQ.data?.items ?? [];
  const totalStudents = studentsQ.data?.total ?? 0;

  const cancelled = lesson.status === "cancelled";
  const rescheduled = lesson.status === "rescheduled";
  const isTerminal = cancelled || rescheduled;

              return (
                <>
                  <div className="px-5 pt-5 pb-3 flex items-center gap-2.5 shrink-0 min-w-0">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cardColors.border }} />
        <span className={cn("text-lg font-bold text-foreground truncate", cancelled && "line-through")}>{lesson.groupCode}</span>
        <span className="text-xs text-muted-foreground/60 truncate">{lesson.course}</span>
                  </div>
                  <div className="w-full h-px bg-border/30 shrink-0" />
                  <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">
        {cancelled && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500 flex items-start gap-2">
            <Ban className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span className="font-bold">{t("schedule.cancelled")}</span>
            {lesson.note && <span className="text-red-500/80">— {lesson.note}</span>}
          </div>
        )}
        {rescheduled && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-500 flex items-start gap-2">
            <Repeat className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span className="font-bold">{t("schedule.rescheduled")}</span>
          </div>
        )}
        {conflicts && conflicts.length > 0 && !isTerminal && (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-start gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-bold mb-0.5">{t("schedule.conflict")}</div>
                          {conflicts.map((c, i) => (
                            <div key={i}>{t(c.reason === "teacher" ? "schedule.conflictTeacher" : "schedule.conflictRoom")} — {c.with}</div>
                          ))}
                        </div>
                      </div>
                    )}
        {!isTerminal && (
                    <div className="rounded-lg border border-border/40 bg-muted/30 px-3 py-2.5 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{t("schedule.lessonProgress")}</span>
                        <span className="font-bold text-foreground tabular-nums">{progressPct}%</span>
                      </div>
                      <Progress value={progressPct} className="h-1.5" />
                    </div>
        )}
        <div className="flex items-center gap-2.5 text-sm text-muted-foreground"><CalendarDays className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} /><span className="tabular-nums">{lesson.dateISO}</span></div>
        <div className="flex items-center gap-2.5 text-sm text-muted-foreground"><User className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} /><span>{lesson.teacher}</span></div>
        <div className="flex items-center gap-2.5 text-sm text-muted-foreground"><DoorOpen className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} /><span>{lesson.room}</span></div>
        <div className="flex items-center gap-2.5 text-sm text-muted-foreground"><Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} /><span className="tabular-nums">{timeStr}</span></div>
        <div className="flex items-center gap-2.5 text-sm text-muted-foreground"><Users className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} /><span>{lesson.students}/{lesson.maxStudents} {t("schedule.students")}</span></div>

        {studentsQ.isLoading ? (
          <div className="flex justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : studentItems.length > 0 ? (
                      <div className="space-y-1.5 pt-1">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("schedule.studentsList")}</div>
            {studentItems.map((s) => (
              <button
                key={s.id}
                onClick={() => onGoToStudent(s.id)}
                className="w-full text-left flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-muted/20 px-2.5 py-1.5 text-xs hover:bg-muted/50 transition-colors group"
              >
                <span className="font-medium text-foreground truncate">{studentFullName(s)}</span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:text-primary shrink-0" />
                          </button>
                        ))}
            {totalStudents > studentItems.length && (
              <button onClick={onGoToGroup} className="text-xs text-primary hover:underline pl-1">
                +{totalStudents - studentItems.length} {t("schedule.viewMore")}
                          </button>
                        )}
                      </div>
        ) : null}

        {groupQ.data && (
          <p className="text-[11px] text-muted-foreground/70 pt-1">
            {t("schedule.lessonProgress")}: {groupQ.data.code}
          </p>
        )}

                    <div className="flex flex-wrap gap-1.5 pt-1">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 rounded-lg" onClick={onCopyLink}>
                        <LinkIcon className="h-3 w-3" />{t("schedule.copyLink")}
                      </Button>
          {!isTerminal && isAdmin && (
            <>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 rounded-lg" onClick={onRescheduleLesson}>
                <Repeat className="h-3 w-3" />{t("schedule.rescheduleLesson")}
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 rounded-lg text-destructive hover:text-destructive" onClick={onCancelLesson}>
                        <Ban className="h-3 w-3" />{t("schedule.cancelLesson")}
                      </Button>
            </>
          )}
                    </div>
                  </div>
                  <div className="w-full h-px bg-border/30 shrink-0" />
                  <div className="px-5 py-3 flex gap-2 shrink-0">
        <Button className="flex-1 rounded-xl h-9 text-sm" onClick={onGoToGroup}>
                      {t("schedule.goToGroup")}
                    </Button>
        <Button variant="outline" className="rounded-xl h-9 text-sm gap-1.5" onClick={onOpenJournal}>
                      <ListChecks className="h-3.5 w-3.5" />{t("schedule.openJournal")}
                    </Button>
                  </div>
                </>
  );
}
