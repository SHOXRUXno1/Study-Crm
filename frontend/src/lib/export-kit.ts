import { formatNumber } from "@/lib/utils";

export type CsvCell = string | number | boolean | null | undefined;
export type CsvRow = CsvCell[];

export interface CsvBuildOptions {
  header: string[];
  rows: CsvRow[];
  delimiter?: "," | ";";
  includeBom?: boolean;
}

export interface ExportFileNameOptions {
  entity: string;
  extension: string;
  rangeLabel?: string;
  generatedAt?: Date;
  includeTime?: boolean;
}

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

function dateToken(date: Date, includeTime: boolean): string {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  if (!includeTime) return `${y}${m}${d}`;
  const hh = pad2(date.getHours());
  const mm = pad2(date.getMinutes());
  return `${y}${m}${d}-${hh}${mm}`;
}

function csvEscape(value: CsvCell): string {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function buildExportFileName(options: ExportFileNameOptions): string {
  const now = options.generatedAt ?? new Date();
  const includeTime = options.includeTime ?? true;
  const entity = toFileToken(options.entity) || "export";
  const range = toFileToken(options.rangeLabel ?? "all");
  return `${entity}-${range}-${dateToken(now, includeTime)}.${toFileToken(options.extension)}`;
}

export function buildCsvContent(options: CsvBuildOptions): string {
  const delimiter = options.delimiter ?? ";";
  const rows = [options.header, ...options.rows]
    .map((row) => row.map(csvEscape).join(delimiter))
    .join("\r\n");
  if (options.includeBom ?? true) {
    return `\uFEFF${rows}`;
  }
  return rows;
}

export function downloadCsv(options: CsvBuildOptions & { filename: string }): void {
  const content = buildCsvContent(options);
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, options.filename);
}

export function downloadTextFile(content: string, mimeType: string, filename: string): void {
  const blob = new Blob([content], { type: mimeType });
  triggerDownload(blob, filename);
}

export function formatExportDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function formatExportDateTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  return `${formatExportDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatExportAmount(value: number | null | undefined): string {
  return formatNumber(value ?? 0);
}
