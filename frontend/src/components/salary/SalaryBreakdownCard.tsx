import { useMemo, useState } from "react";
import {
  Calendar, Coins, GraduationCap, Loader2, Percent, TrendingUp, Users,
} from "lucide-react";
import {
  monthEndIso, monthStartIso, useTeacherSalary,
} from "@/hooks/use-salary";
import { useLanguage } from "@/hooks/use-language";
import { formatCurrencyUZS, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  teacherId: number;
  /** ISO YYYY-MM. If omitted, defaults to the current calendar month. */
  initialMonth?: string;
  className?: string;
}

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
 * Salary breakdown card — used on TeacherProfile and as a row in /salary.
 *
 * The four components are independent: any zero rate is rendered as
 * "(disabled)" and excluded from the visual sum so the formula stays
 * readable.
 */
export function SalaryBreakdownCard({ teacherId, initialMonth, className }: Props) {
  const { t } = useLanguage();
  const [month, setMonth] = useState<string>(initialMonth ?? currentMonthInputValue());
  const { from, to } = useMemo(() => monthInputToBounds(month), [month]);

  const { data, isLoading, isError, error, refetch } = useTeacherSalary(
    teacherId, { from, to },
  );

  return (
    <div className={cn(
      "rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden",
      className,
    )}>
      {/* Header — period picker */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 p-4 sm:px-5 sm:py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Coins className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">{t("salary.calculation")}</p>
            <p className="text-[11px] text-muted-foreground">{t("salary.snapshotNote")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value || currentMonthInputValue())}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      {/* Body */}
      {isLoading && (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {isError && !isLoading && (
        <div className="flex h-40 flex-col items-center justify-center gap-2 px-4">
          <p className="text-sm text-destructive text-center">
            {error instanceof Error ? error.message : t("common.error")}
          </p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      )}

      {data && !isLoading && (
        <>
          {/* Source measurements */}
          <div className="grid grid-cols-3 divide-x divide-border/40 border-b border-border/40">
            <Metric
              icon={TrendingUp}
              label={t("salary.revenue")}
              value={formatCurrencyUZS(data.revenue)}
              accent="text-emerald-600"
              accentBg="bg-emerald-500/10"
            />
            <Metric
              icon={GraduationCap}
              label={t("salary.lessonsCount")}
              value={formatNumber(data.lessons_count)}
              accent="text-primary"
              accentBg="bg-primary/10"
            />
            <Metric
              icon={Users}
              label={t("salary.studentsCount")}
              value={formatNumber(data.students_count)}
              accent="text-violet-600"
              accentBg="bg-violet-500/10"
            />
          </div>

          {/* Breakdown table */}
          <div className="divide-y divide-border/40">
            <Row
              label={t("salary.componentMonthly")}
              formula={data.rate_monthly === 0
                ? t("salary.zeroDisabled")
                : `${formatCurrencyUZS(data.rate_monthly)}`}
              amount={data.monthly_amount}
              disabled={data.rate_monthly === 0}
            />
            <Row
              label={t("salary.componentPercent")}
              formula={data.rate_percent === 0
                ? t("salary.zeroDisabled")
                : `${formatCurrencyUZS(data.revenue)} × ${data.rate_percent}%`}
              amount={data.percent_amount}
              icon={Percent}
              disabled={data.rate_percent === 0}
            />
            <Row
              label={t("salary.componentLessons")}
              formula={data.rate_per_lesson === 0
                ? t("salary.zeroDisabled")
                : `${formatCurrencyUZS(data.rate_per_lesson)} × ${formatNumber(data.lessons_count)}`}
              amount={data.lessons_amount}
              disabled={data.rate_per_lesson === 0}
            />
            <Row
              label={t("salary.componentStudents")}
              formula={data.rate_per_student === 0
                ? t("salary.zeroDisabled")
                : `${formatCurrencyUZS(data.rate_per_student)} × ${formatNumber(data.students_count)}`}
              amount={data.students_amount}
              disabled={data.rate_per_student === 0}
            />
          </div>

          {/* Total */}
          <div className="flex items-center justify-between bg-primary/5 px-4 sm:px-5 py-4">
            <p className="text-sm font-semibold text-foreground">{t("salary.total")}</p>
            <p className="text-xl sm:text-2xl font-extrabold text-primary tabular-nums">
              {formatCurrencyUZS(data.total)}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────────────

interface MetricProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent: string;
  accentBg: string;
}

function Metric({ icon: Icon, label, value, accent, accentBg }: MetricProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg shrink-0", accentBg)}>
        <Icon className={cn("h-4 w-4", accent)} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none mb-1">
          {label}
        </p>
        <p className="text-sm font-bold text-foreground truncate tabular-nums">{value}</p>
      </div>
    </div>
  );
}

interface RowProps {
  label: string;
  formula: string;
  amount: number;
  icon?: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
}

function Row({ label, formula, amount, disabled }: RowProps) {
  return (
    <div className={cn(
      "flex items-center justify-between gap-3 px-4 sm:px-5 py-3",
      disabled && "opacity-50",
    )}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-[11px] text-muted-foreground font-mono truncate">{formula}</p>
      </div>
      <p className="text-sm font-semibold text-foreground tabular-nums whitespace-nowrap">
        {disabled ? "—" : formatCurrencyUZS(amount)}
      </p>
    </div>
  );
}
