import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

interface KpiCardProps {
  title: string;
  value: string;
  change: string;
  changeType: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  accentColor?: "indigo" | "emerald" | "amber" | "rose";
}

const accentMap = {
  indigo: {
    iconBg: "bg-primary/10",
    iconText: "text-primary",
    bar: "from-primary to-primary/60",
    glow: "var(--shadow-glow-primary)",
    gradient: "from-primary/[0.03] via-transparent to-transparent",
  },
  emerald: {
    iconBg: "bg-success/10",
    iconText: "text-success",
    bar: "from-success to-success/60",
    glow: "var(--shadow-glow-success)",
    gradient: "from-success/[0.03] via-transparent to-transparent",
  },
  amber: {
    iconBg: "bg-warning/10",
    iconText: "text-warning",
    bar: "from-warning to-warning/60",
    glow: "var(--shadow-glow-warning)",
    gradient: "from-warning/[0.03] via-transparent to-transparent",
  },
  rose: {
    iconBg: "bg-destructive/10",
    iconText: "text-destructive",
    bar: "from-destructive to-destructive/60",
    glow: "var(--shadow-glow-destructive)",
    gradient: "from-destructive/[0.03] via-transparent to-transparent",
  },
};

export function KpiCard({ title, value, change, changeType, icon: Icon, accentColor = "indigo" }: KpiCardProps) {
  const accent = accentMap[accentColor];
  const { t } = useLanguage();

  return (
    <div
      className="group relative overflow-hidden rounded-2xl border border-border/40 bg-card p-4 sm:p-6 transition-all duration-300 hover:-translate-y-1 animate-fade-in"
      style={{ boxShadow: 'var(--shadow-card)' }}
      onMouseEnter={(e) => e.currentTarget.style.boxShadow = `var(--shadow-card-hover), ${accent.glow}`}
      onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'var(--shadow-card)'}
    >
      {/* Top gradient bar */}
      <div className={cn("absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r", accent.bar)} />
      {/* Background gradient */}
      <div className={cn("absolute inset-0 bg-gradient-to-br pointer-events-none", accent.gradient)} />

      <div className="relative flex items-start justify-between">
        <div className="space-y-2 sm:space-y-3 min-w-0 flex-1">
          <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-widest text-muted-foreground truncate">{title}</p>
          <p className="text-2xl sm:text-[2rem] font-extrabold tracking-tight text-card-foreground animate-count-up leading-none">{value}</p>
          {change ? (
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              {changeType === "positive" ? (
                <div className="flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1">
                  <TrendingUp className="h-3 w-3 text-success" />
                  <span className="text-[11px] font-bold text-success">{change}</span>
                </div>
              ) : changeType === "negative" ? (
                <div className="flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1">
                  <TrendingDown className="h-3 w-3 text-destructive" />
                  <span className="text-[11px] font-bold text-destructive">{change}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 rounded-full bg-muted/50 px-2.5 py-1">
                  <span className="text-[11px] font-bold text-muted-foreground">{change}</span>
                </div>
              )}
              <span className="text-[10px] sm:text-xs text-muted-foreground hidden sm:inline">{t("dashboard.vsLastMonth")}</span>
            </div>
          ) : null}
        </div>
        <div className={cn("hidden sm:flex h-12 w-12 items-center justify-center rounded-2xl transition-all duration-300 group-hover:scale-110 group-hover:shadow-md", accent.iconBg)}>
          <Icon className={cn("h-5 w-5", accent.iconText)} strokeWidth={2} />
        </div>
      </div>
    </div>
  );
}
