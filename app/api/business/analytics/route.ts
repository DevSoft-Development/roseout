import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getMetadataAdminUser } from "@/lib/admin-auth";

const RANGE_DAYS: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "12m": 365,
};

function sum(rows: any[], key: string) {
  return rows.reduce((total, row) => total + Number(row?.[key] || 0), 0);
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function startDateFor(range: string) {
  const days = RANGE_DAYS[range] || RANGE_DAYS["30d"];
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - (days - 1));
  return date.toISOString().slice(0, 10);
}

async function isAdminUser(user: any) {
  if (!user?.email) return false;

  const { data } = await supabaseAdmin
    .from("admin_users")
    .select("role")
    .eq("email", user.email.toLowerCase())
    .maybeSingle();

  if (data?.role && ["superuser", "admin", "editor", "viewer"].includes(data.role)) {
    return true;
  }

  return Boolean(getMetadataAdminUser(user));
}

async function canViewLocation(user: any, locationId: string) {
  if (!user) return false;
  if (await isAdminUser(user)) return true;

  const { data: location } = await supabaseAdmin
    .from("locations")
    .select("id, owner_user_id, owner_email, claimed_by_email")
    .eq("id", locationId)
    .maybeSingle();

  if (!location) return false;

  const email = String(user.email || "").toLowerCase();
  return (
    location.owner_user_id === user.id ||
    (email && String(location.owner_email || "").toLowerCase() === email) ||
    (email && String(location.claimed_by_email || "").toLowerCase() === email)
  );
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get("location_id") || "";
  const range = searchParams.get("range") || "30d";

  if (!locationId) {
    return NextResponse.json({ success: false, error: "Missing location_id" }, { status: 400 });
  }

  if (!(await canViewLocation(user, locationId))) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const fromDate = startDateFor(range);

  const [dailyResult, hourlyResult, customerResult] = await Promise.all([
    supabaseAdmin
      .from("location_daily_analytics")
      .select("*")
      .eq("location_id", locationId)
      .gte("analytics_date", fromDate)
      .order("analytics_date", { ascending: true }),
    supabaseAdmin
      .from("location_hourly_analytics")
      .select("*")
      .eq("location_id", locationId)
      .order("day_of_week", { ascending: true })
      .order("hour_of_day", { ascending: true }),
    supabaseAdmin
      .from("location_customer_insights")
      .select("*")
      .eq("location_id", locationId),
  ]);

  if (dailyResult.error) {
    return NextResponse.json({ success: false, error: dailyResult.error.message }, { status: 500 });
  }

  const daily = dailyResult.data || [];
  const hourly = hourlyResult.data || [];
  const customers = customerResult.data || [];

  const profileViews = sum(daily, "profile_views");
  const searchAppearances = sum(daily, "search_appearances");
  const searchClicks = sum(daily, "search_clicks");
  const reservationStarts = sum(daily, "reservation_starts");
  const reservationCompletions = sum(daily, "reservation_completions");
  const reservationCancellations = sum(daily, "reservation_cancellations");
  const totalRevenue = sum(daily, "total_revenue");
  const uniqueVisitors = Math.max(
    sum(daily, "unique_visitors"),
    new Set(customers.map((customer) => customer.user_id).filter(Boolean)).size,
  );
  const repeatVisitors = Math.max(
    sum(daily, "repeat_visitors"),
    customers.filter((customer) => Number(customer.visit_count || 0) > 1).length,
  );

  const partySizes = customers
    .map((customer) => Number(customer.preferred_party_size || 0))
    .filter((value) => value > 0);
  const topOutingTypes = Object.entries(
    customers.reduce<Record<string, number>>((counts, customer) => {
      const key = String(customer.preferred_outing_type || "").trim();
      if (key) counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => ({ label, count }));

  const popularTimes = [...hourly]
    .sort(
      (a, b) =>
        Number(b.profile_views || 0) + Number(b.search_clicks || 0) + Number(b.reservations || 0) -
        (Number(a.profile_views || 0) + Number(a.search_clicks || 0) + Number(a.reservations || 0)),
    )
    .slice(0, 6);

  return NextResponse.json({
    success: true,
    summary: {
      profile_views: profileViews,
      search_appearances: searchAppearances,
      search_clicks: searchClicks,
      click_through_rate: ratio(searchClicks, searchAppearances),
      directions_clicks: sum(daily, "directions_clicks"),
      website_clicks: sum(daily, "website_clicks"),
      phone_clicks: sum(daily, "phone_clicks"),
      reservation_starts: reservationStarts,
      reservation_completions: reservationCompletions,
      reservation_conversion_rate: ratio(reservationCompletions, reservationStarts),
      reservation_cancellations: reservationCancellations,
      cancellation_rate: ratio(reservationCancellations, reservationCompletions),
      total_revenue: totalRevenue,
      average_booking_value: reservationCompletions > 0 ? totalRevenue / reservationCompletions : 0,
      unique_visitors: uniqueVisitors,
      repeat_visitors: repeatVisitors,
    },
    daily,
    hourly,
    customer_insights: {
      repeat_visitor_rate: ratio(repeatVisitors, uniqueVisitors),
      average_party_size:
        partySizes.length > 0
          ? partySizes.reduce((total, value) => total + value, 0) / partySizes.length
          : 0,
      top_outing_types: topOutingTypes,
      popular_times: popularTimes,
    },
    heatmap: hourly.map((row) => ({
      day_of_week: row.day_of_week,
      hour_of_day: row.hour_of_day,
      intensity:
        Number(row.profile_views || 0) +
        Number(row.search_clicks || 0) * 2 +
        Number(row.reservations || 0) * 4,
      profile_views: row.profile_views || 0,
      search_clicks: row.search_clicks || 0,
      reservations: row.reservations || 0,
      cancellations: row.cancellations || 0,
    })),
  });
}
