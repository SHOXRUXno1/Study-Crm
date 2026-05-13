import { useNavigate } from "react-router-dom";

import { useLanguage } from "@/hooks/use-language";

interface GroupInfoSectionProps {
  course: string;
  courseId: number | null;
  teacher: string;
  teacherId: number | null;
  roomName: string | null;
  fillPercent: number;
  startDateLabel: string;
  endDateLabel: string;
}

export function GroupInfoSection({
  course,
  courseId,
  teacher,
  teacherId,
  roomName,
  fillPercent,
  startDateLabel,
  endDateLabel,
}: GroupInfoSectionProps) {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">{t("groups.course")}</p>
          <p
            className="font-medium text-primary cursor-pointer hover:underline"
            onClick={() => courseId && navigate(`/courses/${courseId}`)}
          >
            {course}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">{t("groups.teacher")}</p>
          <p
            className={teacherId ? "font-medium text-primary cursor-pointer hover:underline" : "font-medium text-foreground"}
            onClick={() => teacherId && navigate(`/teachers/${teacherId}`)}
          >
            {teacher}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">{t("groups.room")}</p>
          <p className="font-medium text-foreground">{roomName ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">{t("courses.enrollment")}</p>
          <div className="flex items-center gap-2">
            <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${fillPercent >= 90 ? "bg-destructive" : fillPercent >= 70 ? "bg-warning" : "bg-primary"}`}
                style={{ width: `${fillPercent}%` }}
              />
            </div>
            <span className="text-xs font-medium">{fillPercent}%</span>
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">{t("groups.schedule")}</p>
          <p className="font-medium text-foreground">{startDateLabel} — {endDateLabel}</p>
        </div>
      </div>
    </div>
  );
}
