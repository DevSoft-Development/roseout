import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createAuthClient } from "@/lib/supabase-server";
import LocationsDashboardClient from "./LocationsDashboardClient";
import { getLocationName } from "@/lib/locationName";
import type { LocationClaimFields } from "@/lib/locationClaim";
import type { LocationScoreFields } from "@/lib/locationScore";
import type { LocationVisibilityFields } from "@/lib/locationVisibility";
import { getLocationOwnerAccess, hasOwnerAccessToLocation } from "@/lib/auth/locationOwnerAccess";
import { parseDemoOwnerParams, requireDemoOwnerLocation, type DemoSearchParams } from "@/lib/demo/owner-context";

export const dynamic = "force-dynamic";

type LocationType = "restaurant" | "activity";


const LOCATION_DASHBOARD_COLUMNS = `
  id,
  location_type,
  name,
  restaurant_name,
  activity_name,
  address,
  city,
  state,
  main_image,
  image_url,
  images,
  is_claimed,
  claimed,
  claim_status,
  claim_verification_status,
  claimed_at,
  claimed_by_email,
  owner_user_id,
  owner_name,
  owner_email,
  owner_phone,
  phone,
  website,
  reservation_url,
  external_reservation_url,
  reservation_link,
  plan,
  subscription_plan,
  is_pro,
  view_count,
  click_count,
  call_count,
  reservation_click_count,
  external_reservation_click_count,
  reservation_settings,
  primary_category,
  cuisine,
  cuisine_type,
  food_type,
  activity_type,
  primary_tag,
  tags,
  google_types,
  active,
  is_searchable,
  status,
  score,
  quality_score,
  location_score,
  created_at,
  updated_at
`;

type LocationItem = LocationClaimFields &
  LocationScoreFields &
  LocationVisibilityFields & {
    id: string;
    location_type: LocationType;
    display_name: string;
    name?: string | null;
    restaurant_name?: string | null;
    activity_name?: string | null;
    address?: string;
    city?: string;
    state?: string;
    main_image?: string | null;
    image_url?: string | null;
    images?: string[] | null;
    owner_name?: string;
    owner_email?: string;
    owner_phone?: string;
    primary_category?: string | null;
    cuisine?: string | null;
    cuisine_type?: string | null;
    food_type?: string | null;
    activity_type?: string | null;
    primary_tag?: string | null;
    tags?: string[] | null;
    google_types?: string[] | null;
  };

function adminSupabase() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
      },
    },
  );
}

function toDashboardLocation(locationData: Record<string, any>): LocationItem {
  const locationType =
    locationData.location_type === "restaurant" ? "restaurant" : "activity";

  return {
    ...locationData,
    location_type: locationType,
    display_name: getLocationName(
      locationData,
      locationType === "restaurant" ? "Untitled restaurant" : "Untitled activity",
    ),
  } as LocationItem;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<DemoSearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const parsedDemoParams = parseDemoOwnerParams(resolvedSearchParams);
  const isDemoRequest =
    parsedDemoParams.demo ||
    Boolean(parsedDemoParams.locationId) ||
    Boolean(resolvedSearchParams?.locationId);

  if (isDemoRequest) {
    const demoOwner = await requireDemoOwnerLocation(resolvedSearchParams);
    const demoLocation = demoOwner.location
      ? toDashboardLocation(demoOwner.location as Record<string, any>)
      : null;

    return (
      <LocationsDashboardClient
        locations={demoLocation ? [demoLocation] : []}
        impersonationLabel={
          demoLocation
            ? `Demo mode — viewing as ${demoLocation.display_name}`
            : "Demo mode"
        }
        demoContext={{
          demoMode: true,
          locationId: demoOwner.locationId || parsedDemoParams.locationId || "",
          type:
            demoLocation?.location_type ||
            (demoOwner.type === "activity" ? "activity" : "restaurant"),
        }}
      />
    );
  }

  const cookieStore = await cookies();

  const impersonatedLocationId = cookieStore.get(
    "theouthaven_impersonate_location_id",
  )?.value;

  const impersonatedUserId = cookieStore.get(
    "theouthaven_impersonate_user_id",
  )?.value;

  const adminUserId = cookieStore.get("theouthaven_admin_user_id")?.value;

  const supabase = adminSupabase();
  const authSupabase = await createAuthClient();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();

  let locations: LocationItem[] = [];
  let impersonationLabel = "";
  const ownerAccess = user?.id ? await getLocationOwnerAccess(user.id) : null;

  if (impersonatedLocationId) {
    const { data } = await supabase
      .from("locations")
      .select(LOCATION_DASHBOARD_COLUMNS)
      .eq("id", impersonatedLocationId)
      .maybeSingle();

    if (data) {
      const locationData = data as Record<string, any>;

      locations = [toDashboardLocation(locationData)];
      impersonationLabel = `Viewing as ${locations[0].display_name}`;
    }
  } else if (impersonatedUserId) {
    const { data: ownedLocations } = await supabase
      .from("locations")
      .select(LOCATION_DASHBOARD_COLUMNS)
      .eq("owner_user_id", impersonatedUserId)
      .order("created_at", { ascending: false })
      .limit(100);

    locations = (ownedLocations || []).map(toDashboardLocation);
    impersonationLabel = "Viewing as location owner";
  } else if (adminUserId && ownerAccess?.isAdmin) {
    const { data: allLocations } = await supabase
      .from("locations")
      .select(LOCATION_DASHBOARD_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(100);

    locations = (allLocations || []).map(toDashboardLocation);
  } else if (user?.id && ownerAccess) {
    if (!ownerAccess.isAdmin && ownerAccess.ownedLocationIds.length === 0 && ownerAccess.ownedSourceLocationIds.length === 0) {
      redirect("/create");
    }

    let query = supabase
      .from("locations")
      .select(LOCATION_DASHBOARD_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(100);

    if (!ownerAccess.isAdmin) {
      const ownerFilters = [
        ...ownerAccess.ownedLocationIds.map((id) => `id.eq.${id}`),
        ...ownerAccess.ownedSourceLocationIds.map((id) => `source_id.eq.${id}`),
      ];

      if (ownerFilters.length === 0) {
        redirect("/create");
      }

      query = query.or(ownerFilters.join(","));
    }

    const { data: ownedLocations } = await query;

    locations = (ownedLocations || [])
      .filter((location) => hasOwnerAccessToLocation(ownerAccess, location as Record<string, any>))
      .map(toDashboardLocation);
  } else {
    redirect("/login?next=/locations/dashboard");
  }

  return (
    <LocationsDashboardClient
      locations={locations}
      impersonationLabel={impersonationLabel}
    />
  );
}
