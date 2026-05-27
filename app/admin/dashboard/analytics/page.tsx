import { requireAdminRole } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationName } from "@/lib/locationName";
import BusinessAnalyticsDashboard from "@/components/analytics/BusinessAnalyticsDashboard";

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage() {
  await requireAdminRole(["superuser", "admin", "editor", "viewer"]);

  const { data: locations } = await supabaseAdmin
    .from("locations")
    .select("id, name, restaurant_name, activity_name, city, state")
    .order("created_at", { ascending: false })
    .limit(250);

  const options = (locations || []).map((location: any) => ({
    id: location.id,
    display_name: getLocationName(location, "Untitled location"),
    city: location.city || null,
    state: location.state || null,
    is_pro: true,
  }));

  return <BusinessAnalyticsDashboard locations={options} admin />;
}
