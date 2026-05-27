import { requireAdminRole } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export default async function OwnerAccountsPage() {
  await requireAdminRole(["superuser", "admin", "editor", "viewer"]);
  const { data, error } = await supabaseAdmin.from("users").select("id,full_name,email,role,created_at").eq("role", "owner").limit(200);
  const owners = data || [];
  return <main className="min-h-screen bg-[#090706] p-6 text-white"><div className="mx-auto max-w-7xl rounded-3xl border border-white/10 bg-[#120d0b] p-6"><h1 className="text-3xl font-black">Owner Accounts</h1>{error ? <p className="text-rose-300">{error.message}</p> : <p className="text-white/60">Total owners: {owners.length}</p>}</div></main>;
}
