import { useState, useEffect } from "react";
import { useLanguage } from "@/hooks/use-language";
import type { DaysType, GroupRead } from "@/hooks/use-groups";
import type { ConflictHit } from "@/hooks/use-group-conflicts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { GroupScheduleTimeSection } from "@/components/GroupScheduleTimeSection";
import { useTransferPreview, useTransferStudent, type DebtPolicy } from "@/hooks/use-students";
import { formatCurrencyUZS } from "@/lib/utils";
import { AlertTriangle, Loader2, CheckCircle2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

type BasicOption = { id: number; name: string };
type TeacherOption = BasicOption & { first_name?: string; last_name?: string };

interface GroupProfileDialogsProps {
  isAdmin: boolean;
  group: GroupRead;
  courses: BasicOption[];
  teachers: TeacherOption[];
  rooms: BasicOption[];
  studentsForEnroll: Array<{ id: number; first_name: string; last_name: string; phone: string }>;
  editOpen: boolean;
  onEditOpenChange: (open: boolean) => void;
  deleteOpen: boolean;
  onDeleteOpenChange: (open: boolean) => void;
  enrollOpen: boolean;
  onEnrollOpenChange: (open: boolean) => void;
  removeOpen: boolean;
  onRemoveOpenChange: (open: boolean) => void;
  transferOpen: boolean;
  onTransferOpenChange: (open: boolean) => void;
  vacationOpen: boolean;
  onVacationOpenChange: (open: boolean) => void;
  editName: string;
  setEditName: (v: string) => void;
  editCourseId: string;
  setEditCourseId: (v: string) => void;
  editTeacherId: string;
  setEditTeacherId: (v: string) => void;
  editRoomId: string;
  setEditRoomId: (v: string) => void;
  editMaxStudents: number;
  setEditMaxStudents: (v: number) => void;
  editPrice: number;
  setEditPrice: (v: number) => void;
  editStart: string;
  setEditStart: (v: string) => void;
  editEnd: string;
  setEditEnd: (v: string) => void;
  editDays: DaysType;
  setEditDays: (v: DaysType) => void;
  editStartTime: string;
  setEditStartTime: (v: string) => void;
  editEndTime: string;
  setEditEndTime: (v: string) => void;
  editDurationMonths: number;
  setEditDurationMonths: (v: number) => void;
  conflictsReady: boolean;
  conflictsLoading: boolean;
  liveConflicts: ConflictHit[];
  editSaveDisabled: boolean;
  onNavigateConflictGroup: (groupId: number) => void;
  onSubmitEdit: () => void;
  onConfirmDelete: () => void;
  selectedStudentIds: number[];
  setSelectedStudentIds: (ids: number[]) => void;
  enrollDate: string;
  setEnrollDate: (v: string) => void;
  onSubmitEnroll: () => void;
  removeReason: string;
  setRemoveReason: (v: string) => void;
  onSubmitRemove: () => void;
  activeStudentId: number | null;
  transferTargetGroupId: string;
  setTransferTargetGroupId: (v: string) => void;
  transferDate: string;
  setTransferDate: (v: string) => void;
  onSubmitTransfer?: () => void;
  vacationDate: string;
  setVacationDate: (v: string) => void;
  vacationNote: string;
  setVacationNote: (v: string) => void;
  onSubmitVacation: () => void;
  otherGroups: GroupRead[];
  pending: boolean;
  activeStudentLabel: string | null;
}

function teacherLabel(t: TeacherOption): string {
  if (t.first_name || t.last_name) return `${t.last_name ?? ""} ${t.first_name ?? ""}`.trim();
  return t.name;
}

function EditScheduleConflictsPreview({
  ready,
  loading,
  conflicts,
  t,
  onOpenGroup,
}: {
  ready: boolean;
  loading: boolean;
  conflicts: ConflictHit[];
  t: (key: string) => string;
  onOpenGroup: (id: number) => void;
}) {
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
          <div
            key={`${c.kind}-${c.group_id}-${i}`}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-md bg-background/80 border border-border/60 px-2.5 py-2 text-xs"
          >
            <div className="min-w-0 flex-1 text-muted-foreground">
              <span className="font-medium text-foreground">{c.group_code}</span>
              {" · "}
              {c.days === "odd" ? t("groups.daysOdd") : t("groups.daysEven")}{" "}
              {c.start_time.slice(0, 5)}–{c.end_time.slice(0, 5)}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={() => onOpenGroup(c.group_id)}
            >
              <ExternalLink className="h-3 w-3" />
              {t("conflicts.openGroup")}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GroupProfileDialogs(props: GroupProfileDialogsProps) {
  const { t } = useLanguage();
  const {
    isAdmin,
    group,
    courses,
    teachers,
    rooms,
    studentsForEnroll,
    editOpen,
    onEditOpenChange,
    deleteOpen,
    onDeleteOpenChange,
    enrollOpen,
    onEnrollOpenChange,
    removeOpen,
    onRemoveOpenChange,
    transferOpen,
    onTransferOpenChange,
    vacationOpen,
    onVacationOpenChange,
    editName,
    setEditName,
    editCourseId,
    setEditCourseId,
    editTeacherId,
    setEditTeacherId,
    editRoomId,
    setEditRoomId,
    editMaxStudents,
    setEditMaxStudents,
    editPrice,
    setEditPrice,
    editStart,
    setEditStart,
    editEnd,
    setEditEnd,
    editDays,
    setEditDays,
    editStartTime,
    setEditStartTime,
    editEndTime,
    setEditEndTime,
    editDurationMonths,
    setEditDurationMonths,
    conflictsReady,
    conflictsLoading,
    liveConflicts,
    editSaveDisabled,
    onNavigateConflictGroup,
    onSubmitEdit,
    onConfirmDelete,
    selectedStudentIds,
    setSelectedStudentIds,
    enrollDate,
    setEnrollDate,
    onSubmitEnroll,
    removeReason,
    setRemoveReason,
    onSubmitRemove,
    activeStudentId,
    transferTargetGroupId,
    setTransferTargetGroupId,
    transferDate,
    setTransferDate,
    vacationDate,
    setVacationDate,
    vacationNote,
    setVacationNote,
    onSubmitVacation,
    otherGroups,
    pending,
    activeStudentLabel,
  } = props;

  const selectedCourseNum = editCourseId !== "none" ? Number(editCourseId) : null;
  const selectedTeacherNum = editTeacherId !== "none" ? Number(editTeacherId) : null;
  const selectedRoomNum = editRoomId !== "none" ? Number(editRoomId) : null;

  const courseInList = selectedCourseNum != null && courses.some((c) => c.id === selectedCourseNum);
  const teacherInList = selectedTeacherNum != null && teachers.some((tc) => tc.id === selectedTeacherNum);
  const roomInList = selectedRoomNum != null && rooms.some((r) => r.id === selectedRoomNum);

  const showCourseOrphan = selectedCourseNum != null && !courseInList;
  const showTeacherOrphan = selectedTeacherNum != null && !teacherInList;
  const showRoomOrphan = selectedRoomNum != null && !roomInList;

  const courseOrphanLabel = group.course_name ?? `#${selectedCourseNum ?? ""}`;
  const teacherOrphanLabel = group.teacher_name ?? `#${selectedTeacherNum ?? ""}`;
  const roomOrphanLabel = group.room_name ?? `#${selectedRoomNum ?? ""}`;

  const invalidTimeRange = Boolean(
    editStartTime && editEndTime && editEndTime <= editStartTime,
  );

  // ── Transfer dialog internal state ───────────────────────────────────────
  const [debtPolicy, setDebtPolicy] = useState<DebtPolicy>("writeoff");
  const [transferReason, setTransferReason] = useState("");
  const [forceOverflow, setForceOverflow] = useState(false);

  const previewParams =
    activeStudentId && transferTargetGroupId
      ? { to_group_id: Number(transferTargetGroupId), transfer_date: transferDate || undefined }
      : null;

  const previewQ = useTransferPreview(activeStudentId ?? 0, previewParams);
  const transferM = useTransferStudent(activeStudentId ?? 0);

  // Reset internal state when dialog opens/closes
  useEffect(() => {
    if (!transferOpen) {
      setDebtPolicy("writeoff");
      setTransferReason("");
      setForceOverflow(false);
    }
  }, [transferOpen]);

  const handleTransferSubmit = async () => {
    if (!activeStudentId || !transferTargetGroupId || !transferDate) return;
    try {
      const result = await transferM.mutateAsync({
        to_group_id: Number(transferTargetGroupId),
        transfer_date: transferDate,
        debt_policy: debtPolicy,
        reason: transferReason.trim() || null,
        force: forceOverflow,
      });
      onTransferOpenChange(false);
      const toName = previewQ.data?.to_group_name ?? t("groups.actionTransfer");
      if (result.debt_action === "writeoff" && result.prev_debt > 0) {
        toast.success(
          t("transfer.successWithWriteoff")
            .replace("{{group}}", toName)
            .replace("{{amount}}", formatCurrencyUZS(result.prev_debt)),
        );
      } else {
        toast.success(t("transfer.success").replace("{{group}}", toName));
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("same_group")) toast.error(t("transfer.errorSameGroup"));
      else if (msg.includes("group_completed")) toast.error(t("transfer.errorCompleted"));
      else if (msg.includes("capacity_exceeded")) toast.error(t("transfer.errorCapacity"));
      else toast.error(msg || t("groups.errSave"));
    }
  };

  if (!isAdmin) return null;

  return (
    <>
      <Dialog open={editOpen} onOpenChange={onEditOpenChange}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("groups.edit")}</DialogTitle>
            <DialogDescription>{group.code}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t("groups.groupCode")}</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t("groups.course")}</Label>
                <Select value={editCourseId} onValueChange={setEditCourseId}>
                  <SelectTrigger><SelectValue placeholder={t("groups.selectCourse")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("groups.noCourse")}</SelectItem>
                    {showCourseOrphan && selectedCourseNum != null && (
                      <SelectItem value={String(selectedCourseNum)}>
                        {courseOrphanLabel}
                      </SelectItem>
                    )}
                    {courses.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t("groups.teacher")}</Label>
                <Select value={editTeacherId} onValueChange={setEditTeacherId}>
                  <SelectTrigger><SelectValue placeholder={t("groups.selectTeacher")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("groups.noTeacher")}</SelectItem>
                    {showTeacherOrphan && selectedTeacherNum != null && (
                      <SelectItem value={String(selectedTeacherNum)}>
                        {teacherOrphanLabel}
                      </SelectItem>
                    )}
                    {teachers.map((tc) => (
                      <SelectItem key={tc.id} value={String(tc.id)}>
                        {teacherLabel(tc)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t("groups.room")}</Label>
                <Select value={editRoomId} onValueChange={setEditRoomId}>
                  <SelectTrigger><SelectValue placeholder={t("groups.room")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("groups.noRoom")}</SelectItem>
                    {showRoomOrphan && selectedRoomNum != null && (
                      <SelectItem value={String(selectedRoomNum)}>
                        {roomOrphanLabel}
                      </SelectItem>
                    )}
                    {rooms.map((r) => (
                      <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t("groups.maxStudents")}</Label>
                <Input
                  type="number"
                  min={1}
                  value={editMaxStudents}
                  onChange={(e) => setEditMaxStudents(Number(e.target.value || 1))}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("groups.days")}</Label>
                <Select value={editDays} onValueChange={(v) => setEditDays(v as DaysType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="odd">{t("groups.daysOdd")}</SelectItem>
                    <SelectItem value="even">{t("groups.daysEven")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t("groups.duration")}</Label>
                <Input
                  type="number"
                  min={1}
                  value={editDurationMonths}
                  onChange={(e) => setEditDurationMonths(Math.max(1, Number(e.target.value || 1)))}
                />
              </div>
            </div>

            <GroupScheduleTimeSection
              startTime={editStartTime}
              endTime={editEndTime}
              onStartChange={setEditStartTime}
              onEndChange={setEditEndTime}
              invalidRange={invalidTimeRange}
            />

            <div className="space-y-1">
              <Label>{t("groups.pricePerMonth")}</Label>
              <Input
                type="number"
                min={0}
                value={editPrice}
                onChange={(e) => setEditPrice(Number(e.target.value || 0))}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t("groups.startDate")}</Label>
                <Input type="date" value={editStart} onChange={(e) => setEditStart(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>{t("groups.endDate")}</Label>
                <Input type="date" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} />
              </div>
            </div>

            {group.status === "active" && (
              <EditScheduleConflictsPreview
                ready={conflictsReady}
                loading={conflictsLoading}
                conflicts={liveConflicts}
                t={t}
                onOpenGroup={onNavigateConflictGroup}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onEditOpenChange(false)} disabled={pending}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={onSubmitEdit}
              disabled={pending || editSaveDisabled}
            >
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={onDeleteOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("groups.delete")}</DialogTitle>
            <DialogDescription>{t("groups.deleteConfirm")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => onDeleteOpenChange(false)} disabled={pending}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={onConfirmDelete} disabled={pending}>
              {t("groups.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={enrollOpen} onOpenChange={onEnrollOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("groups.enrollStudent")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2 max-h-72 overflow-auto border rounded-md p-3">
              {studentsForEnroll.map((s) => {
                const checked = selectedStudentIds.includes(s.id);
                return (
                  <label key={s.id} className="flex items-center justify-between gap-3 text-sm">
                    <div>
                      <p className="font-medium">{s.last_name} {s.first_name}</p>
                      <p className="text-xs text-muted-foreground">{s.phone}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedStudentIds([...selectedStudentIds, s.id]);
                        else setSelectedStudentIds(selectedStudentIds.filter((id) => id !== s.id));
                      }}
                    />
                  </label>
                );
              })}
            </div>
            <div className="space-y-1">
              <Label>{t("students.enrollDate")}</Label>
              <Input type="date" value={enrollDate} onChange={(e) => setEnrollDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onEnrollOpenChange(false)} disabled={pending}>
              {t("common.cancel")}
            </Button>
            <Button onClick={onSubmitEnroll} disabled={pending}>
              {t("groups.enrollStudent")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removeOpen} onOpenChange={onRemoveOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("groups.actionRemove")}</DialogTitle>
            <DialogDescription>{activeStudentLabel ?? "—"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label>{t("groups.removeConfirmTitle")}</Label>
            <Textarea value={removeReason} onChange={(e) => setRemoveReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onRemoveOpenChange(false)} disabled={pending}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={onSubmitRemove} disabled={pending}>
              {t("groups.actionRemove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={transferOpen} onOpenChange={onTransferOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("transfer.title")}</DialogTitle>
            <DialogDescription>{activeStudentLabel ?? "—"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Target group */}
            <div className="space-y-1">
              <Label>{t("groups.transferSelectGroup")}</Label>
              <Select value={transferTargetGroupId} onValueChange={(v) => { setTransferTargetGroupId(v); setForceOverflow(false); }}>
                <SelectTrigger><SelectValue placeholder={t("groups.transferSelectGroup")} /></SelectTrigger>
                <SelectContent>
                  {otherGroups.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>{g.code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Transfer date */}
            <div className="space-y-1">
              <Label>{t("transfer.date")}</Label>
              <Input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
            </div>

            {/* Preview section */}
            {transferTargetGroupId && (
              previewQ.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{t("common.loading") || "Loading…"}</span>
                </div>
              ) : previewQ.data ? (
                <div className="rounded-md border p-3 space-y-3 text-sm">
                  {/* Capacity warning */}
                  {previewQ.data.capacity_exceeded && (
                    <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <p className="text-amber-800 dark:text-amber-300 font-medium text-xs">
                          {t("transfer.capacityFull")
                            .replace("{{current}}", String(previewQ.data.capacity_current))
                            .replace("{{max}}", String(previewQ.data.capacity_max))}
                        </p>
                        <label className="flex items-center gap-2 mt-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={forceOverflow}
                            onChange={(e) => setForceOverflow(e.target.checked)}
                            className="rounded"
                          />
                          <span className="text-xs text-amber-700 dark:text-amber-400">
                            {t("transfer.forceOverflow")}
                          </span>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Debt policy (only if debt > 0) */}
                  {previewQ.data.prev_debt > 0 && (
                    <div className="space-y-2">
                      <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide">
                        {t("transfer.debtPolicy")}
                        {" · "}
                        <span className="text-destructive">{formatCurrencyUZS(previewQ.data.prev_debt)}</span>
                      </p>
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="debt_policy"
                          value="writeoff"
                          checked={debtPolicy === "writeoff"}
                          onChange={() => setDebtPolicy("writeoff")}
                          className="mt-0.5"
                        />
                        <span className="text-xs">{t("transfer.debtPolicy.writeoff")}</span>
                      </label>
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="debt_policy"
                          value="snapshot"
                          checked={debtPolicy === "snapshot"}
                          onChange={() => setDebtPolicy("snapshot")}
                          className="mt-0.5"
                        />
                        <span className="text-xs">{t("transfer.debtPolicy.snapshot")}</span>
                      </label>
                    </div>
                  )}
                </div>
              ) : null
            )}

            {/* Reason */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("transfer.reason")}</Label>
              <Textarea
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="—"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onTransferOpenChange(false)} disabled={transferM.isPending}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleTransferSubmit}
              disabled={
                transferM.isPending ||
                !transferTargetGroupId ||
                !transferDate ||
                (previewQ.data?.capacity_exceeded === true && !forceOverflow)
              }
            >
              {transferM.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t("transfer.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={vacationOpen} onOpenChange={onVacationOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("groups.giveVacation")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t("groups.vacationDate")}</Label>
              <Input type="date" value={vacationDate} onChange={(e) => setVacationDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t("groups.vacationNote")}</Label>
              <Textarea value={vacationNote} onChange={(e) => setVacationNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onVacationOpenChange(false)} disabled={pending}>
              {t("common.cancel")}
            </Button>
            <Button onClick={onSubmitVacation} disabled={pending}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
