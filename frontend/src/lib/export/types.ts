export type ExportFormat = "csv" | "pdf" | "ics";

export type ExportPhase = "idle" | "preparing" | "downloading" | "success" | "error";

export interface ExportColumn {
  key: string;
  label: string;
  enabledByDefault?: boolean;
}

export interface ExportSortOption {
  value: string;
  label: string;
}

export interface ExportFilterSummaryItem {
  label: string;
  value: string;
}

export interface ExportCenterState {
  format: ExportFormat;
  columns: string[];
  sort: string;
  scope: "filtered" | "all";
}

export interface ExportFileNameOptions {
  entity: string;
  format: ExportFormat;
  rangeLabel?: string;
  generatedAt?: Date;
}
