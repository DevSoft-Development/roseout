import { getBillingPlanLabel, getBillingStatusLabel } from "@/lib/billing/plans";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminRole } from "@/lib/admin-auth";
import { dedupeUrls, formatFullAddress, getBusinessCRM, getClaimStatus, getDisplayCRMStatus, getLocationCrmRelatedData, getUpgradeFlags, getPartnerPlanDisplay, getPartnerSalesStatus, getClaimOutreachStatus, getReservationPortalStatus, getEmbedStatus, getDiscoveryStatus, getNextActionLabel, getSalesReadinessScore, getPartnerSetupScore, safeUpdateLocationPhotos, stripCityStateZipFromStreetAddress, getCrmPublicLocationHref, canOpenPublicLocationPage, getCrmCanonicalLocationId, type BusinessCRMRow } from "@/lib/admin-crm";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logAdminEvent } from "@/lib/admin/logAdminEvent";
import CommunicationPanel from "./CommunicationPanel";
import PhotosPanelClient from "./PhotosPanel";
import ReservationsPanel from "./ReservationPanel";
import ListingEnhancementEditor from "./ListingEnhancementEditor";
import type { LocationTableName } from "@/lib/listing-enhancement";
import { createClaimQr, ensureClaimFields, upsertLocationClaimCode } from "@/lib/claimQrServer";
import { getCanonicalAppUrl } from "@/lib/site-url";
import { evaluateLocationPublishability } from "@/lib/location-publishability";
import PublishabilityRepairButton from "./PublishabilityRepairButton";
import { getGrowthProChecklist, getGrowthProLocationContext } from "@/lib/growth-pro/data";
import { buildGrowthRecommendations, calculateConversionRate, calculateGrowthReadinessScore, GROWTH_CHILD_TABS, normalizeGrowthChildTab } from "@/lib/admin/growth-workspace";
import RepairPublishabilityButton from "./RepairPublishabilityButton";
import MenuEditorClient from "@/app/business/dashboard/menu/MenuEditorClient";
import { getPublicLocationMenuHref, getBusinessMenuEditorHref } from "@/lib/locations/public-location-url";
import { getEditableLocationMenu } from "@/lib/locations/menu";

import { ADMIN_PAGE_ACCESS, canAdmin } from "@/lib/admin-permissions";
import { getTeamProfileForUser, hasBroadWorkspaceLocationAccess, isWorkspaceLocationPermitted } from "@/lib/team-tools";
import { AdminActionButton, AdminDetailPanel, AdminKpiCard, AdminKpiGrid, AdminPageShell, AdminSectionCard } from "@/components/admin/AdminDesignSystem";
import LocationHoursEditor from "@/components/admin/LocationHoursEditor";
import LocationProfileEditor from "@/components/admin/LocationProfileEditor";
import LocationWorkspaceNavigation from "@/components/admin/location-workspace/LocationWorkspaceNavigation";
export const dynamic = "force-dynamic";

const tabs = [
  "overview",
  "partner-launch",
  "operations",
  "reservations",
  "waitlist",
  "walk-ins",
  "floor-resources",
  "photos",
  "listing",
  "analytics",
  "communication",
  "settings",
  "logs",
  "profile",
  "claims",
  "owner",
  "plan",
  "qr-codes",
  "support",
  "seo",
  "branding",
  "offerings",
  "menu-packages",
  "growth-overview",
  "offers",
  "vip-list",
  "messaging",
  "notifications",
  "event-leads",
  "reviews-feedback",
  "marketing-studio",
  "campaigns",
  "conversion",
  "growth-settings",
] as const;

type Tab = (typeof tabs)[number];

function normalizeCrmDetailTab(tab: string | null | undefined): Tab {
  if (!tab) return "overview";

  const normalized = tab.toLowerCase().trim();
  const aliases: Record<string, Tab> = {
    emails: "communication",
    enhancement: "listing",
    partnerlaunch: "partner-launch",
    partner_launch: "partner-launch",
    launch: "partner-launch",
    qr: "qr-codes",
    qrcodes: "qr-codes",
    menu: "menu-packages",
    vip: "vip-list",
    leads: "event-leads",
    reviews: "reviews-feedback",
    qr_codes: "qr-codes",
    photo: "photos",
    reservation: "reservations",
    reservations_overview: "operations",
    operations: "operations",
    wait_list: "waitlist",
    waitlists: "waitlist",
    walkins: "walk-ins",
    walk_ins: "walk-ins",
    floor: "floor-resources",
    resources: "floor-resources",
    layout: "floor-resources",
    comms: "communication",
    growth: "growth-overview",
    growth_overview: "growth-overview",
    vip_audience: "vip-list",
    campaigns: "campaigns",
    conversion: "conversion",
    growth_settings: "growth-settings",
  };

  const candidate = aliases[normalized] ?? normalized;
  return tabs.includes(candidate as Tab) ? (candidate as Tab) : "overview";
}

async function AdminCrmMenuPanel({ business, canEdit }: { business: BusinessCRMRow; canEdit: boolean }) {
  const locationId = String(business.id);
  const initialData = await getEditableLocationMenu(locationId, { canonicalLocationId: locationId, location: business as any, isAdmin: true, permissions: { canRead: true, canEdit } });
  return <AdminSectionCard className="overflow-hidden p-0"><div className="border-b border-white/10 p-5"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.25em] text-rose-200">Menu / Packages</p><h2 className="mt-2 text-2xl font-black">CRM Menu Editor</h2><p className="mt-1 text-sm text-white/55">Admins can edit this location menu without impersonating the owner.</p></div><div className="flex flex-wrap gap-2"><Link href={getBusinessMenuEditorHref(locationId, "admin")} className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-black text-white/75">Open full editor</Link><Link href={getPublicLocationMenuHref(business as any)} className="rounded-full bg-rose-600 px-4 py-2 text-sm font-black text-white">Preview public menu</Link></div></div></div><MenuEditorClient initialData={initialData} locationId={locationId} mode="admin" contextKey="adminLocationId" returnHref={`/admin/dashboard/crm/${business.id}?tab=menu-packages`} canEdit={canEdit} /></AdminSectionCard>;
}

