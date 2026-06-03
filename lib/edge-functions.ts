import { supabase } from "@/lib/supabase";

export type EdgeFunctionResult<T> = {
  data: T | null;
  error: Error | null;
};

export async function invokeEdgeFunction<T = unknown>(
  name: string,
  body?: Record<string, unknown>,
): Promise<EdgeFunctionResult<T>> {
  try {
    const { data, error } = await supabase.functions.invoke(name, { body: body ?? {} });
    if (error) return { data: null, error: new Error(error.message) };
    return { data: data as T, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
  }
}
