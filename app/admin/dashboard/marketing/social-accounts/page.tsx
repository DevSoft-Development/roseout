import SocialConnectionActions from "@/components/marketing/SocialConnectionActions";
import SocialPublishingControls from "@/components/marketing/SocialPublishingControls";
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

function settingBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true";
  return false;
}

function healthClass(value: string) {
  if (value === "connected") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  if (value === "degraded" || value === "reauthorization_required") return "border-amber-300/20 bg-amber-300/10 text-amber-200";
  return "border-white/10 bg-white/[0.06] text-white/55";
}

export default async function SocialAccountsPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.marketingSocialAccounts);
  const params = await searchParams;
  const [{ data }, { data: settingRows }] = await Promise.all([
    supabaseAdmin
      .from("marketing_social_connections")
      .select("id,provider,provider_account_id,provider_business_id,display_name,username,status,granted_scopes,token_expires_at,last_refreshed_at,last_sync_at,last_error,connected_at")
      .eq("scope", "platform")
      .order("provider"),
    supabaseAdmin
      .from("marketing_settings")
      .select("key,value")
      .in("key", ["social_publishing_global_pause", "social_publishing_pause_instagram", "social_publishing_pause_facebook", "social_publishing_pause_tiktok", "social_publishing_pause_youtube"]),
  ]);
  const connections = data || [];
  const publishSettings = Object.fromEntries((settingRows || []).map((row) => [row.key, settingBoolean(row.value)]));
  const connectedCount = providers.filter((provider) => {
    const connection = connections.find((item) => item.provider === provider.key && item.status !== "disconnected") || connections.find((item) => item.provider === provider.key);
    const state = health(connection);
    return state === "connected" || state === "degraded" || state === "reauthorization_required";
  }).length;

  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-4 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.26),transparent_34%),linear-gradient(135deg,#170b0b,#090706_58%,#14100c)] p-5 shadow-2xl sm:p-7">
          <div className="absolute right-[-70px] top-[-70px] h-72 w-72 rounded-full bg-rose-500/20 blur-3xl" />
          <div className="absolute bottom-[-80px] left-16 h-56 w-56 rounded-full bg-rose-300/10 blur-3xl" />
          <div className="relative z-10 grid gap-5 xl:grid-cols-[1fr_360px] xl:items-end">
            <div>
              <p className="mb-3 text-xs font-black uppercase tracking-[0.35em] text-rose-300">Marketing Settings</p>
              <h1 className="text-4xl font-black tracking-tight sm:text-5xl">Social Accounts</h1>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-white/60 sm:text-base">Connect TheOutHaven&apos;s social channels with OAuth, keep publishing credentials out of employee hands, and manage every network from one secure control center.</p>
            </div>
            <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.08] p-5 backdrop-blur">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-white/45">Connection Pulse</p>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div>
                  <p className="text-4xl font-black">{connectedCount}</p>
                  <p className="mt-1 text-sm text-white/45">of {providers.length} networks connected</p>
                </div>
                <span className="rounded-full bg-rose-300 px-3 py-2 text-xs font-black text-black">OAuth only</span>
              </div>
            </div>
          </div>
        </section>

        {params.connected ? <div className="rounded-[1.25rem] border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm font-bold text-emerald-200">{params.connected} connected successfully.</div> : null}
        {params.error ? <div className="rounded-[1.25rem] border border-red-400/20 bg-red-400/10 p-4 text-sm font-bold text-red-200">{params.error}</div> : null}

        <SocialPublishingControls initial={publishSettings} />

        <div className="grid gap-4 lg:grid-cols-2">
          {providers.map((provider) => {
            const connection = connections.find((item) => item.provider === provider.key && item.status !== "disconnected") || connections.find((item) => item.provider === provider.key);
            const displayHealth = health(connection);
            const connected = displayHealth === "connected" || displayHealth === "degraded" || displayHealth === "reauthorization_required";
            const configured = socialOauthConfigured(provider.key);
            return (
              <section key={provider.key} className="rounded-[1.75rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-rose-300/80">Social Network</p>
                    <h2 className="mt-1 text-2xl font-black">{provider.label}</h2>
                    <p className="mt-1 text-sm text-white/50">{connection?.username ? `${String(connection.username).startsWith("@") ? "" : "@"}${connection.username}` : connection?.display_name || "Not connected"}</p>
                    <p className="mt-3 text-xs leading-5 text-white/40">{provider.purpose}</p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-black capitalize ${healthClass(displayHealth)}`}>
                    {displayHealth.replaceAll("_", " ")}
                  </span>
                </div>

                <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                  {[
                    ["Connected", connection?.connected_at ? new Date(connection.connected_at).toLocaleString() : "—"],
                    ["Last sync", connection?.last_sync_at ? new Date(connection.last_sync_at).toLocaleString() : "—"],
                    ["Token refresh", connection?.last_refreshed_at ? new Date(connection.last_refreshed_at).toLocaleString() : "—"],
                    ["Token expires", connection?.token_expires_at ? new Date(connection.token_expires_at).toLocaleString() : "Provider-managed / unknown"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl bg-black/20 p-3">
                      <dt className="text-[10px] font-black uppercase tracking-wide text-white/35">{label}</dt>
                      <dd className="mt-1 font-semibold text-white/80">{value}</dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-xs text-white/50">
                  <div className="font-black uppercase tracking-[0.18em] text-white/75">OAuth readiness</div>
                  <div className="mt-2 leading-5">{configured ? "Provider app credentials detected. Connect/reconnect is available." : "Provider app credentials are not present in this deployment environment yet."}</div>
                  {connection?.granted_scopes?.length ? <div className="mt-2 break-words text-white/35">Scopes: {connection.granted_scopes.join(", ")}</div> : null}
                </div>

                {connection?.last_error ? <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{connection.last_error}</div> : null}
                <SocialConnectionActions provider={provider.key} connectionId={connection?.id} configured={configured} connected={connected} />
              </section>
            );
          })}
        </div>

        <section className="rounded-[1.75rem] border border-rose-400/20 bg-rose-500/10 p-5 shadow-xl">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-200">Security</p>
          <h2 className="mt-2 text-xl font-black">Required deployment secrets</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-white/55">Configure provider app IDs/secrets plus SOCIAL_TOKEN_ENCRYPTION_KEY and SOCIAL_OAUTH_STATE_SECRET in Vercel. Tokens themselves are encrypted server-side, never stored as environment variables, and never exposed in the browser.</p>
        </section>
      </div>
    </main>
  );
}
