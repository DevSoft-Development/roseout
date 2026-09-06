import { handleGeneratePost } from "@/lib/search/public-api/controller";
import { getInternalDemoViewer } from "@/lib/demo/internal-demo-access";
import { requestContainsTheOutHavenLoungeSearch } from "@/lib/demo/internal-demo-search";
import { MIRROR_DEMO_KEY } from "@/lib/demo/demo-center";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function internalDemoSearchResponse(request: Request) {
  let body: any = null;
  try {
    body = await request.clone().json();
  } catch {
    return null;
  }

  if (!requestContainsTheOutHavenLoungeSearch(body)) return null;

  const viewer = await getInternalDemoViewer().catch(() => null);
  if (!viewer) return null;

  const { data: location, error } = await supabaseAdmin
    .from("locations")
    .select("*")
    .eq("demo_key", MIRROR_DEMO_KEY)
    .eq("is_demo", true)
    .eq("is_hidden", true)
    .maybeSingle();

  if (error || !location?.id || location.is_searchable === true) return null;

  const id = String(location.id);
  const profileHref = `/locations/restaurant/${encodeURIComponent(id)}/internal`;
  const reserveHref = `/locations/restaurant/${encodeURIComponent(id)}/reserve`;
  const websiteWorkspaceHref = `https://www.theouthaven.com/locations/dashboard/website?adminLocationId=${encodeURIComponent(id)}&locationId=${encodeURIComponent(id)}&type=restaurant&demo=1&fromDemoCenter=1`;

  const { data: hostedWebsite } = await supabaseAdmin
    .from("business_websites")
    .select("domain,platform_domain,published_version,last_publish_status")
    .eq("location_id", id)
    .maybeSingle();

  const hostedDomain = String(hostedWebsite?.domain || hostedWebsite?.platform_domain || "").trim();
  const hasPublishedHostedWebsite =
    Boolean(hostedDomain) &&
    Number(hostedWebsite?.published_version || 0) > 0 &&
    hostedWebsite?.last_publish_status === "published";
  const websiteHref = hasPublishedHostedWebsite
    ? `https://${hostedDomain}`
    : websiteWorkspaceHref;

  const card = {
    ...location,
    id,
    name:
      location.name ||
      location.restaurant_name ||
      location.activity_name ||
      "TheOutHaven Lounge",
    restaurant_name:
      location.restaurant_name || location.name || "TheOutHaven Lounge",
    location_type: "restaurant",
    detail_location_type: "restaurants",
    source_table: location.source_table || "restaurant",
    source_id: location.source_id || id,
    is_searchable: true,
    is_hidden: false,
    publish_ready: true,
    demo_internal_preview: true,
    demo_viewer_role: viewer.role,
    profile_href: profileHref,
    public_url: profileHref,
    detail_url: profileHref,
    website: websiteHref,
    website_workspace_url: websiteWorkspaceHref,
    reservation_url: reserveHref,
    reservation_link: reserveHref,
    external_reservation_url: null,
    reservation_enabled: true,
    internal_reservations_enabled: true,
    uses_internal_reservations: true,
    reservation_source: "internal",
  };

  return Response.json({
    success: true,
    status: "ok",
    reply: "TheOutHaven Lounge is available for internal end-to-end testing.",
    restaurants: [card],
    activities: [],
    matched_locations: [card],
    matchedLocations: [card],
    pairs: [],
    cards: [card],
    render_mode: "restaurants",
    renderMode: "restaurants",
    card_counts: {
      restaurants: 1,
      activities: 0,
      matched_locations: 1,
      pairs: 0,
    },
    cardCounts: {
      restaurants: 1,
      activities: 0,
      matched_locations: 1,
      pairs: 0,
    },
    diagnostics: {
      internal_demo_search: true,
      demo_viewer_role: viewer.role,
      profile_href: profileHref,
      website_href: websiteHref,
      website_workspace_href: websiteWorkspaceHref,
    },
  });
}

export async function POST(request: Request) {
  const demoResponse = await internalDemoSearchResponse(request);
  if (demoResponse) return demoResponse;
  return handleGeneratePost(request);
}
