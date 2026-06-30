import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createAuthClient } from "@/lib/supabase-server";
import LocationsDashboardClient from "./LocationsDashboardClient";
import { getLocationName } from "@/lib/locationName";
import type { LocationClaimFields } from "@/lib/locationClaim";
import type { LocationScoreFields } from "@/lib/locationScore";
import type { LocationVisibilityFields } from "@/lib/locationVisibility";
import {
  getLocationOwnerAccess,
  hasOwnerAccessToLocation,
} from "@/lib/auth/locationOwnerAccess";
import {
  parseDemoOwnerParams,
  requireDemoOwnerLocation,
  type DemoSearchParams,
} from "@/lib/demo/owner-context";

export const dynamic = "force-dynamic";

type LocationType = "restaurant" | "activity";

type DashboardSummary = {
  locationId: string;
  reservationsToday: number;
  upcomingReservations: number;
  guestsSeated: number;
  openSpaces: number | null;
  totalReservations30d: number;
  guestsServed30d: number;
  walkIns30d: number;
  noShows30d: number;
  revenueEstimate30d: number;
  newVipSignups30d: number;
  profileViews30d: number;
  guestClicks30d: number;
  calls30d: number;
  searchesThisMonth: number;
  searchesLastMonth: number;
  searchTrendPercent: number | null;
  profileViewsThisMonth: number;
  profileViewsLastMonth: number;
  profileViewsTrendPercent: number | null;
  clickTrendPercent: number | null;
};

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
      locationType === "restaurant"
        ? "Untitled restaurant"
        : "Untitled activity",
    ),
  } as LocationItem;
}

function emptySummary(location: LocationItem): DashboardSummary {
  return {
    locationId: location.id,
    reservationsToday: 0,
    upcomingReservations: 0,
    guestsSeated: 0,
    openSpaces: null,
    totalReservations30d: 0,
    guestsServed30d: 0,
    walkIns30d: 0,
    noShows30d: 0,
    revenueEstimate30d: 0,
    newVipSignups30d: 0,
    profileViews30d: Number((location as any).view_count || 0),
    guestClicks30d: Number((location as any).click_count || 0),
    calls30d: Number((location as any).call_count || 0),
    searchesThisMonth: 0,
    searchesLastMonth: 0,
    searchTrendPercent: null,
    profileViewsThisMonth: Number((location as any).view_count || 0),
    profileViewsLastMonth: 0,
    profileViewsTrendPercent: null,
    clickTrendPercent: null,
  };
}

function trend(current: number, previous: number) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function inRange(date: unknown, start: string, end?: string) {
  const value = String(date || "");
  return value >= start && (!end || value < end);
}

function moneyValue(row: Record<string, any>) {
  return (
    Number(
      row.deposit_amount ||
        row.amount ||
        row.total_amount ||
        row.payment_amount ||
        0,
    ) || 0
  );
}

async function safeRows(
  supabase: ReturnType<typeof adminSupabase>,
  table: string,
  locationId: string,
  from: string,
) {
  try {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("location_id", locationId)
      .gte("created_at", from)
      .limit(2000);
    if (error) return [];
    return (data || []) as Record<string, any>[];
  } catch {
    return [];
  }
}