async function GrowthProAdminPanel({ business, tab, canEdit, adminRole }: { business: BusinessCRMRow; tab: string; canEdit: boolean; adminRole: string }) {
  const [checklist, context] = await Promise.all([getGrowthProChecklist(String(business.id)), getGrowthProLocationContext(String(business.id))]);
  const activeTab = normalizeGrowthChildTab(tab);
  const baseHref = `/admin/dashboard/crm/${business.id}?tab=`;
  const activeOffers = context.offers.filter((offer: any) => {
    const status = String(offer.status || "").toLowerCase();
    const end = offer.end_date || offer.ends_at || offer.expires_at;
    return ["active", "published", "live"].includes(status) && (!end || new Date(end) >= new Date());
  });
  const qualifiedLeads = context.leads.filter((lead: any) => ["qualified", "proposal sent", "negotiating", "won"].includes(String(lead.status || "").toLowerCase()));
  const campaigns = [...(context.notificationEvents || []), ...(context.marketingSuggestions || [])];
  const readiness = calculateGrowthReadinessScore({ location: business, offers: context.offers, vipCount: context.vipCount, leads: context.leads, qrCodes: context.qrCodes, generations: context.marketingGenerations, reservations: context.reservationsSummary.count, analyticsAvailable: Boolean(context.analyticsSummary.qrScans || business.profile_views_30d || business.search_appearances_30d || business.reservation_completions_30d) });
  const recommendations = buildGrowthRecommendations({ location: business, readiness, offers: context.offers, vipCount: context.vipCount, leads: context.leads, qrCodes: context.qrCodes, generations: context.marketingGenerations, campaigns, planStatus: context.planStatus, baseHref });
  const offerConversion = calculateConversionRate(context.offerClaimsCount, Math.max(activeOffers.length, context.offers.length));
  const vipConversion = calculateConversionRate(context.vipCount, Number(business.profile_views_30d || 0));
  const leadConversion = calculateConversionRate(context.leads.length, Number(business.profile_views_30d || 0));
  const kpis = [
    ["Current plan", context.planStatus, "growth-settings"], ["Growth Pro eligibility", context.planStatus === "active" ? "Eligible" : "Upgrade required", "growth-settings"], ["Active offers", activeOffers.length, "offers"], ["Offer claims", context.offerClaimsCount, "offers"], ["VIP signups", context.vipCount, "vip-list"], ["New VIP 30D", context.vipCount, "vip-list"], ["Event leads", context.leads.length, "event-leads"], ["Qualified leads", qualifiedLeads.length, "event-leads"], ["Marketing drafts", context.marketingGenerations.length, "marketing-studio"], ["Published campaigns", campaigns.filter((c:any)=>String(c.status||"").toLowerCase()==="sent" || String(c.status||"").toLowerCase()==="published").length, "campaigns"], ["QR scans", context.analyticsSummary.qrScans, "conversion"], ["Listing views", business.profile_views_30d || 0, "conversion"], ["Reservations", business.reservation_completions_30d || context.reservationsSummary.count, "conversion"], ["Claim conversions", context.offerClaimsCount, "conversion"], ["Offer CVR", `${offerConversion}%`, "conversion"], ["VIP CVR", `${vipConversion}%`, "conversion"], ["Lead CVR", `${leadConversion}%`, "conversion"], ["Readiness", `${readiness.score}%`, "growth-overview"],
  ];
  return <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
    <div className="min-w-0 space-y-5">
      <AdminSectionCard className="p-5"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.25em] text-rose-200">Enterprise Growth Workspace</p><h2 className="mt-2 text-2xl font-black">{GROWTH_CHILD_TABS.find((t)=>t.id===activeTab)?.label}</h2><p className="mt-2 text-sm leading-6 text-white/60">Location-scoped revenue, promotion, audience, and demand-generation controls using existing Growth Pro data. Write actions respect plan and role permissions; live sends and publishing require validation.</p></div><Link href={`/business/dashboard/${activeTab === "vip-list" ? "vip" : activeTab === "event-leads" ? "leads" : activeTab === "growth-overview" ? "growth" : activeTab}`} className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black text-white/75">Open business page</Link></div></AdminSectionCard>
      {activeTab === "growth-overview" ? <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{kpis.map(([label,value,target]) => <Link key={String(label)} href={`${baseHref}${target}`} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-rose-300/40 focus:outline-none focus:ring-2 focus:ring-rose-300/40"><p className="text-xs font-black uppercase tracking-[0.14em] text-white/45">{label}</p><p className="mt-2 text-2xl font-black text-white">{String(value)}</p></Link>)}</div><ReadinessPanel readiness={readiness}/><GrowthAlertsPanel business={business} context={context} recommendations={recommendations}/></> : null}
      {activeTab === "offers" ? <GrowthTable title="Offers" empty="No offers yet. Create a draft offer or generate editable AI copy before publishing." rows={context.offers} fields={["name","offer_type","description","status","start_date","end_date","redemption_limit","redemptions","claims","associated_qr_code","associated_campaign","created_at","updated_at","created_by"]} actions={["Create offer","Generate offer copy with AI","Edit","Duplicate","Activate","Pause","Expire (confirm)","Archive (confirm)","Generate QR code","Copy public link","Preview public offer","View claims","Export claims"]} canEdit={canEdit}/>:null}
      {activeTab === "vip-list" ? <GrowthTable title="VIP Audience" empty="No VIP contacts yet. Set up a signup link, generate a QR code, or import consented contacts without overwriting newer records." rows={context.notificationRecipients} fields={["name","email","phone","verification_status","sms_consent","email_consent","source","created_at","last_activity","tags","notes","offer_claims","reservation_count"]} actions={["Add contact","Import contacts","Export contacts","Edit tags","Add note","Resend verification","Suppress","Remove","View activity","Send to campaign builder"]} canEdit={canEdit}/>:null}
      {activeTab === "event-leads" ? <><PipelineSummary leads={context.leads}/><GrowthTable title="Event Leads" empty="No event leads yet. Configure event packages and public lead capture." rows={context.leads} fields={["name","company","email","phone","event_type","requested_date","requested_time","guest_count","budget","status","source","assigned_owner","last_contact","follow_up_date","proposal_status","estimated_value","created_at","updated_at"]} actions={["Create lead","Assign owner","Add note","Log call","Log email","Schedule follow-up","Change status","Generate reply with AI","Generate proposal outline","Mark won","Mark lost (reason required)","Archive (confirm)"]} canEdit={canEdit}/></>:null}
      {activeTab === "marketing-studio" ? <MarketingStudioPanel business={business} context={context} canEdit={canEdit}/>:null}
      {activeTab === "campaigns" ? <CampaignPanel rows={campaigns} canEdit={canEdit && context.planStatus === "active"}/>:null}
      {activeTab === "conversion" ? <ConversionPanel business={business} context={context}/>:null}
      {activeTab === "growth-settings" ? <GrowthSettingsPanel business={business} context={context} adminRole={adminRole} canEdit={canEdit}/>:null}
    </div><aside className="space-y-5"><RecommendedGrowthActions items={recommendations}/><GrowthTimeline logs={context.notificationEvents.concat(context.marketingGenerations, context.leads, context.offers)}/></aside>
  </section>;
}
function ReadinessPanel({ readiness }: { readiness: any }) {
  return <AdminSectionCard className="p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><h3 className="text-xl font-black">Growth readiness score</h3><p className="mt-1 text-sm text-white/60">Deterministic score from listing, offer, VIP, lead, QR, marketing, reservation, contact, and analytics data.</p></div><div className="text-5xl font-black text-rose-100">{readiness.score}%</div></div><div className="mt-5 grid gap-3 md:grid-cols-2">{readiness.categories.map((c:any)=><div key={c.key} className="rounded-2xl border border-white/10 bg-black/25 p-4"><div className="flex items-center justify-between gap-3"><p className="font-black text-white">{c.label}</p><span className="rounded-full border border-white/10 px-2 py-1 text-xs font-black text-white/65">{c.score}%</span></div><p className="mt-2 text-xs text-white/55">{c.complete ? "Complete" : c.missing}</p></div>)}</div><div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-500/10 p-4"><p className="text-sm font-black text-amber-100">Highest-impact next action</p><p className="mt-1 text-sm text-white/70">{readiness.nextAction}</p></div></AdminSectionCard>;
}
function RecommendedGrowthActions({ items }: { items: any[] }) { return <AdminSectionCard className="p-5"><h3 className="text-lg font-black">Recommended actions</h3>{items.length ? <ul className="mt-3 space-y-3">{items.map((a)=><li key={a.key} className="rounded-2xl border border-white/10 bg-black/25 p-4"><div className="flex items-center justify-between"><b>{a.priority}</b><span className="text-xs text-white/45">{a.effort}</span></div><p className="mt-1 font-black text-white">{a.impact}</p><p className="mt-1 text-sm text-white/60">{a.reason}</p><p className="mt-2 text-xs text-white/45">Required plan: {a.requiredPlan} · Status: {a.complete ? "Complete" : "Not complete"}</p><Link href={a.href} className="mt-3 inline-flex rounded-full bg-rose-600 px-3 py-2 text-xs font-black text-white">Open action</Link></li>)}</ul> : <EmptyPanel title="No recommended actions" text="Core Growth setup is complete. Monitor conversion and optimize active campaigns." />}</AdminSectionCard>; }
function GrowthAlertsPanel({ business, context, recommendations }: { business:any; context:any; recommendations:any[] }) { const alerts = recommendations.map((r)=>({severity:r.priority, text:r.reason, action:r.impact, href:r.href})); return <AdminSectionCard className="p-5"><h3 className="text-lg font-black">Growth alerts</h3>{alerts.length ? <div className="mt-3 grid gap-3 md:grid-cols-2">{alerts.map((a,i)=><Link href={a.href} key={`${a.text}-${i}`} className="rounded-2xl border border-amber-300/20 bg-amber-500/10 p-4 focus:outline-none focus:ring-2 focus:ring-rose-300/40"><span className="rounded-full bg-amber-300/15 px-2 py-1 text-xs font-black text-amber-100">{a.severity}</span><p className="mt-2 font-black text-white">{a.text}</p><p className="mt-1 text-sm text-white/60">Recommended action: {a.action}</p><span className="mt-2 block text-xs text-white/45">Dismiss when intentionally deferred.</span></Link>)}</div> : <EmptyPanel title="No growth alerts" text="No duplicate or unresolved growth setup alerts were found." />}</AdminSectionCard>; }
function GrowthTable({ title, empty, rows, fields, actions, canEdit }: { title:string; empty:string; rows:any[]; fields:string[]; actions:string[]; canEdit:boolean }) { return <AdminSectionCard className="overflow-hidden p-0"><div className="border-b border-white/10 p-5"><h3 className="text-xl font-black">{title}</h3><p className="mt-1 text-sm text-white/60">Actions are wired to existing location systems and disabled when permissions, consent, plan, or date validation fails.</p><div className="mt-3 flex flex-wrap gap-2">{actions.map((a)=><span key={a} className={`rounded-full border px-3 py-2 text-xs font-black ${canEdit?"border-white/10 bg-white/[0.05] text-white/70":"border-white/10 bg-black/30 text-white/35"}`}>{a}</span>)}</div></div>{rows.length ? <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-white/[0.04] text-xs uppercase tracking-[0.14em] text-white/45"><tr>{fields.map(f=><th key={f} className="px-4 py-3">{f.replace(/_/g," ")}</th>)}</tr></thead><tbody>{rows.slice(0,25).map((row,i)=><tr key={row.id||i} className="border-t border-white/10">{fields.map(f=><td key={f} className="max-w-[220px] truncate px-4 py-3 text-white/70">{String(row[f] ?? row[f.replace("_date","_at")] ?? "—")}</td>)}</tr>)}</tbody></table></div> : <div className="p-5"><EmptyPanel title={title} text={empty}/></div>}</AdminSectionCard>; }
function PipelineSummary({ leads }: { leads:any[] }) { const statuses=["New","Contacted","Qualified","Proposal sent","Negotiating","Won","Lost","Archived"]; const total=leads.reduce((s,l)=>s+Number(l.estimated_value||l.budget||0),0); return <div className="grid gap-3 md:grid-cols-4">{statuses.map(st=><StatCard key={st} label={st} value={leads.filter(l=>String(l.status||"New").toLowerCase()===st.toLowerCase()).length}/>) }<StatCard label="Estimated pipeline" value={`$${fmt(total)}`}/><StatCard label="Weighted pipeline" value={`$${fmt(total*.5)}`}/><StatCard label="Follow-ups due" value={leads.filter(l=>l.follow_up_date && new Date(l.follow_up_date)<=new Date()).length}/><StatCard label="Conversion rate" value={`${calculateConversionRate(leads.filter(l=>String(l.status).toLowerCase()==="won").length, leads.length)}%`}/></div>; }
function MarketingStudioPanel({ business, context, canEdit }: { business:any; context:any; canEdit:boolean }) { const modes=["Social post","Instagram caption","TikTok caption","Email campaign","SMS campaign","Offer promotion","Event promotion","Seasonal promotion","New menu announcement","Reservation reminder","VIP campaign","Location launch","Owner outreach","Review request"]; return <GrowthTable title="Marketing Studio" empty="No marketing generations yet. Generate editable copy from current location fields; nothing publishes automatically." rows={context.marketingGenerations} fields={["generation_mode","prompt","content","created_at","created_by"]} actions={modes.map(m=>`Generate ${m}`)} canEdit={canEdit}/>; }
function CampaignPanel({ rows, canEdit }: { rows:any[]; canEdit:boolean }) { return <GrowthTable title="Campaigns" empty="No campaigns yet. Create a draft campaign, select a consented audience, preview, send a test, then schedule only after validation passes." rows={rows} fields={["name","campaign_type","status","audience","scheduled_date","sent_date","created_by","offer","content","delivery_count","open_rate","click_rate","conversion_count","revenue_attribution"]} actions={["Create campaign","Generate content with AI","Select audience","Select offer","Preview","Send test","Schedule","Pause","Cancel","Duplicate","Archive","View performance"]} canEdit={canEdit}/>; }
function ConversionPanel({ business, context }: { business:any; context:any }) { const rows=[{step:"Listing view",count:business.profile_views_30d||0},{step:"Reservation completed",count:business.reservation_completions_30d||context.reservationsSummary.count},{step:"QR scan",count:context.analyticsSummary.qrScans},{step:"Offer claim",count:context.offerClaimsCount},{step:"VIP signup",count:context.vipCount},{step:"Event lead submitted",count:context.leads.length}]; return <GrowthTable title="Conversion" empty="No analytics yet. Connect listing, QR, reservation, offer, VIP, or campaign tracking." rows={rows} fields={["step","count","source","campaign","qr_code","offer","device"]} actions={["Last 7 days","Last 30 days","Last 90 days","Custom range","Observed conversions","Attributed conversions","Estimated values"]} canEdit={false}/>; }
function GrowthSettingsPanel({ business, context, adminRole, canEdit }: { business:any; context:any; adminRole:string; canEdit:boolean }) { const rows=["Default campaign sender","Default reply-to address","SMS sender","Brand voice","Default target audience","Conversion window","Offer defaults","Event lead assignment","Follow-up SLA","VIP verification behavior","Marketing approval requirement","Campaign approval requirement","Attribution settings","Tracking parameters"].map((name)=>({name,status: context.planStatus === "active" ? "Available" : "Plan gated", permission: canEdit ? adminRole : "read-only"})); return <GrowthTable title="Growth Settings" empty="Growth settings are available after plan and permission validation." rows={rows} fields={["name","status","permission"]} actions={["Save brand voice","Validate sender","Update attribution","Configure follow-up SLA"]} canEdit={canEdit}/>; }
function GrowthTimeline({ logs }: { logs:any[] }) { return <AdminSectionCard className="p-5"><h3 className="text-lg font-black">Growth activity timeline</h3>{logs.length ? <ul className="mt-3 space-y-2">{logs.slice(0,12).map((l,i)=><li key={l.id||i} className="rounded-2xl border border-white/10 bg-black/25 p-3 text-sm text-white/65"><b>{l.action || l.status || l.generation_mode || "Growth activity"}</b><span className="block text-xs text-white/40">{formatDate(l.created_at || l.updated_at)} · {l.source || "location"}</span></li>)}</ul> : <EmptyPanel title="No growth activity" text="Offer, VIP, event lead, QR, conversion, marketing, campaign, and settings activity will appear here." />}</AdminSectionCard>; }


function fmt(n: number) {
  return Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(n || 0);
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function badge(value?: string | null, tone = "default") {
  const cls = tone === "danger" ? "border-rose-300/30 bg-rose-500/10 text-rose-100" : tone === "good" ? "border-emerald-300/30 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-white/[0.06] text-white/75";
  return <span className={`rounded-full border px-3 py-1 text-xs font-black ${cls}`}>{value || "Not set"}</span>;
}

function formatLocationAddress(business: Partial<BusinessCRMRow>) {
  return formatFullAddress({ address: business.address, city: business.city || business.borough, state: business.state, zip: business.zip_code || business.zip }) || "Address unavailable";
}

function normalizeImageList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => typeof item === "string" ? item : (item as any)?.url || (item as any)?.src || "").filter(Boolean);
  if (typeof value === "string") {
    try { const parsed = JSON.parse(value); if (Array.isArray(parsed)) return normalizeImageList(parsed); } catch {}
    return value.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

async function safeUpdateLocation(locationId: string, updates: Record<string, any>) {
  const { error } = await supabaseAdmin.from("locations").update(updates).eq("id", locationId);
  if (!error) return null;
  const messages: string[] = [error.message];
  for (const [key, value] of Object.entries(updates)) {
    const single = await supabaseAdmin.from("locations").update({ [key]: value }).eq("id", locationId);
    if (single.error) messages.push(`${key}: ${single.error.message}`);
  }
  return messages.join("; ");
}

async function saveLocationProfile(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.crmEdit);
  const locationId = String(formData.get("location_id") || "");
  if (!locationId) return;

  const updates = {
    name: String(formData.get("name") || "").trim() || null,
    address: stripCityStateZipFromStreetAddress(String(formData.get("address") || ""), String(formData.get("city") || ""), String(formData.get("state") || ""), String(formData.get("zip_code") || "")) || null,
    city: String(formData.get("city") || "").trim() || null,
    borough: String(formData.get("borough") || "").trim() || null,
    state: String(formData.get("state") || "").trim() || null,
    zip_code: String(formData.get("zip_code") || "").trim() || null,
    phone: String(formData.get("phone") || "").trim() || null,
    website: String(formData.get("website") || "").trim() || null,
    category: String(formData.get("category") || "").trim() || null,
    cuisine: String(formData.get("cuisine") || "").trim() || null,
    description: String(formData.get("description") || "").trim() || null,
    reservation_url: String(formData.get("reservation_url") || "").trim() || null,
    external_reservation_url: String(formData.get("external_reservation_url") || "").trim() || null,
    status: String(formData.get("status") || "").trim() || null,
    is_searchable: formData.get("is_searchable") === "on",
    updated_at: new Date().toISOString(),
  };

  if (formData.get("operating_hours_json_valid") !== "true") redirect(`/admin/dashboard/crm/${locationId}?tab=profile&hours_error=invalid`);
  const operatingHoursJson = String(formData.get("operating_hours_json") || "");
  Object.assign(updates, { operating_hours: operatingHoursJson ? JSON.parse(operatingHoursJson) : null });

  const { error } = await supabaseAdmin.from("locations").update(updates).eq("id", locationId);
  await logAdminEvent({
    level: error ? "error" : "info",
    category: "crm",
    action: "location_profile_updated",
    message: error ? `CRM profile update failed for ${locationId}` : `CRM profile updated for ${updates.name || locationId}`,
    actor_user_id: admin.user_id,
    actor_email: admin.email,
    entity_type: "location",
    entity_id: locationId,
    metadata: error ? { error: error.message } : { fields: Object.keys(updates) },
  });

  revalidatePath(`/admin/dashboard/crm/${locationId}`);
  redirect(`/admin/dashboard/crm/${locationId}?tab=profile`);
}


async function saveLocationPhotos(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.crmEdit);
  const locationId = String(formData.get("location_id") || "");
  const mainImage = String(formData.get("main_image") || "").trim() || null;
  const gallery = dedupeUrls(String(formData.get("gallery_images") || "").split(/\n|,/));
  const error = await safeUpdateLocationPhotos(locationId, { mainImage, galleryImages: gallery });
  await supabaseAdmin.from("location_photo_change_logs").insert({ location_id: locationId, main_image: mainImage, gallery_count: gallery.length, actor_user_id: admin.user_id, actor_email: admin.email });
  await logAdminEvent({ level: error ? "error" : "info", category: "crm", action: "location_photos_updated", message: error ? `Photo update had partial failures for ${locationId}` : `Photos updated for ${locationId}`, actor_user_id: admin.user_id, actor_email: admin.email, entity_type: "location", entity_id: locationId, metadata: { gallery_count: gallery.length, error } });
  revalidatePath(`/admin/dashboard/crm/${locationId}`);
  revalidatePath(`/admin/dashboard/crm/${locationId}?tab=photos`);
  redirect(`/admin/dashboard/crm/${locationId}?tab=photos&saved=1`);
}

async function savePlanBilling(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.billing);
  const locationId = String(formData.get("location_id") || "");
  const plan = String(formData.get("plan") || "free_discovery");
  const status = String(formData.get("plan_status") || "inactive");
  const trialType = String(formData.get("trial_type") || "none");
  if (trialType === "forever_comped" && admin.role !== "superadmin") redirect("/admin/unauthorized");
  const trialDays = { "7_days": 7, "14_days": 14, "30_days": 30, "60_days": 60, "90_days": 90 }[trialType] as number | undefined;
  const trialEnds = trialDays ? new Date(Date.now() + trialDays * 86400000).toISOString() : null;
  const note = String(formData.get("billing_notes") || "").trim() || null;
  const billingUpdates: Record<string, any> = { plan, plan_status: status, subscription_plan: plan, subscription_status: status, trial_ends_at: trialEnds, promo_code: String(formData.get("promo_code") || "").trim() || null, promo_campaign: String(formData.get("promo_campaign") || "").trim() || null, billing_notes: note, is_pro: plan !== "free_discovery", partner_plan_name: plan === "free_discovery" ? null : "TheOutHaven Partner", partner_plan_price_cents: plan === "free_discovery" ? null : 9900, updated_at: new Date().toISOString() }; if (plan !== "free_discovery" && ["active","comped"].includes(status)) { billingUpdates.partner_activated_at = new Date().toISOString(); billingUpdates.partner_sales_status = "active_partner"; } const error = await safeUpdateLocation(locationId, billingUpdates);
  await supabaseAdmin.from("location_plan_change_logs").insert({ location_id: locationId, new_plan: plan, new_status: status, trial_ends_at: trialEnds, promo_code: String(formData.get("promo_code") || "") || null, promo_campaign: String(formData.get("promo_campaign") || "") || null, note, actor_user_id: admin.user_id, actor_email: admin.email });
  await supabaseAdmin.from("business_crm_notes").insert({ location_id: locationId, note: `Plan updated to ${plan} / ${status}${note ? ` — ${note}` : ""}`, note_type: "billing", created_by: admin.user_id });
  await logAdminEvent({ level: error ? "error" : "info", category: "crm", action: "location_plan_updated", message: `Plan updated for ${locationId}`, actor_user_id: admin.user_id, actor_email: admin.email, entity_type: "location", entity_id: locationId, metadata: { plan, status, error } });
  revalidatePath(`/admin/dashboard/crm/${locationId}`);
  redirect(`/admin/dashboard/crm/${locationId}?tab=plan`);
}

async function updatePartnerLaunchStatus(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.crmEdit);
  const locationId = String(formData.get("location_id") || "");
  const mode = String(formData.get("mode") || "launch");
  const updates: Record<string, any> = { sales_campaign: "partner_launch", partner_launch_selected: true, updated_at: new Date().toISOString() };
  if (mode === "pilot") updates.partner_launch_pilot = true;
  const error = await safeUpdateLocation(locationId, updates);
  await supabaseAdmin.from("business_crm_notes").insert({ location_id: locationId, note: mode === "pilot" ? "Added to Launch Pilot." : "Added to Partner Launch.", note_type: "onboarding", created_by: admin.user_id }).then(undefined, () => undefined);
  await logAdminEvent({ level: error ? "error" : "info", category: "crm", action: "partner_launch_updated", message: `Partner Launch updated for ${locationId}`, actor_user_id: admin.user_id, actor_email: admin.email, entity_type: "location", entity_id: locationId, metadata: { mode, error } });
  revalidatePath(`/admin/dashboard/crm/${locationId}`);
  redirect(`/admin/dashboard/crm/${locationId}`);
}

async function updatePartnerSalesStatus(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.crmEdit);
  const locationId = String(formData.get("location_id") || "");
  const status = String(formData.get("partner_sales_status") || "target");
  const updates: Record<string, any> = { partner_sales_status: status, sales_campaign: "partner_launch", partner_launch_selected: true, updated_at: new Date().toISOString() };
  if (status === "active_partner") Object.assign(updates, { plan: "partner_99", subscription_plan: "partner_99", plan_status: "active", subscription_status: "active", is_pro: true, partner_plan_name: "TheOutHaven Partner", partner_plan_price_cents: 9900, partner_activated_at: new Date().toISOString() });
  const error = await safeUpdateLocation(locationId, updates);
  await supabaseAdmin.from("business_crm_notes").insert({ location_id: locationId, note: `Partner sales status updated to ${status}.`, note_type: "onboarding", created_by: admin.user_id }).then(undefined, () => undefined);
  await logAdminEvent({ level: error ? "error" : "info", category: "crm", action: "partner_sales_status_updated", message: `Partner sales status updated for ${locationId}`, actor_user_id: admin.user_id, actor_email: admin.email, entity_type: "location", entity_id: locationId, metadata: { status, error } });
  revalidatePath(`/admin/dashboard/crm/${locationId}`);
  redirect(`/admin/dashboard/crm/${locationId}`);
}

