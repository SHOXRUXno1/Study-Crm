import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { differenceInMonths, format } from "date-fns";
import { ru as ruLocale, uz as uzLocale, enUS as enLocale } from "date-fns/locale";
import type { Locale } from "date-fns";
import { BookOpen, Hourglass, AlertTriangle, ExternalLink, Loader2 } from "lucide-react";

import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn, formatCurrencyUZS } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import {
  useCreateVacation,
  useDeleteGroup,
  useDeleteVacation,
  useGroup,
  useGroups,
  useGroupVacations,
  useUpdateGroup,
  expandDays,
  type DaysType,
  type GroupRead,
  type GroupUpdate,
} from "@/hooks/use-groups";
import { useStudents, useUpdateStudent, type StudentRead } from "@/hooks/use-students";
import { useCourses } from "@/hooks/use-courses";
import { useTeachers } from "@/hooks/use-teachers";
import { useRooms } from "@/hooks/use-rooms";
import { useAuth } from "@/hooks/use-auth";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  useGroupConflicts,
  isConflictPayloadReady,
  type ConflictCheckPayload,
  type ConflictHit,
} from "@/hooks/use-group-conflicts";
import { conflictsFromError } from "@/lib/group-conflicts-from-error";
import { toast } from "sonner";
import { GroupHeaderSection } from "@/components/group-profile/GroupHeaderSection";
import { GroupInfoSection } from "@/components/group-profile/GroupInfoSection";
import { GroupProfileDialogs } from "@/components/group-profile/GroupProfileDialogs";
import { GroupStatsSection } from "@/components/group-profile/GroupStatsSection";
import { GroupStudentsSection, type GroupProfileStudent } from "@/components/group-profile/GroupStudentsSection";
import { GroupVacationsSection } from "@/components/group-profile/GroupVacationsSection";

function mapToGroupStudent(s: StudentRead): GroupProfileStudent {
  const parts = (s.full_name ?? "").trim().split(/\s+/);
  return {
    id: String(s.id),
    firstName: parts.slice(1).join(" ") || "",
    lastName: parts[0] || "",
    phone: s.phone ?? "",
    paymentStatus: (s.payment_status as GroupProfileStudent["paymentStatus"]) ?? "paid",
    enrollDate: s.created_at?.slice(0, 10) ?? "",
  };
}

