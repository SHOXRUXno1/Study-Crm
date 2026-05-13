import type { CsvCell, CsvRow } from "@/lib/export-kit";
import type { ExportFileNameOptions, ExportFilterSummaryItem } from "@/lib/export/types";

function toFileToken(value: string): string {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function dateToken(date: Date): string {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const mm = pad2(date.getMinutes());
  return `${y}${m}${d}-${hh}${mm}`;
}

export function buildUnifiedExportFileName(options: ExportFileNameOptions): string {
  const now = options.generatedAt ?? new Date();
  const entity = toFileToken(options.entity) || "export";
  const range = toFileToken(options.rangeLabel ?? "all");
  return `${entity}-${range}-${dateToken(now)}.${options.format}`;
}

export function buildFilterRangeLabel(items: ExportFilterSummaryItem[]): string {
  if (items.length === 0) return "all";
  return `${items.length}-filters`;
}

export function normalizeCsvValue(value: CsvCell): string {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

export function pickColumns(header: string[], rows: CsvRow[], enabledColumnIndexes: number[]): { header: string[]; rows: CsvRow[] } {
  if (enabledColumnIndexes.length === 0) {
    return { header, rows };
  }
  const indexSet = new Set(enabledColumnIndexes);
  const filteredHeader = header.filter((_, idx) => indexSet.has(idx));
  const filteredRows = rows.map((row) => row.filter((_, idx) => indexSet.has(idx)));
  return { header: filteredHeader, rows: filteredRows };
}
