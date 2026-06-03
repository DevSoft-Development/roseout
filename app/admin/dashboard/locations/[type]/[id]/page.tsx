import Link from "next/link";
import { notFound } from "next/navigation";
import ImpersonateButton from "@/components/admin/ImpersonateButton";
import { requireAdminRole } from "@/lib/admin-auth";
import { getLocationImage } from "@/lib/locationImage";
import { getLocationName } from "@/lib/locationName";
import { getLocationScore } from "@/lib/locationScore";
import { getIsClaimed } from "@/lib/locationClaim";
import { supabase } from "@/lib/supabase";

import { ADMIN_PAGE_ACCESS, canAdmin } from "@/lib/admin-permissions";
type LocationType = "restaurants" | "activities";
type LocationRecord = Record<string, unknown> & { id: string; locationType: LocationType; restaurant_name?: string | null; activity_name?: string | null; claim_code?: string | null; claim_status?: string | null; rating?: number | null; view_count?: number | null; click_count?: number | null };

const val = (v: unknown, fallback = "—") => String(v ?? "").trim() || fallback;
const num = (v: unknown) => Number(v ?? 0).toLocaleString();

function claimEmailTemplate(name: string, claimLink: string) {
  return {
    subject: "Your TheOutHaven Claim QR Code",
    body: `Hi ${name} team,\n\nYour TheOutHaven claim QR code is ready.\n\nUse this QR code to quickly claim and manage your business profile, update your details, monitor activity, and access owner tools.\n\nClaim link:\n${claimLink}\n\nIf you have any questions, reply to this email and our team can help.\n\nTheOutHaven Team`,
  };
}

async function getLocation(type: LocationType, id: string): Promise<LocationRecord | null> {
  const table = type === "restaurants" ? "restaurants" : "activities";
  const { data } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
  return data ? ({ ...data, id, locationType: type } as LocationRecord) : null;
}

function AdminCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-[1.5rem] border border-white/10 bg-[#120d0b] p-5 shadow-2xl"><h2 className="text-lg font-black text-white">{title}</h2><div className="mt-3 text-sm text-white/70">{children}</div></section>;
}

export default async function AdminLocationCrmDetail({ params }: { params: Promise<{ type: string; id: string }> }) {
  const currentAdmin = await requireAdminRole(ADMIN_PAGE_ACCESS.locations);
  const canImpersonate = canAdmin(currentAdmin.role, "impersonation");
  const { type, id } = await params;
  if (type !== "restaurants" && type !== "activities") notFound();
  const location = await getLocation(type, id);
  if (!location) notFound();

  const name = type === "restaurants" ? val(location.restaurant_name || location.name, "Untitled restaurant") : val(location.activity_name || location.name, "Untitled activity");
  const image = getLocationImage(location);
  const score = getLocationScore(location);
  const isClaimed = getIsClaimed(location);
  const claimLink = `${process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.com"}/claim/${id}`;
  const email = claimEmailTemplate(name, claimLink);
  const mailto = `mailto:?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
  const basePath = `/admin/dashboard/locations/${type}/${id}`;

  return <main className="min-h-screen bg-[#090706] px-4 pb-10 pt-5 text-white sm:px-6 lg:px-8"><div className="mx-auto max-w-[1500px] space-y-6">
    <section className="rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,#1b1210,#120d0b)] p-6 shadow-2xl"><div className="grid gap-5 lg:grid-cols-[1fr_280px]"><div><p className="text-xs font-black uppercase tracking-[0.3em] text-rose-200">Location CRM</p><h1 className="mt-2 text-4xl font-black">{name}</h1><p className="mt-2 text-white/60">{val(location.address)} · {val(location.city)} · {val(location.state)}</p><div className="mt-4 flex flex-wrap gap-2">{["data-quality","communication","crm"].map((s)=><Link key={s} href={`${basePath}/${s}`} className="rounded-full border border-white/10 bg-[#1b1210] px-4 py-2 text-xs font-black uppercase tracking-wide text-white/80 hover:text-white">{s.replace("-"," ")}</Link>)}{canImpersonate && (location.owner_user_id ? <ImpersonateButton targetType="location_owner" locationId={id} locationType={type} userId={String(location.owner_user_id)} label="Log in as location owner" className="rounded-full border border-amber-200/40 bg-amber-500/15 px-4 py-2 text-xs font-black uppercase tracking-wide text-amber-50 hover:bg-amber-500/25 disabled:opacity-50" /> : <span className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black uppercase tracking-wide text-white/45">No owner connected</span>)}</div></div>{image ? <img src={image} alt={name} className="h-44 w-full rounded-[1.5rem] border border-white/10 object-cover"/> : <div className="flex h-44 items-center justify-center rounded-[1.5rem] border border-dashed border-white/20 bg-[#1b1210] text-white/50">No image</div>}</div></section>

    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">{[["Views",num(location.view_count)],["Clicks",num(location.click_count)],["Score",String(score)],["Rating",val(location.rating,"0")],["Claim Status",isClaimed?"Claimed":"Unclaimed"],["Reservation", location.reservation_link?"Configured":"Missing"],["QR/Claim", val(location.claim_status,"Ready")]].map(([k,v]) => <div key={String(k)} className="rounded-[1.5rem] border border-white/10 bg-[#120d0b] p-4 shadow-2xl"><p className="text-[11px] uppercase tracking-[0.2em] text-white/45">{k}</p><p className="mt-2 text-xl font-black text-white">{String(v)}</p></div>)}</section>

    <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      <AdminCard title="Data Quality"><p>Review missing fields and repair opportunities.</p><Link href={`${basePath}/data-quality`} className="mt-3 inline-flex rounded-full border border-rose-300/30 bg-gradient-to-r from-rose-900/50 to-rose-900/40 px-4 py-2 font-bold text-rose-100">Open Data Quality</Link></AdminCard>
      <AdminCard title="Communication + Follow-up"><p>Track outreach history and next actions.</p><Link href={`${basePath}/communication`} className="mt-3 inline-flex rounded-full border border-rose-300/30 bg-gradient-to-r from-rose-900/50 to-rose-900/40 px-4 py-2 font-bold text-rose-100">Open Communication</Link></AdminCard>
      <AdminCard title="CRM"><p>Pipeline status, notes, and ownership tasks.</p><Link href={`${basePath}/crm`} className="mt-3 inline-flex rounded-full border border-rose-300/30 bg-gradient-to-r from-rose-900/50 to-rose-900/40 px-4 py-2 font-bold text-rose-100">Open CRM</Link></AdminCard>
      <AdminCard title="Claim Access"><div className="space-y-2"><Link href={`/admin/dashboard/claim-qrs?type=${type}&id=${id}`} className="block rounded-xl border border-white/10 bg-[#1b1210] px-3 py-2">Print QR Code Label</Link><Link href={mailto} className="block rounded-xl border border-white/10 bg-[#1b1210] px-3 py-2">Resend QR Code Email</Link><p className="text-xs text-white/50">Claim link: {claimLink}</p></div></AdminCard>
      {['Analytics','Upsell Opportunities','Reservation Intelligence','AI Recommendations'].map((title)=><AdminCard key={title} title={title}><p className="rounded-xl border border-dashed border-white/15 p-4 text-white/50">No data yet. Add integrations to populate this area.</p><button className="mt-3 rounded-full border border-white/10 bg-[#1b1210] px-4 py-2 text-xs font-bold">Create action</button></AdminCard>)}
    </section>
  </div></main>;
}