function formatDateDMY(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

const LOCALES: Record<string, Locale> = { ru: ruLocale, uz: uzLocale, en: enLocale };

/** API returns "HH:MM:SS"; forms use "HH:MM". */
function toHm(iso: string): string {
  const s = (iso ?? "").trim();
  if (s.length >= 5 && s[2] === ":") return s.slice(0, 5);
  return s;
}

export default function GroupProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t, language } = useLanguage();
  const dfLocale = LOCALES[language] ?? enLocale;
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const policy = useMemo(
    () => ({
      canEditGroup: isAdmin,
      canDeleteGroup: isAdmin,
      canManageVacations: isAdmin,
      canEnroll: isAdmin,
      canRemoveStudent: isAdmin,
      canTransferStudent: isAdmin,
    }),
    [isAdmin],
  );

  const groupQ = useGroup(id ?? "");
  const apiGroup = groupQ.data;
  const studentsQ = useStudents(id ? { group_id: Number(id), limit: 500 } : {}, { enabled: !!id });
  const allStudentsQ = useStudents({ limit: 1000 }, { enabled: policy.canEnroll });
  const allGroupsQ = useGroups({ limit: 500 }, { enabled: policy.canTransferStudent });
  const vacationsQ = useGroupVacations(Number(id) || 0);
  const coursesQ = useCourses({ limit: 1000, is_active: true }, { enabled: policy.canEditGroup });
  const teachersQ = useTeachers({ limit: 1000 }, { enabled: policy.canEditGroup });
  const roomsQ = useRooms({ limit: 1000 }, { enabled: policy.canEditGroup });

  const updateGroupM = useUpdateGroup();
  const deleteGroupM = useDeleteGroup();
  const updateStudentM = useUpdateStudent();
  const createVacationM = useCreateVacation();
  const deleteVacationM = useDeleteVacation();

  const studentsList = useMemo(() => {
    const apiStudents = studentsQ.data?.items ?? [];
    return apiStudents.map(mapToGroupStudent);
  }, [studentsQ.data?.items]);

  const enrolledIds = useMemo(() => new Set(studentsList.map((s) => Number(s.id))), [studentsList]);
  const studentsForEnroll = useMemo(() => {
    const all = allStudentsQ.data?.items ?? [];
    return all
      .filter((s) => !enrolledIds.has(s.id))
      .map((s) => {
        const nameParts = (s.full_name ?? "").trim().split(/\s+/);
        return {
          id: s.id,
          first_name: nameParts.slice(1).join(" "),
          last_name: nameParts[0] ?? "",
          phone: s.phone ?? "",
        };
      });
  }, [allStudentsQ.data?.items, enrolledIds]);

  const otherGroups = useMemo(
    () => (allGroupsQ.data?.items ?? []).filter((g) => (apiGroup ? g.id !== apiGroup.id : true)),
    [allGroupsQ.data?.items, apiGroup],
  );

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [vacationOpen, setVacationOpen] = useState(false);

  const [activeStudent, setActiveStudent] = useState<GroupProfileStudent | null>(null);
  const [removeReason, setRemoveReason] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
  const [enrollDate, setEnrollDate] = useState(new Date().toISOString().slice(0, 10));
  const [vacationDate, setVacationDate] = useState(new Date().toISOString().slice(0, 10));
  const [vacationNote, setVacationNote] = useState("");

  const [editName, setEditName] = useState("");
  const [editCourseId, setEditCourseId] = useState("none");
  const [editTeacherId, setEditTeacherId] = useState("none");
  const [editRoomId, setEditRoomId] = useState("none");
  const [editMaxStudents, setEditMaxStudents] = useState(12);
  const [editPrice, setEditPrice] = useState(0);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editDays, setEditDays] = useState<DaysType>("odd");
  const [editStartTime, setEditStartTime] = useState("09:00");
  const [editEndTime, setEditEndTime] = useState("10:30");
  const [editDurationMonths, setEditDurationMonths] = useState(3);

  const [confirmEditConflicts, setConfirmEditConflicts] = useState<ConflictHit[] | null>(null);

  useEffect(() => {
    if (!apiGroup) return;
    setEditName(apiGroup.code);
    setEditCourseId(apiGroup.course_id ? String(apiGroup.course_id) : "none");
    setEditTeacherId(apiGroup.teacher_id ? String(apiGroup.teacher_id) : "none");
    setEditRoomId(apiGroup.room_id ? String(apiGroup.room_id) : "none");
    setEditMaxStudents(apiGroup.max_students);
    setEditPrice(apiGroup.price);
    setEditStart(apiGroup.start_date);
    setEditEnd(apiGroup.end_date);
    setEditDays(apiGroup.days as DaysType);
    setEditStartTime(toHm(apiGroup.start_time));
    setEditEndTime(toHm(apiGroup.end_time));
    setEditDurationMonths(Math.max(1, apiGroup.duration_months ?? 3));
  }, [apiGroup]);

  useEffect(() => {
    if (!editOpen) setConfirmEditConflicts(null);
  }, [editOpen]);

  useEffect(() => {
    if (searchParams.get("edit") === "1" && policy.canEditGroup && apiGroup) {
      setEditOpen(true);
      searchParams.delete("edit");
      setSearchParams(searchParams, { replace: true });
    }
  }, [apiGroup, policy.canEditGroup, searchParams, setSearchParams]);

  const roomsItems = roomsQ.data?.items ?? [];

  const rawConflictPayload: ConflictCheckPayload | null = useMemo(() => {
    const g = groupQ.data;
    if (!editOpen || !g || g.status !== "active") return null;
    const teacherId = editTeacherId !== "none" ? Number(editTeacherId) : null;
    const roomId = editRoomId !== "none" ? Number(editRoomId) : null;
    return {
      days: editDays,
      start_time: editStartTime,
      end_time: editEndTime,
      start_date: editStart,
      end_date: editEnd,
      teacher_id: teacherId,
      room_id: roomId,
      exclude_group_id: g.id,
    };
  }, [
    editOpen,
    groupQ.data,
    editDays,
    editStartTime,
    editEndTime,
    editStart,
    editEnd,
    editTeacherId,
    editRoomId,
  ]);

  const debouncedConflictPayload = useDebouncedValue(rawConflictPayload, 300);
  const conflictsQ = useGroupConflicts(debouncedConflictPayload);
  const liveConflicts = conflictsQ.data?.conflicts ?? [];
  const conflictsReady = isConflictPayloadReady(debouncedConflictPayload);
  const conflictsLoading =
    conflictsReady && (conflictsQ.isLoading || conflictsQ.isFetching);

  const editSaveDisabled = useMemo(() => {
    if (!editName.trim()) return true;
    if (!editStartTime || !editEndTime || editEndTime <= editStartTime) return true;
    if (!editStart || !editEnd || editEnd < editStart) return true;
    if (editDurationMonths < 1) return true;
    return false;
  }, [
    editName,
    editStartTime,
    editEndTime,
    editStart,
    editEnd,
    editDurationMonths,
  ]);

  const pending =
    updateGroupM.isPending ||
    deleteGroupM.isPending ||
    updateStudentM.isPending ||
    createVacationM.isPending ||
    deleteVacationM.isPending;

  if (groupQ.isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Hourglass className="h-6 w-6 animate-spin text-muted-foreground mr-2" />
          <span className="text-muted-foreground">{t("groups.loading")}</span>
        </div>
      </DashboardLayout>
    );
  }

  if (groupQ.isError || !apiGroup) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-20">
          <BookOpen className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground">{t("groups.noGroups")}</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/groups")}>
            {t("groups.title")}
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const daysLabel = expandDays(apiGroup.days as DaysType).map((d) => t(`day.short.${d}`)).join(", ");
  const currentCount = studentsList.length || apiGroup.student_count;
  const fillPercent = apiGroup.max_students > 0 ? Math.round((currentCount / apiGroup.max_students) * 100) : 0;

  const startDateObj = new Date(apiGroup.start_date);
  const endDateObj = new Date(apiGroup.end_date);
  const totalMs = endDateObj.getTime() - startDateObj.getTime();
  const elapsedMs = new Date().getTime() - startDateObj.getTime();
  const progressPercent = totalMs > 0 ? Math.min(100, Math.max(0, Math.round((elapsedMs / totalMs) * 100))) : 0;
  const daysLeft = Math.max(0, Math.ceil((endDateObj.getTime() - new Date().getTime()) / 86_400_000));
  const durationMonths = differenceInMonths(endDateObj, startDateObj) || 1;
  const totalPrice = apiGroup.price * durationMonths;

  const buildEditPayload = (): GroupUpdate => {
    const roomId = editRoomId !== "none" ? Number(editRoomId) : null;
    const selectedRoom = roomId ? roomsItems.find((r) => r.id === roomId) : null;
    const cap = selectedRoom?.capacity ?? Math.max(1, editMaxStudents);
    return {
      code: editName.trim(),
      course_id: editCourseId !== "none" ? Number(editCourseId) : null,
      teacher_id: editTeacherId !== "none" ? Number(editTeacherId) : null,
      room_id: roomId,
      days: editDays,
      start_time: editStartTime,
      end_time: editEndTime,
      duration_months: editDurationMonths,
      max_students: Math.min(Math.max(1, editMaxStudents), cap),
      price: Math.max(0, editPrice),
      start_date: editStart,
      end_date: editEnd,
    };
  };

  const runSaveEdit = async (force: boolean) => {
    if (!policy.canEditGroup) return;
    if (!editName.trim()) {
      toast.error(t("groups.errorEnterCode"));
      return;
    }
    if (!editStartTime || !editEndTime) {
      toast.error(t("groups.selectTime"));
      return;
    }
    if (editEndTime <= editStartTime) {
      toast.error(t("groups.invalidTimeRange"));
      return;
    }
    if (!editStart || !editEnd) {
      toast.error(t("groups.errorEnterDates"));
      return;
    }
    if (editEnd < editStart) {
      toast.error(t("groups.endDateBeforeStart"));
      return;
    }
    if (editDurationMonths < 1) return;

    const data = buildEditPayload();

    if (!force && liveConflicts.length > 0) {
      setConfirmEditConflicts(liveConflicts);
      return;
    }

    try {
      await updateGroupM.mutateAsync({ id: apiGroup.id, data, force });
      setEditOpen(false);
      setConfirmEditConflicts(null);
      toast.success(t("groups.groupUpdated"));
    } catch (e) {
      const conflicts = conflictsFromError(e);
      if (conflicts && !force) {
        setConfirmEditConflicts(conflicts);
        return;
      }
      toast.error(e instanceof Error ? e.message : t("groups.errSave"));
    }
  };

  const handleSaveEdit = () => {
    void runSaveEdit(false);
  };

  const handleForceSaveEdit = () => {
    setConfirmEditConflicts(null);
    void runSaveEdit(true);
  };

  const handleDeleteGroup = async () => {
    if (!policy.canDeleteGroup) return;
    try {
      await deleteGroupM.mutateAsync(apiGroup.id);
      setDeleteOpen(false);
      toast.success(t("groups.groupDeleted"));
      navigate("/groups");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("groups.errDelete"));
    }
  };

  const handleEnroll = async () => {
    if (!policy.canEnroll || selectedStudentIds.length === 0) return;
    try {
      await Promise.all(
        selectedStudentIds.map((studentId) =>
          updateStudentM.mutateAsync({
            id: studentId,
            data: { group_id: apiGroup.id },
          }),
        ),
      );
      setEnrollOpen(false);
      setSelectedStudentIds([]);
      toast.success(t("groups.studentAdded"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("groups.errSave"));
    }
  };

  const handleCallStudent = async (student: GroupProfileStudent) => {
    try {
      await navigator.clipboard.writeText(student.phone);
      toast.success(t("groups.toastPhoneCopied"));
    } catch {
      toast.success(student.phone);
    }
  };

  const handleOpenRemove = (student: GroupProfileStudent) => {
    if (!policy.canRemoveStudent) return;
    setActiveStudent(student);
    setRemoveReason("");
    setRemoveOpen(true);
  };

  const handleConfirmRemove = async () => {
    if (!policy.canRemoveStudent || !activeStudent) return;
    try {
      await updateStudentM.mutateAsync({
        id: Number(activeStudent.id),
        data: { group_id: null },
      });
      setRemoveOpen(false);
      setActiveStudent(null);
      toast.success(t("groups.toastRemoved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("groups.errSave"));
    }
  };

  const handleOpenTransfer = (student: GroupProfileStudent) => {
    if (!policy.canTransferStudent) return;
    setActiveStudent(student);
    setTransferOpen(true);
  };

  const handleCreateVacation = async () => {
    if (!policy.canManageVacations || !vacationDate) return;
    try {
      await createVacationM.mutateAsync({
        groupId: apiGroup.id,
        data: { vacation_date: vacationDate, note: vacationNote.trim() || null },
      });
      setVacationOpen(false);
      setVacationNote("");
      toast.success(t("groups.vacationSaved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("groups.vacationExists"));
    }
  };

  const handleDeleteVacation = async (vacationId: number) => {
    if (!policy.canManageVacations) return;
    try {
      await deleteVacationM.mutateAsync({ groupId: apiGroup.id, vacationId });
      toast.success(t("groups.vacationDeleted"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("groups.errDelete"));
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6">
        <GroupHeaderSection
          code={apiGroup.code}
          status={apiGroup.status}
          course={apiGroup.course_name ?? "—"}
          teacher={apiGroup.teacher_name ?? "—"}
          isAdmin={isAdmin}
          onBack={() => navigate("/groups")}
          onOpenVacation={() => setVacationOpen(true)}
          onOpenEdit={() => setEditOpen(true)}
          onOpenDelete={() => setDeleteOpen(true)}
        />

        <GroupStatsSection
          currentCount={currentCount}
          maxStudents={apiGroup.max_students}
          daysLabel={daysLabel}
          timeSlot={apiGroup.time_slot}
          monthlyPrice={formatCurrencyUZS(apiGroup.price)}
          totalPrice={formatCurrencyUZS(totalPrice)}
          daysLeft={daysLeft}
          progressPercent={progressPercent}
          startDateLabel={formatDateDMY(apiGroup.start_date)}
          endDateLabel={formatDateDMY(apiGroup.end_date)}
        />

        <GroupInfoSection
          course={apiGroup.course_name ?? "—"}
          courseId={apiGroup.course_id}
          teacher={apiGroup.teacher_name ?? "—"}
          teacherId={apiGroup.teacher_id}
          roomName={apiGroup.room_name}
          fillPercent={fillPercent}
          startDateLabel={formatDateDMY(apiGroup.start_date)}
          endDateLabel={formatDateDMY(apiGroup.end_date)}
        />

        <GroupVacationsSection
          isAdmin={isAdmin}
          language={language}
          vacations={vacationsQ.data?.items ?? []}
          onDeleteVacation={handleDeleteVacation}
        />

        <GroupStudentsSection
          students={studentsList}
          isAdmin={isAdmin}
          onOpenEnroll={() => setEnrollOpen(true)}
          onViewStudent={(studentId) => navigate(`/students/${studentId}`)}
          onCallStudent={handleCallStudent}
          onRemoveStudent={handleOpenRemove}
          onTransferStudent={handleOpenTransfer}
        />
      </div>

      <GroupProfileDialogs
        isAdmin={isAdmin}
        group={apiGroup}
        courses={coursesQ.data?.items ?? []}
        teachers={teachersQ.data?.items ?? []}
        rooms={roomsQ.data?.items ?? []}
        studentsForEnroll={studentsForEnroll}
        editOpen={editOpen}
        onEditOpenChange={setEditOpen}
        deleteOpen={deleteOpen}
        onDeleteOpenChange={setDeleteOpen}
        enrollOpen={enrollOpen}
        onEnrollOpenChange={setEnrollOpen}
        removeOpen={removeOpen}
        onRemoveOpenChange={setRemoveOpen}
        transferOpen={transferOpen}
        onTransferOpenChange={setTransferOpen}
        vacationOpen={vacationOpen}
        onVacationOpenChange={setVacationOpen}
        editName={editName}
        setEditName={setEditName}
        editCourseId={editCourseId}
        setEditCourseId={setEditCourseId}
        editTeacherId={editTeacherId}
        setEditTeacherId={setEditTeacherId}
        editRoomId={editRoomId}
        setEditRoomId={setEditRoomId}
        editMaxStudents={editMaxStudents}
        setEditMaxStudents={setEditMaxStudents}
        editPrice={editPrice}
        setEditPrice={setEditPrice}
        editStart={editStart}
        setEditStart={setEditStart}
        editEnd={editEnd}
        setEditEnd={setEditEnd}
        editDays={editDays}
        setEditDays={setEditDays}
        editStartTime={editStartTime}
        setEditStartTime={setEditStartTime}
        editEndTime={editEndTime}
        setEditEndTime={setEditEndTime}
        editDurationMonths={editDurationMonths}
        setEditDurationMonths={setEditDurationMonths}
        conflictsReady={conflictsReady}
        conflictsLoading={conflictsLoading}
        liveConflicts={liveConflicts}
        editSaveDisabled={editSaveDisabled}
        onNavigateConflictGroup={(gid) => {
          setEditOpen(false);
          navigate(`/groups/${gid}`);
        }}
        onSubmitEdit={handleSaveEdit}
        onConfirmDelete={handleDeleteGroup}
        selectedStudentIds={selectedStudentIds}
        setSelectedStudentIds={setSelectedStudentIds}
        enrollDate={enrollDate}
        setEnrollDate={setEnrollDate}
        onSubmitEnroll={handleEnroll}
        removeReason={removeReason}
        setRemoveReason={setRemoveReason}
        onSubmitRemove={handleConfirmRemove}
        activeStudentId={activeStudent ? Number(activeStudent.id) : null}
        vacationDate={vacationDate}
        setVacationDate={setVacationDate}
        vacationNote={vacationNote}
        setVacationNote={setVacationNote}
        onSubmitVacation={handleCreateVacation}
        otherGroups={otherGroups as GroupRead[]}
        pending={pending}
        activeStudentLabel={activeStudent ? `${activeStudent.lastName} ${activeStudent.firstName}` : null}
      />

      <AlertDialog
        open={confirmEditConflicts !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmEditConflicts(null);
        }}
      >
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              {t("conflicts.confirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("conflicts.confirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-[40vh] overflow-y-auto space-y-2 rounded-md border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/60 dark:bg-amber-950/30">
            {(confirmEditConflicts ?? []).map((c, i) => (
              <ProfileConflictRow
                key={`${c.kind}-${c.group_id}-${i}`}
                hit={c}
                t={t}
                dfLocale={dfLocale}
                onOpen={() => {
                  setConfirmEditConflicts(null);
                  setEditOpen(false);
                  navigate(`/groups/${c.group_id}`);
                }}
              />
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("conflicts.fixForm")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleForceSaveEdit}
              disabled={updateGroupM.isPending}
              className="bg-amber-600 hover:bg-amber-600/90 text-white"
            >
              {updateGroupM.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("groups.saving")}
                </>
              ) : (
                t("conflicts.saveAnyway")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}

interface ProfileConflictRowProps {
  hit: ConflictHit;
  t: (key: string) => string;
  dfLocale: Locale;
  onOpen: () => void;
}

function ProfileConflictRow({ hit, t, dfLocale, onOpen }: ProfileConflictRowProps) {
  const daysLabel = hit.days === "odd" ? t("groups.daysOdd") : t("groups.daysEven");
  const time = `${hit.start_time.slice(0, 5)}–${hit.end_time.slice(0, 5)}`;
  const overlap = `${format(new Date(hit.overlap_start), "dd MMM", { locale: dfLocale })} – ${format(new Date(hit.overlap_end), "dd MMM yyyy", { locale: dfLocale })}`;
  const reasonKey = hit.kind === "teacher" ? "conflicts.teacherBusy" : "conflicts.roomBusy";
  const subject =
    hit.kind === "teacher" ? (hit.teacher_name ?? "—") : (hit.room_name ?? "—");
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-md bg-background/80 border border-border/60 px-2.5 py-2 text-xs">
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              hit.kind === "teacher"
                ? "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200"
                : "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200",
            )}
          >
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
