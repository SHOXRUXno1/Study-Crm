import { Phone, GraduationCap, CalendarDays, CircleDot, User } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ru as ruLocale, uz as uzLocale, enUS as enLocale } from "date-fns/locale";
import type { Locale } from "date-fns";

import { DashboardLayout } from "@/components/DashboardLayout";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Skeleton } from "@/components/ui/skeleton";

import { useLanguage } from "@/hooks/use-language";
import { useMyProfile } from "@/hooks/use-me-student";

const DF_LOCALES: Record<string, Locale> = {
  ru: ruLocale,
  uz: uzLocale,
  en: enLocale,
};

export default function StudentSettingsPage() {
  const { t, language } = useLanguage();
  const dfLocale = DF_LOCALES[language] ?? ruLocale;

  const { data: profile, isLoading } = useMyProfile();

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6 max-w-4xl mx-auto">
        <Breadcrumbs items={[{ label: t("sidebar.settings") }]} />

        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
            {t("sidebar.settings")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("student.profileBlock")}
          </p>
        </div>

        <section className="rounded-2xl border border-border/40 bg-card p-4 sm:p-5">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : profile ? (
            <dl className="grid grid-cols-1 gap-3">
              <Field icon={User} label={t("student.myProfile")} value={profile.full_name} />
              <Field icon={Phone} label={t("student.credentialsLogin")} value={profile.phone ?? "—"} mono />
              <Field icon={Phone} label={t("student.parentPhone")} value={profile.parent_phone ?? "—"} mono />
              <Field icon={GraduationCap} label={t("student.group")} value={profile.group_code ?? "—"} />
              <Field icon={CircleDot} label={t("student.course")} value={profile.course_name ?? "—"} />
              <Field
                icon={CalendarDays}
                label={t("student.cabinetSince")}
                value={
                  profile.created_at
                    ? format(parseISO(profile.created_at), "d MMM yyyy", { locale: dfLocale })
                    : "—"
                }
              />
            </dl>
          ) : null}
        </section>
      </div>
    </DashboardLayout>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-muted/20 px-3 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted/60">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground/80 font-semibold">
          {label}
        </p>
        <p className={`mt-0.5 text-sm font-semibold text-foreground break-words ${mono ? "font-mono" : ""}`}>
          {value}
        </p>
      </div>
    </div>
  );
}
