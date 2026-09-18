import Link from "next/link";
import SocialConnectionActions from "@/components/marketing/SocialConnectionActions";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { socialOauthConfigured, type SocialProvider } from "@/lib/marketing/social-oauth";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export const dynamic = "force-dynamic";

const providers: Array<{ key: SocialProvider; label: string; short: string; description: string }> = [
  { key: "instagram", label: "Instagram", short: "IG", description: "Publish posts and Reels, see results, and bring supported comments and messages into Community." },
  { key: "facebook", label: "Meta / Facebook", short: "FB", description: "Publish to your Facebook Page, see results, and bring supported comments and messages into Community." },
  { key: "tiktok", label: "TikTok", short: "TT", description: "Publish videos and track account and video performance from TheOutHaven." },
  { key: "youtube", label: "YouTube", short: "YT", description: "Publish videos and track channel and video performance." },
];

function state(connection: any) {
  if (!connection || connection.status === "disconnected") return "not_connected";
  if (connection.status === "reauthorization_required") return "reconnect";
  if (connection.token_expires_at && new Date(connection.token_expires_at).getTime() <= Date.now()) return "reconnect";
  if (connection.last_error) return "attention";
  return "connected";
}

function stateLabel(value: string) {
  if (value === "connected") return "Connected";
  if (value === "reconnect") return "Reconnect needed";
  if (value === "attention") return "Needs attention";
  return "Not connected";
}

function stateClass(value: string) {
  if (value === "connected") return "bg-emerald-500/15 text-emerald-200";
  if (value === "reconnect" || value === "attention") return "bg-amber-500/15 text-amber-200";
  return "bg-white/10 text-white/55";
}

function communityStatus(provider: SocialProvider, scopes: unknown) {
  const granted = Array.isArray(scopes) ? scopes.map((value) => String(value)) : [];
  if (provider === "instagram") {
    const comments = granted.some((scope) => ["instagram_manage_comments", "instagram_business_manage_comments"].includes(scope));
    const messages = granted.some((scope) => ["instagram_manage_messages", "instagram_business_manage_messages"].includes(scope));
    return comments && messages ? "Community ready" : "Publishing ready · Community access still needs Meta approval";
  }
  if (provider === "facebook") {
    const comments = granted.includes("pages_manage_engagement");
    const messages = granted.includes("pages_messaging");
    return comments && messages ? "Community ready" : "Publishing ready · Community access still needs Meta approval";
  }
  if (provider === "tiktok") return "Publishing and performance ready · TikTok does not expose a general Community inbox through the standard app scopes";
  return "Publishing and performance ready";
}

export default async function SocialAccountsPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.marketingSocialAccounts);
  const params = await searchParams;
  const { data } = await getAdminDatabaseClient()
    .from("marketing_social_connections")
    .select("id,provider,display_name,username,status,token_expires_at,last_sync_at,last_error,connected_at,granted_scopes")
    .eq("scope", "platform")
    .order("provider");
  const connections = data || [];
  const connectedCount = providers.filter((provider) => {
    const connection = connections.find((item) => item.provider === provider.key && item.status !== "disconnected") || connections.find((item) => item.provider === provider.key);
    return state(connection) === "connected";
  }).length;

  return <main className="min-h-screen bg-[#090706] px-4 py-6 text-white sm:px-6 lg:px-8"><div className="mx-auto max-w-[1200px] space-y-6">
    <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.28),transparent_34%),linear-gradient(135deg,#170b0b,#090706_58%,#14100c)] p-6 sm:p-8"><div className="flex flex-wrap items-end justify-between gap-5"><div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-rose-300">Social Manager</p><h1 className="mt-2 text-4xl font-semibold sm:text-5xl">Connect Social Accounts</h1><p className="mt-3 max-w-2xl text-white/60">Choose a network, sign in on that network, approve access, and you’ll come straight back to TheOutHaven. No account IDs or setup codes to copy.</p></div><div className="rounded-2xl border border-white/10 bg-white/[0.07] px-5 py-4"><p className="text-3xl font-semibold">{connectedCount}/{providers.length}</p><p className="mt-1 text-sm text-white/45">accounts connected</p></div></div></section>
    {params.connected ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm font-semibold text-emerald-200">Connected successfully. TheOutHaven will begin using the account features you approved.</div> : null}
    {params.error ? <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm font-semibold text-red-200">We couldn’t finish that connection. {params.error} Try Connect again, or reconnect the account if access changed.</div> : null}

    <section className="grid gap-4 md:grid-cols-2">{providers.map((provider) => {
      const connection = connections.find((item) => item.provider === provider.key && item.status !== "disconnected") || connections.find((item) => item.provider === provider.key);
      const connectionState = state(connection);
      const configured = socialOauthConfigured(provider.key);
      const account = connection?.username ? `${String(connection.username).startsWith("@") ? "" : "@"}${connection.username}` : connection?.display_name || null;
      return <article key={provider.key} className="rounded-[1.75rem] border border-white/10 bg-white/[0.06] p-5"><div className="flex items-start justify-between gap-3"><div className="flex gap-4"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-500/10 text-sm font-bold text-rose-200">{provider.short}</div><div><h2 className="text-2xl font-semibold">{provider.label}</h2><p className="mt-1 text-sm text-white/45">{account || "Not connected yet"}</p></div></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${stateClass(connectionState)}`}>{stateLabel(connectionState)}</span></div>
        <p className="mt-5 text-sm leading-6 text-white/60">{provider.description}</p>
        {connectionState === "connected" ? <div className="mt-3 rounded-xl bg-black/20 p-3 text-sm text-white/55">{communityStatus(provider.key, connection?.granted_scopes)}</div> : null}
        {connection?.last_sync_at ? <p className="mt-4 text-xs text-white/35">Last updated {new Date(connection.last_sync_at).toLocaleString("en-US", { timeZone: "America/New_York" })}</p> : null}
        {connection?.last_error ? <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">This account needs attention. Reconnecting usually fixes the issue.</div> : null}
        <SocialConnectionActions provider={provider.key} connectionId={connection?.id} configured={configured} connected={connectionState !== "not_connected"} />
      </article>;
    })}</section>

    <section className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><h2 className="text-lg font-semibold">What happens after you connect?</h2><div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-black/20 p-4"><p className="font-semibold">1. Create</p><p className="mt-1 text-sm text-white/50">Plan and approve content in Social Manager.</p></div><div className="rounded-xl bg-black/20 p-4"><p className="font-semibold">2. Publish</p><p className="mt-1 text-sm text-white/50">Post to connected networks without sharing passwords.</p></div><div className="rounded-xl bg-black/20 p-4"><p className="font-semibold">3. Grow</p><p className="mt-1 text-sm text-white/50">See performance, community opportunities, and the actions that lead people into TheOutHaven.</p></div></div></section>
    <div className="flex gap-3"><Link href="/admin/dashboard/marketing/social-manager" className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold">Back to Social Manager</Link><Link href="/admin/dashboard/marketing/community" className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold">Open Community</Link></div>
  </div></main>;
}
