import { downloadCsv, downloadTextFile, type CsvBuildOptions } from "@/lib/export-kit";
import type { ExportPhase } from "@/lib/export/types";

export interface ExportTask {
  run: () => void | Promise<void>;
  onPhaseChange?: (phase: ExportPhase) => void;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export async function runExportTask(task: ExportTask): Promise<void> {
  task.onPhaseChange?.("preparing");
  try {
    await Promise.resolve();
    task.onPhaseChange?.("downloading");
    await task.run();
    task.onPhaseChange?.("success");
    task.onSuccess?.();
  } catch (error) {
    task.onPhaseChange?.("error");
    task.onError?.(error instanceof Error ? error : new Error("Export failed"));
  }
}

export function runCsvExport(payload: CsvBuildOptions & { filename: string }): void {
  downloadCsv(payload);
}

export function runTextExport(content: string, mimeType: string, filename: string): void {
  downloadTextFile(content, mimeType, filename);
}
