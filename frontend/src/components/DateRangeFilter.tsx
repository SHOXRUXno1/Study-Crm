import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { CalendarIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLanguage } from "@/hooks/use-language";

export type PresetKey = "today" | "week" | "month" | "lastMonth";

interface DateRangeFilterProps {
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
  onChange: (from: Date | undefined, to: Date | undefined) => void;
  className?: string;
  fromLabel?: string;
  toLabel?: string;
  presets?: { key: PresetKey; label: string }[];
}

const PRESET_KEYS: { key: PresetKey; labelKey: string }[] = [
  { key: "today", labelKey: "date.today" },
  { key: "week", labelKey: "date.thisWeek" },
  { key: "month", labelKey: "date.thisMonth" },
  { key: "lastMonth", labelKey: "date.lastMonth" },
];

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export function computePresetRange(preset: PresetKey): { from: Date; to: Date } {
  const today = startOfDay(new Date());
  if (preset === "today") return { from: today, to: today };
  if (preset === "week") {
    const day = today.getDay(); // 0=Sun
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diff);
    return { from: startOfDay(monday), to: today };
  }
  if (preset === "month") {
    return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: today };
  }
  // lastMonth
  return {
    from: new Date(today.getFullYear(), today.getMonth() - 1, 1),
    to: new Date(today.getFullYear(), today.getMonth(), 0),
  };
}

function sameDay(a?: Date, b?: Date) {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function DateRangeFilter({
  dateFrom,
  dateTo,
  onChange,
  className,
  fromLabel,
  toLabel,
  presets,
}: DateRangeFilterProps) {
  const { t } = useLanguage();
  const fLabel = fromLabel ?? t("date.from");
  const tLabel = toLabel ?? t("date.to");
  const datePh = t("date.pickDate");
  const localizedPresets = useMemo(
    () => presets ?? PRESET_KEYS.map((p) => ({ key: p.key, label: t(p.labelKey) })),
    [presets, t]
  );
  const [activePreset, setActivePreset] = useState<PresetKey | null>(null);

  // Auto-detect active preset when external values match
  useEffect(() => {
    if (!dateFrom && !dateTo) {
      setActivePreset(null);
      return;
    }
    const match = localizedPresets.find((p) => {
      const r = computePresetRange(p.key);
      return sameDay(r.from, dateFrom) && sameDay(r.to, dateTo);
    });
    setActivePreset(match ? match.key : null);
  }, [dateFrom, dateTo, localizedPresets]);

  const handleFrom = (d: Date | undefined) => {
    const newTo = dateTo && d && d > dateTo ? undefined : dateTo;
    onChange(d, newTo);
  };

  const handleTo = (d: Date | undefined) => {
    onChange(dateFrom, d);
  };

  const applyPreset = (key: PresetKey) => {
    const r = computePresetRange(key);
    onChange(r.from, r.to);
  };

  const clear = () => onChange(undefined, undefined);

  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 flex-wrap", className)}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "w-full sm:w-[180px] justify-start text-left font-normal text-sm",
                !dateFrom && "text-muted-foreground",
                dateFrom && "border-primary text-primary",
              )}
            >
              <CalendarIcon className="mr-2 h-3.5 w-3.5" />
              {dateFrom ? `${fLabel}: ${format(dateFrom, "dd.MM.yyyy")}` : `${fLabel}: ${datePh}`}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dateFrom}
              onSelect={handleFrom}
              initialFocus
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>

        <span className="hidden sm:inline text-muted-foreground text-sm">→</span>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "w-full sm:w-[180px] justify-start text-left font-normal text-sm",
                !dateTo && "text-muted-foreground",
                dateTo && "border-primary text-primary",
              )}
            >
              <CalendarIcon className="mr-2 h-3.5 w-3.5" />
              {dateTo ? `${tLabel}: ${format(dateTo, "dd.MM.yyyy")}` : `${tLabel}: ${datePh}`}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dateTo}
              onSelect={handleTo}
              disabled={(date) => (dateFrom ? date < dateFrom : false)}
              initialFocus
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>

        {(dateFrom || dateTo) && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={clear}
            aria-label={t("date.clearDates")}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {localizedPresets.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => applyPreset(p.key)}
            className={cn(
              "px-2.5 py-1 rounded-full text-xs font-medium transition-colors border",
              activePreset === p.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
