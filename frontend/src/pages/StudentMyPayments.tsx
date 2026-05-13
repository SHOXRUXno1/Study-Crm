import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { Receipt, AlertTriangle, CheckCircle2, Wallet, TrendingUp, CalendarDays, MessageSquareText } from "lucide-react";

import { DashboardLayout } from "@/components/DashboardLayout";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { cn, formatNumber } from "@/lib/utils";

import { useLanguage } from "@/hooks/use-language";
import { useMyLedger } from "@/hooks/use-me-student";
import type { PaymentRead } from "@/hooks/use-finance";

const EMPTY_PAYMENTS: PaymentRead[] = [];

function formatUZS(n: number): string {
  return formatNumber(n);
}

function methodText(method: string, t: (key: string) => string): string {
  return method === "cash" ? t("payments.cash") : method === "transfer" ? t("payments.transfer") : method;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return format(parseISO(value), "dd.MM.yyyy HH:mm");
  } catch {
    return value;
  }
}

function formatDateOnly(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return format(parseISO(value), "dd.MM.yyyy");
  } catch {
    return value;
  }
}

function formatTimeOnly(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return format(parseISO(value), "HH:mm");
  } catch {
    return "—";
  }
}

export default function StudentMyPayments() {
  const { t } = useLanguage();
  const timeColLabel = t("studentMyPayments.colTime");
  const commentColLabel = t("studentMyPayments.colComment");

  const { data, isLoading } = useMyLedger();
  const billing = data?.billing;
  const payments = useMemo(() => data?.payments ?? EMPTY_PAYMENTS, [data?.payments]);

  const sortedPayments = useMemo(
    () => [...payments].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    [payments],
  );

  const paymentProgress = billing?.total_course_cost
    ? Math.min(100, Math.round((billing.total_paid / billing.total_course_cost) * 100))
    : 0;

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6 max-w-5xl mx-auto">
        <Breadcrumbs items={[{ label: t("student.myPayments") }]} />

        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
            {t("student.myPayments")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t("student.paymentLog")}</p>
        </div>

        {billing && (
          <div
            className={cn(
              "rounded-2xl border p-5 sm:p-6 flex items-start gap-4",
              billing.debt_amount > 0 ? "border-destructive/30 bg-destructive/5" : "border-success/30 bg-success/5",
            )}
          >
            <div
              className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
                billing.debt_amount > 0 ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success",
              )}
            >
              {billing.debt_amount > 0 ? <AlertTriangle className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />}
            </div>
            <div className="flex-1 min-w-0">
              <p
                className={cn(
                  "text-sm font-bold uppercase tracking-widest",
                  billing.debt_amount > 0 ? "text-destructive" : "text-success",
                )}
              >
                {billing.debt_amount > 0 ? t("student.paymentStatusDebt") : t("student.paymentStatusPaid")}
              </p>
              <p className="text-2xl sm:text-3xl font-extrabold text-foreground mt-1">
                {billing.credit_balance > 0
                  ? `+${formatUZS(billing.credit_balance)} UZS`
                  : billing.debt_amount > 0
                    ? `−${formatUZS(billing.debt_amount)} UZS`
                    : `0 UZS`}
              </p>
              {billing.debt_amount > 0 && billing.months_unpaid > 0 && (
                <p className="text-sm text-muted-foreground mt-1">
                  {billing.months_unpaid} × {formatUZS(billing.monthly_amount)} UZS
                </p>
              )}
              {billing.credit_balance > 0 && <p className="text-sm text-muted-foreground mt-1">{t("student.depositBalance")}</p>}
            </div>
          </div>
        )}

        {billing && (
          <div className="rounded-2xl border border-border/40 bg-card p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">{t("finance.depositBalance")}</p>
              <p className="text-sm font-bold text-foreground">{formatUZS(billing.credit_balance)} UZS</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{t("finance.depositProgress")}</span>
                <span>{paymentProgress}%</span>
              </div>
              <Progress value={paymentProgress} className="h-1.5" />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t("finance.totalCourseCost")}</span>
              <span>{formatUZS(billing.total_course_cost)} UZS</span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t("finance.remainingCourseCost")}</span>
              <span>{formatUZS(billing.max_deposit_amount)} UZS</span>
            </div>
            <p className="text-xs text-muted-foreground">{t("student.depositHelp")}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat icon={Wallet} label={t("student.monthly")} value={billing ? `${formatUZS(billing.monthly_amount)} UZS` : "—"} isLoading={isLoading} />
          <Stat icon={Receipt} label={t("student.totalDue")} value={billing ? `${formatUZS(billing.total_due)} UZS` : "—"} isLoading={isLoading} />
          <Stat icon={TrendingUp} label={t("student.totalPaid")} value={billing ? `${formatUZS(billing.total_paid)} UZS` : "—"} tone="success" isLoading={isLoading} />
          <Stat
            icon={CalendarDays}
            label={t("student.lastPayment")}
            value={billing?.last_payment_date ? formatDateOnly(`${billing.last_payment_date}T00:00:00`) : "—"}
            isLoading={isLoading}
          />
        </div>

        <div className="rounded-2xl border border-border/40 bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border/40">
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">{t("student.paymentLog")}</h2>
          </div>

          {isLoading ? (
            <div className="p-5 space-y-2">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : sortedPayments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/40">
                <Receipt className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground mt-3 text-center">{t("student.noPayments")}</p>
            </div>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/30 text-left">
                      <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{t("student.paidAt")}</th>
                      <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{timeColLabel}</th>
                      <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground text-right">{t("student.amount")}</th>
                      <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{t("student.method")}</th>
                      <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{t("student.course")}</th>
                      <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{commentColLabel}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {sortedPayments.map((p) => (
                      <tr key={p.id} className="hover:bg-muted/20 transition-colors align-top">
                        <td className="px-4 py-3 font-semibold text-foreground whitespace-nowrap">{formatDateOnly(p.created_at)}</td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatTimeOnly(p.created_at)}</td>
                        <td className="px-4 py-3 font-bold text-success text-right whitespace-nowrap">+{formatUZS(p.amount)} UZS</td>
                        <td className="px-4 py-3 text-muted-foreground">{methodText(p.method, t)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{p.course_name ?? p.group_code ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{p.note?.trim() || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden space-y-2 p-3">
                {sortedPayments.map((p) => (
                  <div key={p.id} className="rounded-xl border border-border/60 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">{formatDateOnly(p.created_at)}</p>
                      <p className="text-xs text-muted-foreground">{formatTimeOnly(p.created_at)}</p>
                      <p className="text-sm font-bold text-success">+{formatUZS(p.amount)} UZS</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{methodText(p.method, t)}</span>
                      <span>•</span>
                      <span>{p.course_name ?? p.group_code ?? "—"}</span>
                    </div>
                    <div className="rounded-lg bg-muted/30 p-2">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                        <MessageSquareText className="h-3.5 w-3.5" />
                        {commentColLabel}
                      </p>
                      <p className="text-xs text-foreground">{p.note?.trim() || "—"}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone = "primary",
  isLoading,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone?: "primary" | "success";
  isLoading?: boolean;
}) {
  const toneCls = tone === "success" ? "text-success" : "text-foreground";
  return (
    <div className="rounded-2xl border border-border/40 bg-card p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">{label}</p>
      </div>
      {isLoading ? <Skeleton className="h-7 w-24 mt-2" /> : <p className={cn("text-xl font-extrabold mt-2 leading-tight", toneCls)}>{value}</p>}
    </div>
  );
}
