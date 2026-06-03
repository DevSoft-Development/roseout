<<<<<<< HEAD
export function normalizeSearchQuery(query: string) {
  return String(query ?? "")
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^a-z0-9#&'"\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function createQueryHash(normalizedQuery: string) {
  const bytes = new TextEncoder().encode(normalizedQuery);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
=======
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
>>>>>>> 62b07568ac9db33da882568ffc4086080fee38c3
}
