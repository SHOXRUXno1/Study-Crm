import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, Search, Pencil, Trash2, ChevronLeft, ChevronRight, X,
  School, Users, CalendarDays, Clock, MoreHorizontal, Eye, DoorOpen,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/use-language";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { cn } from "@/lib/utils";
import {
  useRooms, useCreateRoom, useUpdateRoom, useDeleteRoom,
  type RoomRead,
} from "@/hooks/use-rooms";
import { useSchedule } from "@/hooks/use-schedule";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

// ── Schedule mock data (tied to room names until schedule module lands) ────

const timeSlots = ["08:00", "09:00", "10:30", "11:00", "12:00", "13:00", "14:00", "15:30", "16:00", "17:00", "18:30", "19:00"];

const dayKeys = ["mon", "tue", "wed", "thu", "fri", "sat"] as const;
const dayTranslationKeys = [
  "rooms.mon", "rooms.tue", "rooms.wed", "rooms.thu", "rooms.fri", "rooms.sat",
] as const;

const classDetails: Record<string, { teacher: string; students: number; maxStudents: number }> = {
  "IELTS-A1": { teacher: "Emily Richards", students: 14, maxStudents: 16 },
  "IELTS-B1": { teacher: "James Wilson",   students: 12, maxStudents: 16 },
  "IELTS-B2": { teacher: "Sarah Cooper",   students: 15, maxStudents: 16 },
  "IELTS-C1": { teacher: "Emily Richards", students: 10, maxStudents: 14 },
  "Speaking Club":     { teacher: "James Wilson",  students: 8,  maxStudents: 12 },
  "Pre-IELTS A":       { teacher: "Anna Lee",      students: 11, maxStudents: 14 },
  "Pre-IELTS B":       { teacher: "Anna Lee",      students: 13, maxStudents: 14 },
  "Pre-IELTS C":       { teacher: "Mark Davis",    students: 9,  maxStudents: 12 },
  "Grammar Lab":       { teacher: "Sarah Cooper",  students: 10, maxStudents: 14 },
  "Writing Lab":       { teacher: "Emily Richards",students: 8,  maxStudents: 12 },
  "Mock Exam":         { teacher: "James Wilson",  students: 16, maxStudents: 20 },
  "Weekend Pre-IELTS": { teacher: "Anna Lee",      students: 10, maxStudents: 14 },
  "Kids Beginner":     { teacher: "Lisa Chen",     students: 8,  maxStudents: 10 },
  "Kids Elementary":   { teacher: "Lisa Chen",     students: 9,  maxStudents: 10 },
  "Kids Fun Friday":   { teacher: "Lisa Chen",     students: 7,  maxStudents: 10 },
  "Kids Weekend":      { teacher: "Mark Davis",    students: 6,  maxStudents: 10 },
};

const timeSlotDuration: Record<string, string> = {
  "09:00": "09:00 – 10:30", "10:30": "10:30 – 12:00", "12:00": "12:00 – 13:30",
  "14:00": "14:00 – 15:30", "15:30": "15:30 – 17:00", "17:00": "17:00 – 18:30",
  "18:30": "18:30 – 20:00",
};

