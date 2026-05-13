import { Download, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ExportPhase } from "@/lib/export";

interface ExportActionButtonProps {
  phase: ExportPhase;
  onClick: () => void;
  label: string;
}

export function ExportActionButton({ phase, onClick, label }: ExportActionButtonProps) {
  const icon = phase === "preparing" || phase === "downloading"
    ? <Loader2 className="h-4 w-4 animate-spin" />
    : phase === "success"
      ? <CheckCircle2 className="h-4 w-4" />
      : phase === "error"
        ? <AlertTriangle className="h-4 w-4" />
        : <Download className="h-4 w-4" />;

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-2"
      onClick={onClick}
      disabled={phase === "preparing" || phase === "downloading"}
    >
      {icon}
      {label}
    </Button>
  );
}
