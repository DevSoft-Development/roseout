import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { getLocationOwnerAccess, resolveEditableLocationContext } from "@/lib/auth/locationOwnerAccess";
import { BusinessPageHeader, BusinessPageShell, BusinessStatusBadge } from "@/components/business/BusinessDesignSystem";

export const dynamic="force-dynamic";

type SearchParams=Record<string,string|string[]|undefined>;
function first(value:string|string[]|undefined){return Array.isArray(value)?value[0]:value;}

export default async function PosWorkspacePage({searchParams}:{searchParams?:Promise<SearchParams>}){
  const params=(await searchParams)||{};
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect("/business/login?next=/locations/dashboard/pos");

  const cookieStore=await cookies();
  const adminLocationId=first(params.adminLocationId);
  const demoLocationId=first(params.demoLocationId);
  const sourceId=first(params.sourceId);
  const type=first(params.type);
  const demo=first(params.demo)==="1";
  const fromDemoCenter=first(params.fromDemoCenter)==="1";
  let locationId=
    first(params.locationId)||
    adminLocationId||
    demoLocationId||
    cookieStore.get("theouthaven_impersonate_location_id")?.value||
    "";

  if(!locationId){
    const owner=await getLocationOwnerAccess(user.id,user.email??null);
    locationId=owner.ownedLocationIds[0]||owner.ownedSourceLocationIds[0]||"";
  }
  if(!locationId) redirect("/locations/dashboard");

  const access=await resolveEditableLocationContext({
    userId:user.id,userEmail:user.email??null,locationId,
    adminLocationId,demoLocationId,sourceId,type,demo,fromDemoCenter,
  });
  if(!access) redirect("/locations/dashboard");

  const canonicalLocationId=String(access.canonicalLocationId);
  const location=access.location||{};
  const locationName=String(location.name||location.location_name||location.restaurant_name||location.activity_name||"Your location");

  const query=new URLSearchParams();
  query.set("locationId",canonicalLocationId);
  if(adminLocationId) query.set("adminLocationId",adminLocationId);
  if(demoLocationId) query.set("demoLocationId",demoLocationId);
  if(sourceId) query.set("sourceId",sourceId);
  if(type) query.set("type",type);
  if(demo) query.set("demo","1");
  if(fromDemoCenter) query.set("fromDemoCenter","1");
  const q=query.toString();
  const href=(path:string)=>`${path}?${q}`;

  const core=[
    ["Hardware","Registers, payment terminals, printers, drawers, KDS screens, and device roles.",href("/locations/dashboard/hardware"),"Manage devices"],
    ["Menu / Catalog","Control the same catalog used by the POS, website, profile, and online ordering.",href("/locations/dashboard/menu"),"Edit catalog"],
    ["Online Ordering","Pickup ordering, prep time, capacity, alerts, automatic printing, and customer updates.",href("/locations/dashboard/online-ordering"),"Manage ordering"],
    ["Analytics","Review location performance and operating trends from the business dashboard.",href("/locations/dashboard/analytics"),"View analytics"],
  ] as const;

  return <BusinessPageShell>
    <BusinessPageHeader
      eyebrow="ThePOSHaven"
      title={`POS control center for ${locationName}`}
      subtitle="Manage the business side of your POS in one place. Staff run live orders from the dedicated ThePOSHaven register and handheld app."
      badge={<><BusinessStatusBadge tone="green">Essentials+</BusinessStatusBadge><BusinessStatusBadge tone="blue">Signature+ ready</BusinessStatusBadge></>}
      actions={<Link href={href("/locations/dashboard/hardware")} className="inline-flex min-h-11 items-center rounded-xl bg-[#e1062a] px-4 text-sm font-black text-white">Manage Hardware</Link>}
    />

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {core.map(([title,body,url,action])=><Link key={title} href={url} className="rounded-3xl border border-[var(--business-border)] bg-[var(--business-panel)] p-5 transition hover:border-[#ff2142]/45 hover:bg-white/[0.05]">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ff6b86]">{action}</p>
        <h2 className="mt-3 text-xl font-black text-[var(--business-text)]">{title}</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-[var(--business-muted)]">{body}</p>
      </Link>)}
    </section>

    <section className="mt-6 grid gap-5 xl:grid-cols-2">
      <div className="rounded-3xl border border-[var(--business-border)] bg-[var(--business-panel)] p-6">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ff6b86]">Essentials+</p><h2 className="mt-2 text-2xl font-black">Core POS operations</h2></div>
          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-200">Included</span>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {["Main register","Reservations + table service","Guest / Shared ordering","Course-based sending","Offline POS","Local printing","Cash drawer","Pickup online ordering","Basic inventory","Core reporting"].map(item=><div key={item} className="rounded-xl border border-white/8 bg-black/15 px-3 py-3 text-sm font-bold text-[var(--business-text)]/75">✓ {item}</div>)}
        </div>
      </div>

      <div className="rounded-3xl border border-[#ff2142]/20 bg-gradient-to-br from-[#231015] to-[#0e0b0d] p-6">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ff6b86]">Signature+</p><h2 className="mt-2 text-2xl font-black">Advanced restaurant operations</h2></div>
          <span className="rounded-full border border-[#ff6b86]/30 bg-[#e1062a]/15 px-3 py-1 text-xs font-black text-[#ff9cac]">$149 plan</span>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {["Hold / Fire","Seat-aware kitchen tickets","Kitchen / Bar / Expo routing","KDS","Move / Merge tables","Transfer server","Advanced split checks","Multi-device synchronization","Ingredient + recipe inventory","Advanced reporting"].map(item=><div key={item} className="rounded-xl border border-white/8 bg-black/15 px-3 py-3 text-sm font-bold text-white/75">✓ {item}</div>)}
        </div>
      </div>
    </section>

    <section className="mt-6 rounded-3xl border border-[var(--business-border)] bg-[var(--business-panel)] p-6">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--business-muted)]">How it works</p>
      <h2 className="mt-2 text-xl font-black text-[var(--business-text)]">Business portal manages it. ThePOSHaven app runs service.</h2>
      <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[var(--business-muted)]">
        Owners and managers use this portal for configuration, hardware, catalog, online ordering, inventory, and reporting. Cashiers and servers use the dedicated register/handheld app for live selling, tables, payments, KDS, and offline service.
      </p>
    </section>
  </BusinessPageShell>;
}
