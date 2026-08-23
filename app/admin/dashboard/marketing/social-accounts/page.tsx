import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const providers = [
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
  { key: "tiktok", label: "TikTok" },
  { key: "youtube", label: "YouTube" },
] as const;

export default async function SocialAccountsPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.marketingSocialAccounts);
  const { data } = await supabaseAdmin
    .from("marketing_social_connections")
    .select("id,provider,display_name,username,status,granted_scopes,token_expires_at,last_refreshed_at,last_sync_at,last_error,connected_at")
    .eq("scope", "platform")
    .order("provider");
  const connections = data || [];

  return (
    <main className="space-y-6 p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Marketing Settings</p>
        <h1 className="text-3xl font-semibold">Social Accounts</h1>
        <p className="mt-1 text-sm text-neutral-600">Company social connections are controlled here. Marketing staff never need direct account passwords.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {providers.map((provider) => {
          const connection = connections.find((item) => item.provider === provider.key);
          const connected = connection?.status === "connected";
          return (
            <section key={provider.key} className="rounded-xl border bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{provider.label}</h2>
                  <p className="mt-1 text-sm text-neutral-500">{connection?.username ? `@${String(connection.username).replace(/^@/, '')}` : connection?.display_name || "Not connected"}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${connected ? "bg-emerald-50 text-emerald-700" : connection?.status === "degraded" || connection?.status === "reauthorization_required" ? "bg-amber-50 text-amber-700" : "bg-neutral-100 text-neutral-600"}`}>
                  {connection?.status?.replaceAll("_", " ") || "disconnected"}
                </span>
              </div>
              <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-neutral-500">Connected</dt><dd className="font-medium">{connection?.connected_at ? new Date(connection.connected_at).toLocaleString() : "—"}</dd></div>
                <div><dt className="text-neutral-500">Last sync</dt><dd className="font-medium">{connection?.last_sync_at ? new Date(connection.last_sync_at).toLocaleString() : "—"}</dd></div>
                <div><dt className="text-neutral-500">Token refresh</dt><dd className="font-medium">{connection?.last_refreshed_at ? new Date(connection.last_refreshed_at).toLocaleString() : "—"}</dd></div>
                <div><dt className="text-neutral-500">Token expires</dt><dd className="font-medium">{connection?.token_expires_at ? new Date(connection.token_expires_at).toLocaleString() : "—"}</dd></div>
              </dl>
              {connection?.last_error ? <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{connection.last_error}</div> : null}
              <div className="mt-5 rounded-lg border border-dashed p-3 text-sm text-neutral-500">
                OAuth connection action will appear here once the provider app credentials are configured in the deployment environment.
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
