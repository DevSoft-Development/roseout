import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminRole } from "@/lib/admin-auth";
import { getLocationName } from "@/lib/locationName";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export const dynamic = "force-dynamic";

export default async function AdminBillingPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.billing);

  const { data: locations } = await supabaseAdmin
    .from("locations")
    .select("id,name,restaurant_name,activity_name,subscription_plan,subscription_status,stripe_customer_id,stripe_subscription_id,current_period_end")
    .order("updated_at", { ascending: false })
    .limit(200);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10 text-white">
      <h1 className="text-3xl font-black">Admin Billing</h1>
      <p className="mt-2 text-sm text-white/60">Stripe subscriptions and billing state synced on business locations.</p>
      <div className="mt-8 overflow-x-auto rounded-2xl border border-white/10">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-white/5 text-white/70">
            <tr>
              <th className="px-4 py-3">Location</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Stripe Customer</th><th className="px-4 py-3">Stripe Subscription</th>
            </tr>
          </thead>
          <tbody>
            {(locations || []).map((location: any) => (
              <tr key={location.id} className="border-t border-white/10">
                <td className="px-4 py-3">{getLocationName(location, "Untitled")}</td>
                <td className="px-4 py-3">{location.subscription_plan || "free"}</td>
                <td className="px-4 py-3">{location.subscription_status || "inactive"}</td>
                <td className="px-4 py-3">{location.stripe_customer_id || "—"}</td>
                <td className="px-4 py-3">{location.stripe_subscription_id || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
