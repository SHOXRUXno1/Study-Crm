import { useState } from "react";
import { format } from "date-fns";
import { enUS, ru, uz } from "date-fns/locale";
import type { Locale } from "date-fns";
import { toast } from "sonner";
import {
  AlertTriangle, CalendarIcon, CheckCircle, CreditCard, Download, Loader2, Plus, Trash2,
  Wallet,
} from "lucide-react";

import { useLanguage } from "@/hooks/use-language";
import {
  type PaymentMethod,
  getCreatePaymentErrorMessage,
  useCreatePayment,
  useDeletePayment,
  useStudentLedger,
} from "@/hooks/use-finance";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { cn, formatCurrencyUZS } from "@/lib/utils";
import { fetchAuthBlob } from "@/lib/api";
import { Progress } from "@/components/ui/progress";
import { FileDropzone } from "@/components/ui/file-dropzone";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";

const fmt = (n: number | null | undefined) => formatCurrencyUZS(n);

const isoDate = (d: Date) => format(d, "yyyy-MM-dd");

const LOCALES: Record<string, Locale> = { en: enUS, ru, uz };
const RECEIPT_ACCEPT_MIMES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/gif",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
];

interface Props {
  studentId: number;
}

export function StudentPaymentsTab({ studentId }: Props) {
  const { t, language } = useLanguage();
  const dfLocale: Locale = LOCALES[language] ?? enUS;

  const ledgerQ = useStudentLedger(studentId);
  const createPayment = useCreatePayment();
  const deletePayment = useDeletePayment();

  const [modalOpen, setModalOpen] = useState(false);
  const [formAmount, setFormAmount] = useState<number | null>(null);
  const [formMethod, setFormMethod] = useState<PaymentMethod>("cash");
  const [formDate, setFormDate] = useState<Date | undefined>(new Date());
  const [formComment, setFormComment] = useState("");
  const [formFiles, setFormFiles] = useState<File[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const billing = ledgerQ.data?.billing;
  const payments = ledgerQ.data?.payments ?? [];

  const formatDate = (iso: string | null | undefined) => {
    if (!iso) return "—";
    try {
      return format(new Date(iso), "d MMM yyyy", { locale: dfLocale });
    } catch {
      return iso;
    }
  };

  const methodLabel = (m: string) =>
    m === "cash" ? t("payments.cash") : t("payments.transfer");

  const paymentMode = billing
    ? billing.debt_amount > 0
      ? "debt"
      : "deposit"
    : null;
  const amountTooHigh =
    !!billing &&
    (formAmount ?? 0) > billing.max_deposit_amount;
  const courseProgressPct = billing && billing.total_course_cost > 0
    ? Math.min(100, Math.round((billing.total_paid / billing.total_course_cost) * 100))
    : 0;

  const openModal = () => {
    const defaultAmount = billing
      ? billing.debt_amount > 0
        ? billing.debt_amount
        : Math.min(billing.monthly_amount || 0, billing.max_deposit_amount || 0)
      : 0;
    setFormAmount(defaultAmount > 0 ? defaultAmount : null);
    setFormMethod("cash");
    setFormDate(new Date());
    setFormComment("");
    setFormFiles([]);
    setModalOpen(true);
  };

  const handleSave = async () => {
    const amount = Number(formAmount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t("payments.amountInvalid"));
      return;
    }
    if (!formDate) {
      toast.error(t("payments.dateRequired"));
      return;
    }
    if (billing && amount > billing.max_deposit_amount) {
      toast.error(
        t("finance.amountExceedsRemaining").replace(
          "{max}",
          fmt(billing.max_deposit_amount),
        ),
      );
      return;
    }
    if (formMethod === "transfer" && formFiles.length === 0) {
      toast.error(t("payments.errReceiptRequired"));
      return;
    }
    try {
      await createPayment.mutateAsync({
        payload: {
          student_id: studentId,
          amount: Math.round(amount),
          method: formMethod,
          paid_at: isoDate(formDate),
          note: formComment.trim() || null,
        },
        files: formFiles,
      });
      toast.success(t("payments.accepted"));
      setModalOpen(false);
      setFormFiles([]);
    } catch (err) {
      toast.error(getCreatePaymentErrorMessage(err, t));
    }
  };

  const openReceipt = async (url: string) => {
    try {
      const blob = await fetchAuthBlob(url);
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (err) {
      toast.error((err as Error).message || t("common.error"));
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deletePayment.mutateAsync(id);
      toast.success(t("payments.deleted"));
    } catch (err) {
      toast.error((err as Error).message || t("common.error"));
    } finally {
      setConfirmDelete(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <SummaryCard
          icon={Wallet}
          color="text-primary"
          label={t("payments.monthlyAmount")}
          value={fmt(billing?.monthly_amount)}
          loading={ledgerQ.isLoading}
        />
        <SummaryCard
          icon={CheckCircle}
          color="text-emerald-500"
          label={t("payments.totalPaid")}
          value={fmt(billing?.total_paid)}
          loading={ledgerQ.isLoading}
        />
        <SummaryCard
          icon={AlertTriangle}
          color={billing && billing.debt_amount > 0 ? "text-destructive" : "text-muted-foreground"}
          label={t("payments.debt")}
          value={fmt(billing?.debt_amount)}
          loading={ledgerQ.isLoading}
        />
        <SummaryCard
          icon={CreditCard}
          color="text-amber-500"
          label={t("payments.lastPayment")}
          value={billing?.last_payment_date ? formatDate(billing.last_payment_date) : "—"}
          suffix={billing?.last_payment_amount ? fmt(billing.last_payment_amount) : undefined}
          loading={ledgerQ.isLoading}
        />
      </div>

      {/* Payments list */}
      <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border/40 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">{t("payments.historyTitle")}</h3>
          <Button size="sm" className="gap-1.5" onClick={openModal}>
            <Plus className="h-3.5 w-3.5" /> {t("payments.accept")}
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-semibold">{t("payments.date")}</TableHead>
              <TableHead className="font-semibold">{t("payments.method")}</TableHead>
              <TableHead className="font-semibold">{t("payments.comment")}</TableHead>
              <TableHead className="font-semibold text-right">{t("payments.amount")}</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ledgerQ.isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
                  {t("common.loading")}
                </TableCell>
              </TableRow>
            )}
            {!ledgerQ.isLoading && payments.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Wallet className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm">{t("payments.noneYet")}</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {!ledgerQ.isLoading && payments.map((p, i) => (
              <TableRow key={p.id} className="animate-fade-in" style={{ animationDelay: `${i * 25}ms` }}>
                <TableCell className="text-sm">{formatDate(p.paid_at)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs font-normal">{methodLabel(p.method)}</Badge>
                    {p.receipts.length > 0 && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                            {t("payments.receipt")}: {p.receipts.length}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 p-2" align="start">
                          <div className="space-y-1.5">
                            {p.receipts.map((receipt) => (
                              <button
                                key={receipt.id}
                                type="button"
                                onClick={() => openReceipt(receipt.url)}
                                className="flex w-full items-center justify-between rounded-md border border-border/60 px-2 py-1.5 text-left text-xs hover:bg-muted/40"
                              >
                                <span className="truncate pr-2">{receipt.original_name}</span>
                                <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              </button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[280px] truncate">
                  {p.note ?? "—"}
                </TableCell>
                <TableCell className="text-sm font-semibold text-right text-foreground tabular-nums">
                  +{fmt(p.amount)}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setConfirmDelete(p.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Accept Payment Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("payments.accept")}</DialogTitle>
            <DialogDescription>{t("payments.enterData")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {billing && (
              <div className="rounded-lg bg-muted/30 p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("payments.monthlyFee")}</span>
                  <span className="font-semibold">{fmt(billing.monthly_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("finance.totalCourseCost")}</span>
                  <span className="font-semibold">{fmt(billing.total_course_cost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("finance.availableToDeposit")}</span>
                  <span className="font-semibold">{fmt(billing.max_deposit_amount)}</span>
                </div>
                {billing.debt_amount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("payments.currentDebt")}</span>
                    <span className="font-semibold text-destructive">{fmt(billing.debt_amount)}</span>
                  </div>
                )}
                {billing.total_course_cost > 0 && (
                  <div className="space-y-1 pt-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{t("finance.depositProgress")}</span>
                      <span>{courseProgressPct}%</span>
                    </div>
                    <Progress value={courseProgressPct} className="h-1.5" />
                  </div>
                )}
                <div className="pt-1">
                  <span className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                    paymentMode === "debt"
                      ? "border-red-500/30 bg-red-500/10 text-red-500"
                      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
                  )}>
                    {paymentMode === "debt" ? t("payments.modeDebtRepayment") : t("payments.modeDeposit")}
                  </span>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>{t("payments.amount")}</Label>
              <FormattedNumberInput
                placeholder="500000"
                value={formAmount}
                onValueChange={setFormAmount}
              />
              {billing && (
                <p className={cn(
                  "text-xs",
                  amountTooHigh ? "text-destructive" : "text-muted-foreground",
                )}>
                  {amountTooHigh
                    ? t("finance.amountExceedsRemaining").replace("{max}", fmt(billing.max_deposit_amount))
                    : t("payments.depositHint")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>{t("payments.paymentMethod")}</Label>
              <Select value={formMethod} onValueChange={(v) => setFormMethod(v as PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{t("payments.cash")}</SelectItem>
                  <SelectItem value="transfer">{t("payments.transfer")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formMethod === "transfer" && (
              <div className="space-y-2">
                <Label>
                  {t("payments.receipt")} <span className="text-destructive">*</span>
                </Label>
                <FileDropzone
                  value={formFiles}
                  onChange={setFormFiles}
                  accept={RECEIPT_ACCEPT_MIMES}
                  maxFiles={5}
                  maxSizeMB={10}
                  dropLabel={t("payments.dragHere")}
                  unsupportedTypeMessage={t("payments.errFileType")}
                  tooLargeMessage={t("payments.errFileTooLarge")}
                  duplicateMessage={t("payments.errDuplicateFile")}
                  tooManyMessage={t("payments.errTooManyFiles")}
                  hintId="student-receipt-hint"
                  disabled={createPayment.isPending}
                />
                <p id="student-receipt-hint" className="text-xs text-muted-foreground">
                  {t("payments.acceptedFormats")}
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label>{t("payments.date")}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !formDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formDate ? format(formDate, "d MMMM yyyy", { locale: dfLocale }) : t("payments.selectDate")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={formDate} onSelect={setFormDate} disabled={(d) => d > new Date()} initialFocus locale={dfLocale} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>{t("payments.comment")}</Label>
              <Textarea placeholder={t("payments.optional")} value={formComment} onChange={(e) => setFormComment(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={createPayment.isPending}>{t("common.cancel")}</Button>
            <Button onClick={handleSave} disabled={createPayment.isPending || amountTooHigh}>
              {createPayment.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("payments.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("payments.deleteConfirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmDelete !== null && handleDelete(confirmDelete)}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  color,
  label,
  value,
  suffix,
  loading,
}: {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  label: string;
  value: string;
  suffix?: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-3 sm:p-4 shadow-sm animate-fade-in">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={cn("h-4 w-4", color)} />
        <span className="text-[10px] sm:text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-base sm:text-lg font-bold text-foreground truncate">
        {loading ? <Loader2 className="h-4 w-4 animate-spin inline-block" /> : value}
      </p>
      {suffix && <p className="text-[10px] sm:text-xs text-muted-foreground tabular-nums">{suffix}</p>}
    </div>
  );
}
