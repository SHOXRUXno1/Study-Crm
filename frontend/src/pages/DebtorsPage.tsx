import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { enUS, ru, uz } from "date-fns/locale";
import type { Locale } from "date-fns";
import { toast } from "sonner";
import { cn, formatCurrencyUZS, formatNumber } from "@/lib/utils";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileDropzone } from "@/components/ui/file-dropzone";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Calendar } from "@/components/ui/calendar";
import {
  AlertTriangle, DollarSign, Flame, XCircle, Send, CreditCard,
  CalendarIcon, ChevronLeft, ChevronRight, MoreHorizontal, Search, X, ArrowUpDown,
  TrendingUp, TrendingDown, Minus, StickyNote, Loader2,
} from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useGroups } from "@/hooks/use-groups";
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
import {
  type DebtorRead,
  type PaymentMethod,
  type TrendDirection,
  useCreatePayment,
  useDebtors,
  useFinanceSummary,
  useUpdateFinanceNote,
} from "@/hooks/use-finance";

const PAGE_SIZE = 12;

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

function overdueBadge(days: number) {
  if (days >= 31) return "bg-destructive/15 text-destructive border-destructive/20";
  if (days >= 16) return "bg-orange-500/15 text-orange-500 border-orange-500/20";
  return "bg-amber-500/15 text-amber-500 border-amber-500/20";
}

function TrendBadge({ trend }: { trend: TrendDirection }) {
  const { t } = useLanguage();
  if (trend === "up") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-destructive">
        <TrendingUp className="h-3 w-3" /> {t("debtors.trendUp")}
      </span>
    );
  }
  if (trend === "down") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-500">
        <TrendingDown className="h-3 w-3" /> {t("debtors.trendDown")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground">
      <Minus className="h-3 w-3" /> {t("debtors.trendStable")}
    </span>
  );
}

