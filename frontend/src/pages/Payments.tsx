import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { enUS, ru, uz } from "date-fns/locale";
import type { Locale } from "date-fns";
import { toast } from "sonner";
import { cn, formatCurrencyUZS, formatNumber } from "@/lib/utils";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { useLanguage } from "@/hooks/use-language";
import { Input } from "@/components/ui/input";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { FileDropzone } from "@/components/ui/file-dropzone";
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
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CheckCircle, Plus, Eye, CreditCard, Search, CalendarIcon, Wallet,
  MoreHorizontal, ChevronLeft, ChevronRight, X, AlertTriangle, Loader2,
} from "lucide-react";
import {
  type BillingStatus,
  type PaymentMethod,
  type StudentBilling,
  getCreatePaymentErrorMessage,
  useCreatePayment,
  useFinanceSummary,
  useStudentsBilling,
} from "@/hooks/use-finance";
import { useGroups } from "@/hooks/use-groups";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { DateRangeFilter } from "@/components/DateRangeFilter";
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

const PAGE_SIZE = 20;

const STATUS_BADGE: Record<BillingStatus, string> = {
  paid: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  debt: "bg-red-500/10 text-red-500 border-red-500/20",
};

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

export default function Payments() {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const dfLocale: Locale = LOCALES[language] ?? enUS;

  // Filters
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 300);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, groupFilter, statusFilter, dateFrom, dateTo]);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [selected, setSelected] = useState<StudentBilling | null>(null);
  const [formAmount, setFormAmount] = useState<number | null>(null);
  const [formMethod, setFormMethod] = useState<PaymentMethod>("cash");
  const [formDate, setFormDate] = useState<Date | undefined>(new Date());
  const [formComment, setFormComment] = useState("");
  const [formFiles, setFormFiles] = useState<File[]>([]);
  const debouncedPickerSearch = useDebouncedValue(pickerSearch, 250);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportPhase, setExportPhase] = useState<ExportPhase>("idle");

  // ── Data ──────────────────────────────────────────────────────────────────
  const summaryQ = useFinanceSummary({
    from: dateFrom ? isoDate(dateFrom) : undefined,
    to: dateTo ? isoDate(dateTo) : undefined,
  });

  const billingParams = {
    skip: (page - 1) * PAGE_SIZE,
    limit: PAGE_SIZE,
    group_id: groupFilter !== "all" ? Number(groupFilter) : undefined,
    status: statusFilter !== "all" ? (statusFilter as BillingStatus) : undefined,
    last_payment_from: dateFrom ? isoDate(dateFrom) : undefined,
    last_payment_to: dateTo ? isoDate(dateTo) : undefined,
    sort_by: "name" as const,
    sort_dir: "asc" as const,
    search: debouncedSearch || undefined,
  };
  const billingQ = useStudentsBilling(billingParams);

  const groupsQ = useGroups({ limit: 200 });

  const pickerQ = useStudentsBilling(
    debouncedPickerSearch.length >= 2
      ? { search: debouncedPickerSearch, limit: 8 }
      : { limit: 0 },
  );

  const createPayment = useCreatePayment();

  const rows = billingQ.data?.items ?? [];
  const total = billingQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const summary = summaryQ.data;

  const formatDate = (iso: string | null | undefined) => {
    if (!iso) return "—";
    try {
      return format(new Date(iso), "d MMM yyyy", { locale: dfLocale });
    } catch {
      return iso;
    }
  };

  const statusLabel = (s: BillingStatus | string) =>
    s === "paid" ? t("payments.paid") : t("payments.debt");

  const methodLabel = (m: string) =>
    m === "cash" ? t("payments.cash") : t("payments.transfer");

  const paymentMode = selected
    ? selected.debt_amount > 0
      ? "debt"
      : "deposit"
    : null;
  const amountTooHigh =
    !!selected &&
    (formAmount ?? 0) > selected.max_deposit_amount;
  const courseProgressPct = selected && selected.total_course_cost > 0
    ? Math.min(100, Math.round((selected.total_paid / selected.total_course_cost) * 100))
    : 0;

  // ── Actions ───────────────────────────────────────────────────────────────
  const openModalFor = (s: StudentBilling | null) => {
    setSelected(s);
    const defaultAmount = s
      ? s.debt_amount > 0
        ? s.debt_amount
        : Math.min(s.monthly_amount || 0, s.max_deposit_amount || 0)
      : 0;
    setFormAmount(s && defaultAmount > 0 ? defaultAmount : null);
    setFormMethod("cash");
    setFormDate(new Date());
    setFormComment("");
    setFormFiles([]);
    setPickerSearch("");
    setPickerOpen(!s);
    setModalOpen(true);
  };

  const handleSelectStudent = (s: StudentBilling) => {
    setSelected(s);
    const defaultAmount = s.debt_amount > 0
      ? s.debt_amount
      : Math.min(s.monthly_amount || 0, s.max_deposit_amount || 0);
    setFormAmount(defaultAmount > 0 ? defaultAmount : null);
    setPickerOpen(false);
  };

  const handleClearStudent = () => {
    setSelected(null);
    setFormAmount(null);
    setPickerSearch("");
    setPickerOpen(true);
  };

  const handleSave = async () => {
    if (!selected) {
      toast.error(t("payments.studentRequired"));
      return;
    }
    const amount = Number(formAmount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t("payments.amountInvalid"));
      return;
    }
    if (!formDate) {
      toast.error(t("payments.dateRequired"));
      return;
    }
    if (amountTooHigh) {
      toast.error(
        t("finance.amountExceedsRemaining").replace(
          "{max}",
          fmt(selected.max_deposit_amount),
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
          student_id: selected.id,
          amount: Math.round(amount),
          method: formMethod,
          paid_at: isoDate(formDate),
          note: formComment.trim() || null,
        },
        files: formFiles,
      });
      toast.success(t("payments.accepted"));
      setModalOpen(false);
      setSelected(null);
      setFormAmount(null);
      setFormComment("");
      setFormFiles([]);
    } catch (err) {
      toast.error(getCreatePaymentErrorMessage(err, t));
    }
  };

  const exportColumns: ExportColumn[] = [
    { key: "student", label: t("payments.student") },
    { key: "group", label: t("schedule.group") },
    { key: "course", label: t("filter.course") },
    { key: "monthly", label: t("payments.monthlyAmount") },
    { key: "paid", label: t("payments.totalPaid") },
    { key: "lastPayment", label: t("payments.lastPayment") },
    { key: "status", label: t("filter.status") },
  ];
  const exportFilterSummary: ExportFilterSummaryItem[] = [
    ...(debouncedSearch ? [{ label: t("common.search"), value: debouncedSearch }] : []),
    ...(groupFilter !== "all" ? [{ label: t("schedule.group"), value: groupFilter }] : []),
    ...(statusFilter !== "all" ? [{ label: t("filter.status"), value: statusFilter }] : []),
    ...(dateFrom ? [{ label: t("common.from"), value: isoDate(dateFrom) }] : []),
    ...(dateTo ? [{ label: t("common.to"), value: isoDate(dateTo) }] : []),
  ];

  const runPaymentsExport = async (scope: "filtered" | "all", columns: string[]) => {
    const sourceRows = scope === "all" ? (billingQ.data?.items ?? []) : rows;
    if (sourceRows.length === 0) {
      toast.info(t("payments.notFound"));
      return;
    }

    const indexByKey = exportColumns.reduce<Record<string, number>>((acc, column, idx) => {
      acc[column.key] = idx;
      return acc;
    }, {});
    const enabledIndexes = columns.map((key) => indexByKey[key]).filter((idx) => idx !== undefined);

    const header = exportColumns.map((c) => c.label).filter((_, idx) => enabledIndexes.includes(idx));
    const tableRows = sourceRows.map((r) => {
      const row = [
        r.full_name,
        r.group_code ?? "",
        r.course_name ?? "",
        String(r.monthly_amount),
        String(r.total_paid),
        r.last_payment_date ?? "",
        statusLabel(r.status),
      ];
      return row.filter((_, idx) => enabledIndexes.includes(idx));
    });

    const filename = buildUnifiedExportFileName({
      entity: "payments",
      format: "csv",
      rangeLabel: buildFilterRangeLabel(exportFilterSummary),
    });
    runCsvExport({ filename, header, rows: tableRows, delimiter: ";" });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <Breadcrumbs items={[{ label: t("payments.title") }]} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">{t("payments.title")}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t("payments.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportActionButton
            phase={exportPhase}
            onClick={() => setExportOpen(true)}
            label={t("common.export")}
          />
          <Button className="gap-2" size="sm" onClick={() => openModalFor(null)}>
            <Plus className="h-4 w-4" /> {t("payments.accept")}
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
        <KpiCard
          label={t("payments.totalTransactions")}
          value={formatNumber(summary?.payments_count ?? 0)}
          suffix={t("payments.thisPeriod")}
          icon={CreditCard}
          color="text-primary"
          loading={summaryQ.isLoading}
        />
        <KpiCard
          label={t("payments.totalAmount")}
          value={fmt(summary?.payments_total ?? 0)}
          icon={Wallet}
          color="text-amber-500"
          loading={summaryQ.isLoading}
        />
        <KpiCard
          label={t("debtors.kpiTotalDebt")}
          value={fmt(summary?.total_debt ?? 0)}
          suffix={`${summary?.debtors_count ?? 0} ${t("debtors.studentsSuffix")}`}
          icon={AlertTriangle}
          color="text-destructive"
          loading={summaryQ.isLoading}
        />
      </div>

      {/* Filters */}
      <div className="stat-card space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("payments.searchName")} className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder={t("common.allGroups")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.allGroups")}</SelectItem>
              {(groupsQ.data?.items ?? []).map((g) => (
                <SelectItem key={g.id} value={String(g.id)}>{g.code}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder={t("filter.status")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("payments.allStatuses")}</SelectItem>
              <SelectItem value="paid">{t("payments.paid")}</SelectItem>
              <SelectItem value="debt">{t("payments.debt")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <DateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          onChange={(from, to) => { setDateFrom(from); setDateTo(to); }}
        />
      </div>

      {/* Table */}
      <div className="stat-card p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="font-semibold w-12">#</TableHead>
              <TableHead className="font-semibold">{t("payments.student")}</TableHead>
              <TableHead className="font-semibold">{t("schedule.group")}</TableHead>
              <TableHead className="font-semibold hidden md:table-cell">{t("filter.course")}</TableHead>
              <TableHead className="font-semibold hidden lg:table-cell">{t("payments.monthlyAmount")}</TableHead>
              <TableHead className="font-semibold">{t("payments.totalPaid")}</TableHead>
              <TableHead className="font-semibold hidden lg:table-cell">{t("payments.lastPayment")}</TableHead>
              <TableHead className="font-semibold">{t("filter.status")}</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {billingQ.isLoading && (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
                  {t("common.loading")}
                </TableCell>
              </TableRow>
            )}
            {!billingQ.isLoading && rows.map((p, i) => (
              <TableRow
                key={p.id}
                className="animate-fade-in cursor-pointer transition-colors hover:bg-muted/30"
                style={{ animationDelay: `${i * 30}ms` }}
                onClick={() => navigate(`/students/${p.id}`)}
              >
                <TableCell className="text-sm text-muted-foreground font-mono">
                  {formatNumber((page - 1) * PAGE_SIZE + i + 1)}
                </TableCell>
                <TableCell>
                  <p className="text-sm font-medium text-foreground truncate">{p.full_name}</p>
                </TableCell>
                <TableCell><span className="text-sm text-foreground">{p.group_code ?? "—"}</span></TableCell>
                <TableCell className="hidden md:table-cell">
                  <span className="text-sm text-foreground">{p.course_name ?? "—"}</span>
                </TableCell>
                <TableCell className="hidden lg:table-cell">{fmt(p.monthly_amount)}</TableCell>
                <TableCell className="font-medium">{fmt(p.total_paid)}</TableCell>
                <TableCell className="hidden lg:table-cell">
                  <div className="text-sm">{formatDate(p.last_payment_date)}</div>
                  <div className="text-xs text-muted-foreground">{fmt(p.last_payment_amount ?? 0)}</div>
                </TableCell>
                <TableCell>
                  <span className={cn(
                    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
                    STATUS_BADGE[p.status] ?? STATUS_BADGE.paid,
                  )}>
                    {statusLabel(p.status)}
                  </span>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => navigate(`/students/${p.id}`)}>
                        <Eye className="h-3.5 w-3.5 mr-2" /> {t("payments.studentProfile")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => openModalFor(p)}>
                        <CreditCard className="h-3.5 w-3.5 mr-2" /> {t("payments.accept")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            {!billingQ.isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Search className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">{t("payments.notFound")}</p>
                    <p className="text-xs text-muted-foreground/70">{t("payments.tryAdjustFilters")}</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {!billingQ.isLoading && total > PAGE_SIZE && (
          <div className="flex flex-col sm:flex-row items-center justify-between border-t border-border/60 px-3 sm:px-4 py-3 gap-3">
            <p className="text-xs text-muted-foreground">
              {formatNumber((page - 1) * PAGE_SIZE + 1)}–{formatNumber(Math.min(page * PAGE_SIZE, total))} / {formatNumber(total)}
            </p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" /> {t("common.back")}
              </Button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => (
                <Button key={i + 1} variant={page === i + 1 ? "default" : "outline"} size="sm" className="h-7 w-7 text-xs p-0" onClick={() => setPage(i + 1)}>
                  {i + 1}
                </Button>
              ))}
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                {t("common.forward")} <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Accept Payment Modal */}
      <ExportCenter
        open={exportOpen}
        onOpenChange={setExportOpen}
        title={t("export.center.title")}
        description={t("export.center.description")}
        formats={["csv"]}
        columns={exportColumns}
        sortOptions={[
          { value: "default", label: t("export.sort.default") },
          { value: "name", label: t("export.sort.name") },
        ]}
        filterSummary={exportFilterSummary}
        submitLabel={t("export.center.submit")}
        onSubmit={(state) => {
          runExportTask({
            onPhaseChange: (phase) => setExportPhase(phase),
            run: () => runPaymentsExport(state.scope, state.columns),
            onSuccess: () => {
              toast.success(t("payments.exportStarted"));
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

      {/* Accept Payment Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("payments.accept")}</DialogTitle>
            <DialogDescription>{t("payments.enterData")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {selected ? (
              <div className="rounded-xl border-2 border-primary/40 bg-primary/[0.04] p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm font-semibold text-foreground truncate">{selected.full_name}</span>
                  </div>
                  <button type="button" onClick={handleClearStudent} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <div>{selected.group_code ?? "—"} · {selected.course_name ?? "—"}</div>
                  <div className="text-foreground pt-1">
                    {t("payments.monthlyFee")} <span className="font-semibold">{fmt(selected.monthly_amount)}</span>
                  </div>
                  <div className="text-foreground">
                    {t("finance.totalCourseCost")} <span className="font-semibold">{fmt(selected.total_course_cost)}</span>
                  </div>
                  <div className="text-foreground">
                    {t("finance.availableToDeposit")} <span className="font-semibold">{fmt(selected.max_deposit_amount)}</span>
                  </div>
                  {selected.total_course_cost > 0 && (
                    <div className="pt-1 space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{t("finance.depositProgress")}</span>
                        <span>{courseProgressPct}%</span>
                      </div>
                      <Progress value={courseProgressPct} className="h-1.5" />
                    </div>
                  )}
                  {selected.debt_amount > 0 ? (
                    <div className="flex items-center gap-1.5 text-red-500 font-medium">
                      <AlertTriangle className="h-3 w-3" /> {t("payments.currentDebt")} {fmt(selected.debt_amount)}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-emerald-500 font-medium">
                      <CheckCircle className="h-3 w-3" /> {t("payments.paid")}
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
              </div>
            ) : (
              <div className="space-y-2 relative">
                <Label>{t("payments.studentField")}</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder={t("payments.searchName")}
                    value={pickerSearch}
                    onChange={(e) => { setPickerSearch(e.target.value); setPickerOpen(true); }}
                    onFocus={() => setPickerOpen(true)}
                    className="pl-9"
                  />
                </div>
                {pickerOpen && debouncedPickerSearch.length >= 2 && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-border bg-popover shadow-lg max-h-[280px] overflow-y-auto">
                    {pickerQ.isLoading ? (
                      <div className="p-3 text-center text-xs text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin inline-block mr-1.5" />
                        {t("common.loading")}
                      </div>
                    ) : (pickerQ.data?.items ?? []).length === 0 ? (
                      <div className="p-4 text-center text-xs text-muted-foreground">
                        {t("payments.studentNotFound")}
                      </div>
                    ) : (
                      (pickerQ.data?.items ?? []).map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => handleSelectStudent(s)}
                          className="w-full text-left px-3 py-2.5 hover:bg-primary/[0.06] border-b border-border/40 last:border-0 transition-colors"
                        >
                          <div className="text-[14px] font-semibold text-foreground">{s.full_name}</div>
                          <div className="mt-1 text-[12px] text-muted-foreground">
                            {s.group_code ?? "—"} · {s.course_name ?? "—"} · {fmt(s.monthly_amount)}
                            {s.debt_amount > 0 && (
                              <span className="ml-1.5 text-red-500 font-medium">
                                · {t("payments.debtShort")} {fmt(s.debt_amount)}
                              </span>
                            )}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>{t("payments.amount")}</Label>
              <FormattedNumberInput
                placeholder="500000"
                value={formAmount}
                onValueChange={setFormAmount}
              />
              {selected && (
                <p className={cn(
                  "text-xs",
                  amountTooHigh ? "text-destructive" : "text-muted-foreground",
                )}>
                  {amountTooHigh
                    ? t("finance.amountExceedsRemaining").replace("{max}", fmt(selected.max_deposit_amount))
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
                  hintId="payments-receipt-hint"
                  disabled={createPayment.isPending}
                />
                <p id="payments-receipt-hint" className="text-xs text-muted-foreground">
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
                  <Calendar
                    mode="single"
                    selected={formDate}
                    onSelect={setFormDate}
                    disabled={(date) => date > new Date()}
                    initialFocus
                    locale={dfLocale}
                    className="p-3 pointer-events-auto"
                  />
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
            <Button onClick={handleSave} disabled={createPayment.isPending || !selected || amountTooHigh}>
              {createPayment.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiCard({
  label,
  value,
  suffix,
  icon: Icon,
  color,
  loading,
}: {
  label: string;
  value: number | string;
  suffix?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-3 sm:p-4 shadow-sm animate-fade-in">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={cn("h-4 w-4", color)} />
        <span className="text-[10px] sm:text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-xl sm:text-2xl font-bold text-foreground">
        {loading ? <Loader2 className="h-5 w-5 animate-spin inline-block" /> : value}
      </p>
      {suffix && <p className="text-[10px] sm:text-xs text-muted-foreground">{suffix}</p>}
    </div>
  );
}
