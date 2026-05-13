import { DashboardLayout } from "@/components/DashboardLayout";
import { useMemo, useState } from "react";
import { useLanguage } from "@/hooks/use-language";
import { useAnalyticsOverview } from "@/hooks/use-analytics";
import { Users, UsersRound, BarChart3, TrendingUp } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from "recharts";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const ALL_MONTHS_KEYS = [
  "months.jan","months.feb","months.mar","months.apr","months.may","months.jun",
  "months.jul","months.aug","months.sep","months.oct","months.nov","months.dec",
] as const;

const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const lastDayOf = (y: number, m: number) => new Date(y, m, 0).getDate();

const COURSE_PALETTE: Record<string, string> = {
  "IELTS": "hsl(234 62% 50%)",
  "Pre-IELTS": "hsl(190 70% 45%)",
  "English": "hsl(152 60% 42%)",
  "Grammar": "hsl(38 92% 50%)",
  "KIDS' English": "hsl(280 60% 50%)",
  "CEFR": "hsl(0 72% 55%)",
};

const courseColor = (name: string): string => {
  if (COURSE_PALETTE[name]) return COURSE_PALETTE[name];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h} 65% 48%)`;
};

interface ChartPayload { color?: string; fill?: string; value?: number | string; name?: string; }
const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: ChartPayload[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-lg">
      {label && <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: p.color || p.fill }} />
          {p.name}: {typeof p.value === "number" ? p.value.toLocaleString("ru-RU") : p.value}
        </p>
      ))}
    </div>
  );
};

function ManagerAnalyticsContent() {
  const { t } = useLanguage();
  const today = useMemo(() => new Date(), []);
  const currentYear = today.getFullYear();
  const yearOptions = useMemo(() => {
    const arr: number[] = [];
    for (let y = currentYear; y >= currentYear - 3; y--) arr.push(y);
    return arr;
  }, [currentYear]);

  const [year, setYear] = useState<number>(currentYear);
  const [month, setMonth] = useState<number>(0);

  const { fromIso, toIso } = useMemo(() => {
    if (month === 0) {
      const from = isoOf(year, 1, 1);
      const last = year === currentYear
        ? `${currentYear}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
        : isoOf(year, 12, 31);
      return { fromIso: from, toIso: last };
    }
    const from = isoOf(year, month, 1);
    const to = year === currentYear && month === today.getMonth() + 1
      ? `${currentYear}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
      : isoOf(year, month, lastDayOf(year, month));
    return { fromIso: from, toIso: to };
  }, [year, month, currentYear, today]);

  const { data, isLoading } = useAnalyticsOverview({ from: fromIso, to: toIso });

  const studentChartData = useMemo(() => {
    if (!data) return [];
    return data.revenue_by_month.map((p) => {
      const [y, m] = p.month.split("-");
      const monthIdx = Math.max(0, Math.min(11, parseInt(m, 10) - 1));
      return {
        label: `${t(ALL_MONTHS_KEYS[monthIdx])} ${y.slice(2)}`,
        students: data.kpis.students_active,
      };
    });
  }, [data, t]);

  const attendanceData = useMemo(() => {
    if (!data) return [];
    return data.top_groups_attendance.slice(0, 8).map((g) => ({
      name: g.code,
      rate: g.rate_pct,
      course: g.course_name,
    }));
  }, [data]);

  const courseDistData = useMemo(() => {
    if (!data) return [];
    return data.revenue_by_course
      .filter((r) => r.revenue > 0)
      .map((r) => ({ name: r.course_name, value: r.revenue, color: courseColor(r.course_name) }));
  }, [data]);

  const kpis = data?.kpis;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("managerAnalytics.title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Статистика без финансовых данных</p>
        </div>
        <div className="flex gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Весь год</SelectItem>
              {ALL_MONTHS_KEYS.map((k, i) => (
                <SelectItem key={i} value={String(i + 1)}>{t(k)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { icon: Users, label: "Активные ученики", value: kpis?.students_active ?? "—", color: "bg-blue-500" },
          { icon: UsersRound, label: "Активные группы", value: kpis?.groups_active ?? "—", color: "bg-emerald-500" },
          { icon: BarChart3, label: "Всего должников", value: kpis?.debtors_count ?? "—", color: "bg-amber-500" },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="rounded-xl border bg-card p-4 shadow-sm flex items-start gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color}`}>
              <Icon className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold">{isLoading ? "…" : value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Attendance by group */}
      <div className="rounded-xl border bg-card shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-sm">Посещаемость по группам</h2>
        </div>
        {isLoading ? (
          <div className="h-48 bg-muted animate-pulse rounded-lg" />
        ) : attendanceData.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-10">Нет данных</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={attendanceData} layout="vertical" margin={{ left: 20, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
              <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 11 }} />
              <RTooltip content={<CustomTooltip />} formatter={(v) => [`${v}%`, "Посещаемость"]} />
              <Bar dataKey="rate" name="Посещаемость" radius={[0, 4, 4, 0]}>
                {attendanceData.map((_, i) => (
                  <Cell key={i} fill={`hsl(${152 + i * 15} 60% ${42 + i * 2}%)`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Course distribution (by student count placeholder via revenue_by_course) */}
      {courseDistData.length > 0 && (
        <div className="rounded-xl border bg-card shadow-sm p-5">
          <h2 className="font-semibold text-sm mb-4">Распределение по курсам</h2>
          <div className="flex flex-wrap gap-3">
            {courseDistData.map((c) => (
              <div key={c.name} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <span className="h-3 w-3 rounded-full shrink-0" style={{ background: c.color }} />
                <span className="font-medium">{c.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ManagerAnalytics() {
  return (
    <DashboardLayout>
      <ManagerAnalyticsContent />
    </DashboardLayout>
  );
}
