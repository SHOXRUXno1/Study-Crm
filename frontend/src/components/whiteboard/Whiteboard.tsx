import { Suspense, lazy, useCallback, useEffect, useMemo, useRef } from "react";
import { Loader2 } from "lucide-react";

import "@excalidraw/excalidraw/index.css";

import { useTheme } from "@/hooks/use-theme";
import { useLanguage } from "@/hooks/use-language";
import { saveWhiteboard, type WhiteboardData } from "@/hooks/use-whiteboard";

const ExcalidrawLazy = lazy(() =>
  import("@excalidraw/excalidraw").then((m) => ({ default: m.Excalidraw })),
);

interface WhiteboardProps {
  initial: WhiteboardData;
}

const DEBOUNCE_MS = 1500;

const APP_STATE_DROP = new Set<string>([
  "collaborators",
  "selectedElementIds",
  "selectedGroupIds",
  "editingElement",
  "editingGroupId",
  "draggingElement",
  "resizingElement",
  "multiElement",
  "contextMenu",
  "cursorButton",
  "pendingImageElementId",
  "showHyperlinkPopup",
  "selectedLinearElement",
  "snapLines",
  "originSnapOffset",
  "isResizing",
  "isRotating",
  "openMenu",
  "openPopup",
  "openSidebar",
  "openDialog",
  "errorMessage",
  "toast",
]);

function pruneAppState(
  appState: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!appState) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(appState)) {
    if (APP_STATE_DROP.has(k)) continue;
    out[k] = v;
  }
  return out;
}

function sceneSignature(elements: readonly unknown[]): string {
  let acc = 0;
  for (const el of elements) {
    const v = (el as { version?: number } | null)?.version ?? 0;
    acc = ((acc * 31) + v) | 0;
  }
  return `${elements.length}:${acc}`;
}

function langCodeFor(lang: string): string {
  if (lang === "ru") return "ru-RU";
  if (lang === "uz") return "uz-UZ";
  return "en";
}

export function Whiteboard({ initial }: WhiteboardProps) {
  const { theme } = useTheme();
  const { language } = useLanguage();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSigRef = useRef<string>(sceneSignature(initial.elements ?? []));
  const pendingRef = useRef<WhiteboardData | null>(null);

  const initialData = useMemo(
    () => ({
      elements: (initial.elements ?? []) as never,
      appState: (initial.appState ?? {}) as never,
      files: (initial.files ?? {}) as never,
      scrollToContent: true,
    }),
    [initial],
  );

  const flush = useCallback(() => {
    const payload = pendingRef.current;
    if (!payload) return;
    pendingRef.current = null;
    saveWhiteboard(payload);
  }, []);

  const handleChange = useCallback(
    (
      elements: readonly unknown[],
      appState: Record<string, unknown>,
      files: Record<string, unknown>,
    ) => {
      const sig = sceneSignature(elements);
      if (sig === lastSigRef.current) return;
      lastSigRef.current = sig;

      pendingRef.current = {
        elements: elements as unknown[],
        appState: pruneAppState(appState),
        files,
      };

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(flush, DEBOUNCE_MS);
    },
    [flush],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="relative w-full h-full">
      <Suspense
        fallback={
          <div className="w-full h-full flex items-center justify-center bg-card">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <ExcalidrawLazy
          initialData={initialData}
          theme={theme}
          langCode={langCodeFor(language)}
          onChange={handleChange}
        />
      </Suspense>
    </div>
  );
}
