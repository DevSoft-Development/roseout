import "server-only";

import { getCredentialVaultProviderValues } from "@/lib/admin/credential-vault-runtime-source";

type SerpApiOrganicResult = {
  position?: number;
  title?: string;
  link?: string;
  snippet?: string;
  displayed_link?: string;
};

type SerpApiLocalResult = {
  position?: number;
  title?: string;
  place_id?: string;
  address?: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviews?: number;
  type?: string;
};

export async function searchSerpApiLocationContext(input: {
  query: string;
  count?: number;
}) {
  const values = await getCredentialVaultProviderValues("serpapi");
  const apiKey = String(values.apiKey || "").trim();
  if (!apiKey) throw new Error("serpapi_credentials_not_configured");

  const query = String(input.query || "").trim();
  if (!query) throw new Error("serpapi_query_required");

  const count = Math.max(1, Math.min(10, Math.trunc(Number(input.count || 5))));
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("num", String(count));
  url.searchParams.set("google_domain", "google.com");
  url.searchParams.set("gl", "us");
  url.searchParams.set("hl", "en");
  url.searchParams.set("api_key", apiKey);

  const response = await fetch(url, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    if (response.status === 429) throw new Error("serpapi_rate_limited");
    throw new Error(`serpapi_http_${response.status}`);
  }

  const data = await response.json() as {
    search_metadata?: { id?: string; status?: string };
    search_parameters?: Record<string, unknown>;
    organic_results?: SerpApiOrganicResult[];
    local_results?: { places?: SerpApiLocalResult[] };
  };

  return {
    searchId: data.search_metadata?.id || null,
    status: data.search_metadata?.status || null,
    organicResults: (data.organic_results || []).slice(0, count),
    localResults: (data.local_results?.places || []).slice(0, count),
  };
}
