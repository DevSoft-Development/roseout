import { mobileConfig } from "@/lib/config";
import { getOrCreateGuestId } from "@/lib/auth/storage";
import { supabase } from "@/lib/auth/supabase";

export type ApiErrorPayload = {
  error?: string;
  message?: string;
};

export class MobileApiError extends Error {
  status: number;
  code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = "MobileApiError";
    this.status = status;
    this.code = code;
  }
}

export async function mobileApi<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const [{ data }, guestId] = await Promise.all([
    supabase ? supabase.auth.getSession() : Promise.resolve({ data: { session: null } }),
    getOrCreateGuestId(),
  ]);

  const authHeaders: Record<string, string> = {
    "X-TheOutHaven-Guest": guestId,
  };
  if (data.session?.access_token) {
    authHeaders.Authorization = `Bearer ${data.session.access_token}`;
  }

  const response = await fetch(`${mobileConfig.apiBaseUrl}${normalizedPath}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...authHeaders,
      ...init.headers,
    },
  });

  if (!response.ok) {
    let payload: ApiErrorPayload | null = null;
    try {
      payload = (await response.json()) as ApiErrorPayload;
    } catch {
      payload = null;
    }
    throw new MobileApiError(
      payload?.message || "TheOutHaven could not complete that request.",
      response.status,
      payload?.error || null,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
