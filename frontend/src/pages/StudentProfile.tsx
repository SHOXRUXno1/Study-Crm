import { useState, useMemo, useEffect } from "react";
import { format, subDays, parseISO } from "date-fns";
import { enUS, ru, uz } from "date-fns/locale";
import type { Locale } from "date-fns";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/PasswordInput";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/hooks/use-language";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Calendar, CreditCard,
  BookOpen, Clock, CheckCircle2, XCircle, TrendingUp, TrendingDown, AlertCircle,
  Pencil, Check, X, Save, Trash2, ChevronLeft, ChevronRight,
  User, GraduationCap, Plus, Wallet, Lock, Loader2,
  UserCheck, UserX, LogOut, MoreVertical, MessageSquare, Send,
} from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  useStudent, useUpdateStudent, useDeleteStudent,
  useStudentNotes, useCreateStudentNote, useDeleteStudentNote,
  useStudentTransfers,
} from "@/hooks/use-students";
import { TransferStudentDialog } from "@/components/transfer/TransferStudentDialog";
import { useAuth } from "@/hooks/use-auth";
import { useGroup, useGroups, expandDays, type DaysType } from "@/hooks/use-groups";
import { useStudentLedger } from "@/hooks/use-finance";
import {
  useStudentAttendance, useUpsertAttendance,
  type AbsenceReasonCode, type AttendanceStatus, type StudentAttendanceEntry,
} from "@/hooks/use-attendance";
import { StudentPaymentsTab } from "@/components/StudentPaymentsTab";
import { toast } from "sonner";
import { formatCurrencyUZS, formatNumber } from "@/lib/utils";

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

const LOCALES: Record<string, Locale> = { en: enUS, ru, uz };
const ATTENDANCE_PAGE_SIZE = 8;

const DAY_KEYS: Record<string, string> = {
  Mon: "days.mon", Tue: "days.tue", Wed: "days.wed", Thu: "days.thu",
  Fri: "days.fri", Sat: "days.sat", Sun: "days.sun",
};

const fmtMoney = (n: number | null | undefined) =>
  formatCurrencyUZS(n);

const formatPhone = (phone: string) => phone.replace(/\s/g, "");

const isoDate = (d: Date) => format(d, "yyyy-MM-dd");

const safeParse = (s?: string | null): Date | null => {
  if (!s) return null;
  try {
    const d = parseISO(s);
    return Number.isFinite(d.getTime()) ? d : null;
  } catch {
    return null;
  }
};

function AttendanceIcon({ status }: { status: AttendanceStatus | string }) {
  if (status === "present") return <CheckCircle2 className="h-4 w-4 text-success" />;
  if (status === "late")    return <AlertCircle className="h-4 w-4 text-warning" />;
  if (status === "excused") return <CheckCircle2 className="h-4 w-4 text-muted-foreground" />;
  return <XCircle className="h-4 w-4 text-destructive" />;
}

// ───────────────────────────────────────────────────────────────────────────
// Component
// ───────────────────────────────────────────────────────────────────────────

