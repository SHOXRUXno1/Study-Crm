import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const NUMBER_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

export function sanitizeNumberInput(text: string): string {
  return (text ?? "").replace(/\D/g, "");
}

export function parseFormattedNumber(text: string): number {
  const digits = sanitizeNumberInput(text);
  if (!digits) return 0;
  return Number.parseInt(digits, 10);
}

export function formatNumber(value: number | null | undefined): string {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return "0";
  return NUMBER_FORMATTER.format(Math.round(numeric));
}

export function formatCurrencyUZS(value: number | null | undefined): string {
  return `${formatNumber(value)} UZS`;
}

export function formatNumberFromDigits(digits: string): string {
  if (!digits) return "";
  return formatNumber(Number.parseInt(digits, 10));
}
