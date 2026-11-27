import { mockRequest } from "@/mocks/handler";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
export const MOCK = process.env.NEXT_PUBLIC_MOCK === "1";

const TOKEN_KEY = "keel.token";
const USER_KEY = "keel.user";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setSession(token: string, user: unknown) {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
  } catch {}
}

export function getStoredUser<T>(): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function redirectToLogin() {
  clearSession();
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login?next=${next}`;
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined | null>;
  auth?: boolean;
  signal?: AbortSignal;
}

export function buildPath(path: string, query?: RequestOptions["query"]): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined ? "POST" : "GET");
  const full = buildPath(path, opts.query);
  const auth = opts.auth ?? true;
  const token = auth ? getToken() : null;

  if (MOCK) {
    const res = await mockRequest(method, full, opts.body, token);
    if (res.status === 401 && auth) {
      redirectToLogin();
      throw new ApiError(401, "Unauthorised");
    }
    if (res.status >= 400) throw new ApiError(res.status, String((res.body as { detail?: string })?.detail ?? "Request failed"));
    return res.body as T;
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${full}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  if (res.status === 401 && auth) {
    redirectToLogin();
    throw new ApiError(401, "Unauthorised");
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = typeof j?.detail === "string" ? j.detail : JSON.stringify(j?.detail ?? j);
    } catch {}
    throw new ApiError(res.status, detail || `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