async function updateClaimOutreachStatus(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.crmEdit);
  const locationId = String(formData.get("location_id") || "");
  const status = String(formData.get("claim_outreach_status") || "not_sent");
  const now = new Date().toISOString();
  const updates: Record<string, any> = { claim_outreach_status: status, updated_at: now };
  if (status === "sent") Object.assign(updates, { claim_sent_at: now, partner_sales_status: "claim_link_sent", next_action: "Follow up on claim link", next_action_type: "follow_up_claim", next_action_due_at: new Date(Date.now()+2*86400000).toISOString() });
  if (status === "started") updates.claim_started_at = now;
  if (status === "approved") updates.claim_approved_at = now;
  const error = await safeUpdateLocation(locationId, updates);
  await supabaseAdmin.from("business_crm_notes").insert({ location_id: locationId, note: `Claim outreach status updated to ${status}.`, note_type: "claim", created_by: admin.user_id }).then(undefined, () => undefined);
  revalidatePath(`/admin/dashboard/crm/${locationId}`);
  redirect(`/admin/dashboard/crm/${locationId}`);
}

async function updateNextAction(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.crmEdit);
  const locationId = String(formData.get("location_id") || "");
  const updates = { next_action: String(formData.get("next_action") || "").trim() || null, next_action_type: String(formData.get("next_action_type") || "").trim() || null, next_action_due_at: String(formData.get("next_action_due_at") || "") || null, updated_at: new Date().toISOString() };
  await safeUpdateLocation(locationId, updates);
  await supabaseAdmin.from("business_crm_notes").insert({ location_id: locationId, note: `Next action set: ${updates.next_action || "none"}.`, note_type: "follow_up", created_by: admin.user_id }).then(undefined, () => undefined);
  revalidatePath(`/admin/dashboard/crm/${locationId}`);
  redirect(`/admin/dashboard/crm/${locationId}`);
}

async function logFounderNote(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.crmEdit);
  const locationId = String(formData.get("location_id") || "");
  const note = String(formData.get("note") || "").trim();
  if (note) await supabaseAdmin.from("business_crm_notes").insert({ location_id: locationId, note, note_type: String(formData.get("note_type") || "follow_up"), created_by: admin.user_id }).then(undefined, () => undefined);
  revalidatePath(`/admin/dashboard/crm/${locationId}`);
  redirect(`/admin/dashboard/crm/${locationId}`);
}

async function saveLocationSettings(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.settings);
  const locationId = String(formData.get("location_id") || "");
  const crmStatus = String(formData.get("crm_status") || "Needs Outreach");
  const updates = { active: formData.get("active") === "true", status: formData.get("active") === "true" ? "active" : "inactive", is_searchable: formData.get("is_searchable") === "true", crm_priority: String(formData.get("crm_priority") || "normal"), priority_level: String(formData.get("crm_priority") || "normal"), follow_up_date: String(formData.get("follow_up_date") || "") || null, outreach_status: String(formData.get("outreach_status") || "none"), crm_status: crmStatus, internal_notes: String(formData.get("internal_notes") || "").trim() || null, updated_at: new Date().toISOString() };
  const error = await safeUpdateLocation(locationId, updates);
  await supabaseAdmin.from("business_crm_notes").insert({ location_id: locationId, note: `Settings updated. CRM status: ${crmStatus}.`, note_type: "settings", created_by: admin.user_id });
  await logAdminEvent({ level: error ? "error" : "info", category: "crm", action: "location_settings_updated", message: `Settings updated for ${locationId}`, actor_user_id: admin.user_id, actor_email: admin.email, entity_type: "location", entity_id: locationId, metadata: { updates, error } });
  revalidatePath(`/admin/dashboard/crm/${locationId}`);
  redirect(`/admin/dashboard/crm/${locationId}?tab=settings`);
}

async function deleteLocationSuperadmin(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.locationsDelete);
  const locationId = String(formData.get("location_id") || "");
  const confirmation = String(formData.get("confirmation") || "");
  if (!locationId || confirmation !== "DELETE LOCATION") redirect(`/admin/dashboard/crm/${locationId}?tab=settings&delete_error=confirmation`);
  const { data: location } = await supabaseAdmin.from("locations").select("id, name, location_name").eq("id", locationId).maybeSingle();
  await supabaseAdmin.from("location_deletion_logs").insert({ location_id: locationId, location_name: (location as any)?.name || (location as any)?.location_name || null, actor_user_id: admin.user_id, actor_email: admin.email, action: "permanent_delete", reason: "CRM superadmin deletion" }).then(undefined, () => undefined);
  await logAdminEvent({ level: "warning", category: "crm", action: "location_delete_requested", message: `Permanent delete requested for ${locationId}`, actor_user_id: admin.user_id, actor_email: admin.email, entity_type: "location", entity_id: locationId });
  for (const table of ["business_crm_notes", "business_crm_reminders", "business_communication_logs", "location_plan_change_logs", "location_photo_change_logs", "location_owner_locations", "location_claim_codes", "claim_qr_codes", "business_claim_codes", "qr_claim_codes", "business_claims", "location_claim_requests"]) {
    await supabaseAdmin.from(table).delete().eq("location_id", locationId).then(undefined, () => undefined);
  }
  const { error } = await supabaseAdmin.from("locations").delete().eq("id", locationId);
  if (error) {
    if (/reservation|foreign key|violates/i.test(error.message)) redirect(`/admin/dashboard/crm/${locationId}?tab=settings&delete_error=reservations`);
    redirect(`/admin/dashboard/crm/${locationId}?tab=settings&delete_error=failed`);
  }
  revalidatePath("/admin/dashboard/crm");
  redirect("/admin/dashboard/crm?deleted=1");
}

