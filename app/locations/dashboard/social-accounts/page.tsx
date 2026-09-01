import { Instagram, LockKeyhole, ShieldCheck } from "lucide-react";
import { getCurrentBusinessLocation } from "@/lib/growth-pro/data";
import { getLocationName } from "@/lib/locationName";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { loadMetaSocialConfig } from "@/lib/marketing/social-provider-config";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export default async function LocationSocialAccountsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  const requestedLocationId = first(params.locationId) || first(params.adminLocationId) || first(params.demoLocationId) || undefined;
  const location = await getCurrentBusinessLocation(requestedLocationId);

  if (!location?.id) {
    return (
      <main className="min-h-screen bg-[#050607] p-4 text-white sm:p-6 lg:p-8">
        <div className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-white/[0.04] p-8">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff6b86]">Social Accounts</p>
          <h1 className="mt-3 text-3xl font-black">No connected location found</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-white/55">Connect or claim a location before connecting its Instagram account.</p>
        </div>
      </main>
    );
  }

  const locationId = String(location.id);
  const [{ data: connection }, metaConfig] = await Promise.all([
    supabaseAdmin
      .from("marketing_social_connections")
      .select("id,provider_account_id,display_name,username,status,granted_scopes,token_expires_at,connected_at,last_refreshed_at,last_error,updated_at")
      .eq("scope", "location")
      .eq("location_id", locationId)
      .eq("provider", "instagram")
      .neq("status", "disconnected")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    loadMetaSocialConfig(),
  ]);

  const apiConfigured = Boolean(metaConfig.appId && metaConfig.appSecret && metaConfig.graphVersion);
  const connected = connection?.status === "connected" || connection?.status === "degraded" || connection?.status === "reauthorization_required";
  const accountName = connection?.username
    ? `${String(connection.username).startsWith("@") ? "" : "@"}${connection.username}`
    : connection?.display_name || "Not connected";
  const locationName = getLocationName(location, "This location");
  const returnPath = `/locations/dashboard/social-accounts?locationId=${encodeURIComponent(locationId)}`;
  const connectHref = `/api/locations/social/instagram?locationId=${encodeURIComponent(locationId)}&returnTo=${encodeURIComponent(returnPath)}`;
  const success = first(params.connected) === "instagram";
  const error = first(params.error);

  return (
    <main className="min-h-screen bg-[#050607] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.23),transparent_36%),linear-gradient(135deg,#160b0d,#08090b_60%,#121012)] p-6 shadow-2xl sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[#ff6b86]">Marketing & growth</p>
              <h1 className="mt-2 text-4xl font-black tracking-tight">Social Accounts</h1>
              <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-white/55">Connect {locationName}&apos;s Instagram account once, then TheOutHaven can publish approved content and read permitted performance data for this location.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Location</p>
              <p className="mt-1 max-w-[280px] truncate text-sm font-black text-white/85">{locationName}</p>
            </div>
          </div>
        </section>

        {success ? (
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-100">Instagram connected successfully to this location.</div>
        ) : null}
        {error ? (
          <div role="alert" className="rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-100">{error}</div>
        ) : null}

        <section className="rounded-[2rem] border border-white/10 bg-[#110d0d] p-5 shadow-xl sm:p-7">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-fuchsia-500 via-rose-500 to-amber-400 shadow-lg shadow-rose-950/30">
                <Instagram className="h-7 w-7 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">Instagram professional account</p>
                <h2 className="mt-1 text-2xl font-black">Instagram</h2>
                <p className="mt-2 truncate text-sm font-bold text-white/65">{accountName}</p>
              </div>
            </div>
            <span className={`w-fit rounded-full border px-3 py-1.5 text-xs font-black ${connected ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-white/[0.04] text-white/45"}`}>
              {connected ? String(connection?.status || "connected").replaceAll("_", " ") : "Not connected"}
            </span>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Connected</p>
              <p className="mt-2 text-sm font-bold text-white/75">{connection?.connected_at ? new Date(connection.connected_at).toLocaleString() : "—"}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Token expires</p>
              <p className="mt-2 text-sm font-bold text-white/75">{connection?.token_expires_at ? new Date(connection.token_expires_at).toLocaleString() : "—"}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 sm:col-span-2 lg:col-span-1">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">API setup</p>
              <p className={`mt-2 text-sm font-bold ${apiConfigured ? "text-emerald-200" : "text-amber-200"}`}>{apiConfigured ? "Ready" : "Needs platform setup"}</p>
            </div>
          </div>

          {connection?.last_error ? (
            <div className="mt-4 rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-100">{connection.last_error}</div>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {apiConfigured ? (
              <a href={connectHref} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-5 text-sm font-black text-black transition hover:bg-white/90">
                <Instagram className="h-4 w-4" />
                {connected ? "Reconnect Instagram" : "Connect Instagram"}
              </a>
            ) : (
              <span className="inline-flex min-h-12 items-center rounded-xl border border-amber-300/20 bg-amber-500/10 px-5 text-sm font-black text-amber-100">Instagram API setup required by TheOutHaven</span>
            )}
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <div className="flex items-center gap-2 text-white/80"><LockKeyhole className="h-4 w-4 text-[#ff6b86]" /><p className="text-sm font-black">Your password stays with Instagram</p></div>
              <p className="mt-2 text-xs font-semibold leading-5 text-white/45">Click Connect Instagram, sign in on Instagram, approve access, and you&apos;ll return here. TheOutHaven never receives or stores the Instagram password.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <div className="flex items-center gap-2 text-white/80"><ShieldCheck className="h-4 w-4 text-[#ff6b86]" /><p className="text-sm font-black">Connection is location-specific</p></div>
              <p className="mt-2 text-xs font-semibold leading-5 text-white/45">This authorization belongs only to {locationName}. Other businesses and locations cannot access or reuse its Instagram token.</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
