import Link from "next/link";
import ImpersonateButton from "@/components/admin/ImpersonateButton";
import { requireAdminRole } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Owner Accounts – Admin",
};

type OwnerAccount = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
  created_at: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function Page() {
  const currentAdmin = await requireAdminRole(["superadmin", "admin", "editor", "viewer"]);
  const canImpersonate = ["superadmin", "admin"].includes(currentAdmin.role);

  const { data: owners, error } = await supabaseAdmin
    .from("users")
    .select("id,email,full_name,role,created_at")
    .in("role", ["owner", "business_owner", "location_owner"])
    .order("created_at", { ascending: false })
    .limit(250);

  const ownerAccounts = (owners || []) as OwnerAccount[];

  return (
    <main className="min-h-screen bg-[#090706] p-6 text-white">
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="rounded-[1.75rem] border border-white/10 bg-[linear-gradient(135deg,#160b0b,#090706_55%,#140f0a)] p-6 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-300">TheOutHaven Admin</p>
          <h1 className="mt-2 text-3xl font-black">Owner Accounts</h1>
          <p className="mt-2 text-sm text-white/60">Review connected location owners and securely start admin-only owner impersonation.</p>
        </section>

        {error && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm font-bold text-rose-100">{error.message}</div>}

        <section className="rounded-[1.75rem] border border-white/10 bg-[#120d0b] p-4 shadow-2xl">
          {!ownerAccounts.length ? (
            <p className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-white/55">No owner accounts found.</p>
          ) : (
            <div className="space-y-3">
              {ownerAccounts.map((owner) => (
                <div key={owner.id} className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="min-w-0">
                    <p className="truncate font-black text-white">{owner.full_name || owner.email || "Unnamed owner"}</p>
                    <p className="mt-1 truncate text-sm text-white/55">{owner.email || "No email"}</p>
                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/35">Joined {formatDate(owner.created_at)} · {owner.role || "owner"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <Link href={`/admin/dashboard/users/${owner.id}`} className="rounded-full border border-white/10 bg-black/25 px-4 py-2 text-xs font-black text-white/75 transition hover:bg-white/10 hover:text-white">View user</Link>
                    {canImpersonate && (
                      <ImpersonateButton
                        userId={owner.id}
                        targetType="user"
                        label="Log in as owner"
                        className="rounded-full border border-amber-200/40 bg-amber-500/15 px-4 py-2 text-xs font-black text-amber-50 transition hover:bg-amber-500/25 disabled:opacity-50"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