async function regenerateLocationClaimQr(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.claimQrsGenerate);
  const locationId = String(formData.get("location_id") || "");
  const qr = await createClaimQr("location");
  const error = await safeUpdateLocation(locationId, { ...qr, updated_at: new Date().toISOString() });
  await upsertLocationClaimCode(locationId, qr);
  await logAdminEvent({ level: error ? "error" : "info", category: "crm", action: "location_claim_qr_regenerated", message: `Claim QR regenerated for ${locationId}`, actor_user_id: admin.user_id, actor_email: admin.email, entity_type: "location", entity_id: locationId, metadata: { claim_code: qr.claim_code, error } });
  revalidatePath(`/admin/dashboard/crm/${locationId}`);
  redirect(`/admin/dashboard/crm/${locationId}?tab=qr-codes`);
}

function StatCard({ label, value, helper }: { label: string; value: string | number; helper?: string }) {
  return <div className="rounded-2xl border border-white/10 bg-black/25 p-4"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">{label}</p><p className="mt-2 text-3xl font-black">{value}</p>{helper ? <p className="mt-1 text-xs text-white/45">{helper}</p> : null}</div>;
}

function EmptyPanel({ title, text }: { title: string; text: string }) {
  return <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-5"><h3 className="font-black">{title}</h3><p className="mt-2 text-sm leading-6 text-white/55">{text}</p></div>;
}

function ProfileForm({ business, canEdit }: { business: BusinessCRMRow; canEdit: boolean }) {
  const fields: Array<[string, string, string | null | undefined]> = [
    ["name", "Name", business.name],
    ["address", "Address", business.address],
    ["city", "City", business.city],
    ["borough", "Borough", business.borough],
    ["state", "State", business.state],
    ["zip_code", "Zip code", business.zip_code || business.zip],
    ["phone", "Phone", business.phone],
    ["website", "Website", business.website],
    ["category", "Category", business.category],
    ["cuisine", "Cuisine", business.cuisine],
    ["reservation_url", "Reservation URL", business.reservation_url],
    ["external_reservation_url", "External reservation URL", (business as any).external_reservation_url],
    ["status", "Status", business.status],
  ];

  return <section className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"><form action={saveLocationProfile} className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
    <input type="hidden" name="location_id" value={business.id} />
    <p className="mb-4 rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-white/60"><b className="text-white/80">Public address preview:</b> {formatLocationAddress(business)}</p>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {fields.map(([name, label, value]) => <label key={name} className="space-y-2 text-sm font-bold text-white/65"><span>{label}</span><input name={name} defaultValue={String(value || "")} disabled={!canEdit} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none disabled:opacity-60" /></label>)}
      <label className="space-y-2 text-sm font-bold text-white/65 xl:col-span-3"><span>Description</span><textarea name="description" defaultValue={business.description || ""} disabled={!canEdit} rows={5} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none disabled:opacity-60" /></label>
      <div className="xl:col-span-3"><LocationHoursEditor value={business.operating_hours} disabled={!canEdit} theme="dark" status={business as Record<string, unknown>} /></div>
      <details className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm font-bold text-white/65 xl:col-span-3"><summary className="cursor-pointer">Special/Holiday Hours JSON</summary><textarea readOnly rows={5} value={business.special_hours ? JSON.stringify(business.special_hours, null, 2) : ""} className="mt-3 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-xs text-white outline-none" /></details>
      <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-white/70"><input type="checkbox" name="is_searchable" defaultChecked={Boolean(business.is_searchable)} disabled={!canEdit} /> Searchable</label>
    </div>
    <div className="mt-5 flex flex-wrap gap-3">
      <button disabled={!canEdit} className="rounded-full bg-rose-600 px-6 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">Save profile</button>
      {!canEdit ? <p className="text-sm text-white/45">Viewer role is read-only.</p> : null}
    </div>
  </form><LocationProfileEditor table="locations" id={business.id} record={business as any} canEdit={canEdit} canViewAdvancedSystemData={true} saveMode="admin" type={String(business.location_type || "locations")} aiHelperEnabled={true} aiHelperAccessLabel="Admins can keep manual edits and apply only the suggestions they want." /></section>;
}

function CrmHeroActions({
  business,
  publicHref,
  canViewPublic,
  adminLocationId,
}: {
  business: BusinessCRMRow;
  publicHref: string | null;
  canViewPublic: boolean;
  adminLocationId: string;
}) {
  const publicStatusLabel = canViewPublic && publicHref ? "Public page live" : "Public page not live";
  const publicStatusHelper = canViewPublic && publicHref
    ? "This listing can be opened publicly."
    : publicHref
      ? "Hidden from public search or missing public route data."
      : "Missing public location id or route data.";

  return (
    <aside className="w-full rounded-[1.4rem] border border-white/10 bg-black/30 p-3 shadow-inner shadow-black/30 xl:w-[390px]">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
        <Link
          href={`/admin/dashboard/crm/${business.id}?tab=listing`}
          className="flex min-h-[52px] items-center justify-center rounded-[1rem] bg-rose-600 px-4 py-3 text-center text-sm font-black text-white shadow-lg shadow-rose-950/35 transition hover:bg-rose-500"
        >
          Edit Listing Enhancement
        </Link>

        <Link
          href={`/admin/dashboard/crm/${business.id}?tab=profile`}
          className="flex min-h-[52px] items-center justify-center rounded-[1rem] border border-white/10 bg-white/[0.06] px-4 py-3 text-center text-sm font-black text-white/80 transition hover:border-white/20 hover:bg-white/[0.09] hover:text-white"
        >
          Edit Profile
        </Link>
      </div>

      <div className="mt-3 rounded-[1rem] border border-white/10 bg-white/[0.04] p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-white/40">
              Public Page
            </p>
            <p className={`mt-1 text-sm font-black ${canViewPublic && publicHref ? "text-emerald-100" : "text-white/55"}`}>
              {publicStatusLabel}
            </p>
            <p className="mt-1 text-xs leading-5 text-white/40">
              {publicStatusHelper}
            </p>
          </div>

          {canViewPublic && publicHref ? (
            <Link
              href={publicHref}
              className="shrink-0 rounded-full border border-emerald-300/20 bg-emerald-500/10 px-3 py-2 text-xs font-black text-emerald-100 transition hover:bg-emerald-500/15"
            >
              View
            </Link>
          ) : (
            <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black text-white/35">
              Hidden
            </span>
          )}
        </div>
      </div>

      <details className="group mt-3 rounded-[1rem] border border-white/10 bg-white/[0.04]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-black text-white/75 transition hover:text-white [&::-webkit-details-marker]:hidden">
          <span>More Actions</span>
          <span className="text-white/35 transition group-open:rotate-180">⌄</span>
        </summary>

        <div className="grid gap-2 border-t border-white/10 p-2">
          <Link
            href={`/admin/dashboard/locations/id/${adminLocationId}`}
            className="rounded-[0.85rem] px-3 py-2 text-sm font-bold text-white/65 transition hover:bg-white/[0.06] hover:text-white"
          >
            Open Admin Location
          </Link>

          <Link
            href={`/admin/dashboard/crm/${business.id}?tab=claims`}
            className="rounded-[0.85rem] px-3 py-2 text-sm font-bold text-white/65 transition hover:bg-white/[0.06] hover:text-white"
          >
            Open Claims
          </Link>

          <Link
            href={`/admin/dashboard/crm/${business.id}?tab=qr-codes`}
            className="rounded-[0.85rem] px-3 py-2 text-sm font-bold text-white/65 transition hover:bg-white/[0.06] hover:text-white"
          >
            Print QR
          </Link>

          <Link
            href={`/admin/dashboard/crm/${business.id}?tab=support`}
            className="rounded-[0.85rem] px-3 py-2 text-sm font-bold text-white/65 transition hover:bg-white/[0.06] hover:text-white"
          >
            Add Experience Note
          </Link>
        </div>
      </details>
    </aside>
  );
}

export default async function CRMDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; commTab?: string }> }) {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.crm);
  const { id } = await params;
  const query = await searchParams;
  const activeTab = normalizeCrmDetailTab(query.tab);
  const business = await getBusinessCRM(id);
  if (!business) notFound();

  if (activeTab === "qr-codes") {
    const rawQrValues = [
      (business as any).claim_code,
      (business as any).claim_url,
      (business as any).claim_qr_url,
      (business as any).qr_code_data_url,
      (business as any).qr_link,
    ].map((value) => String(value || ""));
    const needsQrRepair =
      rawQrValues.some((value) => value.length === 0) ||
      rawQrValues.some((value) => /roseout\.com|roseout\.vercel\.app|theouthaven\.vercel\.app/i.test(value));

    if (needsQrRepair) {
      const fields = await ensureClaimFields(business as any, {
        table: "locations",
        forceCanonicalUrl: true,
        regenerateQr: true,
      });
      await supabaseAdmin.from("locations").update(fields).eq("id", business.id).then(undefined, () => undefined);
      await upsertLocationClaimCode(business.id, fields);
      Object.assign(business as any, fields);
    }
  }

  const profile = await getTeamProfileForUser(admin.user_id);
  const hasLocationAccess = hasBroadWorkspaceLocationAccess(admin.role) || hasBroadWorkspaceLocationAccess(profile) || await isWorkspaceLocationPermitted(profile, business.id);
  if (!hasLocationAccess) redirect("/admin/unauthorized");
  const related = await getLocationCrmRelatedData(business.id);
  const flags = getUpgradeFlags(business);
  const canEdit = canAdmin(admin.role, "crmEdit");
  const publicHref = getCrmPublicLocationHref(business);
  const canViewPublic = Boolean(publicHref && canOpenPublicLocationPage(business));
  const adminLocationId = getCrmCanonicalLocationId(business) || business.id;
  const enhancementTable: LocationTableName = business.location_type === "restaurants" || business.location_type === "activities" ? business.location_type : "locations";
  const qualityScore = business.profile_quality_score || Math.round([business.name, business.address, business.city, business.phone, business.website, business.description].filter(Boolean).length / 6 * 100);
  const seoScore = business.seo_score || Math.round([business.name, business.description, business.category, business.city, business.is_searchable].filter(Boolean).length / 5 * 100);
  const publishability = evaluateLocationPublishability(business as any, { allowApproval: true });
  const inferredHasPhoto = Boolean(
    business.main_image ||
      business.image_url ||
      (Array.isArray(business.images) && business.images.length > 0) ||
      (Array.isArray(business.gallery_images) && business.gallery_images.length > 0) ||
      (Array.isArray(business.photos) && business.photos.length > 0),
  );
  const displayHasPhotos = (business as any).has_photos === true || inferredHasPhoto;
  const displayPhotoStatus = displayHasPhotos
    ? (business as any).photo_status === "missing_photo"
      ? "has_photo"
      : (business as any).photo_status || "has_photo"
    : "missing_photo";
  const photoFlagsNeedRepair = inferredHasPhoto &&
    ((business as any).has_photos === false || (business as any).photo_status === "missing_photo");

  return <AdminPageShell>
      <section className="rounded-[1.35rem] border border-white/10 bg-[linear-gradient(135deg,#12090d,#090909_60%,#131316)] p-4 shadow-2xl shadow-black/30 sm:p-5 xl:p-6">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px] xl:items-start">
          <div className="min-w-0">
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-white/45"><Link href="/admin/dashboard/crm" className="text-rose-200 hover:text-rose-100">CRM</Link><span>/</span><span>Location Workspace</span><span>/</span><span className="truncate text-white/65">{business.name}</span></nav>
            <h1 className="mt-3 max-w-4xl text-3xl font-black tracking-tight text-white sm:text-4xl xl:text-5xl">
              {business.name}
            </h1>
            <p className="mt-2 text-sm text-white/60">{formatLocationAddress(business)}</p>
            <div className="mt-4 flex max-w-4xl flex-wrap gap-2">{badge(business.status || "active")}{badge(business.is_searchable ? "Searchable" : "Not searchable", business.is_searchable ? "good" : "danger")}{badge(getClaimStatus(business), business.is_claimed ? "good" : "danger")}{badge(getBillingStatusLabel(business.subscription_status || business.plan_status))}{badge(getDisplayCRMStatus(business))}{(business as any).stripe_subscription_id ? badge("Stripe managed", "good") : business.subscription_status === "comped" ? badge("Manually comped", "good") : business.subscription_plan === "enterprise" ? badge("Enterprise invoice") : null}</div>
          </div>
          <CrmHeroActions
            business={business}
            publicHref={publicHref}
            canViewPublic={canViewPublic}
            adminLocationId={adminLocationId}
          />
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Opportunity" value={fmt(business.opportunity_score)} />
          <StatCard label="Churn risk" value={fmt(business.churn_risk_score)} />
          <StatCard label="Profile quality" value={`${qualityScore}%`} />
          <StatCard label="SEO score" value={`${seoScore}%`} />
          <StatCard label="Reservation ready" value={`${business.reservation_readiness_score || (business.reservation_url ? 80 : 35)}%`} />
          <StatCard label="Open tasks" value={related.reminders.length || business.open_tasks || 0} />
        </div>
      </section>

      <AdminKpiGrid>
        <AdminKpiCard label="Sales Readiness" value={`${getSalesReadinessScore(business)}%`} helper="Pipeline fit" />
        <AdminKpiCard label="Setup Score" value={`${getPartnerSetupScore(business)}%`} helper="Partner readiness" />
        <AdminKpiCard label="Reservation Ready" value={`${business.reservation_readiness_score || (business.reservation_url || (business as any).external_reservation_url ? 80 : 35)}%`} helper={getReservationPortalStatus(business).replace(/_/g, " ")} />
        <AdminKpiCard label="Views 30D" value={fmt(business.profile_views_30d)} helper="Profile views" />
        <AdminKpiCard label="Search 30D" value={fmt(business.search_appearances_30d)} helper="Appearances" />
        <AdminKpiCard label="Reserve Intent 30D" value={fmt(business.reservation_completions_30d)} helper="Completions" />
      </AdminKpiGrid>

      <LocationWorkspaceNavigation locationId={business.id} activeTab={activeTab} />

      <AdminSectionCard className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-rose-200">Search Visibility / Publishability</p>
            <h2 className="mt-2 text-xl font-black">{publishability.reviewLabel}</h2>
            <div className="mt-3 grid gap-2 text-sm text-white/65 sm:grid-cols-2 lg:grid-cols-4">
              <span>Searchable: <b>{publishability.isSearchable ? "yes" : "no"}</b></span><span>Publish-ready: <b>{publishability.qualityStatus === "publish_ready" ? "yes" : "no"}</b></span><span>Ready to approve: <b>{publishability.isReadyToApprove ? "yes" : "no"}</b></span><span>Visibility tier: <b>{publishability.publicVisibilityTier}</b></span>
              <span>Hidden flag: <b>{String(publishability.isHidden)}</b></span><span>Low-level flag: <b>{String(publishability.isLowLevel)}</b></span><span>Photo status: <b>{displayPhotoStatus}</b></span><span>Data status: <b>{(business as any).data_status || "—"}</b></span>
              <span>Quality status: <b>{publishability.qualityStatus}</b></span><span>Source quality: <b>{publishability.sourceQualityStatus}</b></span><span>Import confidence: <b>{publishability.importConfidence}</b></span><span>Duplicate status: <b>{(business as any).duplicate_status || "—"}</b></span>
            </div>
            {photoFlagsNeedRepair ? <p className="mt-3 rounded-2xl border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-sm font-bold text-amber-100">Photo detected but flags need repair.</p> : null}
            {publishability.reasons.length ? <div className="mt-3 flex flex-wrap gap-2">{publishability.reasons.map((reason)=><span key={reason} className="rounded-full border border-amber-300/20 bg-amber-500/10 px-3 py-1 text-xs font-black text-amber-100">{reason}</span>)}</div> : null}
          </div>
          <div className="flex flex-col items-end gap-2"><RepairPublishabilityButton locationId={adminLocationId} /><PublishabilityRepairButton locationId={business.id} eligible={publishability.isReadyToApprove} /></div>
        </div>
      </AdminSectionCard>



      {activeTab === "partner-launch" ? <PartnerLaunchPanel business={business} canEdit={canEdit} /> : null}

      {activeTab === "overview" ? <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]"><div className="min-w-0 grid gap-4 lg:grid-cols-2">
        <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><h2 className="text-xl font-black">Location command center</h2><p className="mt-2 text-sm leading-6 text-white/60">Owner, claim, plan, analytics, Experience Inbox, logs, and data quality context are consolidated here so admins do not need to jump across disconnected pages.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><StatCard label="Profile views 30d" value={fmt(business.profile_views_30d)} /><StatCard label="Search appearances 30d" value={fmt(business.search_appearances_30d)} /><StatCard label="Reserve intent 30d" value={fmt(business.reservation_completions_30d)} /><StatCard label="Conversion rate" value={`${fmt(business.conversion_rate_30d * 100)}%`} /></div></article>
        <NextRecommendedActions business={business} flags={flags} isAdmin={canAdmin(admin.role, "crmEdit")} />
        <ReservationSummaryCard business={business} />
        <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><h2 className="text-xl font-black">Recent activity</h2>{related.logs.length ? <ul className="mt-3 space-y-2 text-sm text-white/70">{related.logs.slice(0, 6).map((log: any) => <li key={log.id} className="rounded-2xl border border-white/10 bg-black/20 p-3"><b>{log.action || log.category}</b> · {log.message}<span className="block text-xs text-white/40">{formatDate(log.created_at)}</span></li>)}</ul> : <EmptyPanel title="No activity yet" text="CRM actions, profile edits, claim changes, QR activity, and Experience notes will appear here after admins perform them." />}</article>
        <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><h2 className="text-xl font-black">Open tasks & Experience Inbox</h2>{related.reminders.length || related.supportTickets.length ? <ul className="mt-3 space-y-2 text-sm text-white/70">{[...related.reminders, ...related.supportTickets].slice(0, 6).map((item: any) => <li key={item.id} className="rounded-2xl border border-white/10 bg-black/20 p-3">{item.title || item.subject || item.message || "CRM item"}<span className="block text-xs text-white/40">{item.reminder_status || item.status || "open"}</span></li>)}</ul> : <EmptyPanel title="No open tasks" text="Tasks, reminders, and Experience Inbox tickets tied to this location will appear here." />}</article></div><RightCommandPanel business={business} flags={flags} canEdit={canEdit} /></section> : null}

      {activeTab === "profile" ? <ProfileForm business={business} canEdit={canEdit} /> : null}
      {activeTab === "analytics" ? <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><StatCard label="Profile views" value={fmt(business.profile_views_30d)} /><StatCard label="Search appearances" value={fmt(business.search_appearances_30d)} /><StatCard label="Saves" value={fmt(business.saves_30d)} /><StatCard label="Reserve completions" value={fmt(business.reservation_completions_30d)} /><StatCard label="Call clicks" value={fmt((business as any).call_clicks_30d || 0)} /><StatCard label="Website clicks" value={fmt((business as any).website_clicks_30d || 0)} /><StatCard label="QR scans" value={fmt((business as any).qr_scans_30d || 0)} /><StatCard label="Conversion rate" value={`${fmt(business.conversion_rate_30d * 100)}%`} /><div className="xl:col-span-4"><EmptyPanel title="Location analytics only" text="This tab contains location-specific analytics. Platform-wide executive analytics stay on /admin/dashboard/analytics." /></div></section> : null}
      {activeTab === "claims" ? <ClaimsPanel business={business} claims={related.claims} /> : null}
      {activeTab === "logs" ? <section className="space-y-4"><Panel title="Location logs" items={related.logs} empty="No admin activity has been recorded for this location yet." href="/admin/dashboard/logs" hrefLabel="Open platform logs" /></section> : null}
      {["communication","messaging","notifications"].includes(activeTab) ? <CommunicationPanel locationId={business.id} defaultEmail={business.owner_email} defaultPhone={business.phone} templates={related.templates} logs={related.communications} canSend={canEdit} /> : null}
      {activeTab === "support" ? <Panel title="Experience Inbox" items={related.supportTickets} empty="No Experience Inbox tickets have been opened for this location yet." href="/admin/dashboard/support" hrefLabel="Open Experience Inbox" /> : null}
      {activeTab === "photos" ? <PhotosPanelClient business={business} canEdit={canEdit} saveAction={saveLocationPhotos} /> : null}
      {["operations","reservations","waitlist","walk-ins","floor-resources"].includes(activeTab) ? <OperationsWorkspace business={business} related={related} activeTab={activeTab} adminRole={admin.role} canEdit={canEdit} /> : null}
      {activeTab === "owner" ? <OwnerPanel business={business} owners={related.owners} /> : null}
      {activeTab === "plan" ? <PlanBillingPanel business={business} canEdit={admin.role === "superadmin"} isSuperadmin={admin.role === "superadmin"} /> : null}
      {activeTab === "qr-codes" ? <QRCodePanel business={business} qrCodes={related.qrCodes} canRegenerate={canAdmin(admin.role, "claimQrsGenerate")} /> : null}
      {activeTab === "seo" ? <EmptyPanel title="SEO and searchability" text={`SEO score ${seoScore}%. Searchable: ${business.is_searchable ? "yes" : "no"}. Use Listing Enhancement, profile, and settings to improve location-level search visibility.`} /> : null}
      {activeTab === "listing" ? <ListingEnhancementEditor table={enhancementTable} id={business.id} record={business} canEdit={canEdit} /> : null}
      {activeTab === "settings" ? <LocationSettingsPanel business={business} canEdit={canEdit} isSuperadmin={admin.role === "superadmin"} /> : null}
      {activeTab === "menu-packages" ? <div className="-mx-2 sm:-mx-4 xl:-mx-6"><AdminCrmMenuPanel business={business} canEdit={canEdit} /></div> : null}
      {["branding","offerings","growth-overview","offers","vip-list","event-leads","reviews-feedback","marketing-studio","campaigns","conversion","growth-settings"].includes(activeTab) ? <GrowthProAdminPanel business={business} tab={activeTab} canEdit={canEdit} adminRole={admin.role} /> : null}
      <div className="sticky bottom-4 z-30 rounded-[1.25rem] border border-white/10 bg-black/85 p-3 shadow-2xl shadow-black/50 backdrop-blur"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm font-bold text-white/65">Workspace actions for <b className="text-white">{business.name}</b></p><div className="flex flex-wrap gap-2"><Link href={`/admin/dashboard/crm/${business.id}?tab=profile`} className="rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white/75">Profile Basics</Link><Link href={`/admin/dashboard/crm/${business.id}?tab=menu-packages`} className="rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white/75">Menu & Packages</Link>{canViewPublic && publicHref ? <Link href={publicHref} className="rounded-full bg-rose-600 px-4 py-2 text-xs font-black text-white">Public Preview</Link> : null}</div></div></div>
  </AdminPageShell>;
}

