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
}
