import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiClient } from "@/lib/api";
import { studentKeys } from "@/hooks/use-students";
import { formatCurrencyUZS } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

export type PaymentMethod = "cash" | "transfer";
export type BillingStatus = "paid" | "debt";
export type TrendDirection = "up" | "down" | "stable";

export interface PaymentReceipt {
  id: number;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  url: string;
  created_at: string;
}

export interface PaymentRead {
  id: number;
  student_id: number;
  amount: number;
  method: PaymentMethod | string;
  /** YYYY-MM-DD */
  paid_at: string;
  note: string | null;
  student_name: string | null;
  group_code: string | null;
  course_name: string | null;
  receipts: PaymentReceipt[];
  created_at: string;
  updated_at: string;
}

export interface PaymentList {
  items: PaymentRead[];
  total: number;
  skip: number;
  limit: number;
}

export interface PaymentCreatePayload {
  student_id: number;
  amount: number;
  method: PaymentMethod;
  /** YYYY-MM-DD */
  paid_at: string;
  note?: string | null;
}

export interface MethodBreakdown {
  method: string;
  count: number;
  amount: number;
}

export interface FinanceSummary {
  period_from: string;
  period_to: string;
  payments_count: number;
  payments_total: number;
  by_method: MethodBreakdown[];
  debtors_count: number;
  total_debt: number;
  overdue_today: number;
}

export interface StudentBilling {
  id: number;
  full_name: string;
  phone: string | null;
  parent_phone: string | null;
  group_id: number | null;
  group_code: string | null;
  course_name: string | null;

  monthly_amount: number;
  months_due: number;
  total_due: number;
  total_paid: number;
  debt_amount: number;
  credit_balance: number;
  total_course_cost: number;
  max_deposit_amount: number;
  /** YYYY-MM-DD */
  course_end_date: string | null;
  months_unpaid: number;
  overdue_days: number;

  last_payment_date: string | null;
  last_payment_amount: number | null;

  status: BillingStatus;
  finance_note: string | null;
}

export interface StudentBillingList {
  items: StudentBilling[];
  total: number;
  skip: number;
  limit: number;
}

export interface DebtorRead extends StudentBilling {
  trend: TrendDirection;
}

export interface DebtorList {
  items: DebtorRead[];
  total: number;
  skip: number;
  limit: number;
}

export interface StudentLedger {
  billing: StudentBilling;
  payments: PaymentRead[];
}

export type TranslatorFn = (key: string) => string;

type FinanceErrorDetail = {
  code?: string;
  max_allowed?: number;
};

const fmtUZS = (amount: number) => formatCurrencyUZS(amount);

export function getCreatePaymentErrorMessage(error: unknown, t: TranslatorFn): string {
  if (error instanceof ApiError && error.status === 400 && error.detail && typeof error.detail === "object") {
    const detail = error.detail as FinanceErrorDetail;
    if (detail.code === "amount_exceeds_remaining_cost") {
      const tmpl = t("finance.amountExceedsRemaining");
      if (typeof detail.max_allowed === "number") {
        return tmpl.replace("{max}", fmtUZS(detail.max_allowed));
      }
      return tmpl;
    }
    if (detail.code === "deposit_not_available") {
      return t("finance.depositNotAvailable");
    }
    if (detail.code === "receipt_required") {
      return t("payments.errReceiptRequired");
    }
    if (detail.code === "receipt_unsupported_type") {
      return t("payments.errFileType");
    }
    if (detail.code === "receipt_too_large") {
      return t("payments.errFileTooLarge");
    }
    if (detail.code === "receipt_too_many") {
      return t("payments.errTooManyFiles");
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return t("common.error");
}

// ── Query params ───────────────────────────────────────────────────────────

export interface SummaryParams {
  /** YYYY-MM-DD */
  from?: string;
  /** YYYY-MM-DD */
  to?: string;
}

export interface PaymentsParams {
  skip?: number;
  limit?: number;
  student_id?: number;
  group_id?: number;
  method?: PaymentMethod | string;
  /** YYYY-MM-DD */
  from?: string;
  /** YYYY-MM-DD */
  to?: string;
  search?: string;
}

export interface BillingParams {
  skip?: number;
  limit?: number;
  group_id?: number;
  status?: BillingStatus;
  /** YYYY-MM-DD */
  last_payment_from?: string;
  /** YYYY-MM-DD */
  last_payment_to?: string;
  sort_by?: "name" | "last_payment" | "debt" | "total_paid";
  sort_dir?: "asc" | "desc";
  search?: string;
}

export interface DebtorsParams {
  skip?: number;
  limit?: number;
  group_id?: number;
  min_overdue_days?: number;
  max_overdue_days?: number;
  debt_min?: number;
  debt_max?: number;
  months_unpaid_min?: number;
  months_unpaid_max?: number;
  trend?: TrendDirection;
  /** YYYY-MM-DD */
  last_payment_from?: string;
  /** YYYY-MM-DD */
  last_payment_to?: string;
  sort_by?: "debt" | "overdue" | "name" | "last_payment";
  sort_dir?: "asc" | "desc";
  search?: string;
}

// ── Query keys ─────────────────────────────────────────────────────────────

export const financeKeys = {
  all: ["finance"] as const,
  summary: (p: SummaryParams) => ["finance", "summary", p] as const,
  payments: (p: PaymentsParams) => ["finance", "payments", p] as const,
  billing: (p: BillingParams) => ["finance", "students-billing", p] as const,
  debtors: (p: DebtorsParams) => ["finance", "debtors", p] as const,
  ledger: (id: number) => ["finance", "ledger", id] as const,
};

// ── Helpers ────────────────────────────────────────────────────────────────

function qs<T extends object>(p: T): string {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
    if (v === undefined || v === null || v === "") continue;
    out.set(k, String(v));
  }
  const s = out.toString();
  return s ? `?${s}` : "";
}

function invalidateFinance(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: financeKeys.all });
  qc.invalidateQueries({ queryKey: studentKeys.all });
}

