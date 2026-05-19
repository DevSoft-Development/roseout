import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationName } from "@/lib/locationName";
import { isBusinessPro } from "@/lib/analytics/business-analytics";

const opportunities = ["promoted listing", "homepage feature", "/go feature", "featured outing", "social campaign feature", "category sponsorship", "city/neighborhood boost"];

export default async function BusinessPromotionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: locations } = await supabaseAdmin
    .from("locations")
    .select("id, name, restaurant_name, activity_name, city, state, is_promoted, subscription_plan, owner_user_id, owner_email, claimed_by_email")
    .or(`owner_user_id.eq.${user.id},owner_email.eq.${user.email || ""},claimed_by_email.eq.${user.email || ""}`)
    .order("created_at", { ascending: false });

  return <main className="min-h-screen bg-[#050505] text-white"><section className="mx-auto max-w-6xl px-5 py-10 sm:px-8"><h1 className="text-4xl font-black">Promotion Center</h1><p className="mt-2 text-sm text-white/60">Feature this location, boost visibility, and launch high-intent promotion requests.</p><div className="mt-6 grid gap-5">{(locations||[]).map((location:any)=>{const isPro=isBusinessPro(location);return <div key={location.id} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"><h2 className="text-2xl font-black">{getLocationName(location,"Untitled")}</h2><p className="text-sm text-white/50">{[location.city,location.state].filter(Boolean).join(", ")}</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{opportunities.map((item)=><div key={item} className="rounded-2xl border border-white/10 bg-black/30 p-4"><p className="text-sm font-black capitalize">{item}</p>{isPro?<Link href={`/checkout?plan=promotion&location=${location.id}&type=${encodeURIComponent(item)}`} className="mt-3 inline-flex rounded-full border border-white/20 px-3 py-2 text-xs font-black">Request / Review</Link>:<><p className="mt-2 text-xs text-white/50">Unlock with Pro</p><Link href="/business/dashboard/billing" className="mt-3 inline-flex rounded-full bg-[#f5b700] px-3 py-2 text-xs font-black text-black">Upgrade to Pro — $99/month</Link></>}</div>)}</div></div>})}</div></section></main>;
}
