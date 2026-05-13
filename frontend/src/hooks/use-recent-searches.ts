import { useCallback, useEffect, useState } from "react";

export type RecentKind =
  | "page"
  | "student"
  | "teacher"
  | "group"
  | "course"
  | "room";

export interface RecentEntry {
  kind: RecentKind;
  /** Stable id within `kind`. For pages — the path itself. */
  id: string;
  label: string;
  path: string;
  /** Unix ms */
  ts: number;
}

const STORAGE_KEY = "cmdk:recent:v1";
const MAX_ENTRIES = 8;

function readStorage(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is RecentEntry =>
        !!e &&
        typeof e === "object" &&
        typeof (e as RecentEntry).path === "string" &&
        typeof (e as RecentEntry).label === "string" &&
        typeof (e as RecentEntry).kind === "string",
    );
  } catch {
    return [];
  }
}

function writeStorage(entries: RecentEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore quota / privacy errors
  }
}

export function useRecentSearches() {
  const [recent, setRecent] = useState<RecentEntry[]>(() => readStorage());

  // Cross-tab sync — refresh from storage when another tab updates the list.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setRecent(readStorage());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const addRecent = useCallback((entry: Omit<RecentEntry, "ts">) => {
    setRecent((prev) => {
      const next: RecentEntry[] = [
        { ...entry, ts: Date.now() },
        ...prev.filter((e) => e.path !== entry.path),
      ].slice(0, MAX_ENTRIES);
      writeStorage(next);
      return next;
    });
  }, []);

  const clearRecent = useCallback(() => {
    writeStorage([]);
    setRecent([]);
  }, []);

  return { recent, addRecent, clearRecent } as const;
}
