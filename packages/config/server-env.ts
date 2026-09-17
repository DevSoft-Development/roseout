import "server-only";

export function getOptionalEnv(name: string): string | undefined {
  const cleaned = process.env[name]?.trim().replace(/^["']|["']$/g, "");
  return cleaned || undefined;
}

export function requireServerEnv(name: string): string {
  const value = getOptionalEnv(name);
  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}.`);
  }
  return value;
}

export function requireSupabaseUrl(): string {
  const url = requireServerEnv("NEXT_PUBLIC_SUPABASE_URL");
  const parsed = new URL(url);
  if (!parsed.protocol.startsWith("http")) {
    throw new Error("Invalid NEXT_PUBLIC_SUPABASE_URL.");
  }
  return url;
}

export function requireSupabaseAnonKey(): string {
  return requireServerEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

export function requireSupabaseServiceRoleKey(): string {
  return requireServerEnv("SUPABASE_SERVICE_ROLE_KEY");
}
