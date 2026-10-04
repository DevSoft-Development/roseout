import "server-only";

import { getCredentialVaultProviderValues } from "@/lib/admin/credential-vault-runtime-source";

export type BraveContextResult = {
  title: string;
  url: string;
  description: string;
};

export async function searchBraveLocationContext(input: {
  name: string;
  city?: string | null;
  state?: string | null;
  query?: string | null;
  count?: number;
}) {
  const values = await getCredentialVaultProviderValues("brave");
  const apiKey = String(values.apiKey || "").trim();
  if (!apiKey) throw new Error("brave_credentials_missing");

  const terms = [
    `"${String(input.name || "").trim()}"`,
    String(input.city || "").trim(),
    String(input.state || "").trim(),
    String(input.query || "").trim(),
  ].filter(Boolean).join(" ");

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", terms);
  url.searchParams.set("count", String(Math.max(1, Math.min(20, Math.trunc(input.count || 5)))));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: { accept: "application/json", "X-Subscription-Token": apiKey },
    });
    if (!response.ok) throw new Error(`brave_search_http_${response.status}`);
    const data = await response.json() as {
      web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
    };
    return (data.web?.results || [])
      .map((item) => ({
        title: String(item.title || "").trim(),
        url: String(item.url || "").trim(),
        description: String(item.description || "").trim(),
      }))
      .filter((item): item is BraveContextResult => Boolean(item.url));
  } finally {
    clearTimeout(timeout);
  }
}
