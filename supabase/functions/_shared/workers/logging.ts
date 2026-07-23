const secretPattern = /(token|secret|key|password|authorization|phone|email)/i;
export function redact(value: unknown): unknown { if (Array.isArray(value)) return value.map(redact); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, secretPattern.test(k) ? "[redacted]" : redact(v)])); return value; }
export function log(event: string, metadata: Record<string, unknown> = {}) { console.log(JSON.stringify({ event, ...redact(metadata), at: new Date().toISOString() })); }
