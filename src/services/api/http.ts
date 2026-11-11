/**
 * Minimal JSON client for the AIVERA API (API mode only).
 * Same-origin `/api` (proxied by Vite in development, served by Express in
 * production) so the httpOnly session cookie is sent automatically.
 */
import { toast } from "sonner";

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Fired when the session is missing/expired so the app can return to sign-in. */
export const UNAUTHORIZED_EVENT = "aivera:unauthorized";

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; silent?: boolean } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      credentials: "same-origin",
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    const err = new ApiError(0, "Cannot reach the AIVERA server. Is it running (npm run server:dev)?");
    if (!init.silent) toast.error(err.message);
    throw err;
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const issues = Array.isArray(data?.issues) ? `: ${data.issues.join("; ")}` : "";
    const err = new ApiError(res.status, `${data?.error ?? `Request failed (${res.status})`}${issues}`);
    if (res.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    if (!init.silent && res.status !== 401) toast.error(err.message);
    throw err;
  }
  return data as T;
}
