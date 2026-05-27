import { requireAdminRole } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export default async function BillingPage() {
  await requireAdminRole(["superuser", "admin", "editor", "viewer"]);
  const { data } = await supabaseAdmin.from("locations").select("id,stripe_customer_id,stripe_subscription_id,created_at").limit(200);
  const rows = data || [];
  return <main className="min-h-screen bg-[#090706] p-6 text-white"><div className="mx-auto max-w-7xl rounded-3xl border border-white/10 bg-[#120d0b] p-6"><h1 className="text-3xl font-black">Billing</h1><p className="text-white/60">Connected to existing Stripe fields on locations.</p><p className="mt-3">Active subscriptions: {rows.filter((r:any)=>r.stripe_subscription_id).length}</p><p>Total accounts with customer id: {rows.filter((r:any)=>r.stripe_customer_id).length}</p></div></main>;
}
