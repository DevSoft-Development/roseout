import type { Metadata } from "next";
import Link from "next/link";
import MarketingCampaignActions from "@/components/marketing/MarketingCampaignActions";
import MarketingCampaignCardActions from "@/components/marketing/MarketingCampaignCardActions";
import LinkedCaptionPreview from "@/components/marketing/LinkedCaptionPreview";
import SocialGeneratorPreview from "@/components/marketing/SocialGeneratorPreview";
import { shortenDisplayedLink } from "@/lib/marketing/links";
import { buildMarketingSocialPackage } from "@/lib/marketing/caption-templates";
import { requireAdminRole } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Marketing Center | TheOutHaven Admin" },
  description: "Create and monitor TheOutHaven marketing campaigns.",
};

type SearchParams = {
  source_table?: string;
  source_id?: string;
  location_id?: string;
  location_name?: string;
  image?: string;
  category?: string;
  city?: string;
  state?: string;
  address?: string;
  description?: string;
  public_url?: string;
  status?: string;
  campaign_id?: string;
};

type Campaign = {
  id: string;
  name: string | null;
  campaign_type: string | null;
  status: string | null;
  selected_platforms?: string[] | null;
  audience_segment?: string | null;
  location_name?: string | null;
  email_subject?: string | null;
  sms_text?: string | null;
  scheduled_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  social_captions?: Record<string, string> | null;
  generated_payload?: Record<string, unknown> | null;
  public_slug?: string | null;
  public_url?: string | null;
};

type SendLog = {
  channel: string | null;
  status: string | null;
};

const tabs = [
  "Overview",
  "Campaigns",
  "Social Posts",
  "Email Blast",
  "Text Blast",
  "Audience",
  "Templates",
  "Analytics",
  "Settings",
];

const campaignTypes = ["Social Post", "Email Blast", "Text Blast", "All Channels"];
const statuses = ["draft", "scheduled", "sent", "failed"];
const platforms = ["Instagram", "TikTok", "YouTube Shorts", "Email", "SMS"];

function formatNumber(value: number | null | undefined) {
  return Number(value || 0).toLocaleString();
}

function statusClass(status: string | null | undefined) {
  if (status === "sent") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "scheduled") return "border-sky-200 bg-sky-50 text-sky-700";
  if (status === "failed") return "border-red-200 bg-red-50 text-red-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function typeLabel(type: string | null | undefined) {
  return String(type || "all_channels").replace(/_/g, " ");
}

function prefillCopy(params: SearchParams) {
  const name = params.location_name || "Selected Location";
  const cityState = [params.city, params.state].filter(Boolean).join(", ");
  const category = params.category || "local outing";
  const publicUrl = params.public_url || "";

  return {
    campaignName: params.location_name ? `${name} Feature Campaign` : "New TheOutHaven Campaign",
    social: `${name} is your next ${category.toLowerCase()} pick${cityState ? ` in ${cityState}` : ""}. Save it, share it, and plan it on TheOutHaven.${publicUrl ? ` ${publicUrl}` : ""}`,
    hashtags: "#TheOutHaven #LocalFinds #DateNight #WeekendPlans",
    emailSubject: params.location_name ? `Plan your next outing at ${name}` : "Plan your next outing with TheOutHaven",
    emailBody: `Looking for a fresh plan? ${name}${cityState ? ` in ${cityState}` : ""} is ready to feature in your next outing. ${params.description || "Explore the vibe, check the details, and make your plan on TheOutHaven."}`,
    sms: `${name}: a TheOutHaven pick for your next plan.${publicUrl ? ` ${publicUrl}` : ""} Reply STOP to opt out.`,
  };
}

async function safeCount(table: string, filters?: { column: string; value: string }[]) {
  let query = supabaseAdmin.from(table).select("id", { count: "exact", head: true });
  for (const filter of filters || []) query = query.eq(filter.column, filter.value);
  const { count } = await query;
  return count || 0;
}

