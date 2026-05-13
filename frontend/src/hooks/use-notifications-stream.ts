import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { getApiBaseUrl, getToken } from "@/lib/api";
import {
  notificationKeys,
  type NotificationListResponse,
  type NotificationRead,
  type UnreadCount,
} from "@/hooks/use-notifications";

/** ── Real-time notifications via Server-Sent Events ─────────────────────
 *
 * Mounts ONCE at the top of the authenticated layout. Behaviour:
 * * Opens a single EventSource per token. Closes & reopens on token change.
 * * On each ``notification`` event:
 *     - Updates the "list" cache directly (instant UI, no extra HTTP round-trip).
 *     - Bumps the unread counter by 1 (rolled back if the server says otherwise).
 *     - Schedules a single coalesced ``invalidate`` for accuracy after 800 ms
 *       so any minor cache divergence is reconciled.
 *     - Pops a clickable toast.
 * * Browser handles reconnect automatically; we also force a full
 *   ``invalidateQueries`` on every reconnect to catch up on missed events.
 * * Listens for the global ``auth:expired`` event to close the stream early.
 */
export function useNotificationsStream(enabled: boolean) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const sourceRef = useRef<EventSource | null>(null);
  const reconcileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const token = getToken();
    if (!token) return;

    const url = `${getApiBaseUrl()}/notifications/stream?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    sourceRef.current = es;

    const scheduleReconcile = () => {
      if (reconcileTimerRef.current) clearTimeout(reconcileTimerRef.current);
      reconcileTimerRef.current = setTimeout(() => {
        qc.invalidateQueries({ queryKey: notificationKeys.all });
      }, 800);
    };

    es.addEventListener("ready", () => {
      // Connection is live: refresh once to catch up on anything we missed
      // while reconnecting (or on first connect since last open).
      qc.invalidateQueries({ queryKey: notificationKeys.all });
    });

    es.addEventListener("notification", (rawEv) => {
      const ev = rawEv as MessageEvent<string>;
      let n: NotificationRead | null = null;
      try {
        n = JSON.parse(ev.data) as NotificationRead;
      } catch {
        return;
      }
      if (!n) return;

      // 1. Optimistic merge into every list query we already have cached.
      qc.setQueriesData<NotificationListResponse | undefined>(
        { queryKey: ["notifications", "list"] },
        (prev) => {
          if (!prev) return prev;
          // Skip if we already have this id (defensive against duplicates).
          if (prev.items.some((x) => x.id === n!.id)) return prev;
          return {
            items: [n!, ...prev.items],
            total: prev.total + 1,
            unread: prev.unread + 1,
          };
        },
      );

      // 2. Bump unread counter cache.
      qc.setQueryData<UnreadCount>(notificationKeys.unread(), (prev) =>
        prev ? { unread: prev.unread + 1 } : { unread: 1 },
      );

      // 3. Schedule reconcile to keep caches honest.
      scheduleReconcile();

      // 4. Toast — clickable when there's a link.
      const tToast = toast.message(n.title, {
        description: n.body ?? undefined,
        action: n.link
          ? {
              label: "→",
              onClick: () => {
                navigate(n!.link!);
                toast.dismiss(tToast);
              },
            }
          : undefined,
      });

      // 5. Inform the rest of the app (e.g. for bell shake animation).
      window.dispatchEvent(
        new CustomEvent("notifications:new", { detail: n }),
      );
    });

    es.onerror = () => {
      // EventSource auto-reconnects; we just trigger a reconcile when it
      // succeeds (the next "ready" handler will fire on reconnect).
    };

    const onAuthExpired = () => {
      es.close();
      sourceRef.current = null;
    };
    window.addEventListener("auth:expired", onAuthExpired);

    return () => {
      window.removeEventListener("auth:expired", onAuthExpired);
      if (reconcileTimerRef.current) {
        clearTimeout(reconcileTimerRef.current);
        reconcileTimerRef.current = null;
      }
      es.close();
      sourceRef.current = null;
    };
  }, [enabled, qc, navigate]);
}
