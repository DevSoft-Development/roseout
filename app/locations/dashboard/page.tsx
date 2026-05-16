import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import LocationsDashboardClient from "./LocationsDashboardClient";
import { getLocationName } from "@/lib/locationName";
import type { LocationClaimFields } from "@/lib/locationClaim";
import type { LocationScoreFields } from "@/lib/locationScore";
import type { LocationVisibilityFields } from "@/lib/locationVisibility";

export const dynamic = "force-dynamic";

type LocationType = "restaurant" | "activity";


const ACTIVITY_DASHBOARD_COLUMNS =
  "id, name, activity_name, address, city, state, main_image, image_url, images, owner_name, owner_email, owner_phone, primary_category, activity_type, primary_tag, tags, google_types, is_claimed, claimed, claim_status, claimed_at, claimed_by_email, owner_user_id, theouthaven_score, roseout_score, quality_score, trend_score, conversion_score, review_score, popularity_score, ranking_badge, view_count, click_count, claim_count, is_searchable, data_status, missing_fields, is_hidden, status, last_quality_check_at, created_at";

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
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
      },
    },
  );
}

export default async function DashboardPage() {
  const cookieStore = await cookies();

  const impersonatedLocationId = cookieStore.get(
    "theouthaven_impersonate_location_id",
  )?.value;

  const impersonatedLocationType = cookieStore.get(
    "theouthaven_impersonate_location_type",
  )?.value;

  const impersonatedUserId = cookieStore.get(
    "theouthaven_impersonate_user_id",
  )?.value;

  const adminUserId = cookieStore.get("theouthaven_admin_user_id")?.value;

  const supabase = adminSupabase();

  let locations: LocationItem[] = [];
  let impersonationLabel = "";

  if (
    impersonatedLocationId &&
    ["restaurants", "activities"].includes(impersonatedLocationType || "")
  ) {
    const table = impersonatedLocationType as "restaurants" | "activities";

    const { data } = await supabase
      .from(table)
      .select(table === "activities" ? ACTIVITY_DASHBOARD_COLUMNS : "*")
      .eq("id", impersonatedLocationId)
      .maybeSingle();

    if (data) {
      const locationData = data as Record<string, any>;

      locations = [
        ({
          ...locationData,
          location_type: table === "restaurants" ? "restaurant" : "activity",
          display_name: getLocationName(
            locationData,
            table === "restaurants"
              ? "Untitled restaurant"
              : "Untitled activity",
          ),
        } as LocationItem),
      ];

      impersonationLabel = `Viewing as ${locations[0].display_name}`;
    }
  } else if (impersonatedUserId) {
    const { data: restaurants } = await supabase
      .from("restaurants")
      .select("*")
      .eq("owner_user_id", impersonatedUserId);

    const { data: activities } = await supabase
      .from("activities")
      .select(ACTIVITY_DASHBOARD_COLUMNS)
      .eq("owner_user_id", impersonatedUserId);

    locations = [
      ...(restaurants || []).map((r: any) => ({
        ...r,
        location_type: "restaurant" as LocationType,
        display_name: getLocationName(r, "Untitled restaurant"),
      })),
      ...(activities || []).map((a: any) => ({
        ...a,
        location_type: "activity" as LocationType,
        display_name: getLocationName(a, "Untitled activity"),
      })),
    ];

    impersonationLabel = "Viewing as location owner";
  } else if (adminUserId) {
    const { data: restaurants } = await supabase
      .from("restaurants")
      .select("*")
      .order("created_at", { ascending: false });

    const { data: activities } = await supabase
      .from("activities")
      .select(ACTIVITY_DASHBOARD_COLUMNS)
      .order("created_at", { ascending: false });

    locations = [
      ...(restaurants || []).map((r: any) => ({
        ...r,
        location_type: "restaurant" as LocationType,
        display_name: getLocationName(r, "Untitled restaurant"),
      })),
      ...(activities || []).map((a: any) => ({
        ...a,
        location_type: "activity" as LocationType,
        display_name: getLocationName(a, "Untitled activity"),
      })),
    ];
  }

  return (
    <LocationsDashboardClient
      locations={locations}
      impersonationLabel={impersonationLabel}
    />
  );
}