function OperationsWorkspace({ business, related, activeTab, adminRole, canEdit }: { business: BusinessCRMRow; related: any; activeTab: string; adminRole: string; canEdit: boolean }) {
  const base = `/admin/dashboard/crm/${business.id}?tab=`;
  const reservations = related.reservations || [];
  const waitlist = related.waitlist || [];
  const walkIns = related.walkIns || [];
  const resources = related.resources || [];
  const claims = related.claims || [];
  const qrCodes = related.qrCodes || [];
  const support = related.supportTickets || [];
  const canWrite = canEdit && !["viewer", "reviewer"].includes(adminRole);
  const claimOnly = adminRole === "ambassador";
  const supportAllowed = adminRole === "experience team";
  const actionAllowed = canWrite && !claimOnly;
  const today = new Date().toISOString().slice(0, 10);
  const statusCount = (rows: any[], names: string[]) => rows.filter((r) => names.includes(String(r.status || "").toLowerCase())).length;
  const resDate = (r: any) => String(r.starts_at || r.reservation_date || r.date || r.created_at || "").slice(0, 10);
  const todayReservations = reservations.filter((r: any) => resDate(r) === today);
  const activeWaitlist = waitlist.filter((w: any) => ["waiting", "waitlisted", "notified"].includes(String(w.status || "waiting").toLowerCase()));
  const activeWalkIns = walkIns.filter((w: any) => !["completed", "complete", "cancelled", "canceled"].includes(String(w.status || "active").toLowerCase()));
  const alerts = dedupeOperationalAlerts([
    getReservationPortalStatus(business) === "not_enabled" && ["high", "Reservation portal disabled", "Guests cannot book through the public reservation portal.", "Enable or test the reservation portal.", `${base}reservations`],
    !resources.length && ["high", "Missing reservation resources", "No tables, rooms, lanes, or resources are configured.", "Open layout/resource setup and create capacity.", `${base}floor-resources`],
    resources.length > 0 && !resources.some((r: any) => ["available", "open", "active"].includes(String(r.status || r.current_status || "available").toLowerCase())) && ["medium", "No available capacity", "All configured resources appear unavailable.", "Review resource statuses or override availability.", `${base}floor-resources`],
    activeWaitlist.some((w: any) => Date.now() - new Date(w.updated_at || w.created_at || Date.now()).getTime() > 60 * 60 * 1000) && ["medium", "Waitlist entries stuck too long", "One or more active waitlist records have not changed recently.", "Notify, seat, convert, cancel, or expire the entry.", `${base}waitlist`],
    activeWalkIns.some((w: any) => !(w.resource_id || w.assigned_resource || w.table_id)) && ["medium", "Walk-ins without assigned resources", "Active walk-ins are missing an assigned table/resource.", "Assign a resource from the walk-ins workspace.", `${base}walk-ins`],
    !(business.claim_code || qrCodes.some((q: any) => q.claim_code || q.code)) && ["high", "Claim code missing", "This location does not have a reusable owner claim code.", "Generate a claim code or QR claim link.", `${base}claims`],
    qrCodes.some((q: any) => /roseout\.com|roseout\.vercel\.app/i.test(String(q.claim_url || q.qr_url || q.qr_link || ""))) && ["medium", "Claim URL using an old domain", "At least one QR/claim URL points at an old Roseout domain.", "Regenerate the QR code with the canonical TheOutHaven URL.", `${base}qr-codes`],
    !qrCodes.length && ["medium", "QR code missing", "No QR records are connected to this location.", "Generate QR records without duplicating existing codes.", `${base}qr-codes`],
    getEmbedStatus(business) === "not_sent" && ["low", "Embed code unavailable", "The reservation embed has not been sent or installed.", "Generate and send the embed code.", `${base}reservations`],
    business.active === false && ["high", "Location inactive", "The location is inactive and may be hidden from operations.", "Review location settings before taking bookings.", `${base}support`],
    !business.is_searchable && ["medium", "Location not searchable", "Guests may not discover this location in public search.", "Fix search visibility and publishability.", `${base}support`],
    !(business.phone || business.owner_email || business.website) && ["medium", "Missing required contact information", "Phone, owner email, or website details are missing.", "Update the location profile.", `${base}support`],
  ].filter(Boolean) as string[][]);
  const kpis = [
    ["Reservations today", todayReservations.length, "reservations"], ["Confirmed reservations", statusCount(reservations, ["confirmed"]), "reservations"], ["Pending reservations", statusCount(reservations, ["pending", "requested"]), "reservations"], ["Checked-in guests", statusCount(reservations, ["checked_in", "checked-in", "seated"]), "reservations"], ["Completed reservations", statusCount(reservations, ["completed", "complete"]), "reservations"], ["Cancelled reservations", statusCount(reservations, ["cancelled", "canceled"]), "reservations"], ["No-shows", statusCount(reservations, ["no_show", "no-show"]), "reservations"], ["Active waitlist", activeWaitlist.length, "waitlist"], ["Active walk-ins", activeWalkIns.length, "walk-ins"], ["Available resources", resources.filter((r: any) => ["available", "open", "active"].includes(String(r.status || r.current_status || "available").toLowerCase())).length, "floor-resources"], ["Open support issues", support.filter((t: any) => !["resolved", "closed"].includes(String(t.status || "open").toLowerCase())).length, "support"], ["Claim status", getClaimStatus(business), "claims"], ["QR claim code status", qrCodes.length ? "ready" : "missing", "qr-codes"], ["Reservation portal status", getReservationPortalStatus(business).replace(/_/g, " "), "reservations"], ["Embed status", getEmbedStatus(business).replace(/_/g, " "), "reservations"],
  ];
  const activity = [...(related.logs || []), ...reservations, ...waitlist, ...walkIns, ...claims, ...qrCodes, ...support].sort((a: any,b: any)=>new Date(b.updated_at || b.created_at || b.submitted_at || 0).getTime()-new Date(a.updated_at || a.created_at || a.submitted_at || 0).getTime()).slice(0,12);
  return <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]"><div className="min-w-0 space-y-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{kpis.map(([l,v,t])=><Link key={String(l)} href={`${base}${t}`} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 hover:border-rose-300/40"><p className="text-xs font-black uppercase tracking-[0.16em] text-white/40">{l}</p><p className="mt-2 text-2xl font-black capitalize text-white">{String(v)}</p></Link>)}</div><AlertsPanel alerts={alerts}/>{activeTab === "operations" ? <OperationsOverview canWrite={canWrite} /> : null}{activeTab === "reservations" ? <ReservationsPanel business={business} reservations={reservations} canSend={actionAllowed} /> : null}{activeTab === "waitlist" ? <OperationalTable title="Waitlist" rows={waitlist} canWrite={actionAllowed} actions={["Add to waitlist","Notify guest","Seat guest","Convert to reservation","Cancel","Mark expired"]} fields={["contact_name","guest_name","contact_phone","contact_email","party_size","requested_time","estimated_wait_minutes","queue_position","status","notes","created_at","updated_at"]} /> : null}{activeTab === "walk-ins" ? <OperationalTable title="Walk-ins" rows={walkIns} canWrite={actionAllowed || supportAllowed} actions={["Add walk-in","Assign table or resource","Seat","Move","Complete","Cancel"]} fields={["guest_name","party_size","arrival_time","assigned_resource","status","notes","created_by","seated_at","completed_at"]} /> : null}{activeTab === "floor-resources" ? <OperationalTable title="Floor / Resources" rows={resources} canWrite={actionAllowed} actions={["View layout","Edit layout","Create resource","Edit resource","Disable resource","Move reservation","Open hostess mode"]} fields={["name","resource_name","type","resource_type","capacity","status","current_status","active_reservation_id","next_reservation_at","availability_window","default_duration","override_duration"]} /> : null}</div><RecentActivity rows={activity}/></section>;
}

function dedupeOperationalAlerts(alerts: string[][]) { const seen = new Set(); return alerts.filter((a) => { const key = a[1]; if (seen.has(key)) return false; seen.add(key); return true; }); }
function AlertsPanel({ alerts }: { alerts: string[][] }) { return <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><h2 className="text-xl font-black">Operational Alerts</h2>{alerts.length ? <div className="mt-4 grid gap-3">{alerts.map(([severity,title,text,action,href])=><div key={title} className="rounded-2xl border border-amber-300/20 bg-amber-500/10 p-4 text-sm text-amber-50"><div className="flex flex-wrap items-center justify-between gap-2"><b>{severity.toUpperCase()} · {title}</b><Link href={href} className="rounded-full bg-black/30 px-3 py-1 text-xs font-black">Fix</Link></div><p className="mt-1 text-amber-50/80">{text}</p><p className="mt-1 font-bold">Recommended: {action}</p><button type="button" className="mt-2 rounded-full border border-white/10 px-3 py-1 text-xs font-black text-white/60">Dismiss</button></div>)}</div> : <EmptyPanel title="No operational alerts" text="No duplicate or blocking operational alerts were detected for this location." />}</article>; }
function OperationsOverview({ canWrite }: { canWrite: boolean }) { return <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><h2 className="text-xl font-black">Enterprise Operations Workspace</h2><p className="mt-2 text-sm leading-6 text-white/60">Use the Operations child navigation to manage reservations, waitlist, walk-ins, resources, claims, QR tools, and support from the canonical CRM location workspace.</p><p className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-white/55">Permission mode: {canWrite ? "write actions available where supported" : "read-only or restricted actions only"}.</p></article>; }
function OperationalTable({ title, rows, fields, actions, canWrite }: { title: string; rows: any[]; fields: string[]; actions: string[]; canWrite: boolean }) { return <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-black">{title}</h2><p className="mt-1 text-sm text-white/55">Records remain visible across active and terminal statuses. Use existing dashboards/APIs for connected actions.</p></div><div className="flex flex-wrap gap-2">{actions.map(a=><button key={a} disabled={!canWrite} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black text-white/70 disabled:opacity-40">{a}</button>)}</div></div><div className="mt-4 grid gap-3 md:hidden">{rows.map((r,i)=><RecordCard key={r.id || i} row={r} fields={fields}/>)}</div><div className="mt-4 hidden overflow-x-auto md:block"><table className="min-w-full text-left text-sm text-white/65"><thead><tr>{fields.slice(0,8).map(f=><th key={f} className="border-b border-white/10 p-3 text-xs uppercase text-white/40">{f.replace(/_/g," ")}</th>)}</tr></thead><tbody>{rows.length ? rows.map((r,i)=><tr key={r.id || i}>{fields.slice(0,8).map(f=><td key={f} className="border-b border-white/10 p-3">{formatCell(r[f])}</td>)}</tr>) : <tr><td colSpan={8} className="p-6 text-center text-white/45">No {title.toLowerCase()} records yet.</td></tr>}</tbody></table></div></article>; }
function RecordCard({ row, fields }: { row: any; fields: string[] }) { return <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/65">{fields.slice(0,10).map(f=><p key={f} className="mt-1"><b className="capitalize text-white/40">{f.replace(/_/g," ")}:</b> {formatCell(row[f])}</p>)}</div>; }
function formatCell(v: any) { if (!v) return "—"; if (typeof v === "string" && /_at$|date|time/i.test(v)) return formatDate(v); return String(v); }
function RecentActivity({ rows }: { rows: any[] }) { return <aside className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><h2 className="text-xl font-black">Recent operational activity</h2>{rows.length ? <ol className="mt-4 space-y-3 text-sm text-white/65">{rows.map((r:any,i:number)=><li key={r.id || i} className="rounded-2xl border border-white/10 bg-black/20 p-3"><p className="font-black text-white">{r.action || r.subject || r.status || r.guest_name || r.contact_name || r.claimant_name || "Operational record updated"}</p><p className="text-xs text-white/45">{formatDate(r.updated_at || r.created_at || r.submitted_at)} · {r.actor_email || r.created_by || r.assigned_to || "system"}</p></li>)}</ol> : <EmptyPanel title="No recent activity" text="Reservation, waitlist, walk-in, resource, claim, QR, and support activity will appear here." />}</aside>; }

function ReservationSummaryCard({ business }: { business: BusinessCRMRow }) {
  return <article className="rounded-3xl border border-rose-200/15 bg-rose-500/[0.045] p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.24em] text-rose-200">Reservation Summary</p><h2 className="mt-2 text-xl font-black">Booking readiness</h2><p className="mt-1 text-sm text-white/55">Reservation setup is visible here and in the Reservations tab.</p></div><Link href={`/admin/dashboard/crm/${business.id}?tab=reservations`} className="rounded-full bg-rose-600 px-4 py-2 text-sm font-black text-white">Manage Reservations</Link></div><dl className="mt-4 grid gap-3 sm:grid-cols-2 text-sm"><Info label="Portal status" value={getReservationPortalStatus(business).replace(/_/g, " ")} /><Info label="Reservation URL" value={business.reservation_url || "—"} /><Info label="External URL" value={(business as any).external_reservation_url || "—"} /><Info label="Ready score" value={`${business.reservation_readiness_score || (business.reservation_url || (business as any).external_reservation_url ? 80 : 35)}%`} /><Info label="Completions 30d" value={fmt(business.reservation_completions_30d)} /><Info label="Call clicks 30d" value={fmt((business as any).call_clicks_30d || 0)} /></dl></article>;
}

function Info({ label, value }: { label: string; value: any }) {
  return <div className="min-w-0 rounded-2xl border border-white/10 bg-black/20 p-3"><dt className="text-xs font-black uppercase tracking-[0.16em] text-white/35">{label}</dt><dd className="mt-1 truncate font-bold capitalize text-white/75">{value || "—"}</dd></div>;
}

function RightCommandPanel({ business, flags, canEdit }: { business: BusinessCRMRow; flags: string[]; canEdit: boolean }) {
  return <AdminDetailPanel className="space-y-4"><h2 className="text-lg font-black">Command Panel</h2><AdminActionButton href={`/admin/dashboard/crm/${business.id}?tab=partner-launch`} variant="primary">Set Next Action</AdminActionButton><AdminActionButton href={`/admin/dashboard/crm/${business.id}?tab=communication`}>Log Note / Message</AdminActionButton><AdminActionButton href={`/admin/dashboard/crm/${business.id}?tab=reservations`}>Manage Reservations</AdminActionButton><div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><h3 className="font-black">Profile completeness</h3><ul className="mt-3 space-y-2 text-sm text-white/60">{(flags.length ? flags : ["No critical issues flagged", "Review reservations weekly"]).map((flag) => <li key={flag}>• {flag}</li>)}</ul></div><p className="text-xs text-white/40">{canEdit ? "Editing enabled for your role." : "Viewer role is read-only."}</p></AdminDetailPanel>;
}

function PartnerLaunchPanel({ business, canEdit }: { business: BusinessCRMRow; canEdit: boolean }) {
  const stats = [
    ["Selected for Partner Launch", business.partner_launch_selected ? "Yes" : "No"], ["Launch Pilot", business.partner_launch_pilot ? "Yes" : "No"], ["Partner sales status", getPartnerSalesStatus(business).replace(/_/g," ")], ["Claim outreach status", getClaimOutreachStatus(business).replace(/_/g," ")], ["Plan display", getPartnerPlanDisplay(business)], ["Reservation portal status", getReservationPortalStatus(business).replace(/_/g," ")], ["Embed status", getEmbedStatus(business).replace(/_/g," ")], ["Discovery status", getDiscoveryStatus(business).replace(/_/g," ")], ["Next action", getNextActionLabel(business)], ["Follow-up date", formatDate(business.next_action_due_at || business.follow_up_date)], ["Owner contact missing", business.owner_contact_missing ? "Yes" : "No"], ["Sales readiness", `${getSalesReadinessScore(business)}%`], ["Partner setup score", `${getPartnerSetupScore(business)}%`],
  ];
  const salesStatuses = [["Mark Interested","interested"],["Mark Demo/Setup","demo_setup"],["Mark Payment Pending","payment_pending"],["Mark Active Partner","active_partner"],["Mark Reservation Ready","reservation_ready"],["Mark At Risk","at_risk"]];
  const claimStatuses = [["Mark Claim Not Sent","not_sent"],["Mark Claim Invitation Sent","sent"],["Mark Claim Started","started"],["Mark Claim Approved","approved"]];
  return <section className="rounded-3xl border border-rose-200/15 bg-white/[0.03] p-5"><div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.28em] text-rose-200">Partner Launch</p><h2 className="mt-2 text-2xl font-black">Partner Launch</h2><p className="mt-2 text-sm text-white/55">Track claim outreach, setup, payment, reservation portal, website embed, and discovery readiness.</p></div><div className="flex flex-wrap gap-2"><form action={updatePartnerLaunchStatus}><input type="hidden" name="location_id" value={business.id}/><input type="hidden" name="mode" value="launch"/><button disabled={!canEdit} className="rounded-full bg-rose-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">Add to Partner Launch</button></form><form action={updatePartnerLaunchStatus}><input type="hidden" name="location_id" value={business.id}/><input type="hidden" name="mode" value="pilot"/><button disabled={!canEdit} className="rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white/75 disabled:opacity-50">Add to Launch Pilot</button></form></div></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">{stats.map(([label,value])=><StatCard key={label} label={label} value={value}/>)}</div><div className="mt-4 flex flex-wrap gap-2">{claimStatuses.map(([label,status])=><form key={status} action={updateClaimOutreachStatus}><input type="hidden" name="location_id" value={business.id}/><input type="hidden" name="claim_outreach_status" value={status}/><button disabled={!canEdit} className="rounded-full border border-white/10 bg-black/25 px-3 py-2 text-xs font-black text-white/75 disabled:opacity-50">{label}</button></form>)}{salesStatuses.map(([label,status])=><form key={status} action={updatePartnerSalesStatus}><input type="hidden" name="location_id" value={business.id}/><input type="hidden" name="partner_sales_status" value={status}/><button disabled={!canEdit} className="rounded-full border border-white/10 bg-black/25 px-3 py-2 text-xs font-black text-white/75 disabled:opacity-50">{label}</button></form>)}</div><div className="mt-5 grid gap-4 lg:grid-cols-2"><form action={updateNextAction} className="rounded-2xl border border-white/10 bg-black/20 p-4"><input type="hidden" name="location_id" value={business.id}/><h3 className="font-black">Next Action</h3><input name="next_action" defaultValue={business.next_action || ""} placeholder="Next action" className={`${inputClass()} mt-3`}/><select name="next_action_type" defaultValue={business.next_action_type || "follow_up_claim"} className={`${selectClass()} mt-3`}>{["call_owner","send_instagram_dm","send_email","send_claim_link","follow_up_claim","schedule_demo","send_payment_link","activate_partner","setup_reservation_portal","send_embed_code","confirm_embed_install","test_reservation","complete_discovery_profile","owner_dashboard_walkthrough","first_week_checkin"].map(v=><option key={v}>{v}</option>)}</select><input type="datetime-local" name="next_action_due_at" className={`${inputClass()} mt-3`}/><button disabled={!canEdit} className="mt-3 rounded-full bg-rose-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50">Schedule Follow-Up</button></form><form action={logFounderNote} className="rounded-2xl border border-white/10 bg-black/20 p-4"><input type="hidden" name="location_id" value={business.id}/><h3 className="font-black">Founder Notes</h3><select name="note_type" defaultValue="follow_up" className={`${selectClass()} mt-3`}>{["call","instagram_dm","email","owner_objection","follow_up","claim","reservation_setup","embed_setup","billing","onboarding","retention"].map(v=><option key={v}>{v}</option>)}</select><textarea name="note" rows={4} placeholder="Log founder note, objection, lost reason, or outreach detail." className={`${inputClass()} mt-3`}/><button disabled={!canEdit} className="mt-3 rounded-full bg-rose-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50">Log Founder Note</button></form></div></section>;
}

