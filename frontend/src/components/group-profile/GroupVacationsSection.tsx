import { CalendarDays, Palmtree, X } from "lucide-react";

import { useLanguage } from "@/hooks/use-language";
import type { VacationRead } from "@/hooks/use-groups";

interface GroupVacationsSectionProps {
  isAdmin: boolean;
  language: string;
  vacations: VacationRead[];
  onDeleteVacation: (vacationId: number) => void;
}

export function GroupVacationsSection({
  isAdmin,
  language,
  vacations,
  onDeleteVacation,
}: GroupVacationsSectionProps) {
  const { t } = useLanguage();
  if (!isAdmin || vacations.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Palmtree className="h-4 w-4 text-amber-500" />
        <h3 className="text-sm font-semibold text-foreground">{t("groups.vacations")}</h3>
      </div>
      <div className="flex flex-wrap gap-2">
        {vacations.map((v) => (
          <div
            key={v.id}
            className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-1.5 text-xs"
          >
            <CalendarDays className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="font-medium text-foreground">
              {new Date(v.vacation_date).toLocaleDateString(
                language === "ru" ? "ru-RU" : language === "uz" ? "uz-UZ" : "en-US",
                { day: "numeric", month: "short", year: "numeric" },
              )}
            </span>
            {v.note && <span className="text-muted-foreground">— {v.note}</span>}
            <button
              className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
              onClick={() => onDeleteVacation(v.id)}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
