export const EXPORT_ENDPOINT_AUDIT = [
  { id: "students", path: "frontend/src/pages/Students.tsx", formats: ["csv"] },
  { id: "teachers", path: "frontend/src/pages/Teachers.tsx", formats: ["csv"] },
  { id: "payments", path: "frontend/src/pages/Payments.tsx", formats: ["csv"] },
  { id: "debtors", path: "frontend/src/pages/DebtorsPage.tsx", formats: ["csv"] },
  { id: "analytics", path: "frontend/src/pages/Analytics.tsx", formats: ["csv"] },
  { id: "journal", path: "frontend/src/components/JournalTable.tsx", formats: ["csv", "pdf"] },
  { id: "schedule", path: "frontend/src/pages/SchedulePage.tsx", formats: ["ics"] },
] as const;

export const EXPORT_CONTRACT = {
  fileNamePattern: "<entity>-<date-range>-<generatedAt>.<format>",
  csvDelimiter: ";",
  csvEncoding: "UTF-8 with BOM",
  phaseFlow: ["idle", "preparing", "downloading", "success/error"],
  dateFormat: "yyyy-MM-dd",
} as const;
