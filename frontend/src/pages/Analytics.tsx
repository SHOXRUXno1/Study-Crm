import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, DollarSign, BookOpen, AlertTriangle,
  ArrowUpRight, ArrowDownRight, Trophy, Wallet,
  CreditCard, Banknote, Loader2, TrendingUp, TrendingDown, Minus,
  Receipt, RotateCcw, Filter, PieChart as PieIcon,
} from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/hooks/use-language";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie,
} from "recharts";
import { formatNumber } from "@/lib/utils";
import { toast } from "sonner";
import { ExportActionButton } from "@/components/export/ExportActionButton";
import { ExportCenter } from "@/components/export/ExportCenter";
import {
  buildUnifiedExportFileName,
  runCsvExport,
  runExportTask,
  type ExportColumn,
  type ExportFilterSummaryItem,
  type ExportPhase,
} from "@/lib/export";

import {
  useAnalyticsOverview,
  type GenderFilter, type SourceFilter, type DemographicBreakdown,
} from "@/hooks/use-analytics";
import { useDebtors } from "@/hooks/use-finance";

// ── Constants ────────────────────────────────────────────────────────────────

const COURSE_PALETTE: Record<string, string> = {
  "IELTS": "hsl(234 62% 50%)",
  "Pre-IELTS": "hsl(190 70% 45%)",
  "English": "hsl(152 60% 42%)",
  "Grammar": "hsl(38 92% 50%)",
  "KIDS' English": "hsl(280 60% 50%)",
  "CEFR": "hsl(0 72% 55%)",
};

const METHOD_COLORS: Record<string, string> = {
  card:     "hsl(234 62% 50%)",
  cash:     "hsl(152 60% 42%)",
  transfer: "hsl(38 92% 50%)",
};

const METHOD_ICONS: Record<string, typeof CreditCard> = {
  card: CreditCard,
  cash: Banknote,
  transfer: Receipt,
};

const GENDER_COLORS: Record<string, string> = {
  male:    "hsl(234 62% 50%)",
  female:  "hsl(330 75% 60%)",
  unknown: "hsl(220 9% 60%)",
};

const SOURCE_COLORS: Record<string, string> = {
  instagram:   "hsl(330 75% 55%)",
  telegram:    "hsl(204 80% 55%)",
  recommended: "hsl(152 60% 42%)",
  unknown:     "hsl(220 9% 60%)",
};

const ALL_MONTHS_KEYS = [
  "months.jan","months.feb","months.mar","months.apr","months.may","months.jun",
  "months.jul","months.aug","months.sep","months.oct","months.nov","months.dec",
] as const;