// ── Helpers ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 8;

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day  = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatWeekRange(monday: Date, monthShort: (m: number) => string): string {
  // The schedule grid runs Mon–Sat (six business days), so the visible week
  // ends on Saturday — not Sunday. Adding +5 days gives us Saturday from Mon.
  const saturday = new Date(monday);
  saturday.setDate(monday.getDate() + 5);
  const d1 = monday.getDate(), m1 = monthShort(monday.getMonth());
  const d2 = saturday.getDate(), m2 = monthShort(saturday.getMonth());
  const year = monday.getFullYear();
  return m1 === m2 ? `${d1} – ${d2} ${m1} ${year}` : `${d1} ${m1} – ${d2} ${m2} ${year}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getOccupancyColor(current: number, max: number) {
  const pct = max > 0 ? (current / max) * 100 : 0;
  if (pct >= 90) return { bar: "bg-destructive", text: "text-destructive" };
  if (pct >= 70) return { bar: "bg-warning",     text: "text-warning" };
  return               { bar: "bg-success",      text: "text-success" };
}

type GroupStyle = { bg: string; border: string; text: string };
const groupPalette: GroupStyle[] = [
  { bg: "#ede9fe", border: "#8b5cf6", text: "#5b21b6" },
  { bg: "#fef3c7", border: "#f59e0b", text: "#92400e" },
  { bg: "#d1fae5", border: "#10b981", text: "#065f46" },
  { bg: "#fce7f3", border: "#ec4899", text: "#831843" },
  { bg: "#dbeafe", border: "#3b82f6", text: "#1e3a8a" },
  { bg: "#cffafe", border: "#06b6d4", text: "#155e75" },
];
function getGroupStyle(name: string): GroupStyle {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return groupPalette[Math.abs(hash) % groupPalette.length];
}

// Room with computed weekly schedule. The schedule is derived from the
// /schedule API for the current Mon–Sat range and grouped by room id.
interface RoomVM extends RoomRead {
  schedule: Record<string, Record<string, string>>;
}

const ISO_DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

// ── Component ──────────────────────────────────────────────────────────────

export default function Rooms() {
  const { t } = useLanguage();

  // ── search / filter ────────────────────────────────────────────────────
  const [search, setSearch]           = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);

  // ── UI state ───────────────────────────────────────────────────────────
  const [page, setPage]               = useState(1);

  // ── dialogs ────────────────────────────────────────────────────────────
  const [modalOpen,     setModalOpen]     = useState(false);
  const [deleteTarget,  setDeleteTarget]  = useState<RoomVM | null>(null);
  const [editRoom,      setEditRoom]      = useState<RoomVM | null>(null);
  const [scheduleRoom,  setScheduleRoom]  = useState<RoomVM | null>(null);
  const [infoRoom,      setInfoRoom]      = useState<RoomVM | null>(null);

  // ── form state ─────────────────────────────────────────────────────────
  const [formName,     setFormName]     = useState("");
  const [formCapacity, setFormCapacity] = useState("");

  // ── schedule UI ────────────────────────────────────────────────────────
  const [weekOffset,   setWeekOffset]   = useState(0);
  const [activePopup,  setActivePopup]  = useState<{ group: string; time: string; day: string; rect: DOMRect } | null>(null);
  const scheduleContainerRef = useRef<HTMLDivElement>(null);

  // ── API ────────────────────────────────────────────────────────────────
  const allQ = useRooms({ limit: 1000 });

  const filterP = useMemo(() => {
    const p: Parameters<typeof useRooms>[0] = { limit: 1000 };
    if (debouncedSearch) p.search = debouncedSearch;
    return p;
  }, [debouncedSearch]);
  const listQ = useRooms(filterP);

  // Fetch the current week's schedule so we can show "what's happening now"
  // in the floor map and the per-room schedule dialog.
  const currentMondayMemo = useMemo(() => getMonday(new Date()), []);
  const weekRange = useMemo(() => {
    const from = new Date(currentMondayMemo);
    const to = new Date(currentMondayMemo);
    to.setDate(to.getDate() + 6);
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { from: fmt(from), to: fmt(to) };
  }, [currentMondayMemo]);
  const scheduleQ = useSchedule(weekRange);

  // Map: roomId -> schedule[dayKey][timeKey] = group_code.
  const roomSchedules = useMemo(() => {
    const out = new Map<number, Record<string, Record<string, string>>>();
    for (const lesson of scheduleQ.data ?? []) {
      if (!lesson.room_id || lesson.status === "cancelled") continue;
      const d = new Date(lesson.lesson_date + "T00:00:00");
      const dayKey = ISO_DAY_KEYS[d.getDay()];
      if (!dayKey || dayKey === "sun") continue;
      const timeKey = lesson.start_time.slice(0, 5);
      let entry = out.get(lesson.room_id);
      if (!entry) {
        entry = {};
        out.set(lesson.room_id, entry);
      }
      if (!entry[dayKey]) entry[dayKey] = {};
      entry[dayKey][timeKey] = lesson.group_code;
    }
    return out;
  }, [scheduleQ.data]);

  const toVM = useCallback(
    (r: RoomRead): RoomVM => ({ ...r, schedule: roomSchedules.get(r.id) ?? {} }),
    [roomSchedules],
  );

  const apiRooms    = useMemo(() => (listQ.data?.items ?? []).map(toVM), [listQ.data, toVM]);
  const allApiRooms = useMemo(() => (allQ.data?.items  ?? []).map(toVM), [allQ.data, toVM]);

  const createM = useCreateRoom();
  const updateM = useUpdateRoom();
  const deleteM = useDeleteRoom();

  // ── derived ────────────────────────────────────────────────────────────
  const totalRooms    = allQ.data?.total ?? 0;
  const totalCapacity = allApiRooms.reduce((s, r) => s + r.capacity, 0);

  const totalPages = Math.max(1, Math.ceil(apiRooms.length / PAGE_SIZE));
  const paginated  = apiRooms.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const hasFilters = !!search;
  const today      = new Date();
  const currentMonday  = getMonday(today);
  const displayMonday  = new Date(currentMonday);
  displayMonday.setDate(displayMonday.getDate() + weekOffset * 7);

  // ── effects ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activePopup) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-class-popup]") && !target.closest("[data-class-block]"))
        setActivePopup(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [activePopup]);

  useEffect(() => {
    if (!scheduleRoom) { setActivePopup(null); setWeekOffset(0); }
  }, [scheduleRoom]);

  useEffect(() => { setPage(1); }, [debouncedSearch]);

  // ── handlers ───────────────────────────────────────────────────────────
  function openAdd() {
    setEditRoom(null);
    setFormName(""); setFormCapacity("");
    setModalOpen(true);
  }

  function openEdit(room: RoomVM) {
    setEditRoom(room);
    setFormName(room.name);
    setFormCapacity(String(room.capacity));
    setModalOpen(true);
  }

  async function handleSave() {
    if (!formName.trim() || !formCapacity) return;
    const cap = parseInt(formCapacity);
    if (isNaN(cap) || cap <= 0) return;
    try {
      if (editRoom) {
        await updateM.mutateAsync({ id: editRoom.id, data: { name: formName.trim(), capacity: cap } });
        toast.success(t("rooms.toastUpdated"));
      } else {
        await createM.mutateAsync({ name: formName.trim(), capacity: cap });
        toast.success(t("rooms.toastCreated"));
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
      toast.success(t("rooms.toastDeleted"));
      setDeleteTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  }

  function clearAllFilters() { setSearch(""); setPage(1); }

  const isSaving  = createM.isPending || updateM.isPending;
  const isLoading = listQ.isLoading;

  // ── render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 sm:space-y-6">
      <Breadcrumbs items={[{ label: t("rooms.title") }]} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">{t("rooms.title")}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t("rooms.subtitle")}</p>
        </div>
        <Button size="sm" className="gap-1.5 self-start sm:self-auto" onClick={openAdd}>
          <Plus className="h-4 w-4" />
          {t("rooms.addRoom")}
        </Button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {[
          { label: t("rooms.totalRooms"),    value: totalRooms,    icon: DoorOpen, color: "text-primary" },
          { label: t("rooms.totalCapacity"), value: totalCapacity, icon: Users,    color: "text-accent-foreground" },
        ].map((kpi, i) => (
          <div key={kpi.label} className="rounded-xl border border-border/60 bg-card p-3 sm:p-4 shadow-sm animate-fade-in" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="flex items-center gap-1.5 mb-1">
              <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
              <span className="text-[10px] sm:text-xs text-muted-foreground">{kpi.label}</span>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-foreground">{kpi.value}</p>
          </div>
        ))}
      </div>

      <>
          {/* Filters */}
          <div className="stat-card space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("rooms.searchPlaceholder")}
                  className="pl-9 h-9 text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            {hasFilters && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {search && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 text-xs font-medium animate-fade-in">
                    {t("rooms.search")}: {search}
                    <button onClick={() => setSearch("")} className="ml-0.5 hover:text-primary/70 transition-colors">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10" onClick={clearAllFilters}>
                  {t("rooms.cancel")}
                </Button>
                <span className="ml-auto text-xs text-muted-foreground">
                  {t("rooms.found")}: <span className="font-semibold text-foreground">{apiRooms.length}</span> {t("rooms.entry")}
                </span>
              </div>
            )}
          </div>

          {/* Table */}
          <div className="stat-card p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="font-semibold w-12">{t("rooms.number")}</TableHead>
                  <TableHead className="font-semibold">{t("rooms.name")}</TableHead>
                  <TableHead className="font-semibold w-44">{t("rooms.capacity")}</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-32 text-center">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-32 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Search className="h-8 w-8 text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground">{t("rooms.notFound")}</p>
                        {hasFilters && (
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearAllFilters}>
                            {t("rooms.cancel")}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : paginated.map((room, i) => {
                  const pct    = room.capacity > 0 ? (room.current_occupancy / room.capacity) * 100 : 0;
                  const colors = getOccupancyColor(room.current_occupancy, room.capacity);
                  const num    = (page - 1) * PAGE_SIZE + i + 1;
                  return (
                    <TableRow
                      key={room.id}
                      className="animate-fade-in cursor-pointer transition-colors hover:bg-muted/30"
                      style={{ animationDelay: `${i * 30}ms` }}
                      onClick={() => setInfoRoom(room)}
                    >
                      <TableCell className="font-medium text-muted-foreground">{num}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                            <School className="h-4 w-4 text-primary" />
                          </div>
                          <span className="font-medium text-foreground">{room.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1.5">
                          <span className={`text-sm font-semibold ${colors.text}`}>
                            {room.current_occupancy}/{room.capacity}
                          </span>
                          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${colors.bar}`}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setInfoRoom(room)}>
                              <Eye className="h-3.5 w-3.5 mr-2" /> {t("rooms.roomDetails")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setScheduleRoom(room)}>
                              <CalendarDays className="h-3.5 w-3.5 mr-2" /> {t("rooms.viewSchedule")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEdit(room)}>
                              <Pencil className="h-3.5 w-3.5 mr-2" /> {t("rooms.editRoom")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(room)}>
                              <Trash2 className="h-3.5 w-3.5 mr-2" /> {t("rooms.delete")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Pagination */}
            {apiRooms.length > PAGE_SIZE && (
              <div className="flex flex-col sm:flex-row items-center justify-between border-t border-border/60 px-3 sm:px-4 py-3 gap-3">
                <p className="text-xs text-muted-foreground">
                  {t("rooms.showing")} {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, apiRooms.length)} {t("rooms.of")} {apiRooms.length}
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    <ChevronLeft className="h-3 w-3" />
                  </Button>
                  {Array.from({ length: totalPages }, (_, i) => (
                    <Button key={i + 1} variant={page === i + 1 ? "default" : "outline"} size="sm" className="h-7 w-7 text-xs p-0" onClick={() => setPage(i + 1)}>
                      {i + 1}
                    </Button>
                  ))}
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>

      {/* ─── Add / Edit dialog ─────────────────────────────────────────────── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editRoom ? t("rooms.editRoom") : t("rooms.addRoom")}</DialogTitle>
            <DialogDescription className="sr-only">{editRoom ? t("rooms.editRoom") : t("rooms.addRoom")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">{t("rooms.roomName")}</label>
              <Input placeholder={t("rooms.enterName")} value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">{t("rooms.maxCapacity")}</label>
              <Input type="number" placeholder={t("rooms.capacityPlaceholder")} value={formCapacity} onChange={(e) => setFormCapacity(e.target.value)} min={1} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={isSaving}>{t("rooms.cancel")}</Button>
            <Button onClick={handleSave} disabled={isSaving || !formName.trim() || !formCapacity}>
              {isSaving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t("common.saving")}</> : t("rooms.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Schedule dialog ───────────────────────────────────────────────── */}
      <Dialog open={scheduleRoom !== null} onOpenChange={() => setScheduleRoom(null)}>
        <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{t("rooms.schedule")} — {scheduleRoom?.name}</DialogTitle>
            <DialogDescription className="sr-only">{t("rooms.schedule")}</DialogDescription>
          </DialogHeader>
          {scheduleRoom && (
            <div className="space-y-3" ref={scheduleContainerRef}>
              <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/30 border border-border/40 px-3 py-2">
                <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-foreground" onClick={() => { setWeekOffset(w => w - 1); setActivePopup(null); }}>
                  <ChevronLeft className="h-4 w-4" /> {t("rooms.back")}
                </Button>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {formatWeekRange(displayMonday, (m) => t(["months.jan","months.feb","months.mar","months.apr","months.may","months.jun","months.jul","months.aug","months.sep","months.oct","months.nov","months.dec"][m]).toLowerCase())}
                  </span>
                  {weekOffset !== 0 && (
                    <Button variant="outline" size="sm" className="text-xs h-7 px-2" onClick={() => { setWeekOffset(0); setActivePopup(null); }}>
                      {t("rooms.thisWeek")}
                    </Button>
                  )}
                </div>
                <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-foreground" onClick={() => { setWeekOffset(w => w + 1); setActivePopup(null); }}>
                  {t("rooms.forward")} <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="overflow-x-auto relative">
                <table className="w-full text-sm border-collapse">
                  <thead className="sticky top-0 z-20 bg-card">
                    <tr>
                      <th className="p-2 text-left text-muted-foreground font-medium border-b border-border/50 w-20 bg-card">{t("rooms.time")}</th>
                      {dayKeys.map((key, idx) => {
                        const colDate = new Date(displayMonday);
                        colDate.setDate(displayMonday.getDate() + idx);
                        const isToday = isSameDay(colDate, today);
                        return (
                          <th key={key} className={cn("p-2 text-center font-medium border-b transition-colors bg-card", isToday ? "border-b-[3px] border-b-primary" : "text-muted-foreground border-b-border/50")}>
                            <div className={cn("text-xs", isToday && "text-primary font-bold")}>{t(dayTranslationKeys[idx])}</div>
                            {isToday ? (
                              <div className="mt-0.5 mx-auto inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-[11px] font-bold">
                                {colDate.getDate()}
                              </div>
                            ) : (
                              <div className="text-[11px] text-muted-foreground/60">{colDate.getDate()}.{String(colDate.getMonth() + 1).padStart(2, "0")}</div>
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {timeSlots.map((time) => (
                      <tr key={time}>
                        <td className="p-2 text-xs text-muted-foreground font-mono border border-border/30 bg-card">{time}</td>
                        {dayKeys.map((day, idx) => {
                          const group   = scheduleRoom.schedule[day]?.[time];
                          const colDate = new Date(displayMonday);
                          colDate.setDate(displayMonday.getDate() + idx);
                          const isToday = isSameDay(colDate, today);
                          return (
                            <td key={day} className="p-1 border border-border/30" style={isToday ? { backgroundColor: "hsl(var(--primary) / 0.06)" } : undefined}>
                              {group ? (() => {
                                const s = getGroupStyle(group);
                                return (
                                  <div
                                    data-class-block
                                    className="cursor-pointer transition-colors hover:brightness-95 flex flex-col justify-center"
                                    style={{ backgroundColor: s.bg, borderLeft: `3px solid ${s.border}`, color: s.text, borderRadius: 8, padding: "8px 10px", minHeight: 52, fontSize: 13, fontWeight: 600, width: "100%" }}
                                    onClick={(e) => {
                                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                      setActivePopup(
                                        activePopup?.group === group && activePopup?.time === time && activePopup?.day === day
                                          ? null : { group, time, day, rect }
                                      );
                                    }}
                                  >
                                    <div className="leading-tight truncate">{group}</div>
                                    <div className="mt-0.5 font-normal" style={{ fontSize: 11, opacity: 0.75 }}>{timeSlotDuration[time] || time}</div>
                                  </div>
                                );
                              })() : (
                                <div title={t("rooms.addClass")} className="group h-[52px] flex items-center justify-center cursor-pointer transition-colors hover:bg-muted/40">
                                  <Plus className="h-4 w-4 text-transparent group-hover:text-muted-foreground transition-colors" />
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>

                {activePopup && scheduleContainerRef.current && (() => {
                  const details = classDetails[activePopup.group];
                  const containerRect = scheduleContainerRef.current!.getBoundingClientRect();
                  const top  = activePopup.rect.bottom - containerRect.top + scheduleContainerRef.current!.scrollTop + 4;
                  const left = Math.min(Math.max(activePopup.rect.left - containerRect.left, 8), containerRect.width - 280);
                  const meetingDayIdxs = dayKeys
                    .map((d, i) => (Object.values(scheduleRoom.schedule[d] || {}).includes(activePopup.group) ? i : -1))
                    .filter((i) => i >= 0);
                  const daysStr = meetingDayIdxs.map((i) => t(dayTranslationKeys[i])).join("/");
                  return (
                    <div data-class-popup className="absolute z-50 w-72 rounded-xl border border-border/60 bg-card shadow-xl p-3.5 animate-fade-in" style={{ top, left }}>
                      <div className="flex items-center justify-between mb-2.5">
                        {(() => { const ps = getGroupStyle(activePopup.group); return (
                          <span className="inline-block rounded-md px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: ps.bg, color: ps.text, borderLeft: `3px solid ${ps.border}` }}>
                            {activePopup.group}
                          </span>
                        ); })()}
                        <button onClick={() => setActivePopup(null)} className="h-5 w-5 flex items-center justify-center rounded-full hover:bg-muted/50 text-muted-foreground transition-colors">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex items-center gap-2 text-muted-foreground"><Clock className="h-3.5 w-3.5" /><span className="text-foreground font-medium">{timeSlotDuration[activePopup.time] || activePopup.time}</span></div>
                        <div className="flex items-center gap-2 text-muted-foreground"><Users className="h-3.5 w-3.5" /><span className="text-foreground font-medium">{details?.teacher || "—"}</span></div>
                        <div className="flex items-center gap-2 text-muted-foreground"><Users className="h-3.5 w-3.5" /><span className="text-foreground font-medium">{details ? `${details.students}/${details.maxStudents}` : "—"} {t("rooms.studentsShort")}</span></div>
                        <div className="flex items-center gap-2 text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" /><span className="text-foreground font-medium">{daysStr || "—"}</span></div>
                        <div className="flex items-center gap-2 text-muted-foreground"><School className="h-3.5 w-3.5" /><span className="text-foreground font-medium">{scheduleRoom.name}</span></div>
                      </div>
                      <div className="mt-3 pt-2.5 border-t border-border/40 flex items-center justify-end gap-2">
                        <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => setActivePopup(null)}>{t("rooms.goToGroup")}</Button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Room info modal ───────────────────────────────────────────────── */}
      <Dialog open={infoRoom !== null} onOpenChange={() => setInfoRoom(null)}>
        <DialogContent className="sm:max-w-md">
          {infoRoom && (() => {
            const colors = getOccupancyColor(infoRoom.current_occupancy, infoRoom.capacity);
            const pct    = infoRoom.capacity > 0 ? (infoRoom.current_occupancy / infoRoom.capacity) * 100 : 0;
            const days   = ["sun","mon","tue","wed","thu","fri","sat"];
            const todayKey     = days[new Date().getDay()];
            const todayGroups  = Object.values(infoRoom.schedule[todayKey] || {});
            const weeklyClasses = dayKeys.reduce((sum, d) => sum + Object.keys(infoRoom.schedule[d] || {}).length, 0);
            return (
              <>
                <DialogHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                      <School className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <DialogTitle className="text-lg">{infoRoom.name}</DialogTitle>
                      <DialogDescription className="text-xs text-muted-foreground mt-0.5">{t("rooms.roomDetails")}</DialogDescription>
                    </div>
                  </div>
                </DialogHeader>

                <div className="space-y-3 py-2">
                  <div className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground"><Users className="h-4 w-4" />{t("rooms.capacityLabel")}</div>
                      <span className={`text-sm font-bold ${colors.text}`}>{infoRoom.current_occupancy}/{infoRoom.capacity}</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${colors.bar}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarDays className="h-4 w-4" />{t("rooms.weeklyClasses")}</div>
                    <span className="text-sm font-semibold text-foreground">{weeklyClasses}</span>
                  </div>

                  <div className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2"><Clock className="h-4 w-4" />{t("rooms.groupsToday")}</div>
                    {todayGroups.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {todayGroups.map((g, idx) => {
                          const s = getGroupStyle(g);
                          return (
                            <span key={idx} className="inline-block rounded-md px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: s.bg, color: s.text, borderLeft: `3px solid ${s.border}` }}>
                              {g}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">{t("rooms.noClasses")}</p>
                    )}
                  </div>
                </div>

                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => setInfoRoom(null)}>{t("rooms.close")}</Button>
                  <Button onClick={() => { const r = infoRoom; setInfoRoom(null); setScheduleRoom(r); }}>{t("rooms.viewSchedule")}</Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ─── Delete confirm ────────────────────────────────────────────────── */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("rooms.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("rooms.deleteDescription").replace("{{name}}", deleteTarget?.name ?? "")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteM.isPending}>{t("rooms.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteM.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteM.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t("common.deleting")}</> : t("rooms.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
