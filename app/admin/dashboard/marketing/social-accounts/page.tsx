import SocialConnectionActions from "@/components/marketing/SocialConnectionActions";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { socialOauthConfigured, type SocialProvider } from "@/lib/marketing/social-oauth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const providers: Array<{ key: SocialProvider; label: string; purpose: string }> = [
  { key: "instagram", label: "Instagram", purpose: "Reels, image/video publishing, account insights" },
  { key: "facebook", label: "Facebook", purpose: "Page posts, Reels/media, Page insights" },
  { key: "tiktok", label: "TikTok", purpose: "Direct posting and video performance" },
  { key: "youtube", label: "YouTube", purpose: "Shorts/video upload and channel analytics" },
];

function health(connection: any) {
  if (!connection) return "disconnected";
  if (connection.status !== "connected") return connection.status || "disconnected";
  if (connection.token_expires_at && new Date(connection.token_expires_at).getTime() <= Date.now()) return "reauthorization_required";
  if (connection.last_error) return "degraded";
  return "connected";
}

export default async function SocialAccountsPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.marketingSocialAccounts);
  const params = await searchParams;
  const { data } = await supabaseAdmin
    .from("marketing_social_connections")
    .select("id,provider,provider_account_id,provider_business_id,display_name,username,status,granted_scopes,token_expires_at,last_refreshed_at,last_sync_at,last_error,connected_at")
    .eq("scope", "platform")
    .order("provider");
  const connections = data || [];

  return (
    <main className="space-y-6 p-4 sm:p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Marketing Settings</p>
        <h1 className="text-3xl font-semibold">Social Accounts</h1>
        <p className="mt-1 max-w-3xl text-sm text-neutral-600">OAuth only. Employees never receive or share social passwords. OAuth access tokens are encrypted in the server-only data layer.</p>
      </div>

      {params.connected ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">{params.connected} connected successfully.</div> : null}
      {params.error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-900">{params.error}</div> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {providers.map((provider) => {
          const connection = connections.find((item) => item.provider === provider.key && item.status !== "disconnected") || connections.find((item) => item.provider === provider.key);
          const displayHealth = health(connection);
          const connected = displayHealth === "connected" || displayHealth === "degraded" || displayHealth === "reauthorization_required";
          const configured = socialOauthConfigured(provider.key);
          return (
            <section key={provider.key} className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{provider.label}</h2>
                  <p className="mt-1 text-sm text-neutral-500">{connection?.username ? `${String(connection.username).startsWith("@") ? "" : "@"}${connection.username}` : connection?.display_name || "Not connected"}</p>
                  <p className="mt-2 text-xs text-neutral-500">{provider.purpose}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${displayHealth === "connected" ? "bg-emerald-50 text-emerald-700" : displayHealth === "degraded" || displayHealth === "reauthorization_required" ? "bg-amber-50 text-amber-700" : "bg-neutral-100 text-neutral-600"}`}>
                  {displayHealth.replaceAll("_", " ")}
                </span>
              </div>

              <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-neutral-500">Connected</dt><dd className="font-medium">{connection?.connected_at ? new Date(connection.connected_at).toLocaleString() : "—"}</dd></div>
                <div><dt className="text-neutral-500">Last sync</dt><dd className="font-medium">{connection?.last_sync_at ? new Date(connection.last_sync_at).toLocaleString() : "—"}</dd></div>
                <div><dt className="text-neutral-500">Token refresh</dt><dd className="font-medium">{connection?.last_refreshed_at ? new Date(connection.last_refreshed_at).toLocaleString() : "—"}</dd></div>
                <div><dt className="text-neutral-500">Token expires</dt><dd className="font-medium">{connection?.token_expires_at ? new Date(connection.token_expires_at).toLocaleString() : "Provider-managed / unknown"}</dd></div>
              </dl>

              <div className="mt-4 rounded-xl bg-neutral-50 p-3 text-xs text-neutral-600">
                <div className="font-semibold text-neutral-800">OAuth readiness</div>
                <div className="mt-1">{configured ? "Provider app credentials detected. Connect/reconnect is available." : "Provider app credentials are not present in this deployment environment yet."}</div>
                {connection?.granted_scopes?.length ? <div className="mt-2 break-words">Scopes: {connection.granted_scopes.join(", ")}</div> : null}
              </div>

              {connection?.last_error ? <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{connection.last_error}</div> : null}
              <SocialConnectionActions provider={provider.key} connectionId={connection?.id} configured={configured} connected={connected} />
            </section>
          );
        })}
      </div>

      <section className="rounded-2xl border bg-neutral-950 p-5 text-white">
        <h2 className="font-semibold">Required deployment secrets</h2>
        <p className="mt-1 text-sm text-neutral-300">Configure provider app IDs/secrets plus SOCIAL_TOKEN_ENCRYPTION_KEY and SOCIAL_OAUTH_STATE_SECRET in Vercel. Tokens themselves are never environment variables and never appear in the browser.</p>
      </section>
    </main>
  );
}
