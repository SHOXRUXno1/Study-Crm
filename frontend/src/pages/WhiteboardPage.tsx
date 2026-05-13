import { useMemo, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

import { DashboardLayout } from "@/components/DashboardLayout";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/use-language";
import { loadWhiteboard } from "@/hooks/use-whiteboard";
import { Whiteboard } from "@/components/whiteboard/Whiteboard";

export default function WhiteboardPage() {
  const { t } = useLanguage();
  const initial = useMemo(() => loadWhiteboard(), []);
  const [fullscreen, setFullscreen] = useState(false);

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-background">
        <Whiteboard initial={initial} />
        <button
          onClick={() => setFullscreen(false)}
          title={t("common.exitFullscreen")}
          className="absolute top-3 right-3 z-[60] flex items-center justify-center h-8 w-8 rounded-full bg-background/80 border border-border shadow-md text-muted-foreground hover:text-foreground transition-colors backdrop-blur-sm"
        >
          <Minimize2 className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100dvh-3.5rem)]">
        <div className="px-1 pt-2 pb-3 shrink-0">
          <Breadcrumbs items={[{ label: t("whiteboard.title") }]} />
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                {t("whiteboard.title")}
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                {t("whiteboard.subtitle")}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 shrink-0"
              onClick={() => setFullscreen(true)}
            >
              <Maximize2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("common.fullscreen")}</span>
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 rounded-2xl border border-border/40 bg-card overflow-hidden shadow-sm">
          <Whiteboard initial={initial} />
        </div>
      </div>
    </DashboardLayout>
  );
}