const courseColor = (name: string): string => {
  if (COURSE_PALETTE[name]) return COURSE_PALETTE[name];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h} 65% 48%)`;
};

const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const lastDayOf = (y: number, m: number) => new Date(y, m, 0).getDate();

const formatUZS = (v: number, m: string) => {
  void m;
  return formatNumber(v);
};

// ── Custom tooltip ──────────────────────────────────────────────────────────

interface ChartPayloadItem { color?: string; fill?: string; value?: number | string; name?: string; }
const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: ChartPayloadItem[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-lg backdrop-blur-sm">
      {label && <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: p.color || p.fill }} />
          {p.name}: {typeof p.value === "number" ? formatNumber(p.value) : p.value}
        </p>
      ))}
    </div>
  );
};

// ── Page ────────────────────────────────────────────────────────────────────

export default function Analytics() {
  const { t } = useLanguage();
  const navigate = useNavigate();

  // ── Period filter (Year + Month) ───────────────────────────────────────
  const today = useMemo(() => new Date(), []);
  const currentYear = today.getFullYear();
  const yearOptions = useMemo(() => {
    const arr: number[] = [];
    for (let y = currentYear; y >= currentYear - 4; y--) arr.push(y);
    return arr;
  }, [currentYear]);

  const [year, setYear]   = useState<number>(currentYear);
  // 0 = all months in year, 1..12 = specific month
  const [month, setMonth] = useState<number>(0);
  const [gender, setGender] = useState<GenderFilter | "all">("all");
  const [source, setSource] = useState<SourceFilter | "all">("all");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportPhase, setExportPhase] = useState<ExportPhase>("idle");

  const { fromIso, toIso } = useMemo(() => {
    if (month === 0) {
      // Whole year — but cap "to" at today if year is current.
      const from = isoOf(year, 1, 1);
      const last = year === currentYear
        ? `${currentYear}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
        : isoOf(year, 12, 31);
      return { fromIso: from, toIso: last };
    }
    const from = isoOf(year, month, 1);
    const to   = year === currentYear && month === today.getMonth() + 1
      ? `${currentYear}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
      : isoOf(year, month, lastDayOf(year, month));
    return { fromIso: from, toIso: to };
  }, [year, month, currentYear, today]);

  const overviewQ = useAnalyticsOverview({
    from:   fromIso,
    to:     toIso,
    gender: gender === "all" ? undefined : gender,
    source: source === "all" ? undefined : source,
  });
  const debtorsQ = useDebtors({ limit: 5 });

  const financeRef  = useRef<HTMLDivElement>(null);
  const academicRef = useRef<HTMLDivElement>(null);
  const audienceRef = useRef<HTMLDivElement>(null);
  const scrollTo = (ref: React.RefObject<HTMLDivElement>) =>
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const M = t("common.million");
  const data = overviewQ.data;
  const kpis = data?.kpis;
  const isLoading = overviewQ.isLoading;
  const hasFilters = gender !== "all" || source !== "all";

  const resetDemographics = () => { setGender("all"); setSource("all"); };

  // ── Derived ────────────────────────────────────────────────────────────
  const revenueDelta = useMemo(() => {
    if (!kpis) return null;
    const prev = kpis.revenue_prev_period;
    const curr = kpis.revenue_period;
    if (prev <= 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  }, [kpis]);

  const monthlyChartData = useMemo(() => {
    if (!data) return [];
    return data.revenue_by_month.map((p) => {
      const [y, m] = p.month.split("-");
      const monthIdx = Math.max(0, Math.min(11, parseInt(m, 10) - 1));
      return {
        label: `${t(ALL_MONTHS_KEYS[monthIdx])} ${y.slice(2)}`,
        revenue: p.revenue,
      };
    });
  }, [data, t]);

  const courseChartData = useMemo(() => data?.revenue_by_course ?? [], [data]);

  const methodChartData = useMemo(() => {
    if (!data) return [];
    return data.payment_methods
      .filter((m) => m.amount > 0)
      .map((m) => ({
        method: m.method,
        amount: m.amount,
        count: m.count,
        label: m.method === "cash" ? t("analytics.payCash")
             : m.method === "transfer" ? t("analytics.payTransfer") : m.method,
      }));
  }, [data, t]);

  const totalMethodAmount = methodChartData.reduce((s, m) => s + m.amount, 0);

  const labelGender = (key: string) =>
    key === "male"   ? t("students.male")
  : key === "female" ? t("students.female")
  : t("analytics.unknown");

  const labelSource = (key: string) =>
    key === "instagram"   ? t("students.srcInstagram")
  : key === "telegram"    ? t("students.srcTelegram")
  : key === "recommended" ? t("students.srcRecommended")
  : t("analytics.unknown");

  const genderTotal = (data?.students_by_gender ?? []).reduce((s, b) => s + b.count, 0);
  const sourceTotal = (data?.students_by_source ?? []).reduce((s, b) => s + b.count, 0);

  // ── KPI definitions ────────────────────────────────────────────────────
  const kpiCards = useMemo(() => [
    {
      key: "students",
      label: t("analytics.activeStudents"),
      value: kpis ? `${kpis.students_active}` : "—",
      change: null as number | null,
      icon: Users,
      tone: "text-primary",
      bg: "bg-primary/10",
      ref: audienceRef,
    },
    {
      key: "groups",
      label: t("analytics.activeGroups"),
      value: kpis ? `${kpis.groups_active}` : "—",
      change: null,
      icon: BookOpen,
      tone: "text-primary",
      bg: "bg-primary/10",
      ref: academicRef,
    },
    {
      key: "revenue",
      label: t("analytics.totalRevenue"),
      value: kpis ? `${formatUZS(kpis.revenue_period, M)}` : "—",
      change: revenueDelta,
      icon: DollarSign,
      tone: "text-emerald-600",
      bg: "bg-emerald-500/10",
      ref: financeRef,
    },
    {
      key: "debt",
      label: t("analytics.totalDebt"),
      value: kpis ? `${formatUZS(kpis.debt_total, M)}` : "—",
      change: null,
      icon: Wallet,
      tone: "text-amber-600",
      bg: "bg-amber-500/10",
      ref: financeRef,
    },
    {
      key: "debtors",
      label: t("analytics.debtorsCount"),
      value: kpis ? `${kpis.debtors_count}` : "—",
      change: null,
      icon: AlertTriangle,
      tone: "text-rose-600",
      bg: "bg-rose-500/10",
      ref: financeRef,
    },
    {
      key: "avgCheck",
      label: t("analytics.avgCheck"),
      value: kpis ? `${formatUZS(kpis.avg_check, M)}` : "—",
      change: null,
      icon: Receipt,
      tone: "text-primary",
      bg: "bg-primary/10",
      ref: financeRef,
    },
  ], [t, kpis, revenueDelta, M]);

  // ── CSV export ─────────────────────────────────────────────────────────
  const analyticsColumns: ExportColumn[] = [
    { key: "metric", label: "Metric" },
    { key: "value", label: "Value" },
  ];
  const analyticsFilterSummary: ExportFilterSummaryItem[] = [
    { label: t("analytics.year"), value: String(year) },
    { label: t("analytics.month"), value: month === 0 ? t("analytics.allMonths") : t(ALL_MONTHS_KEYS[month - 1]) },
    ...(gender !== "all" ? [{ label: t("students.gender"), value: labelGender(gender) }] : []),
    ...(source !== "all" ? [{ label: t("students.source"), value: labelSource(source) }] : []),
  ];

  const handleExportCsv = () => {
    if (!data) return;
    const header = ["Section", "Metric", "Value"];
    const rows: Array<[string, string, string]> = [
      ["KPI", t("analytics.activeStudents"), String(data.kpis.students_active)],
      ["KPI", t("analytics.activeGroups"), String(data.kpis.groups_active)],
      ["KPI", t("analytics.totalRevenue"), String(data.kpis.revenue_period)],
      ["KPI", t("analytics.totalDebt"), String(data.kpis.debt_total)],
      ["KPI", t("analytics.debtorsCount"), String(data.kpis.debtors_count)],
      ["KPI", t("analytics.avgCheck"), String(data.kpis.avg_check)],
      ...data.revenue_by_month.map((item) => ["Revenue by Month", item.month, String(item.revenue)] as [string, string, string]),
      ...data.revenue_by_course.map((item) => ["Revenue by Course", item.course_name, String(item.revenue)] as [string, string, string]),
      ...data.payment_methods.map((item) => ["Payment Method", `${item.method} (${item.count})`, String(item.amount)] as [string, string, string]),
      ...data.students_by_gender.map((item) => ["Students by Gender", labelGender(item.key), String(item.count)] as [string, string, string]),
      ...data.students_by_source.map((item) => ["Students by Source", labelSource(item.key), String(item.count)] as [string, string, string]),
    ];
    runCsvExport({
      filename: buildUnifiedExportFileName({
        entity: "analytics",
        format: "csv",
        rangeLabel: `${data.period_from}-${data.period_to}`,
      }),
      header,
      rows,
      delimiter: ";",
    });
  };

  // ── Breakdown render helpers ───────────────────────────────────────────
  const renderBreakdown = (
    items: DemographicBreakdown[],
    total: number,
    colors: Record<string, string>,
    labelOf: (k: string) => string,
    onChipClick?: (k: string) => void,
    activeKey?: string,
  ) => {
    if (items.length === 0 || total === 0) {
      return (
        <div className="h-44 flex items-center justify-center text-xs text-muted-foreground">
          {t("analytics.noData")}
        </div>
      );
    }
    const chartData = items.map((b) => ({
      key: b.key,
      label: labelOf(b.key),
      value: b.count,
    }));
    return (
      <div className="grid grid-cols-2 gap-3 items-center">
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={chartData} dataKey="value" nameKey="label" innerRadius={42} outerRadius={68} paddingAngle={2}>
                {chartData.map((entry) => (
                  <Cell key={entry.key} fill={colors[entry.key] ?? colors.unknown} />
                ))}
              </Pie>
              <RTooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-2">
          {items.map((b) => {
            const pct = total > 0 ? Math.round((b.count / total) * 100) : 0;
            const isActive = activeKey === b.key;
            const clickable = !!onChipClick && b.key !== "unknown";
            return (
              <button
                key={b.key}
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onChipClick!(b.key)}
                className={`w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 transition-colors ${
                  clickable ? "hover:bg-muted/60" : "cursor-default"
                } ${isActive ? "bg-primary/10 ring-1 ring-primary/30" : ""}`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: colors[b.key] ?? colors.unknown }} />
                  <span className="text-xs font-medium text-foreground truncate">{labelOf(b.key)}</span>
                </span>
                <span className="text-right shrink-0">
                  <div className="text-xs font-semibold text-foreground tabular-nums">{b.count}</div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">{pct}%</div>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 sm:space-y-6 print:space-y-3">
      <Breadcrumbs items={[{ label: t("analytics.title") }]} />

      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 -mt-2">
        <div>
          <p className="text-xs sm:text-sm font-medium text-primary mb-1">{t("sidebar.operations")}</p>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">{t("analytics.title")}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t("analytics.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <ExportActionButton
            phase={exportPhase}
            onClick={() => setExportOpen(true)}
            label={t("analytics.exportCsv")}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-border/60 bg-card p-3 sm:p-4 shadow-sm print:hidden">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:flex-wrap">
          {/* Year */}
          <div className="flex-1 min-w-[140px]">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">
              {t("analytics.year")}
            </label>
            <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v, 10))}>
              <SelectTrigger className="h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Month */}
          <div className="flex-1 min-w-[140px]">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">
              {t("analytics.month")}
            </label>
            <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v, 10))}>
              <SelectTrigger className="h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">{t("analytics.allMonths")}</SelectItem>
                {ALL_MONTHS_KEYS.map((k, i) => (
                  <SelectItem key={k} value={String(i + 1)}>{t(k)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Gender */}
          <div className="flex-1 min-w-[140px]">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">
              {t("students.gender")}
            </label>
            <Select value={gender} onValueChange={(v) => setGender(v as GenderFilter | "all")}>
              <SelectTrigger className={`h-9 w-full ${gender !== "all" ? "border-primary text-primary" : ""}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("analytics.allGenders")}</SelectItem>
                <SelectItem value="male">{t("students.male")}</SelectItem>
                <SelectItem value="female">{t("students.female")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Source */}
          <div className="flex-1 min-w-[160px]">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">
              {t("students.source")}
            </label>
            <Select value={source} onValueChange={(v) => setSource(v as SourceFilter | "all")}>
              <SelectTrigger className={`h-9 w-full ${source !== "all" ? "border-primary text-primary" : ""}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("analytics.allSources")}</SelectItem>
                <SelectItem value="instagram">{t("students.srcInstagram")}</SelectItem>
                <SelectItem value="telegram">{t("students.srcTelegram")}</SelectItem>
                <SelectItem value="recommended">{t("students.srcRecommended")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Reset */}
          {hasFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={resetDemographics}
              className="h-9 shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              {t("analytics.resetFilters")}
            </Button>
          )}
        </div>

        {hasFilters && (
          <div className="mt-3 pt-3 border-t border-border/50 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase flex items-center gap-1">
              <Filter className="h-3 w-3" /> {t("analytics.filtersActive")}:
            </span>
            {gender !== "all" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-[11px] font-medium px-2 py-0.5">
                {labelGender(gender)}
              </span>
            )}
            {source !== "all" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-[11px] font-medium px-2 py-0.5">
                {labelSource(source)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpiCards.map((kpi) => (
          <button
            key={kpi.key}
            onClick={() => scrollTo(kpi.ref)}
            disabled={isLoading}
            className="text-left rounded-xl border border-border/60 bg-card p-3 sm:p-4 shadow-sm hover:shadow-md hover:border-primary/40 transition-all group disabled:opacity-60"
          >
            <div className="flex items-center justify-between mb-2">
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${kpi.bg}`}>
                <kpi.icon className={`h-4 w-4 ${kpi.tone}`} />
              </div>
              {kpi.change !== null && kpi.change !== undefined && (
                <div className={`flex items-center gap-0.5 text-[10px] font-semibold ${
                  kpi.change > 0 ? "text-emerald-600" : kpi.change < 0 ? "text-destructive" : "text-muted-foreground"
                }`}>
                  {kpi.change > 0 ? <ArrowUpRight className="h-3 w-3" /> :
                   kpi.change < 0 ? <ArrowDownRight className="h-3 w-3" /> : null}
                  {kpi.change > 0 ? "+" : ""}{kpi.change}%
                </div>
              )}
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight mb-1">{kpi.label}</p>
            <p className="text-lg sm:text-xl font-bold text-foreground">
              {isLoading ? <span className="inline-block h-5 w-12 rounded bg-muted animate-pulse" /> : kpi.value}
            </p>
            {kpi.change !== null && kpi.change !== undefined && (
              <p className="text-[9px] text-muted-foreground/70 mt-0.5">{t("analytics.vsPrev")}</p>
            )}
          </button>
        ))}
      </div>

      {/* Loading veil */}
      {isLoading && (
        <div className="rounded-xl border border-border/60 bg-card px-6 py-12 flex items-center justify-center text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" /> {t("groups.loading")}
        </div>
      )}

      {/* Finance block */}
      {!isLoading && data && (
        <div ref={financeRef} className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          <div className="rounded-xl border border-border/60 bg-card p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-card-foreground">{t("analytics.revenueVsDebt")}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {month === 0 ? `${year}` : `${t(ALL_MONTHS_KEYS[month - 1])} ${year}`}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-[10px] text-muted-foreground">{t("analytics.revenue")}</span>
              </div>
            </div>
            <div className="h-56 sm:h-64">
              {monthlyChartData.length === 0 || monthlyChartData.every((d) => d.revenue === 0) ? (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                  {t("analytics.noData")}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyChartData} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
                    <defs>
                      <linearGradient id="gradRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(152 60% 42%)" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="hsl(152 60% 42%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => formatNumber(Number(v))} />
                    <RTooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="revenue" name={t("analytics.revenue")} stroke="hsl(152 60% 42%)" strokeWidth={2.5} fill="url(#gradRev)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-card p-4 sm:p-5 shadow-sm">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-card-foreground">{t("analytics.revenueByCourse")}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{t("analytics.revenueByCourseDesc")}</p>
            </div>
            <div className="h-56 sm:h-64">
              {courseChartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                  {t("analytics.noData")}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={courseChartData} layout="vertical" margin={{ top: 5, right: 20, bottom: 0, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => formatNumber(Number(v))} />
                    <YAxis type="category" dataKey="course_name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={95} />
                    <RTooltip content={<CustomTooltip />} />
                    <Bar dataKey="revenue" name={t("analytics.revenue")} radius={[0, 4, 4, 0]} barSize={16}>
                      {courseChartData.map((entry) => (
                        <Cell key={entry.course_name} fill={courseColor(entry.course_name)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Methods + Top Groups */}
      {!isLoading && data && (
        <div ref={academicRef} className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          <div className="rounded-xl border border-border/60 bg-card p-4 sm:p-5 shadow-sm">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-card-foreground">{t("analytics.paymentMethods")}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{t("analytics.paymentMethodsDesc")}</p>
            </div>
            {methodChartData.length === 0 ? (
              <div className="h-44 flex items-center justify-center text-xs text-muted-foreground">
                {t("analytics.noData")}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 items-center">
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={methodChartData} dataKey="amount" nameKey="label" innerRadius={42} outerRadius={68} paddingAngle={2}>
                        {methodChartData.map((entry) => (
                          <Cell key={entry.method} fill={METHOD_COLORS[entry.method] ?? "hsl(234 62% 50%)"} />
                        ))}
                      </Pie>
                      <RTooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                  {methodChartData.map((m) => {
                    const Icon = METHOD_ICONS[m.method] ?? CreditCard;
                    const pct = totalMethodAmount > 0 ? Math.round((m.amount / totalMethodAmount) * 100) : 0;
                    return (
                      <div key={m.method} className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: `${METHOD_COLORS[m.method] ?? "hsl(234 62% 50%)"}20` }}>
                            <Icon className="h-3.5 w-3.5" style={{ color: METHOD_COLORS[m.method] }} />
                          </span>
                          <span className="text-xs font-medium text-foreground truncate">{m.label}</span>
                        </span>
                        <span className="text-right shrink-0">
                          <div className="text-xs font-semibold text-foreground tabular-nums">{formatUZS(m.amount, M)}</div>
                          <div className="text-[10px] text-muted-foreground tabular-nums">{pct}% · {m.count}</div>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border/60 bg-card p-4 sm:p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-semibold text-card-foreground">{t("analytics.topGroupsAttendance")}</h3>
            </div>
            {data.top_groups_attendance.length === 0 ? (
              <div className="py-10 flex items-center justify-center text-xs text-muted-foreground">
                {t("analytics.noData")}
              </div>
            ) : (
              <div className="space-y-3">
                {data.top_groups_attendance.map((g) => (
                  <button
                    key={g.group_id}
                    onClick={() => navigate(`/groups/${g.group_id}`)}
                    className="w-full text-left group/row"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-foreground group-hover/row:text-primary transition-colors flex items-center gap-2">
                        <span>{g.code}</span>
                        {g.course_name && <span className="text-[10px] text-muted-foreground">{g.course_name}</span>}
                      </span>
                      <span className="text-sm font-semibold text-emerald-600 tabular-nums">{g.rate_pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          g.rate_pct >= 85 ? "bg-emerald-500" : g.rate_pct >= 70 ? "bg-amber-500" : "bg-red-500"
                        }`}
                        style={{ width: `${Math.min(100, Math.max(0, g.rate_pct))}%` }}
                      />
                    </div>
                    <p className="text-[9px] text-muted-foreground/80 mt-0.5">
                      {g.total_marks} {t("analytics.marksCount")}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Audience breakdown */}
      {!isLoading && data && (
        <div ref={audienceRef} className="rounded-xl border border-border/60 bg-card p-4 sm:p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <PieIcon className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-card-foreground">{t("analytics.demographics")}</h3>
            <span className="ml-2 text-[10px] text-muted-foreground">
              {t("analytics.activeStudents")}: {kpis?.students_active ?? 0}
            </span>
          </div>
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">{t("analytics.studentsByGender")}</p>
              {renderBreakdown(
                data.students_by_gender,
                genderTotal,
                GENDER_COLORS,
                labelGender,
                (k) => setGender((cur) => (cur === k ? "all" : (k as GenderFilter))),
                gender === "all" ? undefined : gender,
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">{t("analytics.studentsBySource")}</p>
              {renderBreakdown(
                data.students_by_source,
                sourceTotal,
                SOURCE_COLORS,
                labelSource,
                (k) => setSource((cur) => (cur === k ? "all" : (k as SourceFilter))),
                source === "all" ? undefined : source,
              )}
            </div>
          </div>
        </div>
      )}

      {/* Top debtors */}
      {!isLoading && (
        <div className="rounded-xl border border-border/60 bg-card p-4 sm:p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-rose-600" />
            <h3 className="text-sm font-semibold text-card-foreground">{t("analytics.topDebtors")}</h3>
          </div>
          {debtorsQ.isLoading ? (
            <div className="py-6 flex items-center justify-center text-xs text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("groups.loading")}
            </div>
          ) : !debtorsQ.data || debtorsQ.data.items.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">{t("analytics.noData")}</p>
          ) : (
            <div className="divide-y divide-border/50">
              {debtorsQ.data.items.slice(0, 5).map((d, i) => {
                const TrendIcon = d.trend === "up" ? TrendingUp : d.trend === "down" ? TrendingDown : Minus;
                const trendTone = d.trend === "up" ? "text-rose-600" : d.trend === "down" ? "text-emerald-600" : "text-muted-foreground";
                return (
                  <button
                    key={d.id}
                    onClick={() => navigate(`/students/${d.id}`)}
                    className="w-full flex items-center gap-3 px-1 py-2.5 hover:bg-muted/50 rounded-lg transition-colors text-left"
                  >
                    <span className="text-[10px] font-bold text-muted-foreground w-5 tabular-nums">#{i + 1}</span>
                    <span className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{d.full_name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {d.group_code ?? "—"}{d.course_name ? ` · ${d.course_name}` : ""}
                        {d.months_unpaid ? ` · ${d.months_unpaid} ${t("debtors.monthsShort")}` : ""}
                      </div>
                    </span>
                    <span className={`flex items-center gap-1 text-xs font-semibold ${trendTone}`}>
                      <TrendIcon className="h-3 w-3" />
                    </span>
                    <span className="text-sm font-semibold text-rose-600 tabular-nums shrink-0">
                      {formatUZS(d.debt_amount, M)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <ExportCenter
        open={exportOpen}
        onOpenChange={setExportOpen}
        title={t("export.center.title")}
        description={t("export.center.description")}
        formats={["csv"]}
        columns={analyticsColumns}
        sortOptions={[{ value: "default", label: t("export.sort.default") }]}
        filterSummary={analyticsFilterSummary}
        submitLabel={t("export.center.submit")}
        onSubmit={() => {
          runExportTask({
            onPhaseChange: (phase) => setExportPhase(phase),
            run: () => handleExportCsv(),
            onSuccess: () => {
              toast.success(t("export.toast.success"));
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
    </div>
  );
}
