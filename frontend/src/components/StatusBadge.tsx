import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

type Status = "active" | "inactive" | "paid" | "debt" | "absent" | "present" | "late" | "excused" | "completed";

const statusStyles: Record<Status, string> = {
  active: "bg-success/10 text-success border-success/20",
  inactive: "bg-muted text-muted-foreground border-muted",
  paid: "bg-success/10 text-success border-success/20",
  debt: "bg-destructive/10 text-destructive border-destructive/20",
  absent: "bg-destructive/10 text-destructive border-destructive/20",
  present: "bg-success/10 text-success border-success/20",
  late: "bg-warning/10 text-warning border-warning/20",
  excused: "bg-muted text-muted-foreground border-muted",
  completed: "bg-muted text-muted-foreground border-muted",
};

export function StatusBadge({ status }: { status: Status }) {
  const { t } = useLanguage();

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
        statusStyles[status]
      )}
    >
      {t(`status.${status}`)}
    </span>
  );
}
