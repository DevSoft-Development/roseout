import Link from "next/link";
import PreviewRegister from "./PreviewRegister";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { getLocationOwnerAccess, resolveEditableLocationContext } from "@/lib/auth/locationOwnerAccess";
import { getInternalDemoLocationAccess } from "@/lib/demo/internal-demo-location-access";
import { getPosTableCheckWorkspace, getPosTableServiceBootstrap } from "@/lib/pos/table-service/service";
import { BusinessPageHeader, BusinessPageShell, BusinessStatusBadge } from "@/components/business/BusinessDesignSystem";

export const dynamic = "force-dynamic";
type Params = Record<string,string|string[]|undefined>;
const first = (value:string|string[]|undefined) => Array.isArray(value) ? value[0] : value;

export default async function WebRegisterPreview({searchParams}:{searchParams?:Promise<Params>}) {
  const params = await searchParams || {};
  const supabase = await createClient();
  const {data:{user}} = await supabase.auth.getUser();
  const cookieStore = await cookies();
  const adminLocationId = first(params.adminLocationId);
  const demoLocationId = first(params.demoLocationId);
  const sourceId = first(params.sourceId);
  const type = first(params.type);
  const demo = first(params.demo) === "1";
  const fromDemoCenter = first(params.fromDemoCenter) === "1";
  let locationId = first(params.locationId) || adminLocationId || demoLocationId ||
    cookieStore.get("theouthaven_impersonate_location_id")?.value || "";
  let internalDemoAccess = null;
  if (!user) {
    internalDemoAccess = await getInternalDemoLocationAccess({
      locationId,adminLocationId,demoLocationId,demo,fromDemoCenter,
    });
    if (!internalDemoAccess) redirect("/business/login?next=/locations/dashboard/pos/register");
    locationId = internalDemoAccess.locationId;
  }
  if (!locationId && user) {
    const owner = await getLocationOwnerAccess(user.id,user.email ?? null);
    locationId = owner.ownedLocationIds[0] || owner.ownedSourceLocationIds[0] || "";
  }
  if (!locationId) redirect("/locations/dashboard");
  const access = user ? await resolveEditableLocationContext({
    userId:user.id,userEmail:user.email ?? null,locationId,
    adminLocationId,demoLocationId,sourceId,type,demo,fromDemoCenter,
  }) : null;
  if (!access && !internalDemoAccess) redirect("/locations/dashboard");
  const canonicalLocationId = String(access?.canonicalLocationId || internalDemoAccess!.locationId);
  const location = access?.location || internalDemoAccess!.location || {};
  const name = String(location.name || location.location_name || location.restaurant_name || "Your location");
  let preview:Awaited<ReturnType<typeof getPosTableServiceBootstrap>> | null = null;
  let previewError:string | null = null;
  try { preview = await getPosTableServiceBootstrap(canonicalLocationId); }
  catch { previewError = "Table and catalog data are currently unavailable."; }
  const requestedCheckId = first(params.checkId) || "";
  const selectedCheckId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedCheckId) &&
    (preview?.tables || []).some(table => table.openCheck?.id === requestedCheckId) ? requestedCheckId : "";
  let check:Awaited<ReturnType<typeof getPosTableCheckWorkspace>> | null = null;
  if (selectedCheckId) {
    try { check = await getPosTableCheckWorkspace(canonicalLocationId,selectedCheckId); }
    catch { previewError = "Selected check is unavailable."; }
  }
  const query = new URLSearchParams({locationId:canonicalLocationId});
  if (adminLocationId) query.set("adminLocationId",adminLocationId);
  if (demoLocationId) query.set("demoLocationId",demoLocationId);
  if (demo) query.set("demo","1");
  if (fromDemoCenter) query.set("fromDemoCenter","1");
  return <BusinessPageShell>
    <BusinessPageHeader eyebrow="ThePOSHaven / Web Register" title={name}
      subtitle="Tablet and desktop register preview. Shared operational services will power both web and native POS."
      badge={<BusinessStatusBadge tone="amber">Not certified for transactions</BusinessStatusBadge>}
      actions={<Link href={`/locations/dashboard/pos?${query}`} className="rounded-xl border border-white/20 px-4 py-2 text-sm">POS control center</Link>}
    />
    <section className="rounded-3xl border border-[var(--business-border)] bg-[var(--business-panel)] p-6">
      <h2 className="text-xl font-bold">Web cashier activation pending</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--business-muted)]">
        The browser register must authenticate staff and devices, enforce location-specific entitlements,
        synchronize orders and tables, and certify payments before live selling can be enabled.
        No orders, payments, drawer commands or printer commands can be initiated from this preview.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link href={`/locations/dashboard/menu?${query}`} className="rounded-xl border border-white/20 px-4 py-3 text-sm font-semibold">Manage menu</Link>
        <Link href={`/locations/dashboard/online-ordering?${query}`} className="rounded-xl border border-white/20 px-4 py-3 text-sm font-semibold">Online orders</Link>
        <Link href={`/locations/dashboard/hardware?${query}`} className="rounded-xl border border-white/20 px-4 py-3 text-sm font-semibold">Hardware</Link>
      </div>
    </section>
    <section className="mt-5 grid gap-5 lg:grid-cols-2">
      <div className="rounded-3xl border border-[var(--business-border)] bg-[var(--business-panel)] p-6">
        <h2 className="text-xl font-bold">Restaurant tables</h2>
        {previewError ? <p role="alert" className="mt-3 text-sm text-amber-300">{previewError}</p> : null}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(preview?.tables || []).map(table => <div key={table.id} className="rounded-xl border border-white/15 p-3">
            <p className="font-semibold">{table.label}</p>
            <p className="text-xs text-[var(--business-muted)]">{table.status} · {table.capacity} seats</p>
            {table.openCheck ? <Link href={`?${query}&checkId=${encodeURIComponent(table.openCheck.id)}`} className="mt-2 block text-xs underline underline-offset-4">View open check · {(table.openCheck.totalCents/100).toLocaleString("en-US",{style:"currency",currency:"USD"})}</Link> : null}
          </div>)}
        </div>
        {!preview?.tables?.length ? <p className="mt-3 text-sm text-[var(--business-muted)]">No tables available.</p> : null}
      </div>
      <div className="rounded-3xl border border-[var(--business-border)] bg-[var(--business-panel)] p-6">
        <h2 className="text-xl font-bold">POS catalog</h2>
        <div className="mt-4 max-h-[480px] space-y-2 overflow-y-auto">
          {(preview?.catalog?.items || []).slice(0,100).map(item => <div key={item.id} className="flex justify-between gap-3 rounded-xl border border-white/10 p-3">
            <div><p className="text-sm font-semibold">{item.name}</p><p className="text-xs text-[var(--business-muted)]">{item.course} · {item.isAvailable ? "Available" : "Unavailable"}</p></div>
            <span className="text-sm font-semibold">{(item.priceCents/100).toLocaleString("en-US",{style:"currency",currency:"USD"})}</span>
          </div>)}
        </div>
        {!preview?.catalog?.items?.length ? <p className="mt-3 text-sm text-[var(--business-muted)]">No catalog items available.</p> : null}
      </div>
    </section>
    <PreviewRegister tables={(preview?.tables || []).map(t=>({id:t.id,label:t.label,capacity:t.capacity}))} items={(preview?.catalog?.items || []).map(i=>({id:i.id,name:i.name,priceCents:i.priceCents,course:i.course,isAvailable:i.isAvailable}))} />
    {check ? <section className="mt-5 rounded-3xl border border-[var(--business-border)] bg-[var(--business-panel)] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Check details · read only</h2><Link href={`?${query}`} className="text-sm underline">Close details</Link></div>
      <p className="mt-2 text-sm text-[var(--business-muted)]">{check.guestCount} guests · {check.status}</p>
      <div className="mt-4 space-y-2">{check.items.map(item => <div key={item.id} className="flex justify-between gap-3 border-b border-white/10 py-2 text-sm"><span>{item.quantity} × {item.name} · {item.course}</span><span>{(item.lineTotalCents/100).toLocaleString("en-US",{style:"currency",currency:"USD"})}</span></div>)}</div>
      <div className="mt-4 flex justify-between text-base font-bold"><span>Remaining balance</span><span>{(check.amounts.remainingCents/100).toLocaleString("en-US",{style:"currency",currency:"USD"})}</span></div>
      <p className="mt-3 text-xs text-[var(--business-muted)]">Payment, editing and kitchen actions are unavailable in preview mode.</p>
    </section> : null}
  </BusinessPageShell>;
}
