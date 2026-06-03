<<<<<<< HEAD
import { supabase } from "@/lib/supabase";

export type EdgeFunctionResult<T> = {
  data: T | null;
  error: Error | null;
=======
type InvokeOptions = {
  accessToken?: string | null;
  headers?: Record<string, string>;
  signal?: AbortSignal;
>>>>>>> 62b07568ac9db33da882568ffc4086080fee38c3
};

export async function invokeEdgeFunction<T = unknown>(
  name: string,
<<<<<<< HEAD
  body?: Record<string, unknown>,
): Promise<EdgeFunctionResult<T>> {
  try {
    const { data, error } = await supabase.functions.invoke(name, { body: body ?? {} });
    if (error) return { data: null, error: new Error(error.message) };
    return { data: data as T, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
=======
  body: Record<string, unknown>,
  options: InvokeOptions = {},
): Promise<{ data: T | null; error: { message: string; details?: unknown } | null }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return { data: null, error: { message: "Supabase URL or anon key is not configured" } };
  }

  const token = options.accessToken || anonKey;
  const url = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/${name}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      signal: options.signal,
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        ...(options.headers ?? {}),
      },
      body: JSON.stringify(body ?? {}),
    });
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json().catch(() => null)
      : await response.text().catch(() => "");
    if (!response.ok) {
      return {
        data: null,
        error: {
          message: payload?.message || payload?.error || `Edge Function ${name} failed with ${response.status}`,
          details: payload,
        },
      };
    }
    return { data: payload as T, error: null };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : String(error) } };
>>>>>>> 62b07568ac9db33da882568ffc4086080fee38c3
  }
}
