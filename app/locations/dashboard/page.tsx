import { cookies } from "next/headers";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient as createServerSupabaseClient } from "@/lib/supabase-server";
import LocationsDashboardClient from "./LocationsDashboardClient";

export const dynamic = "force-dynamic";

type LocationType = "restaurant" | "activity";

type LocationItem = {
  id: string;
  location_type: LocationType;
  display_name: string;
  restaurant_name?: string;
  activity_name?: string;
  address?: string;
  city?: string;
  state?: string;
  image_url?: string;
  theouthaven_score?: number;
  quality_score?: number;
  claim_status?: string;
  owner_name?: string;
  owner_email?: string;
  owner_phone?: string;
  primary_tag?: string;
};

type LocationRecord = LocationItem & Record<string, unknown>;

type RestaurantOwnerLink = {
  restaurants?: LocationRecord | LocationRecord[] | null;
};

type ActivityOwnerLink = {
  activities?: LocationRecord | LocationRecord[] | null;
};

function toRestaurantItem(restaurant: LocationRecord): LocationItem {
  return {
    ...restaurant,
    location_type: "restaurant",
    display_name: restaurant.restaurant_name || "Untitled restaurant",
  };
}

function toActivityItem(activity: LocationRecord): LocationItem {
  return {
    ...activity,
    location_type: "activity",
    display_name: activity.activity_name || "Untitled activity",
  };
}

function adminSupabase() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
      },
    }
  );
}

export default async function DashboardPage() {
  const cookieStore = await cookies();

  const impersonatedLocationId =
    cookieStore.get("theouthaven_impersonate_location_id")?.value;

  const impersonatedLocationType =
    cookieStore.get("theouthaven_impersonate_location_type")?.value;

  const impersonatedUserId =
    cookieStore.get("theouthaven_impersonate_user_id")?.value;

  const adminUserId = cookieStore.get("theouthaven_admin_user_id")?.value;

  const supabase = adminSupabase();
  const authSupabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await authSupabase.auth.getUser();

  const currentUserId = user?.id || null;
  const currentUserEmail = user?.email?.toLowerCase() || null;

  let locations: LocationItem[] = [];
  let impersonationLabel = "";

  if (
    impersonatedLocationId &&
    ["restaurants", "activities"].includes(impersonatedLocationType || "")
  ) {
    const table = impersonatedLocationType as "restaurants" | "activities";

    const { data } = await supabase
      .from(table)
      .select("*")
      .eq("id", impersonatedLocationId)
      .maybeSingle();

    if (data) {
      locations = [
        {
          ...data,
          location_type: table === "restaurants" ? "restaurant" : "activity",
          display_name:
            table === "restaurants"
              ? data.restaurant_name || "Untitled restaurant"
              : data.activity_name || "Untitled activity",
        },
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
      .select("*")
      .eq("owner_user_id", impersonatedUserId);

    locations = [
      ...((restaurants || []) as LocationRecord[]).map(toRestaurantItem),
      ...((activities || []) as LocationRecord[]).map(toActivityItem),
    ];

    impersonationLabel = "Viewing as location owner";
  } else if (adminUserId) {
    const { data: restaurants } = await supabase
      .from("restaurants")
      .select("*")
      .order("created_at", { ascending: false });

    const { data: activities } = await supabase
      .from("activities")
      .select("*")
      .order("created_at", { ascending: false });

    locations = [
      ...((restaurants || []) as LocationRecord[]).map(toRestaurantItem),
      ...((activities || []) as LocationRecord[]).map(toActivityItem),
    ];
  } else if (currentUserId) {
    const [restaurantsByUser, activitiesByUser, restaurantOwnerLinks, activityOwnerLinks] =
      await Promise.all([
        supabase.from("restaurants").select("*").eq("owner_user_id", currentUserId),
        supabase.from("activities").select("*").eq("owner_user_id", currentUserId),
        currentUserEmail
          ? supabase
              .from("restaurant_owners")
              .select("restaurant_id, restaurants (*)")
              .or(`user_id.eq.${currentUserId},email.ilike.${currentUserEmail}`)
          : supabase
              .from("restaurant_owners")
              .select("restaurant_id, restaurants (*)")
              .eq("user_id", currentUserId),
        currentUserEmail
          ? supabase
              .from("activity_owners")
              .select("activity_id, activities (*)")
              .or(`user_id.eq.${currentUserId},email.ilike.${currentUserEmail}`)
          : supabase
              .from("activity_owners")
              .select("activity_id, activities (*)")
              .eq("user_id", currentUserId),
      ]);

    const restaurantMap = new Map<string, LocationRecord>();
    const activityMap = new Map<string, LocationRecord>();

    ((restaurantsByUser.data || []) as LocationRecord[]).forEach((restaurant) => {
      restaurantMap.set(restaurant.id, restaurant);
    });

    ((activitiesByUser.data || []) as LocationRecord[]).forEach((activity) => {
      activityMap.set(activity.id, activity);
    });

    ((restaurantOwnerLinks.data || []) as RestaurantOwnerLink[]).forEach((link) => {
      const restaurant = Array.isArray(link.restaurants)
        ? link.restaurants[0]
        : link.restaurants;

      if (restaurant?.id) {
        restaurantMap.set(restaurant.id, restaurant);
      }
    });

    ((activityOwnerLinks.data || []) as ActivityOwnerLink[]).forEach((link) => {
      const activity = Array.isArray(link.activities)
        ? link.activities[0]
        : link.activities;

      if (activity?.id) {
        activityMap.set(activity.id, activity);
      }
    });

    locations = [
      ...Array.from(restaurantMap.values()).map(toRestaurantItem),
      ...Array.from(activityMap.values()).map(toActivityItem),
    ];
  }

  return (
    <LocationsDashboardClient
      locations={locations}
      impersonationLabel={impersonationLabel}
    />
  );
}