import { ArrowLeft, Palmtree, Pencil, Trash2 } from "lucide-react";

import { Breadcrumbs } from "@/components/Breadcrumbs";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/use-language";

interface GroupHeaderSectionProps {
  code: string;
  status: "active" | "completed";
  course: string;
  teacher: string;
  isAdmin: boolean;
  onBack: () => void;
  onOpenVacation: () => void;
  onOpenEdit: () => void;
  onOpenDelete: () => void;
}

export function GroupHeaderSection({
  code,
  status,
  course,
  teacher,
  isAdmin,
  onBack,
  onOpenVacation,
  onOpenEdit,
  onOpenDelete,
}: GroupHeaderSectionProps) {
  const { t } = useLanguage();

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t("groups.title"), href: "/groups" },
          { label: code },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between -mt-2">
        <div className="flex items-start gap-3">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0 mt-0.5"
            onClick={onBack}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                {code}
              </h1>
              <StatusBadge status={status} />
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {course} · {teacher}
            </p>
          </div>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={onOpenVacation}>
              <Palmtree className="h-3.5 w-3.5" /> {t("groups.giveVacation")}
            </Button>
            <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={onOpenEdit}>
              <Pencil className="h-3.5 w-3.5" /> {t("groups.edit")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1.5 text-destructive hover:text-destructive"
              onClick={onOpenDelete}
            >
              <Trash2 className="h-3.5 w-3.5" /> {t("groups.delete")}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
