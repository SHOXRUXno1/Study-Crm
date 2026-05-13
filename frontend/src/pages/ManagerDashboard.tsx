import { DashboardLayout } from "@/components/DashboardLayout";
import { useManagerSummary } from "@/hooks/use-managers";
import { useLanguage } from "@/hooks/use-language";
import { useNavigate } from "react-router-dom";
import { Users, UsersRound, UserCheck, CalendarDays, AlertTriangle, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function formatCurrency(n: number) {
  return n.toLocaleString("ru-RU") + " сум";
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm flex items-start gap-4">
      <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", color ?? "bg-primary/10")}>
        <Icon className={cn("h-5 w-5", color ? "text-white" : "text-primary")} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-muted-foreground font-medium">{label}</p>
        <p className="text-2xl font-bold mt-0.5">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function ManagerDashboardContent() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { data, isLoading } = useManagerSummary();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-64 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("managerDash.title")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Обзор ключевых показателей</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={Users}
          label={t("managerDash.kpiStudents")}
          value={data.total_students}
          sub={`${data.active_students} ${t("managerDash.activeOf")} ${data.total_students}`}
          color="bg-blue-500"
        />
        <KpiCard
          icon={UsersRound}
          label={t("managerDash.kpiGroups")}
          value={data.total_groups}
          sub={`${data.active_groups} активных`}
          color="bg-emerald-500"
        />
        <KpiCard
          icon={UserCheck}
          label={t("managerDash.kpiTeachers")}
          value={data.total_teachers}
          color="bg-violet-500"
        />
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground font-medium">Уроки</p>
          </div>
          <div className="flex gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Сегодня</p>
              <p className="text-xl font-bold">{data.upcoming_lessons_today}</p>
            </div>
            <div className="border-l pl-4">
              <p className="text-xs text-muted-foreground">Завтра</p>
              <p className="text-xl font-bold">{data.upcoming_lessons_tomorrow}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Debtors */}
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <h2 className="font-semibold text-sm">{t("managerDash.topDebtors")}</h2>
            </div>
            <button
              onClick={() => navigate("/debtors")}
              className="text-xs text-primary hover:underline"
            >
              Все должники →
            </button>
          </div>
          <div className="divide-y">
            {data.top_debtors.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">{t("managerDash.noDebtors")}</p>
            ) : (
              data.top_debtors.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => navigate(`/students/${d.id}`)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{d.full_name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground truncate">{d.group_code} · {d.course_name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-destructive">{formatCurrency(d.debt_amount)}</p>
                    <p className="text-[10px] text-muted-foreground">{d.overdue_days} дн.</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Students */}
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-sm">{t("managerDash.newStudents")}</h2>
            </div>
            <button
              onClick={() => navigate("/students")}
              className="text-xs text-primary hover:underline"
            >
              Все ученики →
            </button>
          </div>
          <div className="divide-y">
            {data.recent_students.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">{t("managerDash.noStudents")}</p>
            ) : (
              data.recent_students.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => navigate(`/students/${s.id}`)}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-xs">
                    {(s.full_name ?? "?")[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{s.full_name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground truncate">{s.group_code ?? "Без группы"} · {s.course_name}</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground shrink-0">
                    {new Date(s.created_at).toLocaleDateString("ru-RU")}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ManagerDashboard() {
  return (
    <DashboardLayout>
      <ManagerDashboardContent />
    </DashboardLayout>
  );
}