// ── Queries ────────────────────────────────────────────────────────────────

export function useFinanceSummary(params: SummaryParams = {}) {
  return useQuery<FinanceSummary>({
    queryKey: financeKeys.summary(params),
    queryFn: () => apiClient.get<FinanceSummary>(`/finance/summary${qs(params)}`),
    staleTime: 15_000,
  });
}

export function useFinancePayments(params: PaymentsParams = {}) {
  return useQuery<PaymentList>({
    queryKey: financeKeys.payments(params),
    queryFn: () => apiClient.get<PaymentList>(`/finance/payments${qs(params)}`),
    staleTime: 15_000,
  });
}

export function useStudentsBilling(params: BillingParams = {}) {
  return useQuery<StudentBillingList>({
    queryKey: financeKeys.billing(params),
    queryFn: () =>
      apiClient.get<StudentBillingList>(`/finance/students-billing${qs(params)}`),
    staleTime: 15_000,
  });
}

export function useDebtors(params: DebtorsParams = {}) {
  return useQuery<DebtorList>({
    queryKey: financeKeys.debtors(params),
    queryFn: () => apiClient.get<DebtorList>(`/finance/debtors${qs(params)}`),
    staleTime: 15_000,
  });
}

export function useStudentLedger(studentId: number | null | undefined) {
  return useQuery<StudentLedger>({
    queryKey: financeKeys.ledger(Number(studentId ?? 0)),
    queryFn: () =>
      apiClient.get<StudentLedger>(`/finance/students/${studentId}/ledger`),
    staleTime: 15_000,
    enabled: !!studentId,
  });
}

// ── Mutations ──────────────────────────────────────────────────────────────

export function useCreatePayment() {
  const qc = useQueryClient();
  type CreatePaymentInput = {
    payload: PaymentCreatePayload;
    files: File[];
  };
  return useMutation({
    mutationFn: ({ payload, files }: CreatePaymentInput) => {
      const form = new FormData();
      form.append("student_id", String(payload.student_id));
      form.append("amount", String(payload.amount));
      form.append("method", payload.method);
      form.append("paid_at", payload.paid_at);
      if (payload.note) {
        form.append("note", payload.note);
      }
      files.forEach((file) => {
        form.append("files", file);
      });
      return apiClient.upload<PaymentRead>("/finance/payments", form);
    },
    onSuccess: () => invalidateFinance(qc),
  });
}

export function useDeletePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.delete<void>(`/finance/payments/${id}`),
    onSuccess: () => invalidateFinance(qc),
  });
}

export function useUpdateFinanceNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ studentId, note }: { studentId: number; note: string | null }) =>
      apiClient.patch<StudentBilling>(`/finance/students/${studentId}/note`, {
        note,
      }),
    onSuccess: () => invalidateFinance(qc),
  });
}
