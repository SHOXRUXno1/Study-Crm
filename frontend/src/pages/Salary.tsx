import { useMemo, useState } from "react";
import { Calendar, Coins, Loader2, Search, TrendingUp, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useLanguage } from "@/hooks/use-language";
import {
  monthEndIso, monthStartIso, useAllSalaries, type SalaryBreakdown,
} from "@/hooks/use-salary";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { formatCurrencyUZS, formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";

function currentMonthInputValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthInputToBounds(monthValue: string): { from: string; to: string } {
  const [yearStr, monthStr] = monthValue.split("-");
  const d = new Date(Number(yearStr), Number(monthStr) - 1, 1);
  return { from: monthStartIso(d), to: monthEndIso(d) };
}

/**
 * Admin-only payroll page.
 *
 * Lists every active teacher with their salary breakdown for the selected
 * month and shows the resulting payroll total. Search filters by teacher
 * name on the client (the dataset is small and already cached by the
 * /teachers/salaries endpoint, so a network round-trip per keystroke would
 * be wasteful).
 */
export default function Salary() {
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [month, setMonth] = useState<string>(currentMonthInputValue());
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 250);

  const { from, to } = useMemo(() => monthInputToBounds(month), [month]);
  const { data, isLoading, isError, error, refetch } = useAllSalaries({ from, to });

  const filtered: SalaryBreakdown[] = useMemo(() => {
    const items = data?.items ?? [];
    if (!debouncedSearch.trim()) return items;
    const q = debouncedSearch.trim().toLowerCase();
    return items.filter((s) => s.teacher_name.toLowerCase().includes(q));
  }, [data?.items, debouncedSearch]);

  const filteredPayroll = useMemo(
    () => filtered.reduce((sum, s) => sum + s.total, 0),
    [filtered],
  );

  const grandTotal = data?.total_payroll ?? 0;
  const teacherCount = data?.items.length ?? 0;
  const totalLessons = useMemo(
    () => (data?.items ?? []).reduce((s, x) => s + x.lessons_count, 0),
    [data?.items],
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <Breadcrumbs items={[{ label: t("salary.title") }]} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            {t("salary.title")}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {t("salary.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value || currentMonthInputValue())}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t("salary.month")}
          />
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Kpi
          icon={Coins}
          label={t("salary.payroll")}
          value={formatCurrencyUZS(grandTotal)}
          accent="text-primary"
          accentBg="bg-primary/10"
        />
        <Kpi
          icon={Users}
          label={t("teachers.activeTeachers")}
          value={formatNumber(teacherCount)}
          accent="text-emerald-600"
          accentBg="bg-emerald-500/10"
        />
        <Kpi
          icon={TrendingUp}
          label={t("salary.lessonsCount")}
          value={formatNumber(totalLessons)}
          accent="text-violet-600"
          accentBg="bg-violet-500/10"
        />
      </div>

      {/* Filter */}
      <div className="stat-card">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("teachers.searchPlaceholder")}
            className="pl-9 h-9 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t("teachers.searchPlaceholder")}
          />
        </div>
        {debouncedSearch && (
          <p className="text-xs text-muted-foreground mt-2">
            {t("salary.payroll")}: <span className="font-semibold text-foreground">
              {formatCurrencyUZS(filteredPayroll)}
            </span>
          </p>
        )}
      </div>

      {/* Table */}
      <div className="stat-card p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="font-semibold pl-4">{t("teachers.teacher")}</TableHead>
              <TableHead className="font-semibold text-right hidden sm:table-cell">
                {t("salary.componentMonthly")}
              </TableHead>
              <TableHead className="font-semibold text-right hidden md:table-cell">
                {t("salary.componentPercent")}
              </TableHead>
              <TableHead className="font-semibold text-right hidden md:table-cell">
                {t("salary.componentLessons")}
              </TableHead>
              <TableHead className="font-semibold text-right hidden lg:table-cell">
                {t("salary.componentStudents")}
              </TableHead>
              <TableHead className="font-semibold text-right pr-4">
                {t("salary.total")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            )}

            {isError && !isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-sm text-destructive">
                      {error instanceof Error ? error.message : t("common.error")}
                    </p>
                    <Button size="sm" variant="outline" onClick={() => refetch()}>
                      {t("dash.retry")}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {!isLoading && !isError && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <p className="text-sm text-muted-foreground">{t("salary.empty")}</p>
                </TableCell>
              </TableRow>
            )}

            {!isLoading && !isError && filtered.map((s, i) => (
              <TableRow
                key={s.teacher_id}
                className="animate-fade-in cursor-pointer hover:bg-muted/30"
                style={{ animationDelay: `${i * 30}ms` }}
                onClick={() => navigate(`/teachers/${s.teacher_id}`)}
              >
                <TableCell className="pl-4">
                  <p className="text-sm font-medium text-foreground">{s.teacher_name}</p>
                </TableCell>
                <Cell amount={s.monthly_amount} disabled={s.rate_monthly === 0} className="hidden sm:table-cell" />
                <Cell amount={s.percent_amount} disabled={s.rate_percent === 0} className="hidden md:table-cell" />
                <Cell amount={s.lessons_amount} disabled={s.rate_per_lesson === 0} className="hidden md:table-cell" />
                <Cell amount={s.students_amount} disabled={s.rate_per_student === 0} className="hidden lg:table-cell" />
                <TableCell className="pr-4 text-right tabular-nums font-bold text-primary">
                  {formatCurrencyUZS(s.total)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────────────

interface KpiProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent: string;
  accentBg: string;
}

function Kpi({ icon: Icon, label, value, accent, accentBg }: KpiProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-3 sm:p-4 shadow-sm">
      <div className="flex items-center gap-1.5 mb-1">
        <div className={cn("flex h-5 w-5 items-center justify-center rounded", accentBg)}>
          <Icon className={cn("h-3.5 w-3.5", accent)} />
        </div>
        <span className="text-[10px] sm:text-xs text-muted-foreground truncate">{label}</span>
      </div>
      <p className="text-base sm:text-xl font-bold text-foreground tabular-nums truncate">{value}</p>
    </div>
  );
}

interface CellProps {
  amount: number;
  disabled?: boolean;
  className?: string;
}

function Cell({ amount, disabled, className }: CellProps) {
  return (
    <TableCell
      className={cn("text-right tabular-nums text-sm", disabled && "text-muted-foreground/60", className)}
    >
      {disabled ? "—" : formatCurrencyUZS(amount)}
    </TableCell>
  );
}
