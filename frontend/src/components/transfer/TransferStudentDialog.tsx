import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import type { GroupRead } from "@/hooks/use-groups";
import { useLanguage } from "@/hooks/use-language";
import {
  useTransferPreview,
  useTransferStudent,
  type DebtPolicy,
  type TransferPreview,
} from "@/hooks/use-students";
import { ApiError } from "@/lib/api";
import { formatCurrencyUZS } from "@/lib/utils";

// ── Public props ─────────────────────────────────────────────────────────────

export interface TransferStudentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: number | null;
  studentLabel?: string | null;
  /** All groups the student could potentially be moved to. Current group is
   *  included for clarity (rendered as disabled with a "current" badge). */
  candidateGroups: GroupRead[];
  /** Current group id of the student (drives "same group" disabled state). */
  currentGroupId: number | null;
  /** Optional callback fired after a successful transfer. */
  onTransferred?: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface GroupOption {
  group: GroupRead;
  isCurrent: boolean;
  isCompleted: boolean;
  isFull: boolean;
  /** Reason the option is disabled (or null if selectable). */
  disabledReason: "current" | "completed" | null;
}

function buildOptions(
  groups: GroupRead[],
  currentGroupId: number | null,
): GroupOption[] {
  return groups.map((g) => {
    const isCurrent = currentGroupId != null && g.id === currentGroupId;
    const isCompleted = g.status === "completed";
    const isFull = g.student_count >= g.max_students;
    const disabledReason: GroupOption["disabledReason"] = isCurrent
      ? "current"
      : isCompleted
        ? "completed"
        : null;
    return { group: g, isCurrent, isCompleted, isFull, disabledReason };
  });
}

/** Resolve an error from the transfer endpoint to a user-visible string.
 *
 * Priority:
 * 1. Structured `{ code }` from backend → i18n by code.
 * 2. HTTP 5xx (or any error without a parseable detail) → generic server-error key.
 * 3. Backend-provided `detail.message` string.
 * 4. `e.message` (last resort).
 */
function mapApiError(e: unknown, t: (key: string) => string): string {
  if (e instanceof ApiError) {
    const detail =
      e.detail && typeof e.detail === "object" && !Array.isArray(e.detail)
        ? (e.detail as Record<string, unknown>)
        : null;

    if (detail && typeof detail.code === "string") {
      const codeMap: Record<string, string> = {
        same_group:                t("transfer.errorSameGroup"),
        group_completed:           t("transfer.errorCompleted"),
        capacity_exceeded:         t("transfer.errorCapacity"),
        transfer_date_out_of_range: t("transfer.errorDateRange"),
        reset_requires_reason:     t("transfer.errorResetReason"),
        use_transfer_endpoint:     t("transfer.errorUseTransfer"),
        not_enrolled:              t("transfer.errorNotEnrolled"),
        target_not_found:          t("transfer.errorTargetNotFound"),
      };
      return codeMap[detail.code] ?? (typeof detail.message === "string" ? detail.message : t("common.unknownError"));
    }

    // 5xx or no structured detail — don't show raw HTTP text to the user.
    if (e.status >= 500 || !detail) return t("transfer.errorServer");

    // 4xx with a plain string detail.
    if (typeof e.detail === "string") return e.detail;
  }

  if (e instanceof Error) return e.message;
  return t("common.unknownError");
}

// ── Component ────────────────────────────────────────────────────────────────

