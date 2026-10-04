import "server-only";

import { getCredentialVaultProviderValues } from "@/lib/admin/credential-vault-runtime-source";
import { createAzureFoundryProvider } from "@/lib/ai/gateway/providers/azure-foundry";
import { resolvePostalArea } from "@/lib/geo/server";
import { fetchAllowedHttpsUrl, readResponseWithLimit } from "@/lib/security/outbound-url";
import { supabaseAdmin } from "@/lib/supabase-admin";

function text(bytes: Uint8Array) {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export async function fetchOfficialWebsiteContext(rawUrl: string) {
  const withProtocol = /^https:///i.test(rawUrl) ? rawUrl : `https://${rawUrl.replace(/^http:///i, "")}`;
  const parsed = new URL(withProtocol);
  const host = parsed.hostname.toLowerCase();
  const allowedHosts = [host, host.startsWith("www.") ? host.slice(4) : `www.${host}`];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetchAllowedHttpsUrl(parsed.toString(), {
      allowedHosts,
      maxRedirects: 3,
      signal: controller.signal,
      headers: { "user-agent": "TheOutHaven-LocationIntelligence/2.0" },
    });
    if (!response.ok) throw new Error(`official_website_http_${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    if (!/text/html|application/xhtml+xml/i.test(contentType)) {
      throw new Error("official_website_not_html");
    }
    const html = text(await readResponseWithLimit(response, 750_000));
    return {
      url: response.url || parsed.toString(),
      html,
      title: (html.match(/<title[^>]*>([sS]*?)</title>/i)?.[1] || "").replace(/s+/g, " ").trim(),
      text: html
        .replace(/<script[sS]*?</script>/gi, " ")
        .replace(/<style[sS]*?</style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/s+/g, " ")
        .trim()
        .slice(0, 100_000),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function mapboxGeocodeAddress(query: string) {
  const values = await getCredentialVaultProviderValues("mapbox");
  const token = String(values.accessToken || "").trim();
  if (!token) throw new Error("mapbox_credentials_not_configured");

  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  url.searchParams.set("q", query);
  url.searchParams.set("access_token", token);
  url.searchParams.set("country", "us");
  url.searchParams.set("limit", "5");
  url.searchParams.set("permanent", "true");

  const response = await fetch(url, { cache: "no-store", headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`mapbox_geocode_http_${response.status}`);
  const data = await response.json() as { features?: unknown[] };
  return data.features || [];
}

export async function loadPublicGeography(zipCode: string) {
  return resolvePostalArea(zipCode);
}

export async function loadOwnerProfile(locationId: string) {
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("id,name,restaurant_name,activity_name,address,city,state,zip_code,neighborhood,borough,phone,website,operating_hours,description,main_image,images,primary_category,cuisine,cuisine_type,activity_type,tags,vibe_tags,best_for_tags,reservation_url,external_reservation_url,is_claimed,claimed,claim_status,owner_user_id,claimed_at")
    .eq("id", locationId)
    .single();
  if (error) throw new Error(`owner_profile_read_failed:${error.message}`);
  return data;
}

export async function loadInternalSignals(locationId: string) {
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("id,popularity_score,trend_score,conversion_score,review_score,theouthaven_score,roseout_score,quality_score,search_boost,date_score")
    .eq("id", locationId)
    .single();
  if (error) throw new Error(`internal_signals_read_failed:${error.message}`);
  return data;
}

export async function runAzureExtraction(input: unknown, instructions?: string) {
  const provider = createAzureFoundryProvider();
  return provider.invoke({
    capability: "extract",
    input: {
      instructions: instructions || "Extract factual location intelligence only. Do not invent missing values.",
      data: input,
    },
    timeoutMs: 30_000,
  });
}
