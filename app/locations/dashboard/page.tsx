import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createAuthClient } from "@/lib/supabase-server";
import LocationsDashboardClient from "./LocationsDashboardClient";
import { getLocationName } from "@/lib/locationName";
import type { LocationClaimFields } from "@/lib/locationClaim";
import type { LocationScoreFields } from "@/lib/locationScore";
import type { LocationVisibilityFields } from "@/lib/locationVisibility";

export const dynamic = "force-dynamic";

type LocationType = "restaurant" | "activity";


const LOCATION_DASHBOARD_COLUMNS = "*";

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

export default async function DashboardPage() {
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
      .order("created_at", { ascending: false });

    locations = (ownedLocations || []).map(toDashboardLocation);
    impersonationLabel = "Viewing as location owner";
  } else if (adminUserId) {
    const { data: allLocations } = await supabase
      .from("locations")
      .select(LOCATION_DASHBOARD_COLUMNS)
      .order("created_at", { ascending: false });

    locations = (allLocations || []).map(toDashboardLocation);
  } else if (user?.id) {
    const email = user.email || "";
    const ownedFilters = [
      `owner_user_id.eq.${user.id}`,
      `claimed_by.eq.${user.id}`,
      email ? `owner_email.eq.${email}` : null,
      email ? `claimed_by_email.eq.${email}` : null,
    ].filter(Boolean).join(",");

    const { data: ownedLocations } = await supabase
      .from("locations")
      .select(LOCATION_DASHBOARD_COLUMNS)
      .or(ownedFilters)
      .order("created_at", { ascending: false });

    locations = (ownedLocations || []).map(toDashboardLocation);
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
