import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationName } from "@/lib/locationName";
import { isBusinessPro } from "@/lib/analytics/business-analytics";
import BusinessAnalyticsDashboard from "@/components/analytics/BusinessAnalyticsDashboard";

export const dynamic = "force-dynamic";

export default async function BusinessAnalyticsPage() {
  const cookieStore = await cookies();
  const impersonatedLocationId = cookieStore.get("theouthaven_impersonate_location_id")?.value;
  const impersonatedUserId = cookieStore.get("theouthaven_impersonate_user_id")?.value;
  const adminUserId = cookieStore.get("theouthaven_admin_user_id")?.value;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user && !impersonatedLocationId && !impersonatedUserId && !adminUserId) {
    redirect("/login");
  }

  let query = supabaseAdmin.from("locations").select("*").order("created_at", { ascending: false });

  if (impersonatedLocationId) {
    query = query.eq("id", impersonatedLocationId);
  } else if (impersonatedUserId) {
    query = query.eq("owner_user_id", impersonatedUserId);
  } else if (!adminUserId && user) {
    query = query.or(`owner_user_id.eq.${user.id},owner_email.eq.${user.email || ""},claimed_by_email.eq.${user.email || ""}`);
  }

  const { data: locations } = await query;

  const options = (locations || []).map((location: any) => ({
    id: location.id,
    display_name: getLocationName(location, "Untitled location"),
    city: location.city || null,
    state: location.state || null,
    is_pro: isBusinessPro(location),
  }));

  return <BusinessAnalyticsDashboard locations={options} />;
}
