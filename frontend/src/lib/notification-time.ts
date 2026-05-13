type TranslateFn = (key: string) => string;

const LANGUAGE_TO_LOCALE: Record<string, string> = {
  en: "en-US",
  ru: "ru-RU",
  uz: "uz-UZ",
};

function localeFor(language: string): string {
  return LANGUAGE_TO_LOCALE[language] ?? "en-US";
}

function formatTemplate(template: string, value: number): string {
  return template.replace("{n}", String(value));
}

function startOfLocalDayMs(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function localDayKey(input: string | Date): string {
  const date = input instanceof Date ? input : new Date(input);
  if (!Number.isFinite(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function notificationDayBucket(
  iso: string,
  nowMs: number = Date.now(),
): "today" | "yesterday" | "week" | "earlier" {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "earlier";

  const todayStart = startOfLocalDayMs(new Date(nowMs));
  const dayStart = startOfLocalDayMs(date);
  const diffDays = Math.floor((todayStart - dayStart) / 86_400_000);

  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays <= 6) return "week";
  return "earlier";
}

export function formatRelativeNotificationTime(
  iso: string,
  t: TranslateFn,
  language: string,
  nowMs: number = Date.now(),
): string {
  const date = new Date(iso);
  const ts = date.getTime();
  if (!Number.isFinite(ts)) return iso;

  const diffSeconds = Math.max(0, Math.floor((nowMs - ts) / 1000));
  if (diffSeconds < 60) return t("time.justNow");

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return formatTemplate(t("time.minutesAgo"), diffMinutes);
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return formatTemplate(t("time.hoursAgo"), diffHours);
  }

  if (diffHours < 48) return t("activity.yesterday");
  return date.toLocaleDateString(localeFor(language));
}