export default function StudentProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const dfLocale: Locale = LOCALES[language] ?? enUS;

  const studentId = Number(id);
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  // ── Queries ────────────────────────────────────────────────────────
  const { data: apiStudent, isLoading: apiLoading, isError: apiError } = useStudent(id ?? "");
  const updateM = useUpdateStudent();
  const deleteM = useDeleteStudent();
  const upsertM = useUpsertAttendance();

  const { data: realGroup } = useGroup(apiStudent?.group_id ?? 0);
  const allGroupsQ = useGroups({ limit: 500 });
  const allGroups = allGroupsQ.data?.items ?? [];

  const ledgerQ = useStudentLedger(studentId);
  const billing = ledgerQ.data?.billing;

  // Notes
  const notesQ = useStudentNotes(studentId);
  const createNoteM = useCreateStudentNote();
  const deleteNoteM = useDeleteStudentNote();

  // Transfer
  // ``useStudentTransfers`` is admin-only on the backend; the query stays
  // disabled for non-admins so we don't surface 403s in the console.
  const transfersQ = useStudentTransfers(isAdmin ? studentId : 0);
  const [noteText, setNoteText] = useState("");
  // Shared transfer dialog (replaces the inline move form).
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);

  // Attendance range (30 / 90 / all days back)
  const [attRange, setAttRange] = useState<"30" | "90" | "all">("90");
  const attRangeFrom = useMemo(
    () => attRange === "all" ? undefined : isoDate(subDays(new Date(), Number(attRange))),
    [attRange],
  );
  const attQ = useStudentAttendance(
    studentId || null,
    attRangeFrom ? { from: attRangeFrom } : undefined,
  );

  // ── Adapter (memoised) ─────────────────────────────────────────────
  const student = useMemo(() => {
    if (!apiStudent) return null;
    return {
      id:           apiStudent.id,
      fullName:     apiStudent.full_name,
      phone:        apiStudent.phone ?? "",
      parentPhone:  apiStudent.parent_phone ?? "",
      gender:       apiStudent.gender ?? "",
      birthDate:    apiStudent.birth_date ?? "",
      group:        apiStudent.group_code ?? "—",
      isActive:     apiStudent.is_active,
      paymentStatus: (billing?.status ?? apiStudent.payment_status) as "paid" | "debt",
      enrollDate:   apiStudent.created_at?.slice(0, 10) ?? "",
    };
  }, [apiStudent, billing?.status]);

  // ── Attendance stats ───────────────────────────────────────────────
  const attRows = attQ.data ?? [];
  const attStats = useMemo(() => {
    let p = 0, l = 0, a = 0, e = 0;
    for (const r of attRows) {
      if (r.lesson_status === "rescheduled" || r.lesson_status === "cancelled") continue;
      if (r.status === "present") p++;
      else if (r.status === "late") l++;
      else if (r.status === "absent") a++;
      else if (r.status === "excused") e++;
    }
    const total = p + l + a + e;
    const rate = total > 0 ? Math.round(((p + l) / total) * 100) : 0;
    return { present: p, late: l, absent: a, excused: e, total, rate };
  }, [attRows]);

  // ── UI state ───────────────────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    fullName: "", phone: "", parentPhone: "",
    gender: "", birthDate: "",
  });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [activeToggleOpen, setActiveToggleOpen] = useState(false);

  // Cabinet credentials
  const [credsOpen, setCredsOpen] = useState(false);
  const [credsPwd, setCredsPwd] = useState("");
  const [credsSaving, setCredsSaving] = useState(false);

  const [attendancePage, setAttendancePage] = useState(0);

  // Reason-edit dialog state
  const [reasonRow, setReasonRow] = useState<StudentAttendanceEntry | null>(null);
  const [reasonCode, setReasonCode] = useState<AbsenceReasonCode>("none");
  const [reasonText, setReasonText] = useState("");

  // Enrollment dialog state
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollCourse, setEnrollCourse] = useState<string>("all");
  const [enrollDay, setEnrollDay] = useState<string>("all");
  const [enrollAvailability, setEnrollAvailability] = useState<string>("all");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  useEffect(() => {
    if (student) {
      setEditForm({
        fullName:    student.fullName,
        phone:       student.phone,
        parentPhone: student.parentPhone,
        gender:      student.gender,
        birthDate:   student.birthDate,
      });
    }
  }, [student]);

  // Reset to first page when range changes
  useEffect(() => { setAttendancePage(0); }, [attRange]);

  // ── Handlers ───────────────────────────────────────────────────────
  const openEdit = () => {
    if (!student) return;
    setEditForm({
      fullName:    student.fullName,
      phone:       student.phone,
      parentPhone: student.parentPhone,
      gender:      student.gender,
      birthDate:   student.birthDate,
    });
    setEditOpen(true);
  };

  const saveProfile = async () => {
    if (!apiStudent) return;
    if (!editForm.fullName.trim()) {
      toast.error(t("students.requiredName"));
      return;
    }
    try {
      await updateM.mutateAsync({
        id: apiStudent.id,
        data: {
          full_name:    editForm.fullName.trim(),
          phone:        editForm.phone.trim() || null,
          parent_phone: editForm.parentPhone.trim() || null,
          gender:       (editForm.gender as "male" | "female") || null,
          birth_date:   editForm.birthDate || null,
        },
      });
      toast.success(t("students.updateSuccess"));
    setEditOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  };

  const handleDelete = async () => {
    if (!apiStudent) return;
    try {
      await deleteM.mutateAsync(apiStudent.id);
      toast.success(t("students.deleteSuccess"));
    setDeleteOpen(false);
    navigate("/students");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  };

  const saveCredentials = async () => {
    if (!apiStudent) return;
    if (credsPwd.trim().length < 6) {
      toast.error(t("student.passwordTooShort"));
      return;
    }
    if (!apiStudent.phone) {
      toast.error(t("student.passwordRequiresPhone"));
      return;
    }
    setCredsSaving(true);
    try {
      await updateM.mutateAsync({
        id: apiStudent.id,
        data: { password: credsPwd.trim() },
      });
      toast.success(t("student.passwordSavedToast"));
      setCredsOpen(false);
      setCredsPwd("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setCredsSaving(false);
    }
  };

  const handleLeaveGroup = async () => {
    if (!apiStudent) return;
    try {
      await updateM.mutateAsync({ id: apiStudent.id, data: { group_id: null } });
      toast.success(t("profile.leaveGroupSuccess"));
      setLeaveOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  };

  const handleToggleActive = async () => {
    if (!apiStudent) return;
    try {
      await updateM.mutateAsync({
        id: apiStudent.id,
        data: { is_active: !apiStudent.is_active },
      });
      toast.success(
        apiStudent.is_active ? t("profile.deactivatedToast") : t("profile.activatedToast"),
      );
      setActiveToggleOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  };

  // ── Reason editing ─────────────────────────────────────────────────
  const openReasonDialog = (row: StudentAttendanceEntry) => {
    setReasonRow(row);
    setReasonCode(row.reason_code ?? "other");
    setReasonText(row.reason_text ?? "");
  };
  const closeReasonDialog = () => {
    setReasonRow(null);
    setReasonCode("none");
    setReasonText("");
  };
  const saveReason = async () => {
    if (!reasonRow || !apiStudent) return;
    try {
      await upsertM.mutateAsync({
        lessonId: reasonRow.lesson_id,
        marks: [{
          student_id:   apiStudent.id,
          status:       reasonRow.status,
          late_minutes: reasonRow.late_minutes,
          reason_code:  reasonCode === "none" ? null : reasonCode,
          reason_text:  reasonText.trim() || null,
        }],
      });
      toast.success(t("profile.reasonUpdated"));
      closeReasonDialog();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  };

  // ── Pagination ─────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(attRows.length / ATTENDANCE_PAGE_SIZE));
  const pagedAttendance = attRows.slice(
    attendancePage * ATTENDANCE_PAGE_SIZE,
    (attendancePage + 1) * ATTENDANCE_PAGE_SIZE,
  );

  // ── Enrollment derived data ────────────────────────────────────────
  const adaptedGroups = useMemo(
    () => allGroups.map((g) => ({
      id: String(g.id),
      code: g.code,
      course: g.course_name ?? "—",
      teacher: g.teacher_name ?? "—",
      students: g.student_count,
      maxStudents: g.max_students,
      days: expandDays(g.days as DaysType),
      timeSlot: g.time_slot,
      price: g.price,
    })),
    [allGroups],
  );

  const courseOptions = useMemo(
    () => Array.from(new Set(adaptedGroups.map((g) => g.course).filter((c) => c && c !== "—"))),
    [adaptedGroups],
  );

  const evaluateGroup = (g: typeof adaptedGroups[number]) => {
    const isFull = g.students >= g.maxStudents;
    const alreadyIn = String(apiStudent?.group_id ?? "") === g.id;
    return { isFull, alreadyIn };
  };

  const filteredEnrollGroups = useMemo(() => {
    return adaptedGroups.filter((g) => {
      if (enrollCourse !== "all" && g.course !== enrollCourse) return false;
      if (enrollDay !== "all" && !g.days.includes(enrollDay)) return false;
      if (enrollAvailability !== "all") {
        const { isFull, alreadyIn } = evaluateGroup(g);
        if (isFull || alreadyIn) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrollCourse, enrollDay, enrollAvailability, adaptedGroups, apiStudent?.group_id]);

  const selectedGroup = selectedGroupId ? adaptedGroups.find((g) => g.id === selectedGroupId) : null;
  const selectedPrice = selectedGroup?.price ?? 0;

  const resetEnrollForm = () => {
    setSelectedGroupId(null);
    setEnrollCourse("all");
    setEnrollDay("all");
    setEnrollAvailability("all");
  };

  const handleEnroll = async () => {
    if (!selectedGroup || !student || !apiStudent) return;
    const isMove = !!apiStudent.group_id && String(apiStudent.group_id) !== selectedGroup.id;
    // Moves (group change) route through the dedicated TransferStudentDialog
    // so they get the debt preview, policies, audit and capacity handling.
    if (isMove) {
      setEnrollOpen(false);
      setTransferDialogOpen(true);
      return;
    }
    try {
      await updateM.mutateAsync({
        id: apiStudent.id,
        data: { group_id: Number(selectedGroup.id) },
      });
      toast.success(t("profile.enrollSuccess").replace("{{group}}", selectedGroup.code));
      setEnrollOpen(false);
      resetEnrollForm();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("common.unknownError"));
    }
  };

  // ── Early returns AFTER all hooks ─────────────────────────────────
  if (apiLoading) {
  return (
    <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mr-2" />
          <span className="text-muted-foreground">{t("students.loading")}</span>
        </div>
      </DashboardLayout>
    );
  }
  if (apiError || !student || !apiStudent) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <p className="text-muted-foreground">{t("students.noStudents")}</p>
          <Button variant="outline" size="sm" onClick={() => navigate("/students")}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> {t("students.title")}
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  // ── Derived (non-hook) values ──────────────────────────────────────
  const groupInfo = apiStudent.group_id ? {
    groupName: realGroup?.course_name ?? apiStudent.course_name ?? apiStudent.group_code ?? "",
    groupCode: realGroup?.code ?? apiStudent.group_code ?? "",
    teacher:   realGroup?.teacher_name ?? "—",
  } : null;

  const courseProgress = (() => {
    if (!realGroup) return 0;
    const s = safeParse(realGroup.start_date)?.getTime();
    const e = safeParse(realGroup.end_date)?.getTime();
    const now = Date.now();
    if (!s || !e || e <= s) return 0;
    return Math.max(0, Math.min(100, Math.round(((now - s) / (e - s)) * 100)));
  })();

  const studentCourses = realGroup ? [{
    name:          realGroup.course_name ?? "—",
    group:         realGroup.code,
    teacher:       realGroup.teacher_name ?? "—",
    startDate:     realGroup.start_date,
    paymentStatus: (billing?.status ?? apiStudent.payment_status) as "paid" | "debt",
    progress:      courseProgress,
    lessonsAttended: attStats.present + attStats.late,
    lessonsTotal:    attStats.total,
  }] : [];

  const totalPaidMoney = fmtMoney(billing?.total_paid);
  const debtAmount = billing?.debt_amount ?? 0;
  const creditBalance = billing?.credit_balance ?? 0;
  const hasDebt = debtAmount > 0;
  const hasCredit = creditBalance > 0;
  const financeKpiMoney = fmtMoney(hasDebt ? debtAmount : creditBalance);
  const financeProgress = billing && billing.total_course_cost > 0
    ? Math.min(100, Math.round((billing.total_paid / billing.total_course_cost) * 100))
    : 0;
  const coursesEnrolled = apiStudent.group_id ? 1 : 0;

  const attendanceTrend: "up" | "down" | "stable" =
    attStats.rate >= 90 ? "up" : attStats.rate <= 75 ? "down" : "stable";

  const genderLabel =
    student.gender === "male"   ? t("students.male")
    : student.gender === "female" ? t("students.female")
    : "—";

  const fmtBirthDate = (s: string) => {
    const d = safeParse(s);
    return d ? format(d, "dd.MM.yyyy") : "—";
  };
  const fmtLongDate = (s: string | null | undefined) => {
    const d = safeParse(s ?? null);
    return d ? format(d, "d MMMM yyyy", { locale: dfLocale }) : "—";
  };
  const fmtAttDate = (s: string) => {
    const d = safeParse(s);
    return d ? format(d, "d MMM yyyy", { locale: dfLocale }) : s;
  };

  const paymentPillCls =
    student.paymentStatus === "paid"
      ? "bg-[hsl(142_76%_94%)] text-[hsl(142_71%_38%)] border-[hsl(142_77%_84%)] dark:bg-success/15 dark:text-success dark:border-success/30"
      : student.paymentStatus === "debt"
      ? "bg-[hsl(0_86%_96%)] text-[hsl(0_72%_47%)] border-[hsl(0_93%_88%)] dark:bg-destructive/15 dark:text-destructive dark:border-destructive/30"
      : "bg-warning/10 text-warning border-warning/30";

  const paymentPillIcon =
    student.paymentStatus === "paid"
      ? <CheckCircle2 className="h-3.5 w-3.5" />
      : student.paymentStatus === "debt"
      ? <AlertCircle className="h-3.5 w-3.5" />
      : <Clock className="h-3.5 w-3.5" />;

  const paymentPillLabel = t(`status.${student.paymentStatus}`);

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6">
        <Breadcrumbs items={[
          { label: t("students.title"), href: "/students" },
          { label: student.fullName },
        ]} />

        <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground -mt-2" onClick={() => navigate("/students")}>
          <ArrowLeft className="h-3.5 w-3.5" /> {t("profile.backToStudents")}
        </Button>

        {/* Hero Header */}
        <div className="rounded-2xl border border-border bg-card shadow-[0_2px_12px_rgba(0,0,0,0.06)] animate-fade-in">
          <div className="p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-5">
              <div className="flex-1 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0">
                    <h1 className="text-[22px] font-bold text-foreground tracking-tight leading-tight">
                      {student.fullName}
                    </h1>
                    <div className="mt-1.5 flex items-center gap-1.5 text-[13px] text-muted-foreground flex-wrap">
                      <span>{genderLabel}</span>
                      <span className="text-muted-foreground/40">·</span>
                      <span>{student.birthDate ? fmtBirthDate(student.birthDate) : "—"}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 text-[13px] text-muted-foreground flex-wrap">
                      <BookOpen className="h-3.5 w-3.5" />
                      <span className="font-medium text-foreground">{groupInfo?.groupName || student.group}</span>
                      {groupInfo && (
                        <>
                          <span className="text-muted-foreground/40">·</span>
                          <GraduationCap className="h-3.5 w-3.5" />
                          <span>{groupInfo.teacher}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right: status + actions */}
                  <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${paymentPillCls}`}>
                        {paymentPillIcon}
                        {paymentPillLabel}
                      </div>
                      {!student.isActive && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border bg-muted text-muted-foreground border-muted-foreground/20">
                          <UserX className="h-3.5 w-3.5" />
                          {t("status.inactive")}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs bg-card border-border text-foreground hover:bg-muted/50"
                        onClick={openEdit}
                      >
                        <Pencil className="h-3 w-3" /> {t("common.edit")}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                            className="gap-1.5 text-xs bg-card border-border text-foreground hover:bg-muted/50"
                      >
                            <MoreVertical className="h-3 w-3" />
                      </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          {apiStudent.is_active ? (
                            <DropdownMenuItem onClick={() => setActiveToggleOpen(true)}>
                              <UserX className="h-3.5 w-3.5 mr-2" />
                              {t("profile.deactivate")}
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => setActiveToggleOpen(true)}>
                              <UserCheck className="h-3.5 w-3.5 mr-2" />
                              {t("profile.activate")}
                            </DropdownMenuItem>
                          )}
                          {apiStudent.group_id && (
                            <DropdownMenuItem onClick={() => setLeaveOpen(true)}>
                              <LogOut className="h-3.5 w-3.5 mr-2" />
                              {t("profile.leaveGroup")}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeleteOpen(true)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            {t("common.delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Info grid */}
        <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden animate-fade-in" style={{ animationDelay: "80ms" }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border/60">
            <InfoCell label={t("students.phone")} value={
              student.phone
                ? <a href={`tel:${formatPhone(student.phone)}`} className="font-mono text-primary hover:underline">{student.phone}</a>
                : "—"
            } />
            <InfoCell label={t("students.parentPhone")} value={
              student.parentPhone
                ? <a href={`tel:${formatPhone(student.parentPhone)}`} className="font-mono text-primary hover:underline">{student.parentPhone}</a>
                : "—"
            } />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border/60 border-t border-border/60">
            <InfoCell label={t("students.birthDate")} value={student.birthDate ? fmtBirthDate(student.birthDate) : "—"} />
            <InfoCell label={t("students.gender")} value={genderLabel} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border/60 border-t border-border/60">
            <InfoCell label={t("students.group")} value={
              groupInfo && apiStudent.group_id ? (
                <span
                  className="cursor-pointer hover:underline text-primary"
                  onClick={() => navigate(`/groups/${apiStudent.group_id}`)}
                >
                  {groupInfo.groupName} <span className="text-muted-foreground/60">({groupInfo.groupCode})</span>
                </span>
              ) : student.group
            } />
            <InfoCell label={t("students.enrolled")} value={fmtLongDate(student.enrollDate)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border/60 border-t border-border/60">
            <InfoCell label={t("profile.instructor")} value={
              realGroup?.teacher_id ? (
                <span
                  className="cursor-pointer hover:underline text-primary"
                  onClick={() => navigate(`/teachers/${realGroup.teacher_id}`)}
                >
                  {groupInfo?.teacher || "—"}
                </span>
              ) : (groupInfo?.teacher || "—")
            } />
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm animate-fade-in" style={{ animationDelay: "120ms" }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-7 w-7 rounded-lg bg-success/10 flex items-center justify-center">
                <CreditCard className="h-3.5 w-3.5 text-success" />
              </div>
              <span className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide">{t("profile.totalPaid")}</span>
            </div>
            <p className="text-lg sm:text-xl font-bold text-foreground">
              {ledgerQ.isLoading ? <Loader2 className="h-4 w-4 animate-spin inline-block" /> : totalPaidMoney}
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm animate-fade-in" style={{ animationDelay: "180ms" }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
              </div>
              <span className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide">{t("profile.attendanceRate")}</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <p className="text-lg sm:text-xl font-bold text-foreground">{attStats.rate}%</p>
              <span className={`text-[10px] font-medium inline-flex items-center gap-0.5 ${
                attendanceTrend === "up" ? "text-success" : attendanceTrend === "down" ? "text-destructive" : "text-muted-foreground"
              }`}>
                {attendanceTrend === "up" && <><TrendingUp className="h-3 w-3" /> {t("profile.trendUp")}</>}
                {attendanceTrend === "down" && <><TrendingDown className="h-3 w-3" /> {t("profile.trendDown")}</>}
                {attendanceTrend === "stable" && <>→ {t("profile.trendStable")}</>}
              </span>
            </div>
            <Progress value={attStats.rate} className="h-1.5 mt-2" />
          </div>

          <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm animate-fade-in" style={{ animationDelay: "240ms" }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-7 w-7 rounded-lg bg-warning/10 flex items-center justify-center">
                <BookOpen className="h-3.5 w-3.5 text-warning" />
              </div>
              <span className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide">{t("profile.coursesEnrolled")}</span>
            </div>
            <p className="text-lg sm:text-xl font-bold text-foreground">{coursesEnrolled}</p>
          </div>

          <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm animate-fade-in" style={{ animationDelay: "300ms" }}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${hasDebt ? "bg-destructive/10" : hasCredit ? "bg-success/10" : "bg-muted/70"}`}>
                {hasDebt ? <AlertCircle className="h-3.5 w-3.5 text-destructive" /> : hasCredit ? <Wallet className="h-3.5 w-3.5 text-success" /> : <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />}
              </div>
              <span className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide">
                {hasDebt ? t("profile.outstandingBalance") : t("finance.depositBalance")}
              </span>
            </div>
            <p className={`text-lg sm:text-xl font-bold ${hasDebt ? "text-destructive" : hasCredit ? "text-success" : "text-muted-foreground"}`}>
              {ledgerQ.isLoading ? <Loader2 className="h-4 w-4 animate-spin inline-block" /> : financeKpiMoney}
            </p>
            {!!billing?.total_course_cost && (
              <>
                <Progress value={financeProgress} className="h-1.5 mt-2" />
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                  {t("finance.totalCourseCost")}: {fmtMoney(billing.total_course_cost)}
                </p>
              </>
            )}
          </div>
        </div>

        {/* Cabinet credentials */}
        <div
          className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden animate-fade-in"
          style={{ animationDelay: "340ms" }}
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 sm:p-5">
            <div className="flex items-start gap-3 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Lock className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-bold text-foreground">
                    {t("student.credentialsBlock")}
                  </p>
                  {apiStudent?.has_credentials ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold uppercase text-success">
                      <CheckCircle2 className="h-3 w-3" />
                      {t("student.credentialsSet")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                      {t("student.credentialsUnset")}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {apiStudent?.phone
                    ? t("student.credentialsHelper")
                    : t("student.credentialsHelperNoPhone")}
                </p>
                {apiStudent?.phone && (
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    {t("student.credentialsLogin")}:{" "}
                    <span className="font-mono text-foreground">{apiStudent.phone}</span>
                  </p>
                )}
              </div>
            </div>
            <Button
              size="sm"
              variant={apiStudent?.has_credentials ? "outline" : "default"}
              onClick={() => {
                setCredsPwd("");
                setCredsOpen(true);
              }}
              disabled={!apiStudent?.phone}
            >
              <Lock className="h-3.5 w-3.5 mr-1.5" />
              {apiStudent?.has_credentials
                ? t("student.resetPassword")
                : t("student.setPassword")}
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="payments" className="space-y-3 sm:space-y-4">
          <div className="flex justify-center">
            <TabsList className="bg-muted/50 h-auto p-1 gap-1 inline-flex flex-wrap">
              <TabsTrigger value="payments" className="text-sm gap-2 px-4 py-2 data-[state=active]:bg-card data-[state=active]:shadow-sm">
                <CreditCard className="h-4 w-4" /> {t("profile.paymentRecords")}
            </TabsTrigger>
              <TabsTrigger value="courses" className="text-sm gap-2 px-4 py-2 data-[state=active]:bg-card data-[state=active]:shadow-sm">
                <BookOpen className="h-4 w-4" /> {t("profile.assignedCourses")}
            </TabsTrigger>
              <TabsTrigger value="attendance" className="text-sm gap-2 px-4 py-2 data-[state=active]:bg-card data-[state=active]:shadow-sm">
                <Calendar className="h-4 w-4" /> {t("profile.attendanceHistory")}
              </TabsTrigger>
              <TabsTrigger value="notes" className="text-sm gap-2 px-4 py-2 data-[state=active]:bg-card data-[state=active]:shadow-sm">
                <MessageSquare className="h-4 w-4" /> {t("profile.notes")}
            </TabsTrigger>
              {isAdmin && (
                <TabsTrigger value="transfers" className="text-sm gap-2 px-4 py-2 data-[state=active]:bg-card data-[state=active]:shadow-sm">
                  <GraduationCap className="h-4 w-4" /> {t("transfer.history")}
                </TabsTrigger>
              )}
          </TabsList>
          </div>

          {/* Attendance tab */}
          <TabsContent value="attendance">
            <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
              {/* Toolbar: range + breakdown chips */}
              <div className="px-4 py-3 border-b border-border/40 flex flex-wrap items-center gap-2 sm:gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{t("profile.attendanceRange")}</span>
                  <Select value={attRange} onValueChange={(v) => setAttRange(v as "30" | "90" | "all")}>
                    <SelectTrigger className="h-8 w-[160px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">{t("profile.last30days")}</SelectItem>
                      <SelectItem value="90">{t("profile.last90days")}</SelectItem>
                      <SelectItem value="all">{t("common.allTime")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="ml-auto flex items-center gap-1.5 sm:gap-2 text-[11px] flex-wrap">
                  <Chip color="success" label={t("profile.attBreakdownPresent")} value={attStats.present} />
                  <Chip color="warning" label={t("profile.attBreakdownLate")} value={attStats.late} />
                  <Chip color="destructive" label={t("profile.attBreakdownAbsent")} value={attStats.absent} />
                  <Chip color="muted" label={t("profile.attBreakdownExcused")} value={attStats.excused} />
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-semibold">{t("profile.date")}</TableHead>
                    <TableHead className="font-semibold">{t("journal.lessonTopic")}</TableHead>
                    <TableHead className="font-semibold">{t("students.status")}</TableHead>
                    <TableHead className="font-semibold">{t("profile.reason")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TooltipProvider>
                    {attQ.isLoading && (
                      <TableRow>
                        <TableCell colSpan={4} className="h-24 text-center text-sm text-muted-foreground">
                          <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
                          {t("common.loading")}
                        </TableCell>
                      </TableRow>
                    )}
                    {!attQ.isLoading && attRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="h-32 text-center">
                          <div className="flex flex-col items-center gap-2 text-muted-foreground">
                            <Calendar className="h-8 w-8 text-muted-foreground/40" />
                            <p className="text-sm">{t("profile.attendanceEmpty")}</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    {!attQ.isLoading && pagedAttendance.map((record, pageIdx) => (
                      <TableRow key={record.lesson_id} className="animate-fade-in" style={{ animationDelay: `${pageIdx * 30}ms` }}>
                        <TableCell className="text-sm whitespace-nowrap">
                          <div className="flex flex-col">
                            <span>{fmtAttDate(record.lesson_date)}</span>
                            <span className="text-[11px] text-muted-foreground tabular-nums">
                              {record.start_time?.slice(0, 5)}–{record.end_time?.slice(0, 5)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[260px] truncate">
                          {record.topic || "—"}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <AttendanceIcon status={record.status} />
                            <StatusBadge status={record.status as "present" | "absent" | "late" | "excused"} />
                            {record.status === "late" && record.late_minutes ? (
                              <span className="text-[11px] text-warning tabular-nums">+{record.late_minutes}{t("time.minShort")}</span>
                            ) : null}
                            </div>
                          </TableCell>
                          <TableCell>
                          {record.status === "present" ? (
                            <span className="text-xs text-muted-foreground/40">—</span>
                              ) : (
                                <div className="flex items-center gap-1.5 group">
                              {record.reason_text ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="text-xs text-muted-foreground max-w-[200px] truncate block cursor-help">
                                      {record.reason_text}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="max-w-xs">
                                    <p className="text-sm">{record.reason_text}</p>
                                      </TooltipContent>
                                    </Tooltip>
                              ) : record.reason_code && record.reason_code !== "none" ? (
                                <span className="text-xs text-muted-foreground italic">
                                  {t(`journal.reason${record.reason_code.charAt(0).toUpperCase()}${record.reason_code.slice(1)}`)}
                                </span>
                                  ) : (
                                    <span className="text-xs text-muted-foreground/40 italic">{t("profile.noReason")}</span>
                                  )}
                                  <Button
                                    variant="ghost" size="icon"
                                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
                                onClick={() => openReasonDialog(record)}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                </div>
                            )}
                          </TableCell>
                        </TableRow>
                    ))}
                  </TooltipProvider>
                </TableBody>
              </Table>
              {attRows.length > ATTENDANCE_PAGE_SIZE && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border/40">
                  <span className="text-xs text-muted-foreground">
                    {`${t("common.page")} ${attendancePage + 1} ${t("common.of")} ${totalPages}`}
                  </span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={attendancePage === 0} onClick={() => setAttendancePage(p => p - 1)}>
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={attendancePage >= totalPages - 1} onClick={() => setAttendancePage(p => p + 1)}>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Courses tab */}
          <TabsContent value="courses">
            <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
              <div className="p-4 border-b border-border/40 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-foreground">{t("profile.assignedCourses")}</h3>
                <Button size="sm" className="gap-1.5 text-xs" onClick={() => setEnrollOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> {t("profile.enrollAction")}
                </Button>
              </div>
              {studentCourses.length === 0 ? (
                <div className="p-8 flex flex-col items-center gap-3 text-center">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                    <BookOpen className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">{t("profile.notInGroup")}</p>
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setEnrollOpen(true)}>
                    <Plus className="h-3.5 w-3.5" /> {t("profile.enrollAction")}
                  </Button>
                </div>
              ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                      <TableHead className="font-semibold">{t("profile.course")}</TableHead>
                      <TableHead className="font-semibold">{t("students.group")}</TableHead>
                      <TableHead className="font-semibold">{t("profile.instructor")}</TableHead>
                      <TableHead className="font-semibold">{t("students.startDate")}</TableHead>
                      <TableHead className="font-semibold">{t("students.payment")}</TableHead>
                      <TableHead className="font-semibold">{t("profile.progress")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {studentCourses.map((course, i) => (
                      <TableRow
                        key={i}
                        className="animate-fade-in cursor-pointer hover:bg-muted/30"
                        style={{ animationDelay: `${i * 50}ms` }}
                        onClick={() => apiStudent.group_id && navigate(`/groups/${apiStudent.group_id}`)}
                      >
                      <TableCell className="font-medium text-sm">{course.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{course.group}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{course.teacher}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{fmtLongDate(course.startDate)}</TableCell>
                      <TableCell>
                        <StatusBadge status={course.paymentStatus} />
                      </TableCell>
                      <TableCell>
                          <div className="flex flex-col gap-1 min-w-[140px]">
                            <div className="flex items-center gap-2">
                          <Progress value={course.progress} className="h-1.5 flex-1" />
                          <span className="text-xs font-semibold text-foreground w-8 text-right">{course.progress}%</span>
                            </div>
                            <span className="text-[10px] text-muted-foreground">
                              {course.lessonsAttended}/{course.lessonsTotal} {t("profile.lessonsAttendedSuffix")}
                            </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              )}
            </div>
          </TabsContent>

          {/* Payments tab */}
          <TabsContent value="payments">
            <StudentPaymentsTab studentId={studentId} />
          </TabsContent>

          {/* Notes tab */}
          <TabsContent value="notes">
            <div className="space-y-4">
              {/* Add note form */}
              <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
                <div className="flex gap-3">
                  <Textarea
                    placeholder={t("profile.notePlaceholder")}
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    rows={2}
                    className="flex-1 resize-none"
                  />
                  <Button
                    size="sm"
                    className="self-end gap-1.5 h-9 px-4"
                    disabled={!noteText.trim() || createNoteM.isPending}
                    onClick={async () => {
                      try {
                        await createNoteM.mutateAsync({ studentId, text: noteText.trim() });
                        setNoteText("");
                        toast.success(t("profile.noteSaved"));
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : t("common.error"));
                      }
                    }}
                  >
                    <Send className="h-3.5 w-3.5" /> {t("profile.addNote")}
                  </Button>
                </div>
              </div>

              {/* Notes list */}
              {(notesQ.data?.items ?? []).length === 0 ? (
                <div className="rounded-xl border border-border/60 bg-card p-8 text-center text-sm text-muted-foreground">
                  {t("profile.noNotes")}
                </div>
              ) : (
                <div className="space-y-3">
                  {(notesQ.data?.items ?? []).map((note) => (
                    <div
                      key={note.id}
                      className="rounded-xl border border-border/60 bg-card p-4 shadow-sm animate-fade-in"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="mt-1.5 h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm text-foreground whitespace-pre-wrap">{note.text}</p>
                            <p className="text-xs text-muted-foreground mt-1.5">
                              {new Date(note.created_at).toLocaleString(
                                language === "ru" ? "ru-RU" : language === "uz" ? "uz-UZ" : "en-US",
                                { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
                              )}
                            </p>
                </div>
              </div>
                        <button
                          className="text-muted-foreground hover:text-destructive transition-colors shrink-0 mt-0.5"
                          onClick={async () => {
                            try {
                              await deleteNoteM.mutateAsync({ studentId, noteId: note.id });
                              toast.success(t("profile.noteDeleted"));
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : t("common.error"));
                            }
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Transfers tab */}
          {isAdmin && (
          <TabsContent value="transfers">
            <div className="space-y-3">
              {transfersQ.isLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : !transfersQ.data || transfersQ.data.length === 0 ? (
                <div className="rounded-xl border border-border/60 bg-card p-6 text-center text-muted-foreground text-sm shadow-sm">
                  {t("transfer.noHistory")}
                </div>
              ) : (
                <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">{t("transfer.date")}</TableHead>
                        <TableHead className="text-xs">{t("transfer.from")}</TableHead>
                        <TableHead className="text-xs">{t("transfer.to")}</TableHead>
                        <TableHead className="text-xs">{t("transfer.prevDebt")}</TableHead>
                        <TableHead className="text-xs">{t("transfer.debtPolicy")}</TableHead>
                        <TableHead className="text-xs">{t("transfer.by")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transfersQ.data.map((tr) => (
                        <TableRow key={tr.id}>
                          <TableCell className="text-sm tabular-nums">
                            {tr.transfer_date.split("-").reverse().join(".")}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {tr.from_group?.name ?? "—"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {tr.to_group?.name ?? "—"}
                          </TableCell>
                          <TableCell className="text-sm tabular-nums">
                            {tr.prev_debt > 0 ? formatCurrencyUZS(tr.prev_debt) : "—"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {tr.debt_action === "writeoff" ? (
                              <span className="inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 text-[11px] font-medium">
                                {t("transfer.debtWrittenOff")}
                              </span>
                            ) : tr.debt_action === "snapshot" ? (
                              <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-[11px] font-medium">
                                {t("transfer.debtKept")}
                              </span>
                            ) : tr.debt_action === "reset" ? (
                              <span className="inline-flex items-center rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 px-2 py-0.5 text-[11px] font-medium">
                                {t("transfer.debtReset")}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {tr.performed_by_subject}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </TabsContent>
          )}
        </Tabs>

        {/* Edit Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("students.editTitle")}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
              <div className="grid gap-2">
                <Label>{t("students.fullName")} *</Label>
                <Input value={editForm.fullName} placeholder={t("students.enterFullName")} onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>{t("students.gender")}</Label>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant={editForm.gender === "male" ? "default" : "outline"}
                    size="sm"
                    className="flex-1 h-9 text-sm"
                    onClick={() => setEditForm({ ...editForm, gender: editForm.gender === "male" ? "" : "male" })}
                  >
                    {t("students.male")}
                  </Button>
                  <Button
                    type="button"
                    variant={editForm.gender === "female" ? "default" : "outline"}
                    size="sm"
                    className="flex-1 h-9 text-sm"
                    onClick={() => setEditForm({ ...editForm, gender: editForm.gender === "female" ? "" : "female" })}
                  >
                    {t("students.female")}
                  </Button>
              </div>
              </div>
              <div className="grid gap-2">
                <Label>{t("students.birthDate")}</Label>
                <Input type="date" value={editForm.birthDate || ""} onChange={(e) => setEditForm({ ...editForm, birthDate: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>{t("students.phone")}</Label>
                <Input value={editForm.phone} placeholder={t("students.phonePh")} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>{t("students.parentPhone")}</Label>
                <Input value={editForm.parentPhone || ""} onChange={(e) => setEditForm({ ...editForm, parentPhone: e.target.value })} placeholder={t("students.phonePh")} />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setEditOpen(false)} disabled={updateM.isPending}>
                <X className="h-3.5 w-3.5 mr-1.5" /> {t("common.cancel")}
              </Button>
              <Button onClick={saveProfile} disabled={updateM.isPending}>
                {updateM.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                {t("common.save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Enrollment Dialog */}
        <Dialog open={enrollOpen} onOpenChange={(o) => { setEnrollOpen(o); if (!o) resetEnrollForm(); }}>
          <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("profile.enrollDialogTitle")}</DialogTitle>
            </DialogHeader>

            {/* Student banner */}
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border/40">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                <span className="text-muted-foreground">{t("payments.student")}:</span>{" "}
                <span className="font-semibold text-foreground">
                  {student.fullName}
                </span>
              </span>
            </div>

            {/* Current group banner */}
            {groupInfo && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <BookOpen className="h-4 w-4 text-primary" />
                <span className="text-sm">
                  <span className="text-muted-foreground">{t("profile.currentGroupBanner")}:</span>{" "}
                  <span className="font-semibold text-foreground">{groupInfo.groupCode}</span>
                  <span className="text-muted-foreground"> · {groupInfo.groupName}</span>
                </span>
              </div>
            )}

            {/* Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Select value={enrollCourse} onValueChange={setEnrollCourse}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.allCourses")}</SelectItem>
                  {courseOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={enrollDay} onValueChange={setEnrollDay}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.allDays")}</SelectItem>
                  {Object.keys(DAY_KEYS).map(d => (
                    <SelectItem key={d} value={d}>{t(DAY_KEYS[d])}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={enrollAvailability} onValueChange={setEnrollAvailability}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.allGroups")}</SelectItem>
                  <SelectItem value="available">{t("profile.availabilityAvailable")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Group cards list */}
            <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
              {filteredEnrollGroups.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground">{t("profile.noGroupsFound")}</div>
              )}
              {filteredEnrollGroups.map(g => {
                const { isFull, alreadyIn } = evaluateGroup(g);
                const disabled = isFull || alreadyIn;
                const isSelected = selectedGroupId === g.id;
                const price = g.price || 0;

                let statusBadge = (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-success/15 text-success border border-success/30">
                    <CheckCircle2 className="h-3 w-3" /> {g.students}/{g.maxStudents}
                  </span>
                );
                if (isFull) statusBadge = (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-destructive/15 text-destructive border border-destructive/30">
                    <Lock className="h-3 w-3" /> {g.students}/{g.maxStudents}
                  </span>
                );

                return (
                  <button
                    type="button"
                    key={g.id}
                    disabled={disabled}
                    onClick={() => setSelectedGroupId(g.id)}
                    className={`w-full text-left rounded-xl border p-3 transition-all ${
                      isSelected
                        ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                        : "border-border/60 bg-card hover:border-primary/40 hover:bg-muted/30"
                    } ${disabled ? "opacity-60 cursor-not-allowed hover:border-border/60 hover:bg-card" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span className="font-semibold text-sm text-foreground">{g.code}</span>
                      {statusBadge}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                      <BookOpen className="h-3 w-3" /><span>{g.course}</span>
                      <span className="text-muted-foreground/40">·</span>
                      <GraduationCap className="h-3 w-3" /><span>{g.teacher}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                      <Calendar className="h-3 w-3" />
                      <span>{g.days.map(d => t(DAY_KEYS[d] ?? "")).filter(Boolean).join(" / ")}</span>
                      <span className="text-muted-foreground/40">·</span>
                      <Clock className="h-3 w-3" /><span>{g.timeSlot}</span>
                      <span className="text-muted-foreground/40">·</span>
                      <Wallet className="h-3 w-3" /><span>{formatNumber(price)} UZS{t("common.perMonth")}</span>
                    </div>
                    {alreadyIn && (
                      <p className="mt-1.5 text-[11px] font-medium text-warning">{t("profile.alreadyInGroup")}</p>
                    )}
                    {!alreadyIn && isFull && (
                      <p className="mt-1.5 text-[11px] font-medium text-destructive">{t("profile.groupFull")}</p>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Selection summary */}
            {selectedGroup && (() => {
              const isMove = !!apiStudent?.group_id && String(apiStudent.group_id) !== selectedGroup.id;
              return (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      <Check className="h-4 w-4 text-primary" />
                      {selectedGroup.code} · {selectedGroup.teacher} · {selectedGroup.days.map(d => t(DAY_KEYS[d] ?? "")).filter(Boolean).join(" / ")}
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedGroupId(null)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-[11px] text-muted-foreground">{t("payments.monthlyAmount")}</Label>
                    <Input value={`${formatNumber(selectedPrice)} UZS`} readOnly className="h-8 text-xs bg-muted/50" />
                  </div>

                  {/* For moves (already enrolled elsewhere), all the
                     debt/date/policy/reason controls now live in the shared
                     TransferStudentDialog so the rules stay consistent. */}
                  {isMove && (
                    <div className="border-t border-primary/20 pt-3 text-[11px] text-muted-foreground">
                      {t("transfer.useTransferDialog")}
                    </div>
                  )}
                </div>
              );
            })()}

            <DialogFooter className="pt-2 gap-2">
              <Button variant="outline" onClick={() => setEnrollOpen(false)} disabled={updateM.isPending}>
                {t("common.cancel")}
              </Button>
              <Button onClick={handleEnroll} disabled={!selectedGroup || updateM.isPending}>
                {updateM.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                {selectedGroup && apiStudent?.group_id && String(apiStudent.group_id) !== selectedGroup.id
                  ? t("transfer.confirm")
                  : t("profile.enrollAction")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Shared Transfer dialog (handles preview, 3 policies, structured errors). */}
        <TransferStudentDialog
          open={transferDialogOpen}
          onOpenChange={setTransferDialogOpen}
          studentId={apiStudent?.id ?? null}
          studentLabel={apiStudent?.full_name ?? null}
          candidateGroups={allGroups}
          currentGroupId={apiStudent?.group_id ?? null}
          onTransferred={() => {
            resetEnrollForm();
          }}
        />

        {/* Reason-edit Dialog */}
        <Dialog open={reasonRow !== null} onOpenChange={(o) => !o && closeReasonDialog()}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("journal.absentReasonTitle")}</DialogTitle>
              <DialogDescription>
                {reasonRow ? `${fmtAttDate(reasonRow.lesson_date)} · ${reasonRow.group_code}` : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid gap-2">
                <Label>{t("profile.reason")}</Label>
                <Select value={reasonCode} onValueChange={(v) => setReasonCode(v as AbsenceReasonCode)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="illness">{t("journal.reasonIllness")}</SelectItem>
                    <SelectItem value="family">{t("journal.reasonFamily")}</SelectItem>
                    <SelectItem value="other">{t("journal.reasonOther")}</SelectItem>
                    <SelectItem value="none">{t("journal.reasonNone")}</SelectItem>
                  </SelectContent>
                </Select>
            </div>
              <div className="grid gap-2">
                <Label>{t("payments.comment")}</Label>
                <Textarea
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                  placeholder={t("journal.reasonOtherPlaceholder")}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={closeReasonDialog} disabled={upsertM.isPending}>
                {t("common.cancel")}
              </Button>
              <Button onClick={saveReason} disabled={upsertM.isPending}>
                {upsertM.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                {t("common.save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Cabinet credentials dialog */}
        <Dialog open={credsOpen} onOpenChange={(o) => { setCredsOpen(o); if (!o) setCredsPwd(""); }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>
                {apiStudent?.has_credentials
                  ? t("student.resetPassword")
                  : t("student.setPassword")}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {t("student.credentialsHelper")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs">
                <p className="text-muted-foreground">{t("student.credentialsLogin")}</p>
                <p className="font-mono font-semibold text-foreground mt-0.5">
                  {apiStudent?.phone ?? "—"}
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="creds-pwd">{t("student.credentialsPassword")}</Label>
                <PasswordInput
                  id="creds-pwd"
                  autoComplete="new-password"
                  value={credsPwd}
                  onChange={(e) => setCredsPwd(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setCredsOpen(false)}
                disabled={credsSaving}
              >
                {t("common.cancel")}
              </Button>
              <Button onClick={saveCredentials} disabled={credsSaving || credsPwd.length < 6}>
                {credsSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                {t("common.save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Leave Group confirmation */}
        <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("profile.leaveGroupConfirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("profile.leaveGroupConfirmDesc")
                  .replace("{{group}}", groupInfo?.groupCode ?? "")
                  .replace("{{name}}", student.fullName)}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={updateM.isPending}>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={handleLeaveGroup} disabled={updateM.isPending}>
                {updateM.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                {t("profile.leaveGroup")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Toggle Active confirmation */}
        <AlertDialog open={activeToggleOpen} onOpenChange={setActiveToggleOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {apiStudent.is_active
                  ? t("profile.deactivateConfirmTitle")
                  : t("profile.activateConfirmTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {apiStudent.is_active
                  ? t("profile.deactivateConfirmDesc")
                  : t("profile.activateConfirmDesc")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={updateM.isPending}>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={handleToggleActive} disabled={updateM.isPending}>
                {updateM.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                {apiStudent.is_active ? t("profile.deactivate") : t("profile.activate")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete confirmation */}
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent className="backdrop-blur-md bg-card/95">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("students.deleteTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {`${t("students.deleteConfirm")} `}
                <span className="font-semibold text-foreground">{student.fullName}</span>
                {`? ${t("common.cannotUndo")}`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteM.isPending}>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleteM.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteM.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                {t("common.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Small helpers
// ───────────────────────────────────────────────────────────────────────────

function InfoCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="px-4 py-3.5 sm:px-5 sm:py-4">
      <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-1">
        {label}
      </p>
      <div className="text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

function Chip({
  color, label, value,
}: { color: "success" | "warning" | "destructive" | "muted"; label: string; value: number }) {
  const cls =
    color === "success"     ? "bg-success/10 text-success border-success/20"
    : color === "warning"   ? "bg-warning/10 text-warning border-warning/20"
    : color === "destructive" ? "bg-destructive/10 text-destructive border-destructive/20"
    : "bg-muted text-muted-foreground border-muted-foreground/15";
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border ${cls} font-medium`}>
      {label}
      <span className="tabular-nums font-semibold">{value}</span>
    </span>
  );
}
