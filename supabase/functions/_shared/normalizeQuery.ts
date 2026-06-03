const SMART_QUOTES: Record<string, string> = { "“": '"', "”": '"', "‘": "'", "’": "'" };
const IMPORTANT_PHRASES = ["walking distance"];

export function normalizeSearchQuery(query: string): string {
  let normalized = String(query ?? "").toLowerCase().trim();
  normalized = normalized.replace(/[“”‘’]/g, (char) => SMART_QUOTES[char] ?? char);
  for (const phrase of IMPORTANT_PHRASES) normalized = normalized.replace(new RegExp(phrase.replace(/ /g, "\\s+"), "gi"), phrase.replace(/ /g, "__KEEP__"));
  normalized = normalized.replace(/[^a-z0-9\s_'-]/g, " ").replace(/[_]{2}keep[_]{2}/gi, " ");
  normalized = normalized.replace(/\s+/g, " ").trim();
  return normalized;
}

export async function createQueryHash(normalizedQuery: string): Promise<string> {
  const bytes = new TextEncoder().encode(normalizedQuery);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
