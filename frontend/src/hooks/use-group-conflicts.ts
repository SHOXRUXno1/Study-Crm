import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import type { DaysType } from "@/hooks/use-groups";

// ── Types ──────────────────────────────────────────────────────────────────

export type ConflictKind = "teacher" | "room";

export interface ConflictHit {
  kind: ConflictKind;
  group_id: number;
  group_code: string;
  teacher_name: string | null;
  room_name: string | null;
  days: string;
  /** "HH:MM:SS" */
  start_time: string;
  end_time: string;
  /** "YYYY-MM-DD" */
  start_date: string;
  end_date: string;
  overlap_start: string;
  overlap_end: string;
}

export interface ConflictCheckResponse {
  conflicts: ConflictHit[];
}

export interface ConflictCheckPayload {
  days: DaysType;
  /** "HH:MM" or "HH:MM:SS" */
  start_time: string;
  end_time: string;
  start_date: string;
  end_date: string;
  teacher_id: number | null;
  room_id: number | null;
  exclude_group_id?: number | null;
}

// ── Query ──────────────────────────────────────────────────────────────────

const conflictKeys = {
  all: ["group-conflicts"] as const,
  check: (payload: ConflictCheckPayload | null) =>
    ["group-conflicts", "check", payload] as const,
};

/** Returns true when the payload has enough data to make a meaningful query. */
export function isConflictPayloadReady(p: ConflictCheckPayload | null): p is ConflictCheckPayload {
  if (!p) return false;
  if (!p.days || !p.start_time || !p.end_time) return false;
  if (!p.start_date || !p.end_date) return false;
  if (p.start_time >= p.end_time) return false;
  if (p.end_date < p.start_date) return false;
  // Nothing to clash on if neither resource is selected.
  if (p.teacher_id == null && p.room_id == null) return false;
  return true;
}

/** Live conflict preview. Skips the network call when the payload isn't ready. */
export function useGroupConflicts(payload: ConflictCheckPayload | null) {
  const ready = isConflictPayloadReady(payload);
  return useQuery<ConflictCheckResponse>({
    queryKey: conflictKeys.check(payload),
    queryFn: () =>
      apiClient.post<ConflictCheckResponse>("/groups/check-conflicts", payload),
    enabled: ready,
    staleTime: 5_000,
    // Quiet during the user's typing — no retries on a soft endpoint.
    retry: false,
    refetchOnWindowFocus: false,
  });
}
