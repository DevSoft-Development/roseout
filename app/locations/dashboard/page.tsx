import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "@/lib/supabase-server";
import LocationsDashboardClient from "./LocationsDashboardClient";

export const dynamic = "force-dynamic";

type LocationType = "restaurant" | "activity";

type LocationRow = Record<string, unknown> & {
  id: string;
  restaurant_name?: string | null;
  activity_name?: string | null;
  owner_user_id?: string | null;
  owner_email?: string | null;
};

type OwnerProfile = {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
};

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

type RestaurantLocationRow = LocationRow & {
  restaurant_name?: string | null;
};

type ActivityLocationRow = LocationRow & {
  activity_name?: string | null;
};

function toRestaurantLocation(restaurant: RestaurantLocationRow): LocationItem {
  return {
    ...(restaurant as Omit<LocationItem, "display_name" | "location_type">),
    restaurant_name: restaurant.restaurant_name || undefined,
    activity_name: undefined,
    location_type: "restaurant",
    display_name: restaurant.restaurant_name || "Untitled restaurant",
  };
}

function toActivityLocation(activity: ActivityLocationRow): LocationItem {
  return {
    ...(activity as Omit<LocationItem, "display_name" | "location_type">),
    restaurant_name: undefined,
    activity_name: activity.activity_name || undefined,
    location_type: "activity",
    display_name: activity.activity_name || "Untitled activity",
  };
}

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
      },
    }
  );
}

function getCookieValue(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  key: string
) {
  return (
    cookieStore.get(`theouthaven_${key}`)?.value ||
    cookieStore.get(`roseout_${key}`)?.value
  );
}

function uniqueById<T extends { id: string }>(items: T[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

async function isAdminUser(
  supabase: ReturnType<typeof adminSupabase>,
  userId?: string,
  email?: string | null
) {
  if (!userId && !email) return false;

  if (email) {
    const { data: adminUser } = await supabase
      .from("admin_users")
      .select("id")
      .eq("email", email.toLowerCase())
      .maybeSingle();

    if (adminUser) return true;
  }

  if (!userId) return false;

  const { data: profile } = await supabase
    .from("users")
    .select("role, is_superadmin")
    .eq("id", userId)
    .maybeSingle();

  const role = String(profile?.role || "").toLowerCase();

  return (
    Boolean(profile?.is_superadmin) ||
    ["superadmin", "superuser", "admin", "editor", "reviewer", "viewer"].includes(
      role
    )
  );
}

async function getOwnedLocations(
  supabase: ReturnType<typeof adminSupabase>,
  userId?: string,
  email?: string | null
) {
  const normalizedEmail = email?.toLowerCase() || null;

  const [restaurantsByUser, activitiesByUser, restaurantsByEmail, activitiesByEmail] =
    await Promise.all([
      userId
        ? supabase
            .from("restaurants")
            .select("*")
            .eq("owner_user_id", userId)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
      userId
        ? supabase
            .from("activities")
            .select("*")
            .eq("owner_user_id", userId)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
      normalizedEmail
        ? supabase
            .from("restaurants")
            .select("*")
            .eq("owner_email", normalizedEmail)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
      normalizedEmail
        ? supabase
            .from("activities")
            .select("*")
            .eq("owner_email", normalizedEmail)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);

  return [
    ...uniqueById([
      ...((restaurantsByUser.data || []) as RestaurantLocationRow[]),
      ...((restaurantsByEmail.data || []) as RestaurantLocationRow[]),
    ]).map(toRestaurantLocation),
    ...uniqueById([
      ...((activitiesByUser.data || []) as ActivityLocationRow[]),
      ...((activitiesByEmail.data || []) as ActivityLocationRow[]),
    ]).map(toActivityLocation),
  ];
}

export default async function DashboardPage() {
  const cookieStore = await cookies();

  const impersonatedLocationId = getCookieValue(
    cookieStore,
    "impersonate_location_id"
  );

  const impersonatedLocationType = getCookieValue(
    cookieStore,
    "impersonate_location_type"
  );

  const impersonatedUserId = getCookieValue(cookieStore, "impersonate_user_id");

  const adminUserId = getCookieValue(cookieStore, "admin_user_id");

  const sessionSupabase = await createServerSupabase();
  const {
    data: { user },
  } = await sessionSupabase.auth.getUser();

  const supabase = adminSupabase();

  let locations: LocationItem[] = [];
  let impersonationLabel = "";
  let ownerProfile: OwnerProfile | null = null;

  if (user?.id) {
    const { data: profile } = await supabase
      .from("users")
      .select("full_name, email, phone")
      .eq("id", user.id)
      .maybeSingle();

    ownerProfile = {
      full_name:
        profile?.full_name ||
        (user.user_metadata?.full_name as string | undefined) ||
        null,
      email: profile?.email || user.email || null,
      phone:
        profile?.phone || (user.user_metadata?.phone as string | undefined) || null,
    };
  }

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
        table === "restaurants"
          ? toRestaurantLocation(data as RestaurantLocationRow)
          : toActivityLocation(data as ActivityLocationRow),
      ];

      impersonationLabel = `Viewing as ${locations[0].display_name}`;
    }
  } else if (impersonatedUserId) {
    const { data: targetUser } = await supabase
      .from("users")
      .select("email")
      .eq("id", impersonatedUserId)
      .maybeSingle();

    locations = await getOwnedLocations(
      supabase,
      impersonatedUserId,
      targetUser?.email || null
    );

    impersonationLabel = "Viewing as location owner";
  } else if (
    adminUserId ||
    (await isAdminUser(supabase, user?.id, user?.email || null))
  ) {
    const { data: restaurants } = await supabase
      .from("restaurants")
      .select("*")
      .order("created_at", { ascending: false });

    const { data: activities } = await supabase
      .from("activities")
      .select("*")
      .order("created_at", { ascending: false });

    locations = [
      ...((restaurants || []) as RestaurantLocationRow[]).map(
        toRestaurantLocation
      ),
      ...((activities || []) as ActivityLocationRow[]).map(toActivityLocation),
    ];
  } else if (user?.id) {
    locations = await getOwnedLocations(supabase, user.id, user.email || null);
  }

  return (
    <LocationsDashboardClient
      locations={locations}
      impersonationLabel={impersonationLabel}
      ownerProfile={ownerProfile}
    />
  );
}