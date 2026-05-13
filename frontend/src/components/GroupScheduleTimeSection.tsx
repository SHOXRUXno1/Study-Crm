import { useMemo, useState } from "react";
import { ArrowRight, ChevronDown, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/hooks/use-language";

/**
 * Standard lesson windows (single Select).
 * Each option maps to start_time / end_time sent to the API.
 */
const STANDARD_TIME_SLOTS: readonly { start: string; end: string }[] = [
  { start: "09:00", end: "10:30" },
  { start: "10:30", end: "12:00" },
  { start: "13:30", end: "15:00" },
  { start: "15:00", end: "16:30" },
  { start: "16:30", end: "18:00" },
];

const SLOT_VALUE_PREFIX = "slot:";

function slotValue(start: string, end: string): string {
  return `${SLOT_VALUE_PREFIX}${start}|${end}`;
}

function parseSlotValue(v: string): { start: string; end: string } | null {
  if (!v.startsWith(SLOT_VALUE_PREFIX)) return null;
  const rest = v.slice(SLOT_VALUE_PREFIX.length);
  const [start, end] = rest.split("|");
  if (!start || !end) return null;
  return { start, end };
}

function slotLabel(start: string, end: string): string {
  return `${start}\u2013${end}`;
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);

/** 5-minute grid; any odd minute from API is kept as an extra option. */
function minuteOptions(currentMinute: number): number[] {
  const step = 5;
  const base = Array.from({ length: 60 / step }, (_, i) => i * step);
  if (base.includes(currentMinute)) return base;
  return [...base, currentMinute].sort((a, b) => a - b);
}

function parseHm(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function splitHm(s: string): [number, number] {
  const total = parseHm(s);
  if (total === null) return [9, 0];
  return [Math.floor(total / 60), total % 60];
}

function joinHm(h: number, minute: number): string {
  const hh = Math.min(23, Math.max(0, h));
  const mm = Math.min(59, Math.max(0, minute));
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function lessonDurationMinutes(start: string, end: string): number | null {
  const a = parseHm(start);
  const b = parseHm(end);
  if (a === null || b === null || b <= a) return null;
  return b - a;
}

function TimePickerField({
  value,
  onChange,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [h, minute] = useMemo(() => splitHm(value), [value]);
  const minuteOpts = useMemo(() => minuteOptions(minute), [minute]);

  const display = parseHm(value) !== null ? value : "—";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-expanded={open}
          aria-haspopup="dialog"
          className={cn(
            "h-11 w-full justify-between gap-2 px-3 font-mono text-base font-semibold tabular-nums tracking-tight",
            invalid && "border-destructive text-destructive hover:text-destructive",
          )}
        >
          <span className="truncate">{display}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={6}
        collisionPadding={16}
        className="z-[200] w-[min(calc(100vw-2rem),280px)] border-border/80 p-3 shadow-lg"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("groups.pickTime")}
        </p>
        <div className="flex gap-3">
          <div className="grid min-w-0 flex-1 gap-1.5">
            <Label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("groups.hour")}
            </Label>
            <Select
              value={String(h)}
              onValueChange={(v) => onChange(joinHm(Number(v), minute))}
            >
              <SelectTrigger className="h-10 font-mono text-sm tabular-nums">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[250] max-h-52">
                {HOUR_OPTIONS.map((hour) => (
                  <SelectItem key={hour} value={String(hour)} className="font-mono tabular-nums">
                    {String(hour).padStart(2, "0")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid min-w-0 flex-1 gap-1.5">
            <Label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("groups.minute")}
            </Label>
            <Select
              value={String(minute)}
              onValueChange={(v) => onChange(joinHm(h, Number(v)))}
            >
              <SelectTrigger className="h-10 font-mono text-sm tabular-nums">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[250] max-h-52">
                {minuteOpts.map((mm) => (
                  <SelectItem key={mm} value={String(mm)} className="font-mono tabular-nums">
                    {String(mm).padStart(2, "0")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export interface GroupScheduleTimeSectionProps {
  startTime: string;
  endTime: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  invalidRange: boolean;
  className?: string;
}

export function GroupScheduleTimeSection({
  startTime,
  endTime,
  onStartChange,
  onEndChange,
  invalidRange,
  className,
}: GroupScheduleTimeSectionProps) {
  const { t } = useLanguage();
  const minutes = lessonDurationMinutes(startTime, endTime);

  const matchedSlotValue = useMemo(() => {
    const hit = STANDARD_TIME_SLOTS.find(
      (s) => s.start === startTime && s.end === endTime,
    );
    return hit ? slotValue(hit.start, hit.end) : undefined;
  }, [startTime, endTime]);

  return (
    <div
      className={cn(
        "rounded-xl border border-border/80 bg-gradient-to-b from-muted/40 to-muted/20 p-4 shadow-sm space-y-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Clock className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground leading-tight">
              {t("groups.lessonTimeSection")}
            </p>
            <p className="text-[11px] text-muted-foreground leading-snug">
              {t("groups.lessonTimeHint")}
            </p>
          </div>
        </div>
        {minutes !== null && (
          <span className="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-semibold tabular-nums text-primary">
            {minutes} {t("time.minShort")}
          </span>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t("groups.standardTimeSlot")}
        </Label>
        <Select
          key={`${startTime}|${endTime}`}
          value={matchedSlotValue}
          onValueChange={(v) => {
            const parsed = parseSlotValue(v);
            if (!parsed) return;
            onStartChange(parsed.start);
            onEndChange(parsed.end);
          }}
        >
          <SelectTrigger className="h-11 font-mono text-sm font-medium tabular-nums">
            <SelectValue placeholder={t("groups.slotPlaceholder")} />
          </SelectTrigger>
          <SelectContent className="z-[250]">
            {STANDARD_TIME_SLOTS.map(({ start, end }) => (
              <SelectItem
                key={slotValue(start, end)}
                value={slotValue(start, end)}
                className="font-mono text-sm tabular-nums"
              >
                {slotLabel(start, end)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5 rounded-lg border border-dashed border-border/70 bg-background/40 px-3 py-2.5">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {t("groups.manualTimeAdjust")}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="grid flex-1 gap-2 min-w-0">
            <Label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("groups.startTime")}
            </Label>
            <TimePickerField value={startTime} onChange={onStartChange} invalid={invalidRange} />
          </div>

          <div
            className="hidden shrink-0 items-center justify-center pb-2 text-muted-foreground/50 sm:flex"
            aria-hidden
          >
            <ArrowRight className="h-5 w-5" />
          </div>

          <div className="grid flex-1 gap-2 min-w-0">
            <Label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("groups.endTime")}
            </Label>
            <TimePickerField value={endTime} onChange={onEndChange} invalid={invalidRange} />
          </div>
        </div>
      </div>

      {invalidRange && (
        <p className="text-xs font-medium text-destructive">{t("groups.invalidTimeRange")}</p>
      )}
    </div>
  );
}