function NextRecommendedActions({ business, flags, isAdmin }: { business: BusinessCRMRow; flags: string[]; isAdmin: boolean }) {
  const items = [
    { label: "Send outreach", href: `/admin/dashboard/crm/${business.id}?tab=communication&channel=email`, show: true },
    { label: "Create follow-up", href: `/admin/dashboard/crm/${business.id}?tab=settings#follow-up`, show: true },
    { label: "Review claim", href: `/admin/dashboard/crm/${business.id}?tab=claims`, show: getClaimStatus(business).toLowerCase().includes("pending") || !business.is_claimed },
    { label: "Upgrade plan", href: `/admin/dashboard/crm/${business.id}?tab=plan`, show: isAdmin },
    { label: "Generate QR", href: `/admin/dashboard/crm/${business.id}?tab=qr-codes`, show: true },
    { label: "Fix reservation setup", href: `/admin/dashboard/crm/${business.id}?tab=reservations`, show: !business.reservation_url && !(business as any).external_reservation_url },
  ].filter((item) => item.show);
  return <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><h2 className="text-xl font-black">Next recommended action</h2><p className="mt-2 text-sm text-white/55">Use these shortcuts to act on the highest-impact CRM tasks for this location.</p><div className="mt-4 flex flex-wrap gap-2">{items.map((item) => <Link key={item.label} href={item.href} className="rounded-full border border-white/10 bg-black/25 px-4 py-2 text-sm font-black text-white/80 hover:bg-rose-600">{item.label}</Link>)}</div><ul className="mt-4 space-y-2 text-sm text-white/60">{(flags.length ? flags : ["Monitor weekly", "Keep profile fresh", "Review search visibility"]).map((flag) => <li key={flag} className="rounded-2xl border border-white/10 bg-black/20 p-3">{flag}</li>)}</ul></article>;
}

