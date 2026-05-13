import { Clock, Users, DollarSign, CalendarDays, Hourglass } from "lucide-react";

import { useLanguage } from "@/hooks/use-language";

interface GroupStatsSectionProps {
  currentCount: number;
  maxStudents: number;
  daysLabel: string;
  timeSlot: string;
  monthlyPrice: string;
  totalPrice: string;
  daysLeft: number;
  progressPercent: number;
  startDateLabel: string;
  endDateLabel: string;
}

export function GroupStatsSection({
  currentCount,
  maxStudents,
  daysLabel,
  timeSlot,
  monthlyPrice,
  totalPrice,
  daysLeft,
  progressPercent,
  startDateLabel,
  endDateLabel,
}: GroupStatsSectionProps) {
  const { t } = useLanguage();
  const dayUnit = t("groups.dayUnit");
  const daysLeftLabel = t("groups.daysLeft");

  const cards = [
    { label: t("groups.studentsCol"), value: `${currentCount}/${maxStudents}`, icon: Users, color: "text-primary" },
    { label: t("groups.days"), value: daysLabel, icon: CalendarDays, color: "text-emerald-600" },
    { label: t("groups.timeSlot"), value: timeSlot, icon: Clock, color: "text-amber-600" },
    { label: t("groups.pricePerMonth"), value: monthlyPrice, icon: DollarSign, color: "text-violet-600" },
    { label: t("groups.totalCost"), value: totalPrice, icon: DollarSign, color: "text-indigo-600" },
    {
      label: daysLeft > 0 ? daysLeftLabel : t("groups.completed"),
      value: daysLeft > 0 ? `${daysLeft} ${dayUnit}` : "✓",
      icon: Hourglass,
      color: daysLeft > 0 ? "text-blue-600" : "text-emerald-600",
    },
  ];

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map((kpi, i) => (
          <div
            key={kpi.label}
            className="rounded-xl border border-border/60 bg-card p-3 sm:p-4 shadow-sm animate-fade-in"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
              <span className="text-[10px] sm:text-xs text-muted-foreground">{kpi.label}</span>
            </div>
            <p className="text-lg sm:text-xl font-bold text-foreground truncate">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">{t("groups.courseProgress")}</span>
          <span className="text-xs font-semibold text-foreground">{progressPercent}%</span>
        </div>
        <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              progressPercent >= 100 ? "bg-emerald-500" : progressPercent >= 75 ? "bg-amber-500" : "bg-primary"
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[10px] text-muted-foreground">{startDateLabel}</span>
          <span className="text-[10px] text-muted-foreground">{endDateLabel}</span>
        </div>
      </div>
    </>
  );
}