export default function DebtorsPage() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const dfLocale: Locale = LOCALES[language] ?? enUS;

  // ── Filters ────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [overdueFilter, setOverdueFilter] = useState<string>("all"); // 1-15 / 16-30 / 31+
  const [debtFilter, setDebtFilter] = useState<string>("all");        // lt500 / 500-1000 / gt1000
  const [monthsFilter, setMonthsFilter] = useState<string>("all");    // 1 / 2 / 3+
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [sortMode, setSortMode] = useState<string>("debt-desc");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 300);

  const overdueRange = useMemo(() => {
    if (criticalOnly || overdueFilter === "31+") return { min: 31, max: undefined };
    if (overdueFilter === "16-30") return { min: 16, max: 30 };
    if (overdueFilter === "1-15") return { min: 1, max: 15 };
    return { min: 0, max: undefined };
  }, [criticalOnly, overdueFilter]);

  const debtRange = useMemo(() => {
    if (debtFilter === "lt500") return { min: undefined, max: 499_999 };
    if (debtFilter === "500-1000") return { min: 500_000, max: 1_000_000 };
    if (debtFilter === "gt1000") return { min: 1_000_001, max: undefined };
    return { min: undefined, max: undefined };
  }, [debtFilter]);

  const monthsRange = useMemo(() => {
    if (monthsFilter === "1") return { min: 1, max: 1 };
    if (monthsFilter === "2") return { min: 2, max: 2 };
    if (monthsFilter === "3+") return { min: 3, max: undefined };
    return { min: undefined, max: undefined };
  }, [monthsFilter]);

  const debtorsSort = useMemo(() => {
    switch (sortMode) {
      case "debt-asc":
        return { sort_by: "debt" as const, sort_dir: "asc" as const };
      case "overdue-desc":
        return { sort_by: "overdue" as const, sort_dir: "desc" as const };
      case "overdue-asc":
        return { sort_by: "overdue" as const, sort_dir: "asc" as const };
      case "az":
        return { sort_by: "name" as const, sort_dir: "asc" as const };
      case "debt-desc":
      default:
        return { sort_by: "debt" as const, sort_dir: "desc" as const };
    }
  }, [sortMode]);

  const debtorsQ = useDebtors({
    skip: (page - 1) * PAGE_SIZE,
    limit: PAGE_SIZE,
    group_id: groupFilter !== "all" ? Number(groupFilter) : undefined,
    min_overdue_days: overdueRange.min,
    max_overdue_days: overdueRange.max,
    debt_min: debtRange.min,
    debt_max: debtRange.max,
    months_unpaid_min: monthsRange.min,
    months_unpaid_max: monthsRange.max,
    trend: criticalOnly ? "up" : undefined,
    last_payment_from: dateFrom ? isoDate(dateFrom) : undefined,
    last_payment_to: dateTo ? isoDate(dateTo) : undefined,
    sort_by: debtorsSort.sort_by,
    sort_dir: debtorsSort.sort_dir,
    search: debouncedSearch || undefined,
  });

  const summaryQ = useFinanceSummary({
    from: dateFrom ? isoDate(dateFrom) : undefined,
    to: dateTo ? isoDate(dateTo) : undefined,
  });

  const groupsQ = useGroups({ limit: 200 });
  const createPayment = useCreatePayment();

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, groupFilter, overdueFilter, debtFilter, monthsFilter,
      criticalOnly, sortMode, dateFrom, dateTo]);

  const rows = useMemo(() => debtorsQ.data?.items ?? [], [debtorsQ.data?.items]);
  const total = debtorsQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const totalDebt = summaryQ.data?.total_debt ?? rows.reduce((s, d) => s + d.debt_amount, 0);
  const debtorsCount = summaryQ.data?.debtors_count ?? total;
  const over30Count = useMemo(
    () => rows.filter((d) => d.overdue_days >= 31).length,
    [rows],
  );
  const dueTodayCount = summaryQ.data?.overdue_today ?? 0;
  const criticalCount = useMemo(
    () => rows.filter((d) => d.overdue_days >= 31 && d.trend === "up").length,
    [rows],
  );

  const avgOverdue = rows.length === 0
    ? 0
    : Math.round(rows.reduce((s, d) => s + d.overdue_days, 0) / rows.length);
  const maxDebt = rows.length === 0 ? 0 : Math.max(...rows.map((d) => d.debt_amount));

  // ── Modal state ────────────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<DebtorRead | null>(null);
  const [formAmount, setFormAmount] = useState<number | null>(null);
  const [formMethod, setFormMethod] = useState<PaymentMethod>("cash");
  const [formDate, setFormDate] = useState<Date | undefined>(new Date());
  const [formComment, setFormComment] = useState("");
  const [formFiles, setFormFiles] = useState<File[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportPhase, setExportPhase] = useState<ExportPhase>("idle");
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [noteTarget, setNoteTarget] = useState<DebtorRead | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const updateNote = useUpdateFinanceNote();

  const openPayment = (d: DebtorRead) => {
    setSelected(d);
    setFormAmount(d.debt_amount > 0 ? d.debt_amount : d.monthly_amount || null);
    setFormMethod("cash");
    setFormDate(new Date());
    setFormComment("");
    setFormFiles([]);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!selected) return;
    const amount = Number(formAmount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t("payments.amountInvalid"));
      return;
    }
    if (!formDate) {
      toast.error(t("payments.dateRequired"));
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
      toast.success(`${t("debtors.acceptedToast")} ${selected.full_name}`);
      setModalOpen(false);
      setSelected(null);
      setFormFiles([]);
    } catch (err) {
      toast.error((err as Error).message || t("common.error"));
    }
  };

  const openNoteDialog = (debtor: DebtorRead) => {
    setNoteTarget(debtor);
    setNoteDraft(debtor.finance_note ?? "");
    setNoteDialogOpen(true);
  };

  const saveNote = async () => {
    if (!noteTarget) return;
    try {
      await updateNote.mutateAsync({
        studentId: noteTarget.id,
        note: noteDraft.trim() || null,
      });
      toast.success(t("debtors.noteSaved"));
      setNoteDialogOpen(false);
      setNoteTarget(null);
      setNoteDraft("");
    } catch (err) {
      toast.error((err as Error).message || t("common.error"));
    }
  };

  const resetFilters = () => {
    setSearch("");
    setOverdueFilter("all");
    setDebtFilter("all");
    setGroupFilter("all");
    setMonthsFilter("all");
    setSortMode("debt-desc");
    setCriticalOnly(false);
    setDateFrom(undefined);
    setDateTo(undefined);
    setPage(1);
  };

  const hasActiveFilters =
    search !== "" || overdueFilter !== "all" || debtFilter !== "all" ||
    groupFilter !== "all" || monthsFilter !== "all" || criticalOnly ||
    !!dateFrom || !!dateTo;

  const exportColumns: ExportColumn[] = [
    { key: "student", label: t("debtors.colStudent") },
    { key: "phone", label: t("debtors.colPhone") },
    { key: "groupCourse", label: t("debtors.colGroupCourse") },
    { key: "monthly", label: t("debtors.colMonthly") },
    { key: "paid", label: t("debtors.colTotalPaid") },
    { key: "debt", label: t("debtors.colDebt") },
    { key: "months", label: t("debtors.colMonths") },
    { key: "lastPayment", label: t("debtors.colLastPayment") },
    { key: "overdue", label: t("debtors.colOverdue") },
  ];
  const exportFilterSummary: ExportFilterSummaryItem[] = [
    ...(debouncedSearch ? [{ label: t("common.search"), value: debouncedSearch }] : []),
    ...(groupFilter !== "all" ? [{ label: t("schedule.group"), value: groupFilter }] : []),
    ...(overdueFilter !== "all" ? [{ label: t("debtors.overdue"), value: overdueFilter }] : []),
    ...(debtFilter !== "all" ? [{ label: t("debtors.debtSum"), value: debtFilter }] : []),
    ...(monthsFilter !== "all" ? [{ label: t("debtors.months"), value: monthsFilter }] : []),
    ...(dateFrom ? [{ label: t("common.from"), value: isoDate(dateFrom) }] : []),
    ...(dateTo ? [{ label: t("common.to"), value: isoDate(dateTo) }] : []),
  ];

  const runDebtorsExport = async (_scope: "filtered" | "all", columns: string[]) => {
    const sourceRows = rows;
    if (sourceRows.length === 0) {
      toast.info(t("debtors.notFound"));
      return;
    }
    const indexByKey = exportColumns.reduce<Record<string, number>>((acc, column, idx) => {
      acc[column.key] = idx;
      return acc;
    }, {});
    const enabledIndexes = columns.map((key) => indexByKey[key]).filter((idx) => idx !== undefined);
    const header = exportColumns.map((c) => c.label).filter((_, idx) => enabledIndexes.includes(idx));
    const tableRows = sourceRows.map((d) => {
      const row = [
        d.full_name,
        d.phone ?? "",
        `${d.group_code ?? ""} / ${d.course_name ?? ""}`,
        String(d.monthly_amount),
        String(d.total_paid),
        String(d.debt_amount),
        String(d.months_unpaid),
        d.last_payment_date ?? "",
        String(d.overdue_days),
      ];
      return row.filter((_, idx) => enabledIndexes.includes(idx));
    });
    runCsvExport({
      filename: buildUnifiedExportFileName({
        entity: "debtors",
        format: "csv",
        rangeLabel: buildFilterRangeLabel(exportFilterSummary),
      }),
      header,
      rows: tableRows,
      delimiter: ";",
    });
  };

  const formatDate = (iso: string | null | undefined) => {
    if (!iso) return "—";
    try {
      return format(new Date(iso), "d MMM yyyy", { locale: dfLocale });
    } catch {
      return iso;
    }
  };

  return (
    <DashboardLayout>
      <TooltipProvider delayDuration={150}>
      <div className="space-y-4 sm:space-y-6">
        <Breadcrumbs items={[{ label: t("debtors.title") }]} />

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">{t("debtors.title")}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t("debtors.subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <ExportActionButton
              phase={exportPhase}
              onClick={() => setExportOpen(true)}
              label={t("debtors.export")}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          {[
            { label: t("debtors.kpiTotal"), value: `${formatNumber(debtorsCount)}`, icon: AlertTriangle, color: "text-amber-500" },
            { label: t("debtors.kpiTotalDebt"), value: fmt(totalDebt), icon: DollarSign, color: "text-destructive" },
            { label: t("debtors.kpiCritical"), value: `${formatNumber(over30Count)} ${t("debtors.studentsSuffix")}`, icon: Flame, color: "text-destructive" },
            { label: t("debtors.kpiDueToday"), value: `${formatNumber(dueTodayCount)} ${t("debtors.studentsSuffix")}`, icon: XCircle, color: "text-orange-500" },
          ].map((stat, i) => (
            <div key={stat.label} className="rounded-xl border border-border/60 bg-card p-3 sm:p-4 shadow-sm animate-fade-in" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="flex items-center gap-1.5 mb-1">
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
                <span className="text-[10px] sm:text-xs text-muted-foreground">{stat.label}</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-foreground">
                {summaryQ.isLoading && i < 2 ? <Loader2 className="h-5 w-5 animate-spin inline-block" /> : stat.value}
              </p>
            </div>
          ))}
        </div>

        {/* Quick filter chips */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => { setCriticalOnly(false); setPage(1); }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              !criticalOnly
                ? "border-primary bg-primary/10 text-primary"
                : "border-border/60 bg-card text-muted-foreground hover:bg-muted/40"
            )}
          >
            {t("debtors.chipAll")}
            <span className="rounded-full bg-background/60 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
              {debtorsCount}
            </span>
          </button>
          <button
            type="button"
            onClick={() => { setCriticalOnly(true); setPage(1); }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              criticalOnly
                ? "border-destructive bg-destructive/15 text-destructive"
                : "border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10"
            )}
          >
            <Flame className="h-3.5 w-3.5" />
            {t("debtors.chipCritical")}
            <span className="text-[10px] text-muted-foreground/80 font-normal">{t("debtors.chipCriticalSub")}</span>
            <span className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
              criticalOnly ? "bg-destructive text-destructive-foreground" : "bg-destructive/15"
            )}>
              {formatNumber(criticalCount)}
            </span>
          </button>
        </div>

        {/* Filters */}
        <div className="stat-card">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder={t("debtors.searchByName")} className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={overdueFilter} onValueChange={setOverdueFilter}>
                <SelectTrigger className={cn("w-full sm:w-40", overdueFilter !== "all" && "border-primary text-primary")}><SelectValue placeholder={t("debtors.overdue")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("debtors.chipAll")}</SelectItem>
                  <SelectItem value="1-15">{t("debtors.range115")}</SelectItem>
                  <SelectItem value="16-30">{t("debtors.range1630")}</SelectItem>
                  <SelectItem value="31+">{t("debtors.range31plus")}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={debtFilter} onValueChange={setDebtFilter}>
                <SelectTrigger className={cn("w-full sm:w-48", debtFilter !== "all" && "border-primary text-primary")}><SelectValue placeholder={t("debtors.debtSum")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("debtors.any")}</SelectItem>
                  <SelectItem value="lt500">{t("debtors.lt500")}</SelectItem>
                  <SelectItem value="500-1000">{t("debtors.range5001000")}</SelectItem>
                  <SelectItem value="gt1000">{t("debtors.gt1000")}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={groupFilter} onValueChange={setGroupFilter}>
                <SelectTrigger className={cn("w-full sm:w-40", groupFilter !== "all" && "border-primary text-primary")}><SelectValue placeholder={t("debtors.allGroups")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("debtors.allGroups")}</SelectItem>
                  {(groupsQ.data?.items ?? []).map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>{g.code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <Select value={monthsFilter} onValueChange={setMonthsFilter}>
                <SelectTrigger className={cn("w-full sm:w-40", monthsFilter !== "all" && "border-primary text-primary")}><SelectValue placeholder={t("debtors.months")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("debtors.anyN")}</SelectItem>
                  <SelectItem value="1">{t("debtors.month1")}</SelectItem>
                  <SelectItem value="2">{t("debtors.month2")}</SelectItem>
                  <SelectItem value="3+">{t("debtors.month3plus")}</SelectItem>
                </SelectContent>
              </Select>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="default" className="gap-1.5 text-sm w-full sm:w-44">
                    <ArrowUpDown className="h-3.5 w-3.5" /> {t("debtors.sort")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => setSortMode("debt-desc")} className={sortMode === "debt-desc" ? "bg-accent" : ""}>{t("debtors.sortDebtDesc")}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortMode("debt-asc")} className={sortMode === "debt-asc" ? "bg-accent" : ""}>{t("debtors.sortDebtAsc")}</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setSortMode("overdue-desc")} className={sortMode === "overdue-desc" ? "bg-accent" : ""}>{t("debtors.sortOverdueDesc")}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortMode("overdue-asc")} className={sortMode === "overdue-asc" ? "bg-accent" : ""}>{t("debtors.sortOverdueAsc")}</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setSortMode("az")} className={sortMode === "az" ? "bg-accent" : ""}>{t("debtors.sortAZ")}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground" onClick={resetFilters}>
                  <X className="h-3.5 w-3.5" /> {t("debtors.resetFilters")}
                </Button>
              )}
              <span className="text-xs text-muted-foreground ml-auto">
                {t("debtors.foundLabel")}: <span className="font-semibold text-foreground">{formatNumber(total)}</span> {t("debtors.foundSuffix")}
              </span>
            </div>
            <div className="pt-3 border-t border-border/40">
              <DateRangeFilter
                dateFrom={dateFrom}
                dateTo={dateTo}
                onChange={(from, to) => { setDateFrom(from); setDateTo(to); }}
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="stat-card p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-semibold w-12">#</TableHead>
                <TableHead className="font-semibold">{t("debtors.colStudent")}</TableHead>
                <TableHead className="font-semibold">{t("debtors.colPhone")}</TableHead>
                <TableHead className="font-semibold">{t("debtors.colGroupCourse")}</TableHead>
                <TableHead className="font-semibold">{t("debtors.colMonthly")}</TableHead>
                <TableHead className="font-semibold">{t("debtors.colTotalPaid")}</TableHead>
                <TableHead className="font-semibold">{t("debtors.colDebt")}</TableHead>
                <TableHead className="font-semibold">{t("debtors.colMonths")}</TableHead>
                <TableHead className="font-semibold">{t("debtors.colLastPayment")}</TableHead>
                <TableHead className="font-semibold">{t("debtors.colOverdue")}</TableHead>
                <TableHead className="font-semibold w-12 text-center">
                  <StickyNote className="h-3.5 w-3.5 inline" />
                </TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {debtorsQ.isLoading && (
                <TableRow>
                  <TableCell colSpan={12} className="h-24 text-center text-sm text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
                    {t("common.loading")}
                  </TableCell>
                </TableRow>
              )}
              {!debtorsQ.isLoading && rows.map((d, i) => (
                <DebtorRow
                  key={d.id}
                  d={d}
                  index={(page - 1) * PAGE_SIZE + i + 1}
                  onAccept={() => openPayment(d)}
                  onEditNote={() => openNoteDialog(d)}
                  onNameClick={() => navigate(`/students/${d.id}`)}
                  formatDate={formatDate}
                />
              ))}
              {!debtorsQ.isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={12} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Search className="h-8 w-8 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">{t("debtors.notFound")}</p>
                      <p className="text-xs text-muted-foreground/70">{t("debtors.tryAdjust")}</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            {rows.length > 0 && (
              <TableFooter>
                <TableRow className="bg-muted/20 font-bold">
                  <TableCell colSpan={6} className="text-right text-muted-foreground">{t("debtors.totalDebtRow")}</TableCell>
                  <TableCell className="text-destructive text-base whitespace-nowrap">{fmt(totalDebt)}</TableCell>
                  <TableCell colSpan={2} className="text-muted-foreground">
                    {t("debtors.avgOverdue")}: <span className="text-foreground">{avgOverdue} {t("debtors.daysShort")}</span>
                  </TableCell>
                  <TableCell colSpan={3} className="text-muted-foreground">
                    {t("debtors.maxDebt")}: <span className="text-destructive">{fmt(maxDebt)}</span>
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>

          {total > PAGE_SIZE && (
            <div className="flex flex-col sm:flex-row items-center justify-between border-t border-border/60 px-3 sm:px-4 py-3 gap-3">
              <p className="text-xs text-muted-foreground">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} / {total}
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="h-3 w-3" /> <span className="hidden sm:inline">{t("common.back")}</span>
                </Button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => (
                  <Button key={i + 1} variant={page === i + 1 ? "default" : "outline"} size="sm" className="h-7 w-7 text-xs p-0" onClick={() => setPage(i + 1)}>
                    {i + 1}
                  </Button>
                ))}
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  <span className="hidden sm:inline">{t("common.forward")}</span> <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
      </TooltipProvider>

      <ExportCenter
        open={exportOpen}
        onOpenChange={setExportOpen}
        title={t("export.center.title")}
        description={t("export.center.description")}
        formats={["csv"]}
        columns={exportColumns}
        sortOptions={[
          { value: "default", label: t("export.sort.default") },
          { value: "debt-desc", label: t("debtors.sortDebtDesc") },
        ]}
        filterSummary={exportFilterSummary}
        submitLabel={t("export.center.submit")}
        onSubmit={(state) => {
          runExportTask({
            onPhaseChange: (phase) => setExportPhase(phase),
            run: () => runDebtorsExport(state.scope, state.columns),
            onSuccess: () => {
              toast.success(t("debtors.exportStarted"));
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
            <DialogTitle>{t("debtors.acceptModal")}</DialogTitle>
            <DialogDescription>{selected ? `${t("debtors.studentLabel")} ${selected.full_name}` : t("debtors.enterPayment")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {selected && (
              <div className="rounded-lg bg-muted/30 p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">{t("debtors.colDebt")}:</span><span className="font-bold text-destructive">{fmt(selected.debt_amount)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t("schedule.group")}:</span><span>{selected.group_code ?? "—"}</span></div>
                {selected.phone && (
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("debtors.colPhone")}:</span><span className="tabular-nums">{selected.phone}</span></div>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label>{t("debtors.amount")}</Label>
              <FormattedNumberInput
                placeholder="500000"
                value={formAmount}
                onValueChange={setFormAmount}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("debtors.paymentMethod")}</Label>
              <Select value={formMethod} onValueChange={(v) => setFormMethod(v as PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{t("debtors.cash")}</SelectItem>
                  <SelectItem value="transfer">{t("debtors.transfer")}</SelectItem>
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
                  hintId="debtors-receipt-hint"
                  disabled={createPayment.isPending}
                />
                <p id="debtors-receipt-hint" className="text-xs text-muted-foreground">
                  {t("payments.acceptedFormats")}
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label>{t("debtors.dateField")}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !formDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formDate ? format(formDate, "d MMMM yyyy", { locale: dfLocale }) : t("debtors.selectDate")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={formDate} onSelect={setFormDate} disabled={(d) => d > new Date()} initialFocus locale={dfLocale} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>{t("debtors.commentField")}</Label>
              <Textarea placeholder={t("debtors.commentPlaceholder")} value={formComment} onChange={(e) => setFormComment(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={createPayment.isPending}>{t("debtors.cancel")}</Button>
            <Button onClick={handleSave} disabled={createPayment.isPending}>
              {createPayment.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t("debtors.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{noteTarget?.finance_note ? t("debtors.editNote") : t("debtors.addNote")}</DialogTitle>
            <DialogDescription>
              {noteTarget ? `${t("debtors.studentLabel")} ${noteTarget.full_name}` : t("debtors.noteLabel")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>{t("debtors.noteLabel")}</Label>
            <Textarea
              placeholder={t("debtors.notePlaceholder")}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setNoteDialogOpen(false)}
              disabled={updateNote.isPending}
            >
              {t("common.cancel")}
            </Button>
            <Button onClick={saveNote} disabled={updateNote.isPending}>
              {updateNote.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t("debtors.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

// ── Debtor row ─────────────────────────────────────────────────────────────
function DebtorRow({
  d,
  index,
  onAccept,
  onEditNote,
  onNameClick,
  formatDate,
}: {
  d: DebtorRead;
  index: number;
  onAccept: () => void;
  onEditNote: () => void;
  onNameClick: () => void;
  formatDate: (s: string | null | undefined) => string;
}) {
  const { t } = useLanguage();
  const note = d.finance_note;

  return (
    <TableRow className="group animate-fade-in transition-colors hover:bg-muted/30">
      <TableCell className="text-sm text-muted-foreground font-mono">{index}</TableCell>
      <TableCell>
        <button
          type="button"
          onClick={onNameClick}
          className="text-sm font-medium text-foreground whitespace-nowrap hover:text-primary hover:underline"
        >
          {d.full_name}
        </button>
      </TableCell>
      <TableCell>
        {d.phone ? (
          <a href={`tel:${d.phone.replace(/\s/g, "")}`} className="text-sm text-foreground hover:text-primary hover:underline whitespace-nowrap tabular-nums">
            {d.phone}
          </a>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </TableCell>
      <TableCell>
        <span className="text-sm text-foreground">{d.group_code ?? "—"}</span>
        <span className="text-muted-foreground"> / {d.course_name ?? "—"}</span>
      </TableCell>
      <TableCell className="text-sm text-foreground whitespace-nowrap">{fmt(d.monthly_amount)}{t("debtors.perMonth")}</TableCell>
      <TableCell className="text-sm text-foreground whitespace-nowrap">{fmt(d.total_paid)}</TableCell>
      <TableCell>
        <div className="flex flex-col gap-0.5">
          <span className="inline-flex items-center self-start rounded-full bg-destructive/10 border border-destructive/20 px-2 py-0.5 text-xs font-semibold text-destructive whitespace-nowrap">
            {fmt(d.debt_amount)}
          </span>
          <TrendBadge trend={d.trend} />
        </div>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{d.months_unpaid} {t("debtors.monthsShort")}</TableCell>
      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(d.last_payment_date)}</TableCell>
      <TableCell>
        <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", overdueBadge(d.overdue_days))}>
          {d.overdue_days} {t("debtors.daysShort")}
        </span>
      </TableCell>
      <TableCell className="text-center">
        {note ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/10 text-amber-500 cursor-help">
                <StickyNote className="h-3.5 w-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-xs">
              <p className="text-xs">{note}</p>
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-muted-foreground/40 text-xs">—</span>
        )}
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground opacity-60 group-hover:opacity-100 transition-opacity">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={onAccept}>
              <CreditCard className="h-3.5 w-3.5 mr-2" /> {t("debtors.actionAccept")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => toast.success(`${t("debtors.reminderSent")}: ${d.full_name.split(" ").slice(0, 2).join(" ")}`)}>
              <Send className="h-3.5 w-3.5 mr-2" /> {t("debtors.actionRemind")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onEditNote}>
              <StickyNote className="h-3.5 w-3.5 mr-2" /> {note ? t("debtors.editNote") : t("debtors.addNote")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