function inputClass() { return "w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none disabled:opacity-60"; }
function selectClass() { return "w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none disabled:opacity-60"; }

function PhotosPanel({ business, canEdit }: { business: BusinessCRMRow; canEdit: boolean }) {
  const mainImage = business.main_image || business.image_url || "";
  const gallery = [business.gallery, business.photos, business.image_gallery, business.gallery_images, business.images].flatMap(normalizeImageList).filter((url, index, all) => url && all.indexOf(url) === index && url !== mainImage);
  return <form action={saveLocationPhotos} className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
    <input type="hidden" name="location_id" value={business.id} />
    <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-black">Photos</h2><p className="mt-2 text-sm text-white/55">Manage URL-based main and gallery images for the public location profile.</p></div><button disabled={!canEdit} className="rounded-full bg-rose-600 px-5 py-2 text-sm font-black text-white disabled:opacity-50">Save photos</button></div>
    <div className="mt-5 grid gap-5 lg:grid-cols-[360px_1fr]">
      <div className="space-y-3"><div className="aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black/30">{mainImage ? <img src={mainImage} alt="Current main image" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center p-5 text-center text-sm text-white/45">No main image has been added yet.</div>}</div><label className="space-y-2 text-sm font-bold text-white/65"><span>Main image URL</span><input name="main_image" defaultValue={mainImage} disabled={!canEdit} className={inputClass()} /></label></div>
      <div><label className="space-y-2 text-sm font-bold text-white/65"><span>Gallery image URLs, one per line</span><textarea name="gallery_images" defaultValue={gallery.join("\n")} disabled={!canEdit} rows={10} className={inputClass()} /></label>{gallery.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{gallery.map((url, index) => <div key={url} className="rounded-2xl border border-white/10 bg-black/20 p-2"><img src={url} alt="Gallery" className="aspect-video w-full rounded-xl object-cover" /><p className="mt-2 truncate text-xs text-white/50">{index + 1}. {url}</p><p className="text-xs text-white/35">Edit the URL list above to set featured, remove, or reorder.</p></div>)}</div> : <EmptyPanel title="No gallery photos" text="No gallery photos have been added yet. Add image URLs below to improve the public location profile." />}</div>
    </div>
  </form>;
}

function ClaimsPanel({ business, claims }: { business: BusinessCRMRow; claims: any[] }) {
  return <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><div className="flex items-center justify-between"><h2 className="text-xl font-black">Claims</h2><Link href="/admin/dashboard/claims" className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-bold text-white/70">Open claims</Link></div><p className="mt-2 text-sm text-white/55">Claim status: {getClaimStatus(business)}</p>{claims.length ? <div className="mt-4 grid gap-3">{claims.map((claim) => <div key={claim.id} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70"><div className="flex flex-wrap gap-2">{badge(claim.status)}<span>{claim.submitted_business_name || business.name}</span></div><dl className="mt-3 grid gap-2 sm:grid-cols-2"><div><dt className="text-xs text-white/40">Claimant</dt><dd>{claim.claimant_name || "—"}</dd></div><div><dt className="text-xs text-white/40">Email</dt><dd>{claim.claimant_email || "—"}</dd></div><div><dt className="text-xs text-white/40">Phone</dt><dd>{claim.claimant_phone || "—"}</dd></div><div><dt className="text-xs text-white/40">Submitted</dt><dd>{formatDate(claim.submitted_at)}</dd></div><div><dt className="text-xs text-white/40">Reviewed</dt><dd>{formatDate(claim.reviewed_at)}</dd></div><div><dt className="text-xs text-white/40">Review notes</dt><dd>{claim.review_notes || "—"}</dd></div></dl></div>)}</div> : <EmptyPanel title="No claims submitted" text="No claims have been submitted for this location yet." />}</article>;
}

function PlanBillingPanel({ business, canEdit, isSuperadmin }: { business: BusinessCRMRow; canEdit: boolean; isSuperadmin: boolean }) {
  return <form action={savePlanBilling} className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><input type="hidden" name="location_id" value={business.id} /><h2 className="text-xl font-black">Plan and billing</h2><p className="mt-2 text-sm text-white/55">Use this to upgrade a location manually, comp a partner account, start a trial, or track a promo-driven upgrade.</p><div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3"><label className="space-y-2 text-sm font-bold text-white/65"><span>Plan</span><p className="text-xs text-white/45">Current: {getBillingPlanLabel(business.subscription_plan || business.plan)}{(business as any).stripe_subscription_id ? " · Stripe managed" : ""}</p><select name="plan" defaultValue={business.plan || "free_discovery"} disabled={!canEdit} className={selectClass()}>{[ ["free_discovery","Free Discovery"], ["partner_99","TheOutHaven Partner Plan — $99/month"], ["pro_reserve","TheOutHaven Partner Plan — $99/month"], ["enterprise","Enterprise"] ].map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label><label className="space-y-2 text-sm font-bold text-white/65"><span>Billing status</span><p className="text-xs text-white/45">Current: {getBillingStatusLabel(business.subscription_status || business.plan_status)}</p><select name="plan_status" defaultValue={business.plan_status || "inactive"} disabled={!canEdit} className={selectClass()}>{["inactive","trialing","active","comped","past_due","canceled"].map((v)=><option key={v}>{v}</option>)}</select></label><label className="space-y-2 text-sm font-bold text-white/65"><span>Trial type</span><select name="trial_type" defaultValue="none" disabled={!canEdit} className={selectClass()}>{["none","7_days","14_days","30_days","60_days","90_days",...(isSuperadmin ? ["forever_comped"] : [])].map((v)=><option key={v}>{v}</option>)}</select></label><label className="space-y-2 text-sm font-bold text-white/65"><span>Promo code</span><input name="promo_code" defaultValue={business.promo_code || ""} disabled={!canEdit} className={inputClass()} /></label><label className="space-y-2 text-sm font-bold text-white/65"><span>Promo campaign</span><input name="promo_campaign" defaultValue={business.promo_campaign || ""} disabled={!canEdit} className={inputClass()} /></label><label className="space-y-2 text-sm font-bold text-white/65 xl:col-span-3"><span>Internal billing note</span><textarea name="billing_notes" defaultValue={business.billing_notes || ""} disabled={!canEdit} rows={4} className={inputClass()} /></label></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><StatCard label="Upgrade score" value={fmt(business.opportunity_score)} /><StatCard label="Churn risk" value={fmt(business.churn_risk_score)} /></div><button disabled={!canEdit} className="mt-5 rounded-full bg-rose-600 px-6 py-3 text-sm font-black text-white disabled:opacity-50">Save plan and billing</button>{!canEdit ? <p className="mt-3 text-sm text-white/45">Only superadmins can update plan and billing.</p> : null}</form>;
}

