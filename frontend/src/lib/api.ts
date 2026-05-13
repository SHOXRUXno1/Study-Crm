const TOKEN_KEY = "access_token";

/** Base URL ending with `/api/v1` (no trailing slash after v1).
 *
 * - **`VITE_API_URL` set** → use it (production or API on another origin).
 * - **unset (recommended for `npm run dev`)** → `${location.origin}/api/v1` — Vite proxies `/api` to FastAPI, so phones on LAN hit the dev server, not `127.0.0.1` on the device.
 */
export function getApiBaseUrl(): string {
  const raw = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (raw) return raw.replace(/\/$/, "");

  const pathBase = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  if (typeof window !== "undefined") {
    return `${window.location.origin}${pathBase}/api/v1`;
  }
  return `${pathBase}/api/v1`;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  /** Raw `detail` value from the backend (string, object, or array).
   *  Useful when the server attaches structured payloads to errors —
   *  e.g. 409 conflict bodies like `{ message, conflicts: [...] }`. */
  detail: unknown;
  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    clearToken();
    window.dispatchEvent(new CustomEvent("auth:expired"));
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let detail: unknown = undefined;
    try {
      const data = await res.json();
      if (data?.detail !== undefined) {
        detail = data.detail;
        if (typeof data.detail === "string") {
          message = data.detail;
        } else if (typeof data.detail === "object" && data.detail !== null && typeof (data.detail as { message?: unknown }).message === "string") {
          message = (data.detail as { message: string }).message;
        }
      }
    } catch { /* ignore */ }
    throw new ApiError(message, res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function requestForm<T>(
  method: string,
  path: string,
  form: FormData,
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    method,
    headers,
    body: form,
  });

  if (res.status === 401) {
    clearToken();
    window.dispatchEvent(new CustomEvent("auth:expired"));
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let detail: unknown = undefined;
    try {
      const data = await res.json();
      if (data?.detail !== undefined) {
        detail = data.detail;
        if (typeof data.detail === "string") {
          message = data.detail;
        } else if (
          typeof data.detail === "object" &&
          data.detail !== null &&
          typeof (data.detail as { message?: unknown }).message === "string"
        ) {
          message = (data.detail as { message: string }).message;
        }
      }
    } catch {
      // ignore
    }
    throw new ApiError(message, res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function fetchAuthBlob(url: string): Promise<Blob> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const fullUrl = url.startsWith("http")
    ? url
    : url.startsWith("/api/")
      ? `${window.location.origin}${url}`
      : `${getApiBaseUrl()}${url}`;

  const res = await fetch(fullUrl, { method: "GET", headers });
  if (res.status === 401) {
    clearToken();
    window.dispatchEvent(new CustomEvent("auth:expired"));
  }
  if (!res.ok) {
    throw new ApiError(`Request failed (${res.status})`, res.status);
  }
  return res.blob();
}

export const apiClient = {
  get:    <T,>(path: string) => request<T>("GET", path),
  post:   <T,>(path: string, body?: unknown) => request<T>("POST", path, body),
  upload: <T,>(path: string, form: FormData) => requestForm<T>("POST", path, form),
  put:    <T,>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch:  <T,>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T,>(path: string) => request<T>("DELETE", path),
};
