import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerSupabaseClient } from "@/lib/supabase-server";
import { getAppSession } from "@/lib/app-session";
import {
  ADMIN_DASHBOARD_ROLES,
  LOCATION_OWNER_ROLES,
  normalizeRole,
} from "@/lib/dashboard-permissions";
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

type RawLocation = Partial<LocationItem> & Record<string, unknown>;

function toLocationItem(location: RawLocation, locationType: LocationType) {
  return {
    ...location,
    id: String(location.id || ""),
    location_type: locationType,
    display_name:
      locationType === "restaurant"
        ? String(location.restaurant_name || "Untitled restaurant")
        : String(location.activity_name || "Untitled activity"),
  } as LocationItem;
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

export default async function DashboardPage() {
  const cookieStore = await cookies();

  const impersonatedLocationId =
    cookieStore.get("theouthaven_impersonate_location_id")?.value;

  const impersonatedLocationType =
    cookieStore.get("theouthaven_impersonate_location_type")?.value;

  const impersonatedUserId =
    cookieStore.get("theouthaven_impersonate_user_id")?.value;

  const adminUserId = cookieStore.get("theouthaven_admin_user_id")?.value;

  const sessionSupabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await sessionSupabase.auth.getUser();

  const appSession = await getAppSession();

  const supabase = adminSupabase();
  const sessionRole = normalizeRole(
    user?.user_metadata?.role || appSession?.role
  );
  const sessionEmail =
    user?.email?.trim().toLowerCase() || appSession?.email || null;

  if (
    !impersonatedLocationId &&
    !impersonatedUserId &&
    !adminUserId &&
    sessionEmail
  ) {
    const { data: adminUser } = await supabase
      .from("admin_users")
      .select("role")
      .eq("email", sessionEmail)
      .maybeSingle();

    if (
      ADMIN_DASHBOARD_ROLES.has(normalizeRole(adminUser?.role || sessionRole))
    ) {
      redirect("/admin/dashboard");
    }
  }

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
  } else if (impersonatedUserId || user?.id || appSession?.id) {
    const ownerUserId = impersonatedUserId || user?.id || appSession?.id;

    const ownerEmail = sessionEmail;

    const { data: restaurantsByUserId } = await supabase
      .from("restaurants")
      .select("*")
      .eq("owner_user_id", ownerUserId);

    const { data: activitiesByUserId } = await supabase
      .from("activities")
      .select("*")
      .eq("owner_user_id", ownerUserId);

    const { data: restaurantsByEmail } = ownerEmail
      ? await supabase
          .from("restaurants")
          .select("*")
          .ilike("owner_email", ownerEmail)
      : { data: [] };

    const { data: activitiesByEmail } = ownerEmail
      ? await supabase
          .from("activities")
          .select("*")
          .ilike("owner_email", ownerEmail)
      : { data: [] };

    const restaurants = ([
      ...(restaurantsByUserId || []),
      ...(restaurantsByEmail || []),
    ] as RawLocation[]).filter(
      (location, index, all) =>
        all.findIndex((item) => item.id === location.id) === index
    );

    const activities = ([
      ...(activitiesByUserId || []),
      ...(activitiesByEmail || []),
    ] as RawLocation[]).filter(
      (location, index, all) =>
        all.findIndex((item) => item.id === location.id) === index
    );

    locations = [
      ...restaurants.map((restaurant) =>
        toLocationItem(restaurant, "restaurant")
      ),
      ...activities.map((activity) => toLocationItem(activity, "activity")),
    ];

    impersonationLabel = impersonatedUserId
      ? "Viewing as location owner"
      : "Your locations";
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
      ...((restaurants || []) as RawLocation[]).map((restaurant) =>
        toLocationItem(restaurant, "restaurant")
      ),
      ...((activities || []) as RawLocation[]).map((activity) =>
        toLocationItem(activity, "activity")
      ),
    ];
  }

  if (
    !impersonatedLocationId &&
    !impersonatedUserId &&
    !adminUserId &&
    !LOCATION_OWNER_ROLES.has(sessionRole) &&
    locations.length === 0
  ) {
    redirect(user?.id || appSession?.id ? "/user/dashboard" : "/login");
  }

  return (
    <LocationsDashboardClient
      locations={locations}
      impersonationLabel={impersonationLabel}
    />
  );
}