function QRCodePanel({ business, qrCodes, canRegenerate }: { business: BusinessCRMRow; qrCodes: any[]; canRegenerate: boolean }) {
  const current = qrCodes[0] || {};
  const code = current.claim_code || current.code || business.claim_code;
  const qrImage =
    current.qr_code_data_url ||
    current.claim_qr_url ||
    (/^data:image\//i.test(String(current.qr_url || "")) ? current.qr_url : null) ||
    (business as any).qr_code_data_url ||
    (business as any).claim_qr_url;
  const rawClaimUrl =
    current.claim_url ||
    (!/^data:image\//i.test(String(current.qr_url || "")) ? current.qr_url : null) ||
    current.qr_link ||
    business.claim_url ||
    (business as any).qr_link;
  const claimUrl = rawClaimUrl ? String(rawClaimUrl).replace(/https?:\/\/(www\.)?roseout\.com/gi, getCanonicalAppUrl()) : "";
  const oldDomain = Boolean(rawClaimUrl && /roseout\.com|roseout\.vercel\.app/i.test(String(rawClaimUrl)));
  const printHref = `/admin/dashboard/claim-qrs?locationId=${encodeURIComponent(String(business.id))}`;

  return <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-xl font-black">QR Codes</h2>
        <p className="mt-1 text-sm text-white/55">Claim QR for this location. Every imported location should have a code, claim URL, and QR image.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/admin/dashboard/claim-qrs" className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-bold text-white/70">Open all QR codes</Link>
        <Link href={printHref} className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-bold text-white/70">Print/download this QR</Link>
        {claimUrl ? <Link href={claimUrl} className="rounded-full bg-rose-600 px-4 py-2 text-sm font-black text-white">Open claim page</Link> : null}
      </div>
    </div>

    {code || claimUrl || qrImage ? <div className="mt-5 grid gap-5 lg:grid-cols-[280px_1fr]">
      <div className="rounded-3xl border border-white/10 bg-white p-4 text-black shadow-xl shadow-black/20">
        {qrImage ? <img src={String(qrImage)} alt={`Claim QR code for ${business.name || "location"}`} className="aspect-square w-full rounded-2xl object-contain" /> : <div className="flex aspect-square items-center justify-center rounded-2xl border border-dashed border-black/20 p-4 text-center text-sm font-bold text-black/50">No QR image generated yet.</div>}
        <p className="mt-3 text-center text-xs font-black uppercase tracking-[0.18em] text-black/45">Scan to claim</p>
        <p className="mt-1 text-center text-sm font-black text-black">{code || "No code"}</p>
      </div>
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
        <p><b>Claim code:</b> {code || "—"}</p>
        <p className="mt-2 break-all"><b>Claim URL:</b> {claimUrl || "—"}</p>
        {oldDomain ? <p className="mt-3 rounded-2xl border border-amber-300/20 bg-amber-500/10 p-3 text-amber-100">This QR uses an old domain. Regenerate it to use theouthaven.com.</p> : null}
        <p className="mt-2"><b>Status:</b> {current.status || current.claim_status || business.claim_status || "active"}</p>
        <p className="mt-2"><b>Scan count:</b> {current.scan_count || current.scans || (business as any).qr_scans_30d || 0}</p>
        <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-xs leading-5 text-white/50">QR images are stored on the location as <code>claim_qr_url</code>/<code>qr_code_data_url</code> and mirrored into the claim-code table for the bulk print page.</p>
      </div>
    </div> : <EmptyPanel title="No claim QR code" text="No claim QR code has been generated for this location yet. Generate one here or use the bulk QR tools." />}

    <form action={regenerateLocationClaimQr} className="mt-5">
      <input type="hidden" name="location_id" value={business.id} />
      <button disabled={!canRegenerate} className="rounded-full bg-rose-600 px-6 py-3 text-sm font-black text-white disabled:opacity-50">Regenerate with TheOutHaven URL</button>
      {!canRegenerate ? <p className="mt-2 text-sm text-white/45">Admin or superadmin permission is required to regenerate QR codes.</p> : null}
    </form>
  </article>;
}

function OwnerPanel({ business, owners }: { business: BusinessCRMRow; owners: any[] }) {
  const owner = owners[0] || {};
  const email = business.owner_email || owner.owner_email || owner.email;
  return <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><h2 className="text-xl font-black">Owner account</h2>{email || business.owner_user_id ? <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-sm text-white/70"><div><dt className="text-xs text-white/40">Owner email</dt><dd>{email || "—"}</dd></div><div><dt className="text-xs text-white/40">Owner name</dt><dd>{owner.full_name || owner.name || owner.owner_name || "—"}</dd></div><div><dt className="text-xs text-white/40">Linked date</dt><dd>{formatDate(owner.created_at || owner.linked_at)}</dd></div><div><dt className="text-xs text-white/40">Claim source</dt><dd>{owner.claim_source || owner.source || "—"}</dd></div><div><dt className="text-xs text-white/40">Owner status</dt><dd>{business.owner_status || owner.status || "linked"}</dd></div><div><dt className="text-xs text-white/40">Owner user ID</dt><dd className="break-all">{business.owner_user_id || owner.owner_user_id || "—"}</dd></div></dl> : <div className="mt-4"><EmptyPanel title="No owner linked yet" text="No owner linked yet. Use claims, invite, or a claim link to connect this location to an owner account." /><div className="mt-4 flex flex-wrap gap-2"><Link href="/admin/dashboard/claims" className="rounded-full bg-rose-600 px-4 py-2 text-sm font-black text-white">Open claims</Link><Link href={`/admin/dashboard/crm/${business.id}?tab=communication`} className="rounded-full border border-white/10 px-4 py-2 text-sm font-bold text-white/70">Invite owner</Link><Link href={`/business/claim?location=${business.id}`} className="rounded-full border border-white/10 px-4 py-2 text-sm font-bold text-white/70">Copy claim link</Link></div></div>}</article>;
}

function LocationSettingsPanel({ business, canEdit, isSuperadmin }: { business: BusinessCRMRow; canEdit: boolean; isSuperadmin: boolean }) {
  return <section className="grid gap-4 lg:grid-cols-[1fr_0.75fr]"><form action={saveLocationSettings} className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><input type="hidden" name="location_id" value={business.id} /><h2 className="text-xl font-black">Location settings</h2><div className="mt-4 grid gap-4 md:grid-cols-2"><label className="space-y-2 text-sm font-bold text-white/65"><span>Active</span><select name="active" defaultValue={business.active === false ? "false" : "true"} disabled={!canEdit} className={selectClass()}><option value="true">Active</option><option value="false">Inactive</option></select></label><label className="space-y-2 text-sm font-bold text-white/65"><span>Searchable</span><select name="is_searchable" defaultValue={business.is_searchable ? "true" : "false"} disabled={!canEdit} className={selectClass()}><option value="true">Searchable</option><option value="false">Hidden from search</option></select></label><label className="space-y-2 text-sm font-bold text-white/65"><span>CRM priority</span><select name="crm_priority" defaultValue={business.crm_priority || business.priority_level || "normal"} disabled={!canEdit} className={selectClass()}>{["low","normal","high","urgent"].map((v)=><option key={v}>{v}</option>)}</select></label><label id="follow-up" className="space-y-2 text-sm font-bold text-white/65"><span>Follow-up date</span><input type="date" name="follow_up_date" defaultValue={business.follow_up_date || ""} disabled={!canEdit} className={inputClass()} /></label><label className="space-y-2 text-sm font-bold text-white/65"><span>Outreach status</span><select name="outreach_status" defaultValue={business.outreach_status || "none"} disabled={!canEdit} className={selectClass()}>{["none","needs_outreach","contacted","follow_up","interested","not_interested","do_not_contact"].map((v)=><option key={v}>{v}</option>)}</select><p className="text-xs font-medium leading-5 text-white/45">The latest communication/outreach state for this location. Examples: Not contacted, contacted, follow-up needed, interested, not interested, do not contact.</p></label><label className="space-y-2 text-sm font-bold text-white/65"><span>CRM status</span><select name="crm_status" defaultValue={getDisplayCRMStatus(business)} disabled={!canEdit} className={selectClass()}>{["New Lead","Needs Outreach","Contacted","Follow Up","Upgrade Opportunity","Active Free","Active Pro","At Risk","Churned"].map((v)=><option key={v}>{v}</option>)}</select><p className="text-xs font-medium leading-5 text-white/45">The overall internal lifecycle stage for this location.</p></label><label className="space-y-2 text-sm font-bold text-white/65 md:col-span-2"><span>Internal notes</span><textarea name="internal_notes" defaultValue={business.internal_notes || ""} disabled={!canEdit} rows={6} className={inputClass()} /></label></div><button disabled={!canEdit} className="mt-5 rounded-full bg-rose-600 px-6 py-3 text-sm font-black text-white disabled:opacity-50">Save settings</button></form><div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><h2 className="text-xl font-black">Danger zone</h2><p className="mt-2 text-sm leading-6 text-white/60">Destructive controls are restricted. Use inactive/searchable controls to remove this location from public flows safely.</p><form action={saveLocationSettings} className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4"><input type="hidden" name="location_id" value={business.id} /><input type="hidden" name="active" value="false" /><input type="hidden" name="is_searchable" value="false" /><input type="hidden" name="crm_priority" value={business.crm_priority || "normal"} /><input type="hidden" name="outreach_status" value={business.outreach_status || "none"} /><input type="hidden" name="crm_status" value={getDisplayCRMStatus(business)} /><input type="hidden" name="internal_notes" value={business.internal_notes || ""} /><button disabled={!canEdit} className="rounded-full border border-white/10 px-4 py-2 text-sm font-bold text-white/75 disabled:opacity-50">Deactivate location</button></form>{isSuperadmin ? <details className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-500/10 p-4"><summary className="cursor-pointer font-bold text-rose-100">Permanently delete location</summary><p className="mt-3 text-sm leading-6 text-white/70">This will permanently delete this location and related CRM data. This action cannot be undone.</p><form action={deleteLocationSuperadmin} className="mt-3 space-y-3"><input type="hidden" name="location_id" value={business.id} /><input name="confirmation" placeholder="DELETE LOCATION" className={inputClass()} /><button className="rounded-full bg-rose-700 px-4 py-2 text-sm font-black text-white">Permanently delete location</button></form></details> : <p className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/55">Only superadmins can permanently delete locations.</p>}</div></section>;
}

function Panel({ title, items, empty, href, hrefLabel }: { title: string; items: any[]; empty: string; href: string; hrefLabel: string }) {
  return <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><div className="flex items-center justify-between gap-4"><h2 className="text-xl font-black">{title}</h2><Link href={href} className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-bold text-white/70">{hrefLabel}</Link></div>{items.length ? <ul className="mt-4 space-y-2 text-sm text-white/70">{items.map((item) => <li key={item.id} className="rounded-2xl border border-white/10 bg-black/20 p-3"><b>{item.title || item.subject || item.action || item.status || item.category || "Record"}</b><p className="mt-1 text-white/55">{item.message || item.note_body || item.description || item.owner_email || item.delivery_status || "Real record"}</p><span className="mt-1 block text-xs text-white/35">{formatDate(item.created_at || item.submitted_at || item.sent_at)}</span></li>)}</ul> : <div className="mt-4"><EmptyPanel title={`No ${title.toLowerCase()} yet`} text={empty} /></div>}</article>;
}
