import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────

export type Gender = "male" | "female";
export type PaymentStatus = "paid" | "debt";

export interface StudentRead {
  id: number;
  full_name: string;
  gender: string | null;
  birth_date: string | null;
  phone: string | null;
  parent_phone: string | null;
  source: string | null;
  group_id: number | null;
  payment_status: string;
  finance_note: string | null;
  is_active: boolean;
  group_code: string | null;
  course_name: string | null;
  has_credentials: boolean;
  created_at: string;
  updated_at: string;
}

export interface StudentListResponse {
  items: StudentRead[];
  total: number;
  skip: number;
  limit: number;
}

export interface StudentCreate {
  full_name: string;
  gender?: Gender | null;
  birth_date?: string | null;
  phone?: string | null;
  parent_phone?: string | null;
  source?: string | null;
  group_id?: number | null;
  payment_status?: PaymentStatus;
  is_active?: boolean;
  /** Optional cabinet password — phone must be set when provided. */
  password?: string | null;
}

export interface StudentUpdate {
  full_name?: string;
  gender?: Gender | null;
  birth_date?: string | null;
  phone?: string | null;
  parent_phone?: string | null;
  source?: string | null;
  group_id?: number | null;
  payment_status?: PaymentStatus;
  finance_note?: string | null;
  is_active?: boolean;
  /** Optional cabinet password — phone must be set when provided. */
  password?: string | null;
}

export interface StudentsParams {
  skip?: number;
  limit?: number;
  group_id?: number;
  payment_status?: PaymentStatus;
  is_active?: boolean;
  search?: string;
  sort?: string;
}

// ── Query keys ───────────────────────────────────────────────────────

export const studentKeys = {
  all: ["students"] as const,
  lists: () => ["students", "list"] as const,
  list: (p: StudentsParams) => ["students", "list", p] as const,
  detail: (id: number) => ["students", "detail", id] as const,
};

// ── Helpers ──────────────────────────────────────────────────────────

function buildQs(p: StudentsParams): string {
  const q = new URLSearchParams();
  if (p.skip           !== undefined) q.set("skip",          String(p.skip));
  if (p.limit          !== undefined) q.set("limit",         String(p.limit));
  if (p.group_id       !== undefined) q.set("group_id",      String(p.group_id));
  if (p.payment_status !== undefined) q.set("payment_status", p.payment_status);
  if (p.is_active      !== undefined) q.set("is_active",     String(p.is_active));
  if (p.search)                       q.set("search",        p.search);
  if (p.sort)                         q.set("sort",          p.sort);
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** Full name from API row */
export function fullName(s: StudentRead): string {
  return s.full_name;
}

// ── Queries ──────────────────────────────────────────────────────────

export function useStudents(
  params: StudentsParams = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery<StudentListResponse>({
    queryKey: studentKeys.list(params),
    queryFn: () => apiClient.get<StudentListResponse>(`/students${buildQs(params)}`),
    staleTime: 30_000,
    enabled: options.enabled ?? true,
  });
}

export function useStudent(id: number | string) {
  return useQuery<StudentRead>({
    queryKey: studentKeys.detail(Number(id)),
    queryFn: () => apiClient.get<StudentRead>(`/students/${id}`),
    staleTime: 30_000,
    enabled: !!id,
  });
}

// ── Mutations ────────────────────────────────────────────────────────

export function useCreateStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: StudentCreate) =>
      apiClient.post<StudentRead>("/students", data),
    onSuccess: (created) => {
      qc.setQueriesData<StudentListResponse>(
        { queryKey: studentKeys.lists() },
        (old) => old ? { ...old, items: [created, ...old.items], total: old.total + 1 } : old,
      );
      qc.setQueryData(studentKeys.detail(created.id), created);
      qc.invalidateQueries({ queryKey: studentKeys.all });
    },
  });
}

export function useUpdateStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: StudentUpdate }) =>
      apiClient.patch<StudentRead>(`/students/${id}`, data),
    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: studentKeys.all });
      const snapshots = qc.getQueriesData<StudentListResponse | StudentRead>({ queryKey: studentKeys.all });
      qc.setQueriesData<StudentListResponse>(
        { queryKey: studentKeys.lists() },
        (old) => old
          ? { ...old, items: old.items.map((s) => s.id === id ? { ...s, ...data } : s) }
          : old,
      );
      qc.setQueryData<StudentRead>(studentKeys.detail(id), (old) => old ? { ...old, ...data } : old);
      return { snapshots };
    },
    onError: (_e, _v, ctx) => {
      ctx?.snapshots?.forEach(([key, val]) => qc.setQueryData(key, val));
    },
    onSuccess: (updated) => {
      qc.setQueryData(studentKeys.detail(updated.id), updated);
      qc.invalidateQueries({ queryKey: studentKeys.all });
    },
  });
}

