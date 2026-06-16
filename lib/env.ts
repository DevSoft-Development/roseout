import "server-only";

export type EnvName = keyof NodeJS.ProcessEnv | string;

export function cleanEnvValue(value: string | undefined): string | undefined {
  const cleaned = value?.trim().replace(/^["']|["']$/g, "");
  return cleaned || undefined;
}

export function getOptionalEnv(name: EnvName): string | undefined {
  return cleanEnvValue(process.env[String(name)]);
}

export function requireServerEnv(name: EnvName): string {
  const value = getOptionalEnv(name);
  if (!value) {
    throw new Error(`Missing required server environment variable: ${String(name)}. Configure it in Vercel/Supabase runtime environment variables; do not hardcode secrets.`);
  }
  return value;
}

export function requirePublicEnv(name: `NEXT_PUBLIC_${string}`): string {
  return requireServerEnv(name);
}

export function requireSupabaseUrl(): string {
  const url = requirePublicEnv("NEXT_PUBLIC_SUPABASE_URL");
  try {
    const parsed = new URL(url);
    if (!parsed.protocol.startsWith("http")) throw new Error();
  } catch {
    throw new Error("Invalid NEXT_PUBLIC_SUPABASE_URL. Expected a full URL like https://xxxx.supabase.co.");
  }
  return url;
}

export function requireSupabaseServiceRoleKey(): string {
  return requireServerEnv("SUPABASE_SERVICE_ROLE_KEY");
}

export function requireAnyServerEnv(names: EnvName[]): string {
  for (const name of names) {
    const value = getOptionalEnv(name);
    if (value) return value;
  }
  throw new Error(`Missing one of required server environment variables: ${names.join(", ")}.`);
}