export function TransferStudentDialog({
  open,
  onOpenChange,
  studentId,
  studentLabel,
  candidateGroups,
  currentGroupId,
  onTransferred,
}: TransferStudentDialogProps) {
  const { t } = useLanguage();

  const [targetId, setTargetId] = useState<string>("");
  const [transferDate, setTransferDate] = useState<string>(todayIso());
  const [debtPolicy, setDebtPolicy] = useState<DebtPolicy>("writeoff");
  const [reason, setReason] = useState("");
  const [forceOverflow, setForceOverflow] = useState(false);

  // Reset internal state on every (re)open so stale values from a previous
  // student do not leak into the form.
  useEffect(() => {
    if (open) {
      setTargetId("");
      setTransferDate(todayIso());
      setDebtPolicy("writeoff");
      setReason("");
      setForceOverflow(false);
    }
  }, [open, studentId]);

  const options = useMemo(
    () => buildOptions(candidateGroups, currentGroupId),
    [candidateGroups, currentGroupId],
  );

  const previewParams =
    studentId && targetId
      ? { to_group_id: Number(targetId), transfer_date: transferDate || undefined }
      : null;

  const previewQ = useTransferPreview(studentId ?? 0, previewParams);
  const transferM = useTransferStudent(studentId ?? 0);

  const preview: TransferPreview | undefined = previewQ.data;

  // ── Validation ─────────────────────────────────────────────────────────
  const dateOutOfRange = Boolean(
    preview &&
      transferDate &&
      (transferDate < preview.transfer_date_min ||
        transferDate > preview.transfer_date_max),
  );
  const needsReason = debtPolicy === "reset" && !reason.trim();
  const blockedByCapacity =
    preview?.capacity_exceeded === true && !forceOverflow;

  const submitDisabled =
    transferM.isPending ||
    !studentId ||
    !targetId ||
    !transferDate ||
    dateOutOfRange ||
    needsReason ||
    blockedByCapacity;

  // ── Submit ─────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!studentId || !targetId || !transferDate) return;
    try {
      const result = await transferM.mutateAsync({
        to_group_id: Number(targetId),
        transfer_date: transferDate,
        debt_policy: debtPolicy,
        reason: reason.trim() || null,
        force: forceOverflow,
      });
      const toName = preview?.to_group_name ?? "—";
      if (result.debt_action === "writeoff" && result.prev_debt > 0) {
        toast.success(
          t("transfer.successWithWriteoff")
            .replace("{{group}}", toName)
            .replace("{{amount}}", formatCurrencyUZS(result.prev_debt)),
        );
      } else if (result.debt_action === "reset" && result.prev_debt > 0) {
        toast.success(
          t("transfer.successWithReset")
            .replace("{{group}}", toName)
            .replace("{{amount}}", formatCurrencyUZS(result.prev_debt)),
        );
      } else {
        toast.success(t("transfer.success").replace("{{group}}", toName));
      }
      onOpenChange(false);
      onTransferred?.();
    } catch (e: unknown) {
      toast.error(mapApiError(e, t));
    }
  };

  // ── Projection helpers ─────────────────────────────────────────────────
  const projectedDebt = (() => {
    if (!preview) return null;
    if (preview.prev_debt === 0) return 0;
    if (debtPolicy === "writeoff") return preview.projected_debt_after_writeoff;
    if (debtPolicy === "reset") return preview.projected_debt_after_reset;
    return preview.projected_debt_after_snapshot;
  })();

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("transfer.title")}</DialogTitle>
          <DialogDescription>{studentLabel ?? "—"}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Target group */}
          <div className="space-y-1">
            <Label>{t("groups.transferSelectGroup")}</Label>
            <Select
              value={targetId}
              onValueChange={(v) => {
                setTargetId(v);
                setForceOverflow(false);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("groups.transferSelectGroup")} />
              </SelectTrigger>
              <SelectContent>
                {options.map((opt) => {
                  const disabled = opt.disabledReason !== null;
                  return (
                    <SelectItem
                      key={opt.group.id}
                      value={String(opt.group.id)}
                      disabled={disabled}
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="truncate">{opt.group.code}</span>
                        <div className="flex shrink-0 items-center gap-1">
                          {opt.isCurrent && (
                            <Badge variant="outline" className="text-[10px] py-0">
                              {t("transfer.targetSameGroupBadge")}
                            </Badge>
                          )}
                          {opt.isCompleted && (
                            <Badge variant="secondary" className="text-[10px] py-0">
                              {t("transfer.targetCompletedBadge")}
                            </Badge>
                          )}
                          {!opt.isCurrent && !opt.isCompleted && opt.isFull && (
                            <Badge
                              variant="destructive"
                              className="text-[10px] py-0"
                            >
                              {t("transfer.targetFullBadge")
                                .replace("{{current}}", String(opt.group.student_count))
                                .replace("{{max}}", String(opt.group.max_students))}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Transfer date */}
          <div className="space-y-1">
            <Label>{t("transfer.date")}</Label>
            <Input
              type="date"
              value={transferDate}
              min={preview?.transfer_date_min}
              max={preview?.transfer_date_max}
              onChange={(e) => setTransferDate(e.target.value)}
            />
            {dateOutOfRange && (
              <p className="text-xs text-destructive">
                {t("transfer.errorDateRange")}
              </p>
            )}
          </div>

          {/* Preview / empty / loading */}
          {!targetId ? (
            <div className="rounded-md border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
              {t("transfer.previewPickGroup")}
            </div>
          ) : previewQ.isLoading ? (
            <div className="flex items-center gap-2 rounded-md border border-border/60 p-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{t("common.loading")}</span>
            </div>
          ) : preview ? (
            <div className="space-y-3 rounded-md border p-3 text-sm">
              {/* Before / after table */}
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("transfer.previewTitle")}
                </p>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs">
                  <span className="text-muted-foreground">
                    {t("transfer.priceDelta")}
                  </span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium text-right tabular-nums">
                    {preview.from_monthly_price != null
                      ? formatCurrencyUZS(preview.from_monthly_price)
                      : "—"}
                    {" → "}
                    {formatCurrencyUZS(preview.to_monthly_price)}
                  </span>

                  <span className="text-muted-foreground">
                    {t("transfer.projectedDebt")}
                  </span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium text-right tabular-nums">
                    <span
                      className={
                        preview.prev_debt > 0 ? "text-destructive" : undefined
                      }
                    >
                      {formatCurrencyUZS(preview.prev_debt)}
                    </span>
                    {" → "}
                    <span
                      className={
                        (projectedDebt ?? 0) > 0
                          ? "text-destructive"
                          : "text-emerald-600 dark:text-emerald-400"
                      }
                    >
                      {formatCurrencyUZS(projectedDebt ?? 0)}
                    </span>
                  </span>
                </div>
              </div>

              {/* Capacity warning */}
              {preview.capacity_exceeded && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 dark:border-amber-800 dark:bg-amber-950/30">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div className="flex-1">
                    <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                      {t("transfer.capacityFull")
                        .replace("{{current}}", String(preview.capacity_current))
                        .replace("{{max}}", String(preview.capacity_max))}
                    </p>
                    <label className="mt-1.5 flex cursor-pointer items-center gap-2">
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

              {/* Debt policy (only when prev_debt > 0) */}
              {preview.prev_debt > 0 && (
                <div className="space-y-2 border-t border-border/60 pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("transfer.debtPolicy")}
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
                    <span className="text-xs">
                      {t("transfer.debtPolicy.writeoff")}
                    </span>
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
                    <span className="text-xs">
                      {t("transfer.debtPolicy.snapshot")}
                    </span>
                  </label>

                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="debt_policy"
                      value="reset"
                      checked={debtPolicy === "reset"}
                      onChange={() => setDebtPolicy("reset")}
                      className="mt-0.5"
                    />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs">
                        {t("transfer.debtPolicy.reset")}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {t("transfer.debtPolicy.resetHint")}
                      </span>
                    </div>
                  </label>
                </div>
              )}
            </div>
          ) : previewQ.isError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              {mapApiError(previewQ.error, t)}
            </div>
          ) : null}

          {/* Reason (required for reset, optional otherwise) */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {debtPolicy === "reset"
                ? `${t("transfer.reason")} *`
                : t("transfer.reason")}
            </Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="—"
            />
            {needsReason && (
              <p className="text-xs text-destructive">
                {t("transfer.errorResetReason")}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={transferM.isPending}
          >
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={submitDisabled}>
            {transferM.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {t("transfer.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