async function buildDashboardSummaries(
  supabase: ReturnType<typeof adminSupabase>,
  locations: LocationItem[],
): Promise<Record<string, DashboardSummary>> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);
  const thirty = thirtyDaysAgo.toISOString();
  const thisMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
  const lastMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  ).toISOString();
  const result: Record<string, DashboardSummary> = {};

  await Promise.all(
    locations.map(async (location) => {
      const summary = emptySummary(location);
      const reservations = await safeRows(
        supabase,
        "location_reservations",
        location.id,
        lastMonthStart,
      );
      if (reservations.length) {
        const active = reservations.filter(
          (row) =>
            !["cancelled", "declined"].includes(
              String(row.status || "").toLowerCase(),
            ),
        );
        summary.reservationsToday = active.filter(
          (row) => String(row.reservation_date) === today,
        ).length;
        summary.upcomingReservations = active.filter(
          (row) => String(row.reservation_date) >= today,
        ).length;
        summary.guestsSeated = active
          .filter(
            (row) =>
              String(row.reservation_date) === today &&
              ["checked_in", "seated", "in_progress", "arrived"].includes(
                String(row.status || "").toLowerCase(),
              ),
          )
          .reduce((sum, row) => sum + (Number(row.party_size) || 1), 0);
        summary.totalReservations30d = active.filter((row) =>
          inRange(row.created_at || row.reservation_date, thirty),
        ).length;
        summary.guestsServed30d = active
          .filter(
            (row) =>
              inRange(row.created_at || row.reservation_date, thirty) &&
              ["completed", "seated", "checked_in", "arrived"].includes(
                String(row.status || "").toLowerCase(),
              ),
          )
          .reduce((sum, row) => sum + (Number(row.party_size) || 1), 0);
        summary.walkIns30d = active.filter(
          (row) =>
            inRange(row.created_at || row.reservation_date, thirty) &&
            String(row.source || row.channel || "")
              .toLowerCase()
              .includes("walk"),
        ).length;
        summary.noShows30d = reservations.filter(
          (row) =>
            inRange(row.created_at || row.reservation_date, thirty) &&
            String(row.status || "").toLowerCase() === "no_show",
        ).length;
        summary.revenueEstimate30d = active
          .filter((row) =>
            inRange(row.created_at || row.reservation_date, thirty),
          )
          .reduce((sum, row) => sum + moneyValue(row), 0);
      }

      const vip = await safeRows(
        supabase,
        "location_vip_signups",
        location.id,
        thirty,
      );
      summary.newVipSignups30d = vip.length;

      const events = await safeRows(
        supabase,
        "analytics_events",
        location.id,
        lastMonthStart,
      );
      if (events.length) {
        const name = (row: Record<string, any>) =>
          `${row.event_name || ""} ${row.event_type || ""}`.toLowerCase();
        const count = (
          predicate: (row: Record<string, any>) => boolean,
          start: string,
          end?: string,
        ) =>
          events.filter(
            (row) => inRange(row.created_at, start, end) && predicate(row),
          ).length;
        const profileThis = count(
          (row) => name(row).includes("profile") || name(row).includes("view"),
          thisMonthStart,
        );
        const profileLast = count(
          (row) => name(row).includes("profile") || name(row).includes("view"),
          lastMonthStart,
          thisMonthStart,
        );
        const clickThis = count(
          (row) => name(row).includes("click"),
          thisMonthStart,
        );
        const clickLast = count(
          (row) => name(row).includes("click"),
          lastMonthStart,
          thisMonthStart,
        );
        const searchThis = count(
          (row) => name(row).includes("search"),
          thisMonthStart,
        );
        const searchLast = count(
          (row) => name(row).includes("search"),
          lastMonthStart,
          thisMonthStart,
        );
        summary.profileViews30d =
          count(
            (row) =>
              name(row).includes("profile") || name(row).includes("view"),
            thirty,
          ) || summary.profileViews30d;
        summary.guestClicks30d =
          count((row) => name(row).includes("click"), thirty) ||
          summary.guestClicks30d;
        summary.calls30d =
          count((row) => name(row).includes("call"), thirty) ||
          summary.calls30d;
        summary.searchesThisMonth = searchThis;
        summary.searchesLastMonth = searchLast;
        summary.searchTrendPercent = trend(searchThis, searchLast);
        summary.profileViewsThisMonth =
          profileThis || summary.profileViewsThisMonth;
        summary.profileViewsLastMonth = profileLast;
        summary.profileViewsTrendPercent = trend(profileThis, profileLast);
        summary.clickTrendPercent = trend(clickThis, clickLast);
      }
      result[location.id] = summary;
    }),
  );

  return result;
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

    const demoLocations = demoLocation ? [demoLocation] : [];
    const summaries = await buildDashboardSummaries(
      adminSupabase(),
      demoLocations,
    );

    return (
      <LocationsDashboardClient
        locations={demoLocations}
        summaries={summaries}
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
    if (
      !ownerAccess.isAdmin &&
      ownerAccess.ownedLocationIds.length === 0 &&
      ownerAccess.ownedSourceLocationIds.length === 0
    ) {
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
      .filter((location) =>
        hasOwnerAccessToLocation(ownerAccess, location as Record<string, any>),
      )
      .map(toDashboardLocation);
  } else {
    redirect("/login?next=/locations/dashboard");
  }

  const summaries = await buildDashboardSummaries(supabase, locations);

  return (
    <LocationsDashboardClient
      locations={locations}
      impersonationLabel={impersonationLabel}
      summaries={summaries}
    />
  );
}