export default async function MarketingCenterPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdminRole(["superuser", "admin", "editor", "viewer"]);
  const params = await searchParams;
  const activeStatus = ["draft", "scheduled", "sent", "failed"].includes(params.status || "") ? params.status : "all";
  const copy = prefillCopy(params);
  const fullUrl = params.public_url || "https://theouthaven.com";
  const initialSocialPackage = buildMarketingSocialPackage({
    locationName: params.location_name || "Selected Location",
    category: params.category || "NYC hidden gems",
    city: params.city || "NYC",
    state: params.state || "",
    address: params.address || "",
    description: params.description || "",
    fullUrl,
    captionCategory: params.category || "NYC hidden gems",
  });

  const [campaignsResult, logsResult, totalCampaigns, drafts, scheduled, sent, failed] = await Promise.all([
    (() => {
      let query = supabaseAdmin
        .from("marketing_campaigns")
        .select("id,name,campaign_type,status,selected_platforms,audience_segment,location_name,email_subject,sms_text,scheduled_at,created_at,updated_at,social_captions,generated_payload,public_slug,public_url")
        .order("created_at", { ascending: false })
        .limit(100);
      if (activeStatus !== "all") query = query.eq("status", activeStatus);
      return query;
    })(),
    supabaseAdmin.from("marketing_send_logs").select("channel,status").limit(5000),
    safeCount("marketing_campaigns"),
    safeCount("marketing_campaigns", [{ column: "status", value: "draft" }]),
    safeCount("marketing_campaigns", [{ column: "status", value: "scheduled" }]),
    safeCount("marketing_campaigns", [{ column: "status", value: "sent" }]),
    safeCount("marketing_campaigns", [{ column: "status", value: "failed" }]),
  ]);

  const campaigns = (campaignsResult.data || []) as Campaign[];
  const logs = (logsResult.data || []) as SendLog[];
  const emailsSent = logs.filter((log) => log.channel === "email" && log.status === "sent").length;
  const textsSent = logs.filter((log) => log.channel === "sms" && log.status === "sent").length;
  const opens = logs.filter((log) => log.status === "opened").length;
  const clicks = logs.filter((log) => log.status === "clicked").length;

  const analytics = [
    { label: "Total campaigns", value: totalCampaigns, tone: "text-white" },
    { label: "Drafts", value: drafts, tone: "text-amber-200" },
    { label: "Scheduled", value: scheduled, tone: "text-sky-200" },
    { label: "Sent", value: sent, tone: "text-emerald-300" },
    { label: "Failed", value: failed, tone: "text-red-300" },
    { label: "Emails sent", value: emailsSent, tone: "text-rose-200" },
    { label: "Texts sent", value: textsSent, tone: "text-purple-200" },
    { label: "Clicks", value: clicks, tone: "text-amber-200" },
    { label: "Opens", value: opens, tone: "text-emerald-200" },
  ];

  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-4 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.28),transparent_34%),linear-gradient(135deg,#170b0b,#090706_58%,#14100c)] p-5 shadow-2xl sm:p-7">
          <div className="absolute right-[-70px] top-[-70px] h-72 w-72 rounded-full bg-rose-500/20 blur-3xl" />
          <div className="absolute bottom-[-80px] left-16 h-56 w-56 rounded-full bg-amber-300/10 blur-3xl" />
          <div className="relative z-10 grid gap-6 xl:grid-cols-[1.15fr_470px] xl:items-end">
            <div>
              <p className="mb-3 text-xs font-black uppercase tracking-[0.35em] text-rose-300">Marketing Center</p>
              <h1 className="max-w-4xl text-4xl font-black tracking-tight sm:text-5xl">Create campaigns for social, email, SMS, and every channel at once.</h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-white/60 sm:text-base">
                Build location-aware promos, generate platform copy, preview every message, schedule sends, and keep consent-safe logs for every attempt.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="#campaign-builder" className="rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-6 py-3 text-sm font-black text-white shadow-lg shadow-rose-950/30 transition hover:scale-[1.03]">Create Marketing Campaign</Link>
                <Link href="#analytics" className="rounded-full border border-white/10 bg-white/[0.07] px-6 py-3 text-sm font-black text-white/70 transition hover:bg-white/10 hover:text-white">View Analytics</Link>
                <Link href="/admin/dashboard/locations" className="rounded-full border border-white/10 bg-white/[0.07] px-6 py-3 text-sm font-black text-white/70 transition hover:bg-white/10 hover:text-white">Choose Location</Link>
                <Link href="/admin/dashboard/marketing/settings" className="rounded-full border border-white/10 bg-white/[0.07] px-6 py-3 text-sm font-black text-white/70 transition hover:bg-white/10 hover:text-white">Settings</Link>
                <Link href="/admin/dashboard/marketing?status=draft#campaigns" className="rounded-full border border-white/10 bg-white/[0.07] px-6 py-3 text-sm font-black text-white/70 transition hover:bg-white/10 hover:text-white">View Drafts</Link>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.08] p-4 backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.25em] text-white/45">Campaign Pulse</p>
                  <p className="mt-1 text-sm text-white/45">Draft-first sending with confirmation gates.</p>
                </div>
                <span className="rounded-full bg-amber-300 px-3 py-2 text-xs font-black text-black">Consent safe</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {analytics.slice(0, 4).map((stat) => (
                  <div key={stat.label} className="rounded-2xl bg-black/25 p-4">
                    <p className="text-[10px] font-black uppercase tracking-wide text-white/40">{stat.label}</p>
                    <p className={`mt-1 text-3xl font-black ${stat.tone}`}>{formatNumber(stat.value)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="analytics" className="mt-5 grid gap-4 md:grid-cols-3 xl:grid-cols-9">
          {analytics.map((stat) => (
            <div key={stat.label} className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl">
              <p className="text-[10px] font-black uppercase tracking-wide text-white/40">{stat.label}</p>
              <p className={`mt-2 text-3xl font-black ${stat.tone}`}>{formatNumber(stat.value)}</p>
            </div>
          ))}
        </section>

        <nav className="mt-5 flex gap-2 overflow-x-auto rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-2">
          {tabs.map((tab) => (
            <Link key={tab} href={`#${tab.toLowerCase().replace(/\s+/g, "-")}`} className="shrink-0 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-[11px] font-black uppercase tracking-wide text-white/60 transition hover:bg-rose-600 hover:text-white">
              {tab}
            </Link>
          ))}
        </nav>

        <section id="overview" className="mt-5 grid gap-4 md:grid-cols-3 xl:grid-cols-5">
          {campaignTypes.map((type) => (
            <div key={type} className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">Campaign Type</p>
              <p className="mt-2 text-xl font-black">{type}</p>
              <p className="mt-2 text-sm leading-6 text-white/45">Draft copy, preview content, then schedule or send after confirmation.</p>
            </div>
          ))}
          <div className="rounded-[1.5rem] border border-rose-400/30 bg-rose-500/10 p-5 shadow-xl">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-200">Loading / Error States</p>
            <p className="mt-2 text-sm leading-6 text-white/60">APIs return structured errors for missing consent, missing providers, duplicate sends, and no recipients. Empty campaign lists show a create-first state below.</p>
          </div>
        </section>

        <section id="campaign-builder" className="mt-5 grid gap-5 xl:grid-cols-[1fr_430px]">
          <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#f8f3ef] text-[#1b1210] shadow-2xl">
            <div className="border-b border-black/10 bg-white/75 p-5">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-700">Create Marketing Campaign</p>
              <h2 className="mt-2 text-2xl font-black">Campaign builder</h2>
              <p className="mt-2 text-sm leading-6 text-black/50">Campaigns stay in draft by default. Sending endpoints require an explicit confirmation payload.</p>
            </div>

            <form className="grid gap-4 p-5 lg:grid-cols-2">
              <input type="hidden" name="campaign_id" value={params.campaign_id || ""} readOnly />
              <input type="hidden" name="location_id" value={params.location_id || params.source_id || ""} readOnly />
              <input type="hidden" name="location_source_id" value={params.source_id || params.location_id || ""} readOnly />
              <input type="hidden" name="location_source_table" value={params.source_table || ""} readOnly />
              <input type="hidden" name="location_name" value={params.location_name || ""} readOnly />
              <input type="hidden" name="location_category" value={params.category || ""} readOnly />
              <input type="hidden" name="location_city" value={params.city || ""} readOnly />
              <input type="hidden" name="location_state" value={params.state || ""} readOnly />
              <input type="hidden" name="location_address" value={params.address || ""} readOnly />
              <input type="hidden" name="location_description" value={params.description || ""} readOnly />
              <input type="hidden" name="location_image_url" value={params.image || ""} readOnly />
              <input type="hidden" name="public_url" value={fullUrl} readOnly />
              <label className="space-y-2">
                <span className="text-xs font-black uppercase tracking-wide text-black/45">Campaign name</span>
                <input name="name" defaultValue={copy.campaignName} className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-rose-400" />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-black uppercase tracking-wide text-black/45">Campaign type</span>
                <select name="campaign_type" defaultValue="all_channels" className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-rose-400">
                  <option value="social_post">Social Post</option>
                  <option value="email_blast">Email Blast</option>
                  <option value="text_blast">Text Blast</option>
                  <option value="all_channels">All Channels</option>
                </select>
              </label>
              <div className="space-y-2 lg:col-span-2">
                <span className="text-xs font-black uppercase tracking-wide text-black/45">Selected platforms</span>
                <div className="flex flex-wrap gap-2">
                  {["instagram", "tiktok", "youtube", "email", "sms"].map((platform) => (
                    <label key={platform} className="rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-black uppercase text-black/60">
                      <input name="selected_platforms" type="checkbox" defaultChecked value={platform} className="mr-2 accent-rose-600" />
                      {platform}
                    </label>
                  ))}
                </div>
              </div>
              <label className="space-y-2 lg:col-span-2">
                <span className="text-xs font-black uppercase tracking-wide text-black/45">Location selector</span>
                <div className="grid gap-3 rounded-[1.25rem] border border-black/10 bg-[#fffaf6] p-4 sm:grid-cols-[96px_1fr]">
                  <div className="h-24 overflow-hidden rounded-2xl bg-[#eadfd8]">
                    {params.image ? <img src={params.image} alt={params.location_name || "Selected location"} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-sm font-black text-black/30">RO</div>}
                  </div>
                  <div>
                    <p className="text-lg font-black">{params.location_name || "No location selected yet"}</p>
                    <p className="mt-1 text-sm font-bold text-black/50">{[params.category, params.city, params.state].filter(Boolean).join(" • ") || "Choose from restaurants, activities, or locations."}</p>
                    <p className="mt-1 line-clamp-2 text-xs font-medium text-black/45">{params.address || params.description || "Use the location admin list buttons to pre-fill campaign copy and CTA links."}</p>
                    {params.public_url && (
                      <a
                        href={params.public_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={params.public_url}
                        className="mt-2 inline-flex max-w-full rounded-full bg-rose-50 px-3 py-1 text-xs font-black text-rose-700 underline decoration-rose-300/50 underline-offset-4"
                      >
                        <span className="truncate">{shortenDisplayedLink(params.public_url)}</span>
                      </a>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link href="/admin/dashboard/locations" className="inline-flex rounded-full bg-[#1b1210] px-4 py-2 text-xs font-black text-white">Browse locations</Link>
                      <Link href="/admin/dashboard/locations" className="inline-flex rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-black text-black/60">Change location</Link>
                    </div>
                  </div>
                </div>
              </label>
              <label className="space-y-2 lg:col-span-2">
                <span className="text-xs font-black uppercase tracking-wide text-black/45">AI campaign generator prompt</span>
                <textarea name="generated_prompt" defaultValue={`Promote ${params.location_name || "a featured TheOutHaven location"} for a weekend outing with a friendly CTA.`} className="min-h-24 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-rose-400" />
              </label>
              <div className="space-y-3 lg:col-span-2">
                <div>
                  <span className="text-xs font-black uppercase tracking-wide text-black/45">AI / social generator</span>
                  <p className="mt-1 text-xs font-bold text-black/45">Pick a creative category, regenerate a viral caption package, preview each platform, and copy channel-ready text.</p>
                </div>
                <SocialGeneratorPreview
                  initialPackage={initialSocialPackage}
                  locationName={params.location_name || "Selected Location"}
                  locationCategory={params.category || "NYC hidden gems"}
                  city={params.city || "NYC"}
                  state={params.state || ""}
                  address={params.address || ""}
                  description={params.description || ""}
                  fullUrl={fullUrl}
                  locationId={params.location_id || params.source_id || ""}
                  locationSourceTable={params.source_table || ""}
                />
              </div>
              <label className="space-y-2">
                <span className="text-xs font-black uppercase tracking-wide text-black/45">Audience selector</span>
                <select name="audience_segment" defaultValue="opted_in_all" className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-rose-400">
                  <option value="opted_in_all">All opted-in subscribers</option>
                  <option value="email_opted_in">Email opted-in only</option>
                  <option value="sms_opted_in">SMS opted-in only</option>
                  <option value="location_segment">Location/city segment</option>
                </select>
              </label>
              <label className="space-y-2 lg:col-span-2">
                <span className="text-xs font-black uppercase tracking-wide text-black/45">Email subject</span>
                <input name="email_subject" defaultValue={initialSocialPackage.email_subject} className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-rose-400" />
              </label>
              <label className="space-y-2 lg:col-span-2">
                <span className="text-xs font-black uppercase tracking-wide text-black/45">Email body</span>
                <textarea name="email_body" defaultValue={initialSocialPackage.email_body} className="min-h-32 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-rose-400" />
              </label>
              <label className="space-y-2 lg:col-span-2">
                <span className="text-xs font-black uppercase tracking-wide text-black/45">SMS text</span>
                <textarea name="sms_text" defaultValue={initialSocialPackage.sms_body} className="min-h-24 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-rose-400" />
              </label>
              <div className="grid gap-3 lg:col-span-2 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-black uppercase tracking-wide text-black/45">Schedule at</span>
                  <input name="scheduled_at" type="datetime-local" className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-rose-400" />
                </label>
                <div className="rounded-[1.25rem] border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
                  Confirmation step: use Save Draft first. Send Now requires confirming audience count, channel, and consent checks in the API.
                </div>
              </div>
              <MarketingCampaignActions />
            </form>
          </div>

          <aside id="templates" className="space-y-5">
            <div className="rounded-[2rem] border border-white/10 bg-[#120d0b] p-5 shadow-2xl">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-300">Campaign Preview</p>
              <h2 className="mt-2 text-2xl font-black">All-channel package</h2>
              <div className="mt-5 space-y-3">
                <div id="social-posts" className="rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-4">
                  <p className="text-[10px] font-black uppercase tracking-wide text-white/40">Instagram / TikTok rules</p>
                  <LinkedCaptionPreview text={initialSocialPackage.instagram_caption} className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/70" />
                  <p className="mt-3 rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-[11px] font-bold text-emerald-100">No raw URLs. Captions use “Link in bio”.</p>
                </div>
                <div id="email-blast" className="rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-4">
                  <p className="text-[10px] font-black uppercase tracking-wide text-white/40">Email / YouTube rules</p>
                  <p className="mt-2 font-black">{initialSocialPackage.email_subject}</p>
                  <LinkedCaptionPreview text={initialSocialPackage.email_body} className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/60" />
                  <p className="mt-3 text-[11px] text-white/35">Email and YouTube previews render full URLs as clickable links.</p>
                </div>
                <div id="text-blast" className="rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-4">
                  <p className="text-[10px] font-black uppercase tracking-wide text-white/40">SMS short link</p>
                  <LinkedCaptionPreview text={initialSocialPackage.sms_body} className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/70" />
                </div>
              </div>
            </div>

            <div id="settings" className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-white/45">Settings</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {platforms.map((platform) => <span key={platform} className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-black text-white/60">{platform}</span>)}
              </div>
              <p className="mt-4 text-sm leading-6 text-white/45">Social generation is enabled first. Auto-posting waits for provider API credentials and platform post IDs are tracked when available.</p>
            </div>
          </aside>
        </section>

        <section id="campaigns" className="mt-5 overflow-hidden rounded-[2rem] border border-white/10 bg-[#f8f3ef] text-[#1b1210] shadow-2xl">
          <div className="flex flex-col gap-3 border-b border-black/10 bg-white/75 p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-700">Campaigns</p>
              <h2 className="mt-2 text-2xl font-black">Campaigns and drafts</h2>
              <p className="mt-1 text-sm font-bold text-black/45">Filter by status and open any draft to copy platform-ready captions.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="#campaign-builder" className="rounded-full bg-[#1b1210] px-5 py-3 text-sm font-black text-white">Create Marketing Campaign</Link>
              <Link href="/admin/dashboard/marketing/settings" className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-black text-black/60">Settings</Link>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto border-b border-black/10 bg-white/45 p-3">
            {[
              { label: "All", value: "all" },
              { label: "Drafts", value: "draft" },
              { label: "Scheduled", value: "scheduled" },
              { label: "Sent", value: "sent" },
              { label: "Failed", value: "failed" },
            ].map((filter) => (
              <Link
                key={filter.value}
                href={filter.value === "all" ? "/admin/dashboard/marketing#campaigns" : `/admin/dashboard/marketing?status=${filter.value}#campaigns`}
                className={`shrink-0 rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-wide ${activeStatus === filter.value ? "border-rose-300 bg-rose-50 text-rose-700" : "border-black/10 bg-white text-black/45"}`}
              >
                {filter.label}
              </Link>
            ))}
          </div>
          {!campaigns.length ? (
            <div className="p-12 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-2xl">📣</div>
              <p className="mt-4 text-lg font-black">No campaigns found</p>
              <p className="mt-1 text-sm text-black/50">Create your first draft campaign above, then generate social, email, and SMS content.</p>
            </div>
          ) : (
            <div className="space-y-6 p-5">
              {statuses.map((status) => {
                const statusCampaigns = campaigns.filter((campaign) => (campaign.status || "draft") === status);
                if (!statusCampaigns.length) return null;
                return (
                  <div key={status}>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-xl font-black capitalize">{status} Campaigns</h3>
                      <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase ${statusClass(status)}`}>{statusCampaigns.length}</span>
                    </div>
                    <div className="mt-3 grid gap-4 lg:grid-cols-2">
                      {statusCampaigns.map((campaign) => {
                        const socialCaptions = campaign.social_captions || {};
                        const generatedPayload = campaign.generated_payload || {};
                        const instagramCaption = socialCaptions.instagram || (typeof generatedPayload.instagram_caption === "string" ? generatedPayload.instagram_caption : "");
                        const tiktokCaption = socialCaptions.tiktok || (typeof generatedPayload.tiktok_caption === "string" ? generatedPayload.tiktok_caption : "");
                        return (
                          <article key={campaign.id} className="rounded-[1.5rem] border border-black/10 bg-white p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-black/35">{typeLabel(campaign.campaign_type)}</p>
                                <h4 className="mt-1 text-xl font-black">{campaign.name || "Untitled campaign"}</h4>
                              </div>
                              <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase ${statusClass(campaign.status)}`}>{campaign.status || "draft"}</span>
                            </div>
                            <p className="mt-3 text-sm font-bold text-black/50">{campaign.location_name || campaign.audience_segment || "General TheOutHaven audience"}</p>
                            <div className="mt-3 grid gap-2 text-xs font-bold text-black/45 sm:grid-cols-2">
                              <p>Created: {campaign.created_at ? new Date(campaign.created_at).toLocaleString() : "—"}</p>
                              <p>Updated: {campaign.updated_at ? new Date(campaign.updated_at).toLocaleString() : "—"}</p>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {(campaign.selected_platforms || []).length ? campaign.selected_platforms!.map((platform) => <span key={platform} className="rounded-full bg-[#f5eee8] px-3 py-1 text-[11px] font-black uppercase text-black/55">{platform}</span>) : <span className="rounded-full bg-[#f5eee8] px-3 py-1 text-[11px] font-black uppercase text-black/55">No platforms selected</span>}
                            </div>
                            <div className="mt-3 grid gap-2 md:grid-cols-2">
                              <div className="rounded-2xl border border-black/10 bg-[#fffaf6] p-3">
                                <p className="text-[10px] font-black uppercase text-black/35">Instagram preview</p>
                                <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-xs font-bold text-black/55">{instagramCaption || "No Instagram caption saved yet."}</p>
                              </div>
                              <div className="rounded-2xl border border-black/10 bg-[#fffaf6] p-3">
                                <p className="text-[10px] font-black uppercase text-black/35">TikTok preview</p>
                                <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-xs font-bold text-black/55">{tiktokCaption || "No TikTok caption saved yet."}</p>
                              </div>
                            </div>
                            <MarketingCampaignCardActions campaignId={campaign.id} instagramCaption={instagramCaption} tiktokCaption={tiktokCaption} publicSlug={campaign.public_slug} publicUrl={campaign.public_url} />
                          </article>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section id="audience" className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-300">Audience</p>
            <h2 className="mt-2 text-2xl font-black">Consent-first targeting</h2>
            <p className="mt-3 text-sm leading-6 text-white/55">Email and SMS send APIs only load opted-in subscribers/users, skip opt-outs, and write marketing_send_logs for sent and failed attempts.</p>
          </div>
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-300">States</p>
            <div className="mt-4 flex flex-wrap gap-2">{statuses.map((status) => <span key={status} className={`rounded-full border px-3 py-2 text-xs font-black uppercase ${statusClass(status)}`}>{status}</span>)}</div>
            <p className="mt-4 text-sm leading-6 text-white/55">Draft is the default. Scheduled, sent, and failed states are stored on campaigns and messages.</p>
          </div>
        </section>

      </div>
    </main>
  );
}