export function useDeleteStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.delete<void>(`/students/${id}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: studentKeys.all });
      const snapshots = qc.getQueriesData<StudentListResponse | StudentRead>({ queryKey: studentKeys.all });
      qc.setQueriesData<StudentListResponse>(
        { queryKey: studentKeys.lists() },
        (old) => old
          ? { ...old, items: old.items.filter((s) => s.id !== id), total: old.total - 1 }
          : old,
      );
      qc.removeQueries({ queryKey: studentKeys.detail(id) });
      return { snapshots };
    },
    onError: (_e, _v, ctx) => {
      ctx?.snapshots?.forEach(([key, val]) => qc.setQueryData(key, val));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: studentKeys.all });
    },
  });
}


// ── Student notes ───────────────────────────────────────────────────────────

export interface StudentNoteRead {
  id: number;
  student_id: number;
  text: string;
  created_at: string;
}

interface NoteListResponse {
  items: StudentNoteRead[];
}

const noteKeys = {
  all: ["student-notes"] as const,
  list: (studentId: number) => ["student-notes", studentId] as const,
};

export function useStudentNotes(studentId: number) {
  return useQuery({
    queryKey: noteKeys.list(studentId),
    queryFn: () => apiClient.get<NoteListResponse>(`/students/${studentId}/notes`),
    enabled: studentId > 0,
  });
}

export function useCreateStudentNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ studentId, text }: { studentId: number; text: string }) =>
      apiClient.post<StudentNoteRead>(`/students/${studentId}/notes`, { text }),
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: noteKeys.list(vars.studentId) });
    },
  });
}

export function useDeleteStudentNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ studentId, noteId }: { studentId: number; noteId: number }) =>
      apiClient.delete<void>(`/students/${studentId}/notes/${noteId}`),
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: noteKeys.list(vars.studentId) });
    },
  });
}


// ── Transfer types ───────────────────────────────────────────────────────────

export type DebtPolicy = "writeoff" | "snapshot";

export interface TransferPreview {
  from_group_id: number | null;
  from_group_name: string | null;
  to_group_id: number;
  to_group_name: string;
  prev_debt: number;
  capacity_current: number;
  capacity_max: number;
  capacity_exceeded: boolean;
}

export interface TransferRequest {
  to_group_id: number;
  transfer_date: string;       // ISO date "YYYY-MM-DD"
  debt_policy: DebtPolicy;
  reason?: string | null;
  force?: boolean;
}

export interface TransferResult {
  transfer_id: number;
  student_id: number;
  from_group_id: number | null;
  to_group_id: number;
  transfer_date: string;
  prev_debt: number;
  debt_action: string;
  adjustment_payment_id: number | null;
}

export interface GroupSnapshot {
  id: number | null;
  name: string | null;
}

export interface StudentTransferRead {
  id: number;
  student_id: number;
  from_group: GroupSnapshot | null;
  to_group: GroupSnapshot | null;
  transfer_date: string;
  prev_debt: number;
  debt_action: string;
  adjustment_payment_id: number | null;
  reason: string | null;
  performed_by_subject: string;
  performed_by_role: string;
  created_at: string;
}

// ── Transfer query keys ──────────────────────────────────────────────────────

export const transferKeys = {
  preview: (studentId: number, toGroupId: number) =>
    ["students", studentId, "transfer-preview", toGroupId] as const,
  history: (studentId: number) =>
    ["students", studentId, "transfers"] as const,
};

// ── Transfer hooks ───────────────────────────────────────────────────────────

export function useTransferPreview(
  studentId: number,
  params: { to_group_id: number; transfer_date?: string } | null,
) {
  return useQuery<TransferPreview>({
    queryKey: params
      ? transferKeys.preview(studentId, params.to_group_id)
      : (["transfer-preview-disabled"] as const),
    queryFn: () => {
      const qs = new URLSearchParams({ to_group_id: String(params!.to_group_id) });
      if (params!.transfer_date) qs.set("transfer_date", params!.transfer_date);
      return apiClient.get<TransferPreview>(
        `/students/${studentId}/transfer/preview?${qs.toString()}`,
      );
    },
    enabled: !!params && params.to_group_id > 0,
    staleTime: 10_000,
  });
}

export function useTransferStudent(studentId: number) {
  const qc = useQueryClient();
  return useMutation<TransferResult, Error, TransferRequest>({
    mutationFn: (data) =>
      apiClient.post<TransferResult>(`/students/${studentId}/transfer`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: studentKeys.all });
      qc.invalidateQueries({ queryKey: ["groups"] });
      qc.invalidateQueries({ queryKey: ["finance"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: transferKeys.history(studentId) });
    },
  });
}

export function useStudentTransfers(studentId: number) {
  return useQuery<StudentTransferRead[]>({
    queryKey: transferKeys.history(studentId),
    queryFn: () =>
      apiClient.get<StudentTransferRead[]>(`/students/${studentId}/transfers`),
    enabled: studentId > 0,
    staleTime: 30_000,
  });
}
