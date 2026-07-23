export function requiredEnv(name: string): string { const value = Deno.env.get(name); if (!value) throw new Error(`Missing required environment variable: ${name}`); return value; }
export function optionalFlag(name: string, defaultValue = false): boolean { const value = Deno.env.get(name); if (value == null) return defaultValue; return ["1", "true", "yes", "on"].includes(value.toLowerCase()); }
