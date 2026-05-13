import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { JournalTable } from "@/components/JournalTable";
import { useGroups } from "@/hooks/use-groups";

const STORAGE_KEY = "journal-selected-group";

function readStoredId(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export default function JournalPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const groupsQ = useGroups({ limit: 1000 });
  const items = groupsQ.data?.items ?? [];

  const orderedGroups = useMemo(() => {
    const ord = (s: string) => (s === "active" ? 0 : 1);
    return [...items].sort((a, b) => ord(a.status) - ord(b.status));
  }, [items]);

  const urlId = (() => {
    const v = Number(searchParams.get("group"));
    return Number.isFinite(v) && v > 0 ? v : null;
  })();
  const [groupId, setGroupId] = useState<number | null>(urlId ?? readStoredId());

  // Once groups load, validate the chosen id (or fall back to the first).
  useEffect(() => {
    if (orderedGroups.length === 0) return;
    const valid = new Set(orderedGroups.map((g) => g.id));
    if (groupId !== null && valid.has(groupId)) return;
    setGroupId(orderedGroups[0].id);
  }, [orderedGroups, groupId]);

  // Persist selection + reflect in URL.
  useEffect(() => {
    if (groupId == null) return;
    try {
      localStorage.setItem(STORAGE_KEY, String(groupId));
    } catch {
      // ignore
    }
    if (Number(searchParams.get("group")) !== groupId) {
      const next = new URLSearchParams(searchParams);
      next.set("group", String(groupId));
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  return (
    <DashboardLayout>
      <JournalTable
        selectedGroupId={groupId}
        onGroupChange={setGroupId}
        groups={orderedGroups}
        isLoadingGroups={groupsQ.isLoading}
      />
    </DashboardLayout>
  );
}
