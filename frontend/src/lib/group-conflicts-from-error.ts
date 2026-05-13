import { ApiError } from "@/lib/api";
import type { ConflictHit } from "@/hooks/use-group-conflicts";

/** Parse 409 conflict list from FastAPI `detail.conflicts`. */
export function conflictsFromError(err: unknown): ConflictHit[] | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const detail = err.detail as { conflicts?: ConflictHit[] } | null | undefined;
  if (detail && Array.isArray(detail.conflicts) && detail.conflicts.length > 0) {
    return detail.conflicts;
  }
  return null;
}
