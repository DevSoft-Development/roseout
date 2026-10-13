import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { getLocationOwnerAccess, resolveEditableLocationContext } from "@/lib/auth/locationOwnerAccess";
import { getInternalDemoLocationAccess } from "@/lib/demo/internal-demo-location-access";
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
  </BusinessPageShell>;
}
